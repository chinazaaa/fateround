import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { checkMafiaWinCondition, mafiaRoleTeam, resolveWolfCubRevenge } from '@/lib/mafia'
import { markGameFinished } from '@/lib/game-finish'
import type { MafiaPlayerState, MafiaSession } from '@/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  const admin = getSupabaseAdmin()

  let body: { resumeToken?: unknown; targetPlayerId?: unknown; action?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { resumeToken, targetPlayerId, action } = body
  if (typeof resumeToken !== 'string' || typeof targetPlayerId !== 'string') {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }
  if (action !== 'shoot' && action !== 'reveal') {
    return NextResponse.json({ error: 'Action must be "shoot" or "reveal"' }, { status: 400 })
  }

  const auth = await assertPlayer(admin, gameId, resumeToken)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const playerId = auth.player.id

  const [{ data: mafiaSession }, { data: mafiaPlayerStates }] = await Promise.all([
    admin.from('mafia_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    admin.from('mafia_player_states').select('*').eq('game_id', gameId),
  ])

  if (!mafiaSession || !mafiaPlayerStates) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  const session = mafiaSession as MafiaSession
  const playerStates = mafiaPlayerStates as MafiaPlayerState[]

  if (session.phase !== 'day' && session.phase !== 'voting') {
    return NextResponse.json({ error: 'Vigilante can only act during the day' }, { status: 400 })
  }

  const myState = playerStates.find((p) => p.player_id === playerId)
  if (!myState || !myState.is_alive || myState.role !== 'vigilante') {
    return NextResponse.json({ error: 'Only an alive Vigilante can use this action' }, { status: 403 })
  }

  const targetState = playerStates.find((p) => p.player_id === targetPlayerId)
  if (!targetState || !targetState.is_alive) {
    return NextResponse.json({ error: 'Target must be an alive player' }, { status: 400 })
  }
  if (targetPlayerId === playerId) {
    return NextResponse.json({ error: 'Cannot target yourself' }, { status: 400 })
  }

  const nameById = new Map(
    ((await admin.from('players').select('id, name').eq('game_id', gameId)).data ?? []).map((p) => [p.id, p.name])
  )
  const playerLabel = (pid: string) => {
    const ps = playerStates.find((p) => p.player_id === pid)
    const name = nameById.get(pid) ?? 'Unknown'
    return ps ? `#${ps.seat_number} ${name}` : name
  }

  if (action === 'shoot') {
    if (myState.vigilante_shots_used >= 1) {
      return NextResponse.json({ error: 'You have already used your shot' }, { status: 400 })
    }

    const { data: updated } = await admin
      .from('mafia_player_states')
      .update({ vigilante_shots_used: myState.vigilante_shots_used + 1 })
      .eq('id', myState.id)
      .eq('vigilante_shots_used', myState.vigilante_shots_used)
      .select('id')
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Action already used' }, { status: 400 })
    }

    await admin
      .from('mafia_player_states')
      .update({ is_alive: false, death_day: session.day_number, death_cause: 'vigilante_kill' })
      .eq('game_id', gameId)
      .eq('player_id', targetPlayerId)
    await admin.from('players').update({ is_eliminated: true }).eq('game_id', gameId).eq('id', targetPlayerId)
    await admin.from('mafia_sessions').update({ vigilante_day_kill_player_id: targetPlayerId }).eq('game_id', gameId)

    const targetName = playerLabel(targetPlayerId)
    const vigName = playerLabel(playerId)
    await admin.from('mafia_chat_messages').insert({
      game_id: gameId,
      sender_player_id: 'system',
      sender_name: '📢',
      message: `🔫 ${vigName} (Vigilante) shot ${targetName}!`,
      scope: 'day',
    })

    const pIndex = playerStates.findIndex((p) => p.player_id === targetPlayerId)
    if (pIndex !== -1) playerStates[pIndex].is_alive = false

    if (targetState.role === 'wolf_cub') {
      const insertMsg = async (msg: string) => {
        await admin.from('mafia_chat_messages').insert({
          game_id: gameId,
          sender_player_id: 'system',
          sender_name: '📢',
          message: msg,
          scope: 'day',
        })
      }
      await resolveWolfCubRevenge(admin, gameId, playerStates, targetState, session.day_number, insertMsg, playerLabel)
    }

    const winTeam = checkMafiaWinCondition(playerStates)
    if (winTeam) {
      await admin
        .from('mafia_sessions')
        .update({ phase: 'game_over', winning_team: winTeam, phase_deadline: null })
        .eq('game_id', gameId)
      await markGameFinished(admin, gameId)
    }

    return NextResponse.json({ success: true, killed: true })
  }

  // action === 'reveal'
  if (myState.vigilante_reveal_used) {
    return NextResponse.json({ error: 'You have already used your reveal' }, { status: 400 })
  }
  if (myState.vigilante_shots_used >= 1 && session.day_number === session.day_number) {
    // Both actions can't be used on the same day — but since shoot is immediate and
    // removes the shot, we just check if they already used the shot THIS phase
    // (vigilante_day_kill_player_id is set for this day).
    if (session.vigilante_day_kill_player_id) {
      return NextResponse.json({ error: 'Cannot use both actions on the same day' }, { status: 400 })
    }
  }

  const { data: updated } = await admin
    .from('mafia_player_states')
    .update({ vigilante_reveal_used: true })
    .eq('id', myState.id)
    .eq('vigilante_reveal_used', false)
    .select('id')
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Reveal already used' }, { status: 400 })
  }

  await admin.from('mafia_sessions').update({ vigilante_reveal_player_id: targetPlayerId }).eq('game_id', gameId)

  const targetRole = targetState.role
  const isVillageTeam = mafiaRoleTeam(targetRole) === 'village'

  // If the target is NOT a villager, reveal the Vigilante's role to them
  if (!isVillageTeam) {
    await admin.from('mafia_chat_messages').insert({
      game_id: gameId,
      sender_player_id: 'system',
      sender_name: '🔒',
      message: `🔫 The Vigilante has investigated you — your identities are now known to each other.`,
      scope: 'day',
      target_player_id: targetPlayerId,
    })
  }

  return NextResponse.json({
    success: true,
    revealedRole: targetRole,
    revealedName: nameById.get(targetPlayerId) ?? 'Unknown',
  })
}
