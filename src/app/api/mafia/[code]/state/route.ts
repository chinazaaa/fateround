import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import type {
  MafiaPlayerState,
  MafiaSession,
  MafiaRole,
  MafiaPublicPlayer,
  MafiaMyState,
  MafiaPhase,
  MafiaChatMessage,
} from '@/types'
import { mafiaRoleTeam } from '@/lib/mafia'

const MAFIA_TEAM_ROLES: MafiaRole[] = ['mafia', 'alpha_wolf', 'wolf_cub', 'framer']

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

  let body: { resumeToken?: unknown } | undefined
  try {
    body = await req.json()
  } catch {
    // Treat as spectator / public request
  }

  const resumeToken = typeof body?.resumeToken === 'string' ? body.resumeToken : null

  // 1. Fetch game and players
  const [{ data: game }, { data: playersData }, { data: mafiaSession }, { data: mafiaPlayerStates }] =
    await Promise.all([
      admin.from('games').select('status, title').eq('id', gameId).maybeSingle(),
      admin
        .from('players')
        .select('id, name, spectator, is_eliminated')
        .eq('game_id', gameId)
        .order('joined_at', { ascending: true }),
      admin.from('mafia_sessions').select('*').eq('game_id', gameId).maybeSingle(),
      admin.from('mafia_player_states').select('*').eq('game_id', gameId).order('created_at', { ascending: true }),
    ])

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }
  if (!mafiaSession || !mafiaPlayerStates) {
    if (game.status === 'waiting') {
      const publicPlayers = (playersData ?? []).map((p, index) => ({
        id: p.id,
        seatNumber: index + 1,
        name: p.name ?? 'Unknown',
        isAlive: true,
        deathDay: null,
        deathCause: null,
      }))
      return NextResponse.json({
        gameTitle: game.title,
        status: 'waiting',
        phase: 'role_reveal',
        dayNumber: 0,
        phaseDeadline: null,
        doctorEnabled: true,
        detectiveEnabled: true,
        anonymousVotes: true,
        winningTeam: null,
        players: publicPlayers,
        lastNightKillPlayerId: null,
        lastNightMafiaHadTarget: false,
        lastVoteResultPlayerId: null,
        voteTallies: {},
        enabledRoles: ['villager', 'mafia', 'doctor', 'detective'],
        myState: null,
      })
    }
    return NextResponse.json({ error: 'Game session not initialized' }, { status: 404 })
  }

  const session = mafiaSession as MafiaSession
  const playerStates = mafiaPlayerStates as MafiaPlayerState[]

  // Determine auth player
  let myPlayerState: MafiaPlayerState | undefined = undefined
  if (resumeToken) {
    const auth = await assertPlayer(admin, gameId, resumeToken)
    if (auth.player) {
      myPlayerState = playerStates.find((p) => p.player_id === auth.player.id)
    }
  }

  // 2. Map players to public information
  const playersMap = new Map(playersData?.map((p) => [p.id, p]) ?? [])
  const publicPlayers: MafiaPublicPlayer[] = playerStates.map((ps, index) => {
    const p = playersMap.get(ps.player_id)
    const isGameOver = session.phase === 'game_over'
    const revealRole = !ps.is_alive || isGameOver
    return {
      id: ps.player_id,
      seatNumber: index + 1,
      name: p?.name ?? 'Unknown',
      isAlive: ps.is_alive,
      deathDay: ps.death_day,
      deathCause: ps.death_cause,
      role: revealRole ? ps.role : undefined,
    }
  })

  // 3. Construct private state for player if authenticated
  let myState: MafiaMyState | null = null
  if (myPlayerState) {
    const role = myPlayerState.role
    const team = mafiaRoleTeam(role)

    // Mafia teammates names (mafia/alpha_wolf/wolf_cub/framer all share the wolf-team view)
    let mafiaTeammates: string[] = []
    if (MAFIA_TEAM_ROLES.includes(role)) {
      const mafiaIds = playerStates.filter((p) => MAFIA_TEAM_ROLES.includes(p.role)).map((p) => p.player_id)
      mafiaTeammates = playersData?.filter((p) => mafiaIds.includes(p.id)).map((p) => p.name) ?? []
    }

    // Detective result — honors Framer's frame (reads as 'mafia' if framed that night)
    let detectiveResult: MafiaMyState['detectiveResult'] = null
    if (role === 'detective' && session.detect_target_player_id) {
      const targetState = playerStates.find((p) => p.player_id === session.detect_target_player_id)
      const targetPlayer = playersData?.find((p) => p.id === session.detect_target_player_id)
      if (targetState && targetPlayer) {
        const framed = session.framed_player_id === session.detect_target_player_id
        detectiveResult = {
          targetName: targetPlayer.name,
          alignment: framed ? 'mafia' : mafiaRoleTeam(targetState.role),
        }
      }
    }

    let trackerResult: MafiaMyState['trackerResult'] = null
    if (role === 'tracker' && myPlayerState.night_action_target_player_id) {
      const targetPlayer = playersData?.find((p) => p.id === myPlayerState!.night_action_target_player_id)
      const visitedPlayer = playersData?.find((p) => p.id === session.tracker_visited_player_id)
      if (targetPlayer) {
        trackerResult = { targetName: targetPlayer.name, visitedName: visitedPlayer?.name ?? null }
      }
    }

    let bodyguardLastOutcome: MafiaMyState['bodyguardLastOutcome'] = null
    if (role === 'bodyguard') {
      if (session.bodyguard_sacrifice_player_id === myPlayerState.player_id) bodyguardLastOutcome = 'sacrificed'
      else if (session.bodyguard_target_player_id) bodyguardLastOutcome = 'saved'
      else bodyguardLastOutcome = 'no_attack'
    }

    const vigilanteShotsRemaining =
      role === 'vigilante' ? Math.max(0, 1 - myPlayerState.vigilante_shots_used) : undefined

    let framerLastTargetName: MafiaMyState['framerLastTargetName'] = undefined
    if (role === 'framer' && session.framed_player_id) {
      framerLastTargetName = playersData?.find((p) => p.id === session.framed_player_id)?.name ?? null
    }

    let cupidLinkedNames: MafiaMyState['cupidLinkedNames'] = undefined
    if (role === 'cupid' && session.cupid_lover_ids) {
      const [aId, bId] = session.cupid_lover_ids
      const aName = playersData?.find((p) => p.id === aId)?.name ?? 'Unknown'
      const bName = playersData?.find((p) => p.id === bId)?.name ?? 'Unknown'
      cupidLinkedNames = [aName, bName]
    }

    const isLover = myPlayerState.is_lover
    const loverPartnerName = isLover
      ? (playersData?.find((p) => p.id === myPlayerState!.lover_partner_player_id)?.name ?? null)
      : null

    // Mafia secret chat — persistent across all phases for alive wolf-team members
    let mafiaChatMessages: MafiaMyState['mafiaChatMessages'] = undefined
    if (MAFIA_TEAM_ROLES.includes(role) && myPlayerState.is_alive) {
      const { data: messages } = await admin
        .from('mafia_chat_messages')
        .select('*')
        .eq('game_id', gameId)
        .eq('scope', 'night')
        .order('created_at', { ascending: true })
        .limit(100)
      if (messages) {
        mafiaChatMessages = messages.map((m) => ({
          id: m.id,
          game_id: m.game_id,
          sender_player_id: m.sender_player_id,
          sender_name: m.sender_name,
          message: m.message,
          created_at: m.created_at,
        }))
      }
    }

    myState = {
      role,
      team,
      nightActionSubmitted: !!myPlayerState.night_action_target_player_id,
      dayVoteSubmitted: !!myPlayerState.day_vote_target_player_id,
      detectiveResult,
      mafiaTeammates,
      mafiaChatMessages,
      trackerResult,
      bodyguardLastOutcome,
      vigilanteShotsRemaining,
      framerLastTargetName,
      cupidLinkedNames,
      isLover,
      loverPartnerName,
      enabledRoles: enabledRolesFrom(session),
    }
  }

  // Fetch day chat messages (public to all players during daytime phases)
  let dayChatMessages: MafiaChatMessage[] = []
  const dayPhases: MafiaPhase[] = ['day_report', 'day', 'voting', 'elimination', 'game_over']
  if (dayPhases.includes(session.phase)) {
    const { data: messages } = await admin
      .from('mafia_chat_messages')
      .select('*')
      .eq('game_id', gameId)
      .eq('scope', 'day')
      .order('created_at', { ascending: true })
      .limit(100)
    if (messages) {
      dayChatMessages = messages.map((m) => ({
        id: m.id,
        game_id: m.game_id,
        sender_player_id: m.sender_player_id,
        sender_name: m.sender_name,
        message: m.message,
        created_at: m.created_at,
      }))
    }
  }

  // Ghost chat — only for eliminated players
  let ghostChatMessages: MafiaChatMessage[] | undefined = undefined
  if (myPlayerState && !myPlayerState.is_alive) {
    const { data: ghostMessages } = await admin
      .from('mafia_chat_messages')
      .select('*')
      .eq('game_id', gameId)
      .eq('scope', 'ghost')
      .order('created_at', { ascending: true })
      .limit(100)
    if (ghostMessages) {
      ghostChatMessages = ghostMessages.map((m) => ({
        id: m.id,
        game_id: m.game_id,
        sender_player_id: m.sender_player_id,
        sender_name: m.sender_name,
        message: m.message,
        created_at: m.created_at,
      }))
    }
  }

  // Calculate vote tallies if public votes
  const voteTallies: Record<string, number> = {}
  playerStates.forEach((ps) => {
    if (ps.day_vote_target_player_id) {
      voteTallies[ps.day_vote_target_player_id] = (voteTallies[ps.day_vote_target_player_id] || 0) + 1
    }
  })

  return NextResponse.json({
    // Public state
    gameTitle: game.title,
    status: game.status,
    phase: session.phase,
    dayNumber: session.day_number,
    phaseDeadline: session.phase_deadline,
    doctorEnabled: session.doctor_enabled,
    detectiveEnabled: session.detective_enabled,
    anonymousVotes: session.anonymous_votes,
    winningTeam: session.winning_team,
    players: publicPlayers,
    lastNightKillPlayerId: session.night_kill_player_id,
    lastNightMafiaHadTarget: session.mafia_target_player_id != null,
    lastVoteResultPlayerId: session.vote_result_player_id,
    voteTallies: session.anonymous_votes && session.phase === 'voting' ? {} : voteTallies,
    dayChatMessages,
    ghostChatMessages,
    enabledRoles: enabledRolesFrom(session),

    // Private state
    myState,
  })
}
