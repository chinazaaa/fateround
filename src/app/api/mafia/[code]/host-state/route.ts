import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { MafiaPlayerState, MafiaSession, MafiaRole } from '@/types'

const ROLE_ENABLED_KEYS = [
  'doctor_enabled',
  'detective_enabled',
  'bodyguard_enabled',
  'mayor_enabled',
  'vigilante_enabled',
  'tracker_enabled',
  'alpha_wolf_enabled',
  'wolf_cub_enabled',
  'framer_enabled',
  'jester_enabled',
  'serial_killer_enabled',
  'arsonist_enabled',
  'cupid_enabled',
  'cursed_villager_enabled',
] as const

function enabledRolesFrom(session: Pick<MafiaSession, (typeof ROLE_ENABLED_KEYS)[number]>): MafiaRole[] {
  const roles: MafiaRole[] = ['villager', 'mafia']
  const map: Record<(typeof ROLE_ENABLED_KEYS)[number], MafiaRole> = {
    doctor_enabled: 'doctor',
    detective_enabled: 'detective',
    bodyguard_enabled: 'bodyguard',
    mayor_enabled: 'mayor',
    vigilante_enabled: 'vigilante',
    tracker_enabled: 'tracker',
    alpha_wolf_enabled: 'alpha_wolf',
    wolf_cub_enabled: 'wolf_cub',
    framer_enabled: 'framer',
    jester_enabled: 'jester',
    serial_killer_enabled: 'serial_killer',
    arsonist_enabled: 'arsonist',
    cupid_enabled: 'cupid',
    cursed_villager_enabled: 'cursed_villager',
  }
  for (const key of ROLE_ENABLED_KEYS) {
    if (session[key]) roles.push(map[key])
  }
  return roles
}

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
  const { data: game } = await admin
    .from('games')
    .select(
      'host_token, status, title, max_players, timer_seconds, mafia_doctor_enabled, mafia_detective_enabled, mafia_bodyguard_enabled, mafia_mayor_enabled, mafia_vigilante_enabled, mafia_tracker_enabled, mafia_alpha_wolf_enabled, mafia_wolf_cub_enabled, mafia_framer_enabled, mafia_jester_enabled, mafia_serial_killer_enabled, mafia_arsonist_enabled, mafia_cupid_enabled, mafia_cursed_villager_enabled, mafia_anonymous_votes, replay_pending, theme, is_public'
    )
    .eq('id', gameId)
    .maybeSingle()
  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }
  if (game.host_token !== hostToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // 2. Fetch mafia sessions and player states
  const [{ data: playersData }, { data: mafiaSession }, { data: mafiaPlayerStates }] = await Promise.all([
    admin
      .from('players')
      .select('id, name, spectator, is_eliminated')
      .eq('game_id', gameId)
      .order('joined_at', { ascending: true }),
    admin.from('mafia_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    admin.from('mafia_player_states').select('*').eq('game_id', gameId).order('seat_number', { ascending: true }),
  ])

  if (!mafiaSession || !mafiaPlayerStates) {
    if (game.status === 'waiting' || game.status === 'finished') {
      const hostPlayers = (playersData ?? []).map((p, index) => ({
        id: p.id,
        seatNumber: index + 1,
        name: p.name ?? 'Unknown',
        isAlive: true,
        role: 'villager' as const,
        deathDay: null,
        deathCause: null,
        nightActionTargetPlayerId: null,
        dayVoteTargetPlayerId: null,
        spectator: p.spectator === true,
      }))
      return NextResponse.json({
        gameTitle: game.title,
        status: game.status,
        phase: game.status === 'finished' ? 'game_over' : 'role_reveal',
        dayNumber: 0,
        phaseDeadline: null,
        maxPlayers: game.max_players ?? 10,
        timerSeconds: game.timer_seconds ?? 60,
        doctorEnabled: game.mafia_doctor_enabled !== false,
        detectiveEnabled: game.mafia_detective_enabled !== false,
        anonymousVotes: game.mafia_anonymous_votes === true,
        replayPending: game.replay_pending === true,
        theme: game.theme,
        isPublic: game.is_public === true,
        winningTeam: null,
        players: hostPlayers,
        lastNightKillPlayerId: null,
        lastVoteResultPlayerId: null,
        mafiaTargetPlayerId: null,
        doctorTargetPlayerId: null,
        detectTargetPlayerId: null,
        enabledRoles: enabledRolesFrom({
          doctor_enabled: game.mafia_doctor_enabled !== false,
          detective_enabled: game.mafia_detective_enabled !== false,
          bodyguard_enabled: game.mafia_bodyguard_enabled !== false,
          mayor_enabled: game.mafia_mayor_enabled !== false,
          vigilante_enabled: game.mafia_vigilante_enabled !== false,
          tracker_enabled: game.mafia_tracker_enabled !== false,
          alpha_wolf_enabled: game.mafia_alpha_wolf_enabled !== false,
          wolf_cub_enabled: game.mafia_wolf_cub_enabled !== false,
          framer_enabled: game.mafia_framer_enabled !== false,
          jester_enabled: game.mafia_jester_enabled !== false,
          serial_killer_enabled: game.mafia_serial_killer_enabled !== false,
          arsonist_enabled: game.mafia_arsonist_enabled !== false,
          cupid_enabled: game.mafia_cupid_enabled !== false,
          cursed_villager_enabled: game.mafia_cursed_villager_enabled !== false,
        }),
      })
    }
    return NextResponse.json({ error: 'Game session not initialized' }, { status: 404 })
  }

  const session = mafiaSession as MafiaSession
  const playerStates = mafiaPlayerStates as MafiaPlayerState[]

  // Combine player info with their mafia states. Every seated player has a mafia_player_state
  // row (assigned at game start), but a host who joined "Host only" mid-game is a spectator
  // row with no game role at all — included here as a placeholder entry (not in the play, but
  // still needs to show up in the roster/manage list and the host-seat mode reconciliation).
  const stateByPlayerId = new Map(playerStates.map((ps) => [ps.player_id, ps]))
  const hostPlayers = (playersData ?? []).map((p) => {
    const ps = stateByPlayerId.get(p.id)
    if (ps) {
      return {
        id: p.id,
        seatNumber: ps.seat_number,
        name: p.name ?? 'Unknown',
        isAlive: ps.is_alive,
        role: ps.role,
        deathDay: ps.death_day,
        deathCause: ps.death_cause,
        nightActionTargetPlayerId: ps.night_action_target_player_id,
        dayVoteTargetPlayerId: ps.day_vote_target_player_id,
        spectator: p.spectator === true,
      }
    }
    return {
      id: p.id,
      seatNumber: 0,
      name: p.name ?? 'Unknown',
      isAlive: true,
      role: 'villager' as const,
      deathDay: null,
      deathCause: null,
      nightActionTargetPlayerId: null,
      dayVoteTargetPlayerId: null,
      spectator: true,
    }
  })

  return NextResponse.json({
    gameTitle: game.title,
    status: game.status,
    phase: session.phase,
    dayNumber: session.day_number,
    phaseDeadline: session.phase_deadline,
    maxPlayers: game.max_players ?? 10,
    timerSeconds: game.timer_seconds ?? 60,
    doctorEnabled: session.doctor_enabled,
    detectiveEnabled: session.detective_enabled,
    anonymousVotes: session.anonymous_votes,
    replayPending: game.replay_pending === true,
    theme: game.theme,
    isPublic: game.is_public === true,
    winningTeam: session.winning_team,
    players: hostPlayers,
    lastNightKillPlayerId: session.night_kill_player_id,
    lastVoteResultPlayerId: session.vote_result_player_id,
    mafiaTargetPlayerId: session.mafia_target_player_id,
    doctorTargetPlayerId: session.doctor_target_player_id,
    detectTargetPlayerId: session.detect_target_player_id,
    enabledRoles: enabledRolesFrom(session),
  })
}
