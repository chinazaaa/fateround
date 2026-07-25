import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import type { MafiaPlayerState, MafiaSession } from '@/types'

const NO_NIGHT_ACTION_ROLES = new Set(['villager', 'mayor', 'jester', 'cursed_villager', 'vigilante'])
const ROLE_ENABLED_FIELD: Partial<Record<string, keyof MafiaSession>> = {
  doctor: 'doctor_enabled',
  detective: 'detective_enabled',
  bodyguard: 'bodyguard_enabled',
  vigilante: 'vigilante_enabled',
  tracker: 'tracker_enabled',
  alpha_wolf: 'alpha_wolf_enabled',
  framer: 'framer_enabled',
  serial_killer: 'serial_killer_enabled',
  arsonist: 'arsonist_enabled',
  cupid: 'cupid_enabled',
  medium: 'medium_enabled',
}
// Roles that may never target themselves (self-target is either meaningless or reserved
// for a different action, e.g. Arsonist self-target signals "ignite" instead of "douse").
const NO_SELF_TARGET_ROLES = new Set(['doctor', 'bodyguard', 'vigilante', 'tracker', 'framer', 'serial_killer'])

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  const admin = getSupabaseAdmin()

  let body: { resumeToken?: unknown; targetPlayerId?: unknown; secondTargetPlayerId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { resumeToken, targetPlayerId, secondTargetPlayerId } = body
  if (typeof resumeToken !== 'string' || typeof targetPlayerId !== 'string') {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  // 1. Authenticate player
  const auth = await assertPlayer(admin, gameId, resumeToken)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const playerId = auth.player.id

  // 2. Fetch mafia session and target states
  const [{ data: mafiaSession }, { data: mafiaPlayerStates }] = await Promise.all([
    admin.from('mafia_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    admin.from('mafia_player_states').select('*').eq('game_id', gameId),
  ])

  if (!mafiaSession || !mafiaPlayerStates) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  const session = mafiaSession as MafiaSession
  const playerStates = mafiaPlayerStates as MafiaPlayerState[]

  if (session.phase !== 'night') {
    return NextResponse.json({ error: 'It is not night' }, { status: 400 })
  }

  const myState = playerStates.find((p) => p.player_id === playerId)
  if (!myState) {
    return NextResponse.json({ error: 'Player state not found' }, { status: 404 })
  }

  if (!myState.is_alive) {
    return NextResponse.json({ error: 'You are dead' }, { status: 400 })
  }

  const role = myState.role
  if (NO_NIGHT_ACTION_ROLES.has(role)) {
    return NextResponse.json({ error: 'This role has no night action' }, { status: 400 })
  }
  const enabledField = ROLE_ENABLED_FIELD[role]
  if (enabledField && session[enabledField] === false) {
    return NextResponse.json({ error: 'This role is not enabled in this game' }, { status: 400 })
  }

  // Cupid: one-time night-1 link, resolved immediately rather than deferred to phase advance.
  if (role === 'cupid') {
    if (session.day_number !== 1) {
      return NextResponse.json({ error: 'Cupid can only link Lovers on night 1' }, { status: 400 })
    }
    if (session.cupid_lover_ids) {
      return NextResponse.json({ error: 'Lovers have already been linked' }, { status: 400 })
    }
    if (typeof secondTargetPlayerId !== 'string') {
      return NextResponse.json({ error: 'Cupid must choose two players to link' }, { status: 400 })
    }
    if (targetPlayerId === secondTargetPlayerId) {
      return NextResponse.json({ error: 'Cupid must choose two different players' }, { status: 400 })
    }
    const first = playerStates.find((p) => p.player_id === targetPlayerId)
    const second = playerStates.find((p) => p.player_id === secondTargetPlayerId)
    if (!first || !second || !first.is_alive || !second.is_alive) {
      return NextResponse.json({ error: 'Both Lover targets must be alive players' }, { status: 404 })
    }
    // Conditioned on cupid_lover_ids still being unset — the read above and this write are
    // separate round trips, so without this guard two concurrent Cupid submissions could both
    // pass the check and the second would silently overwrite the first pair.
    const { data: linked, error: sessionUpdateError } = await admin
      .from('mafia_sessions')
      .update({ cupid_lover_ids: [targetPlayerId, secondTargetPlayerId] })
      .eq('game_id', gameId)
      .is('cupid_lover_ids', null)
      .select('id')
    if (sessionUpdateError) {
      console.error('Failed to link Lovers:', sessionUpdateError)
      return NextResponse.json({ error: 'Failed to link Lovers' }, { status: 500 })
    }
    if (!linked || linked.length === 0) {
      return NextResponse.json({ error: 'Lovers have already been linked' }, { status: 400 })
    }
    await Promise.all([
      admin
        .from('mafia_player_states')
        .update({ is_lover: true, lover_partner_player_id: secondTargetPlayerId })
        .eq('id', first.id),
      admin
        .from('mafia_player_states')
        .update({ is_lover: true, lover_partner_player_id: targetPlayerId })
        .eq('id', second.id),
    ])
    return NextResponse.json({ success: true })
  }

  // Medium targets a DEAD player for revive (opposite of the usual alive check).
  if (role === 'medium') {
    if (myState.medium_revive_used) {
      return NextResponse.json({ error: 'Medium has already used their revive' }, { status: 400 })
    }
    const targetState = playerStates.find((p) => p.player_id === targetPlayerId)
    if (!targetState) {
      return NextResponse.json({ error: 'Target player not found' }, { status: 404 })
    }
    if (targetState.is_alive) {
      return NextResponse.json({ error: 'Target must be a dead player to revive' }, { status: 400 })
    }
    const { error: updateError } = await admin
      .from('mafia_player_states')
      .update({ night_action_target_player_id: targetPlayerId })
      .eq('id', myState.id)
    if (updateError) {
      return NextResponse.json({ error: 'Failed to submit night action' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  // Arsonist: self-target = ignite, otherwise douse 2 players
  if (role === 'arsonist') {
    const isIgnite = targetPlayerId === playerId
    if (isIgnite) {
      const { error: updateError } = await admin
        .from('mafia_player_states')
        .update({ night_action_target_player_id: playerId, night_action_target_player_id_2: null })
        .eq('id', myState.id)
      if (updateError) return NextResponse.json({ error: 'Failed to submit night action' }, { status: 500 })
      return NextResponse.json({ success: true })
    }
    if (typeof secondTargetPlayerId !== 'string') {
      return NextResponse.json({ error: 'Arsonist must choose two players to douse' }, { status: 400 })
    }
    if (targetPlayerId === secondTargetPlayerId) {
      return NextResponse.json({ error: 'Choose two different players' }, { status: 400 })
    }
    if (targetPlayerId === playerId || secondTargetPlayerId === playerId) {
      return NextResponse.json({ error: 'You cannot douse yourself' }, { status: 400 })
    }
    const t1 = playerStates.find((p) => p.player_id === targetPlayerId)
    const t2 = playerStates.find((p) => p.player_id === secondTargetPlayerId)
    if (!t1 || !t2 || !t1.is_alive || !t2.is_alive) {
      return NextResponse.json({ error: 'Both douse targets must be alive players' }, { status: 400 })
    }
    const { error: updateError } = await admin
      .from('mafia_player_states')
      .update({ night_action_target_player_id: targetPlayerId, night_action_target_player_id_2: secondTargetPlayerId })
      .eq('id', myState.id)
    if (updateError) return NextResponse.json({ error: 'Failed to submit night action' }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  const targetState = playerStates.find((p) => p.player_id === targetPlayerId)
  if (!targetState) {
    return NextResponse.json({ error: 'Target player not found' }, { status: 404 })
  }
  if (!targetState.is_alive) {
    return NextResponse.json({ error: 'Target player is already dead' }, { status: 400 })
  }
  if (NO_SELF_TARGET_ROLES.has(role) && targetPlayerId === playerId) {
    return NextResponse.json({ error: 'You cannot target yourself' }, { status: 400 })
  }

  // 3. Update the player's night action target
  const { error: updateError } = await admin
    .from('mafia_player_states')
    .update({ night_action_target_player_id: targetPlayerId })
    .eq('id', myState.id)

  if (updateError) {
    console.error('Failed to update night action:', updateError)
    return NextResponse.json({ error: 'Failed to submit night action' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
