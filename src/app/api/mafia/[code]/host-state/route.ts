import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { MafiaPlayerState, MafiaSession } from '@/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  const admin = getSupabaseAdmin()

  let body: { hostToken?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const hostToken = typeof body?.hostToken === 'string' ? body.hostToken : ''
  if (!hostToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Fetch game and verify host token
  const { data: game } = await admin.from('games').select('host_token, status, title').eq('id', gameId).maybeSingle()
  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }
  if (game.host_token !== hostToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // 2. Fetch mafia sessions and player states
  const [{ data: playersData }, { data: mafiaSession }, { data: mafiaPlayerStates }] = await Promise.all([
    admin.from('players').select('id, name, spectator, is_eliminated').eq('game_id', gameId),
    admin.from('mafia_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    admin.from('mafia_player_states').select('*').eq('game_id', gameId),
  ])

  if (!mafiaSession || !mafiaPlayerStates) {
    return NextResponse.json({ error: 'Game session not initialized' }, { status: 404 })
  }

  const session = mafiaSession as MafiaSession
  const playerStates = mafiaPlayerStates as MafiaPlayerState[]

  // Combine player info with their mafia states
  const playersMap = new Map(playersData?.map((p) => [p.id, p]) ?? [])
  const hostPlayers = playerStates.map((ps) => {
    const p = playersMap.get(ps.player_id)
    return {
      id: ps.player_id,
      name: p?.name ?? 'Unknown',
      isAlive: ps.is_alive,
      role: ps.role,
      deathDay: ps.death_day,
      deathCause: ps.death_cause,
      nightActionTargetPlayerId: ps.night_action_target_player_id,
      dayVoteTargetPlayerId: ps.day_vote_target_player_id,
    }
  })

  return NextResponse.json({
    gameTitle: game.title,
    status: game.status,
    phase: session.phase,
    dayNumber: session.day_number,
    phaseDeadline: session.phase_deadline,
    doctorEnabled: session.doctor_enabled,
    detectiveEnabled: session.detective_enabled,
    anonymousVotes: session.anonymous_votes,
    winningTeam: session.winning_team,
    players: hostPlayers,
    lastNightKillPlayerId: session.night_kill_player_id,
    lastVoteResultPlayerId: session.vote_result_player_id,
    mafiaTargetPlayerId: session.mafia_target_player_id,
    doctorTargetPlayerId: session.doctor_target_player_id,
    detectTargetPlayerId: session.detect_target_player_id,
  })
}
