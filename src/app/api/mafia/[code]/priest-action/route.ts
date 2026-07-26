import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { checkMafiaWinCondition, mafiaRoleTeam, resolveWolfCubRevenge } from '@/lib/mafia'
import { markGameFinished } from '@/lib/game-finish'
import type { MafiaPlayerState, MafiaSession } from '@/types'

const MAFIA_TEAM_ROLES = new Set(['mafia', 'alpha_wolf', 'wolf_cub', 'framer'])

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  const admin = getSupabaseAdmin()

  let body: { resumeToken?: unknown; targetPlayerId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { resumeToken, targetPlayerId } = body
  if (typeof resumeToken !== 'string' || typeof targetPlayerId !== 'string') {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
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
    return NextResponse.json({ error: 'Priest can only act during the day' }, { status: 400 })
  }

  const myState = playerStates.find((p) => p.player_id === playerId)
  if (!myState || !myState.is_alive || myState.role !== 'priest') {
    return NextResponse.json({ error: 'Only an alive Priest can use this action' }, { status: 403 })
  }

  const targetState = playerStates.find((p) => p.player_id === targetPlayerId)
  if (!targetState || !targetState.is_alive) {
    return NextResponse.json({ error: 'Target must be an alive player' }, { status: 400 })
  }
  if (targetPlayerId === playerId) {
    return NextResponse.json({ error: 'Cannot target yourself' }, { status: 400 })
  }

  // CAS: only succeed if holy water hasn't been used yet
  const { data: updated } = await admin
    .from('mafia_player_states')
    .update({ priest_holy_water_used: true })
    .eq('id', myState.id)
    .eq('priest_holy_water_used', false)
    .select('id')
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Holy water already used' }, { status: 400 })
  }

  const nameById = new Map(
    ((await admin.from('players').select('id, name').eq('game_id', gameId)).data ?? []).map((p) => [p.id, p.name])
  )
  const playerLabel = (pid: string) => {
    const ps = playerStates.find((p) => p.player_id === pid)
    const name = nameById.get(pid) ?? 'Unknown'
    return ps ? `#${ps.seat_number} ${name}` : name
  }

  const targetName = playerLabel(targetPlayerId)
  const priestName = playerLabel(playerId)
  const targetIsMafia = MAFIA_TEAM_ROLES.has(targetState.role)

  if (targetIsMafia) {
    // Target is mafia → target dies
    await admin
      .from('mafia_player_states')
      .update({ is_alive: false, death_day: session.day_number, death_cause: 'vigilante_kill' })
      .eq('game_id', gameId)
      .eq('player_id', targetPlayerId)
    await admin.from('players').update({ is_eliminated: true }).eq('game_id', gameId).eq('id', targetPlayerId)

    await admin.from('mafia_chat_messages').insert({
      game_id: gameId,
      sender_player_id: 'system',
      sender_name: '📢',
      message: `⛪ ${priestName} threw holy water on ${targetName} — they were Mafia and have been killed!`,
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
  } else {
    // Target is NOT mafia → priest dies, target's innocence announced
    await admin
      .from('mafia_player_states')
      .update({ is_alive: false, death_day: session.day_number, death_cause: 'vigilante_kill' })
      .eq('game_id', gameId)
      .eq('player_id', playerId)
    await admin.from('players').update({ is_eliminated: true }).eq('game_id', gameId).eq('id', playerId)

    await admin.from('mafia_chat_messages').insert({
      game_id: gameId,
      sender_player_id: 'system',
      sender_name: '📢',
      message: `⛪ ${priestName} threw holy water on ${targetName} — they are NOT Mafia! The Priest has died.`,
      scope: 'day',
    })

    const pIndex = playerStates.findIndex((p) => p.player_id === playerId)
    if (pIndex !== -1) playerStates[pIndex].is_alive = false
  }

  const winTeam = checkMafiaWinCondition(playerStates)
  if (winTeam) {
    await admin
      .from('mafia_sessions')
      .update({ phase: 'game_over', winning_team: winTeam, phase_deadline: null })
      .eq('game_id', gameId)
    await markGameFinished(admin, gameId)
  }

  return NextResponse.json({ success: true, targetWasMafia: targetIsMafia })
}
