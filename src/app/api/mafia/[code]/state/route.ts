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
import { mafiaRoleTeam, auraSeerAlignment } from '@/lib/mafia'

const MAFIA_TEAM_ROLES: MafiaRole[] = ['mafia', 'alpha_wolf', 'wolf_cub', 'framer', 'mafia_seer']

const ROLE_ENABLED_KEYS = [
  'doctor_enabled',
  'detective_enabled',
  'aura_seer_enabled',
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
  'medium_enabled',
  'priest_enabled',
  'witch_enabled',
  'little_girl_enabled',
  'trapper_enabled',
  'seer_enabled',
  'mafia_seer_enabled',
] as const

function enabledRolesFrom(session: Pick<MafiaSession, (typeof ROLE_ENABLED_KEYS)[number]>): MafiaRole[] {
  const roles: MafiaRole[] = ['villager', 'mafia']
  const map: Record<(typeof ROLE_ENABLED_KEYS)[number], MafiaRole> = {
    doctor_enabled: 'doctor',
    detective_enabled: 'detective',
    aura_seer_enabled: 'aura_seer',
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
    medium_enabled: 'medium',
    priest_enabled: 'priest',
    witch_enabled: 'witch',
    little_girl_enabled: 'little_girl',
    trapper_enabled: 'trapper',
    seer_enabled: 'seer',
    mafia_seer_enabled: 'mafia_seer',
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
      admin.from('mafia_player_states').select('*').eq('game_id', gameId).order('seat_number', { ascending: true }),
    ])

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }
  if (!mafiaSession || !mafiaPlayerStates) {
    if (game.status === 'waiting' || game.status === 'finished') {
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
        status: game.status,
        phase: game.status === 'finished' ? 'game_over' : 'role_reveal',
        dayNumber: 0,
        phaseDeadline: null,
        doctorEnabled: true,
        detectiveEnabled: true,
        auraSeerEnabled: true,
        anonymousVotes: true,
        winningTeam: null,
        players: publicPlayers,
        lastNightKillPlayerId: null,
        lastNightMafiaHadTarget: false,
        lastVoteResultPlayerId: null,
        voteTallies: {},
        enabledRoles: ['villager', 'mafia', 'doctor', 'aura_seer'],
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
  const publicPlayers: MafiaPublicPlayer[] = playerStates.map((ps) => {
    const p = playersMap.get(ps.player_id)
    const isGameOver = session.phase === 'game_over'
    const revealRole = !ps.is_alive || isGameOver
    return {
      id: ps.player_id,
      seatNumber: ps.seat_number,
      name: p?.name ?? 'Unknown',
      isAlive: ps.is_alive,
      deathDay: ps.death_day,
      deathCause: ps.death_cause,
      role: revealRole ? ps.role : undefined,
      revivedByMedium: ps.revived_by_medium,
    }
  })

  // 3. Construct private state for player if authenticated
  let myState: MafiaMyState | null = null
  if (myPlayerState) {
    const role = myPlayerState.role
    const team = mafiaRoleTeam(role)

    // Mafia teammates names (mafia/alpha_wolf/wolf_cub/framer all share the wolf-team view)
    let mafiaTeammates: string[] = []
    let mafiaTeammateIds: string[] = []
    let mafiaTeammateRoles: MafiaMyState['mafiaTeammateRoles'] = {}
    let mafiaTeammateNightTargets: Record<string, string | null> | undefined = undefined
    // Every role the Mafia Seer has ever revealed, keyed by player id — only ever built
    // for mafia-team members, never sent to villagers/spectators.
    let mafiaSeerRevealedRoles: MafiaMyState['mafiaSeerRevealedRoles'] = undefined
    if (MAFIA_TEAM_ROLES.includes(role)) {
      const teammates = playerStates.filter(
        (p) => MAFIA_TEAM_ROLES.includes(p.role) && p.player_id !== myPlayerState.player_id
      )
      mafiaTeammateIds = teammates.map((p) => p.player_id)
      mafiaTeammates = playersData?.filter((p) => mafiaTeammateIds.includes(p.id)).map((p) => p.name) ?? []
      mafiaTeammateRoles = Object.fromEntries(teammates.map((p) => [p.player_id, p.role]))

      if (session.phase === 'night') {
        mafiaTeammateNightTargets = Object.fromEntries(
          teammates.map((p) => [p.player_id, p.night_action_target_player_id ?? null])
        )
      }

      mafiaSeerRevealedRoles = Object.fromEntries((session.mafia_seer_revealed ?? []).map((r) => [r.playerId, r.role]))
    }

    // Seat-numbered display name ("#5 Naza") — used for every player mentioned in a private
    // reveal below, so it always reads unambiguously which of possibly-several same-named
    // players is meant, matching the "#N Name" convention already used in chat.
    const seatById = new Map(playerStates.map((p) => [p.player_id, p.seat_number]))
    const seatLabel = (playerId: string, name: string) => {
      const seat = seatById.get(playerId)
      return seat != null ? `#${seat} ${name}` : name
    }

    // Aura Seer result — Good/Evil/Unknown, honors Framer's frame (always reads Evil if framed)
    let auraSeerResult: MafiaMyState['auraSeerResult'] = null
    if (role === 'aura_seer' && session.aura_seer_target_player_id) {
      const targetState = playerStates.find((p) => p.player_id === session.aura_seer_target_player_id)
      const targetPlayer = playersData?.find((p) => p.id === session.aura_seer_target_player_id)
      if (targetState && targetPlayer) {
        const framed = session.framed_player_id === session.aura_seer_target_player_id
        auraSeerResult = {
          targetName: seatLabel(targetPlayer.id, targetPlayer.name),
          alignment: auraSeerAlignment(targetState.role, framed),
        }
      }
    }

    // Detective result — checks two players for same-team membership, honoring the Framer's
    // frame on either target. Only shown after the night resolves (picks are made THIS night).
    let detectiveTeamCheckResult: MafiaMyState['detectiveTeamCheckResult'] = null
    if (
      role === 'detective' &&
      session.phase !== 'night' &&
      myPlayerState.night_action_target_player_id &&
      myPlayerState.night_action_target_player_id_2
    ) {
      const aId = myPlayerState.night_action_target_player_id
      const bId = myPlayerState.night_action_target_player_id_2
      const aState = playerStates.find((p) => p.player_id === aId)
      const bState = playerStates.find((p) => p.player_id === bId)
      const aPlayer = playersData?.find((p) => p.id === aId)
      const bPlayer = playersData?.find((p) => p.id === bId)
      if (aState && bState && aPlayer && bPlayer) {
        const teamOf = (playerId: string, state: MafiaPlayerState) =>
          session.framed_player_id === playerId ? 'mafia' : mafiaRoleTeam(state.role)
        detectiveTeamCheckResult = {
          targetAName: seatLabel(aPlayer.id, aPlayer.name),
          targetBName: seatLabel(bPlayer.id, bPlayer.name),
          sameTeam: teamOf(aId, aState) === teamOf(bId, bState),
        }
      }
    }

    // Seer result — full role reveal, village-aligned, no restrictions
    let seerResult: MafiaMyState['seerResult'] = null
    if (role === 'seer' && session.seer_target_player_id) {
      const targetState = playerStates.find((p) => p.player_id === session.seer_target_player_id)
      const targetPlayer = playersData?.find((p) => p.id === session.seer_target_player_id)
      if (targetState && targetPlayer) {
        seerResult = { targetName: seatLabel(targetPlayer.id, targetPlayer.name), role: targetState.role }
      }
    }

    // Mafia Seer result — full role reveal (nothing auto-shared with the crew; they relay it
    // themselves via the secret chat)
    let mafiaSeerResult: MafiaMyState['mafiaSeerResult'] = null
    if (role === 'mafia_seer' && session.mafia_seer_target_player_id) {
      const targetState = playerStates.find((p) => p.player_id === session.mafia_seer_target_player_id)
      const targetPlayer = playersData?.find((p) => p.id === session.mafia_seer_target_player_id)
      if (targetState && targetPlayer) {
        mafiaSeerResult = { targetName: seatLabel(targetPlayer.id, targetPlayer.name), role: targetState.role }
      }
    }

    let trackerResult: MafiaMyState['trackerResult'] = null
    // Only reveal the tracker result after night resolves (day_report onward) — during the
    // night itself tracker_visited_player_id isn't set yet, so showing the card would
    // misleadingly say "visited no one" before the night has even ended.
    if (role === 'tracker' && session.phase !== 'night' && myPlayerState.night_action_target_player_id) {
      const targetPlayer = playersData?.find((p) => p.id === myPlayerState!.night_action_target_player_id)
      const visitedPlayer = playersData?.find((p) => p.id === session.tracker_visited_player_id)
      if (targetPlayer) {
        trackerResult = {
          targetName: seatLabel(targetPlayer.id, targetPlayer.name),
          visitedName: visitedPlayer ? seatLabel(visitedPlayer.id, visitedPlayer.name) : null,
        }
      }
    }

    let bodyguardLastOutcome: MafiaMyState['bodyguardLastOutcome'] = null
    if (role === 'bodyguard') {
      if (session.bodyguard_sacrifice_player_id === myPlayerState.player_id) {
        bodyguardLastOutcome = 'sacrificed'
      } else if (
        session.bodyguard_target_player_id &&
        (session.bodyguard_target_player_id === session.mafia_target_player_id ||
          session.bodyguard_target_player_id === session.serial_kill_player_id)
      ) {
        bodyguardLastOutcome = 'absorbed'
      } else if (
        session.mafia_target_player_id === myPlayerState.player_id ||
        session.serial_kill_player_id === myPlayerState.player_id
      ) {
        bodyguardLastOutcome = 'absorbed'
      } else {
        bodyguardLastOutcome = 'no_attack'
      }
    }

    let doctorLastOutcome: MafiaMyState['doctorLastOutcome'] = null
    if (role === 'doctor' && session.doctor_target_player_id) {
      const wasAttacked =
        session.doctor_target_player_id === session.mafia_target_player_id ||
        session.doctor_target_player_id === session.serial_kill_player_id
      doctorLastOutcome = wasAttacked ? 'saved' : 'no_attack'
    }

    const vigilanteShotsRemaining =
      role === 'vigilante' ? Math.max(0, 1 - myPlayerState.vigilante_shots_used) : undefined
    const vigilanteRevealRemaining = role === 'vigilante' ? (myPlayerState.vigilante_reveal_used ? 0 : 1) : undefined

    let vigilanteRevealResult: MafiaMyState['vigilanteRevealResult'] = undefined
    if (role === 'vigilante' && session.vigilante_reveal_player_id) {
      const revealedPs = playerStates.find((p) => p.player_id === session.vigilante_reveal_player_id)
      const revealedPlayer = playersData?.find((p) => p.id === session.vigilante_reveal_player_id)
      if (revealedPs && revealedPlayer) {
        vigilanteRevealResult = {
          targetName: seatLabel(revealedPlayer.id, revealedPlayer.name),
          role: revealedPs.role,
        }
      }
    }

    const mediumReviveRemaining = role === 'medium' ? (myPlayerState.medium_revive_used ? 0 : 1) : undefined
    const priestHolyWaterRemaining = role === 'priest' ? (myPlayerState.priest_holy_water_used ? 0 : 1) : undefined
    const witchHealRemaining = role === 'witch' ? (myPlayerState.witch_heal_used ? 0 : 1) : undefined
    const witchKillRemaining = role === 'witch' ? (myPlayerState.witch_kill_used ? 0 : 1) : undefined

    let trapperTrappedNames: MafiaMyState['trapperTrappedNames'] = undefined
    if (role === 'trapper') {
      const trappedIds = myPlayerState.trapper_trap_player_ids ?? []
      trapperTrappedNames = trappedIds.map((id) => {
        const p = playersData?.find((pd) => pd.id === id)
        return p ? seatLabel(p.id, p.name) : 'Unknown'
      })
    }

    let mediumGhostChat: MafiaMyState['mediumGhostChat'] = undefined
    if (role === 'medium' && myPlayerState.is_alive && session.phase === 'night') {
      const { data: ghostMessages } = await admin
        .from('mafia_chat_messages')
        .select('*')
        .eq('game_id', gameId)
        .eq('scope', 'ghost')
        .order('created_at', { ascending: true })
        .limit(100)
      if (ghostMessages) {
        mediumGhostChat = ghostMessages.map((m) => ({
          id: m.id,
          game_id: m.game_id,
          sender_player_id: m.sender_player_id,
          sender_name: m.sender_name,
          message: m.message,
          created_at: m.created_at,
        }))
      }
    }

    let framerLastTargetName: MafiaMyState['framerLastTargetName'] = undefined
    if (role === 'framer' && session.framed_player_id) {
      const framed = playersData?.find((p) => p.id === session.framed_player_id)
      framerLastTargetName = framed ? seatLabel(framed.id, framed.name) : null
    }

    let wolfCubRevengeTargetName: MafiaMyState['wolfCubRevengeTargetName'] = undefined
    if (role === 'wolf_cub' && myPlayerState.wolf_cub_revenge_target_player_id) {
      const target = playersData?.find((p) => p.id === myPlayerState.wolf_cub_revenge_target_player_id)
      wolfCubRevengeTargetName = target ? seatLabel(target.id, target.name) : null
    }

    let cupidLinkedNames: MafiaMyState['cupidLinkedNames'] = undefined
    if (role === 'cupid' && session.cupid_lover_ids) {
      const [aId, bId] = session.cupid_lover_ids
      const aPlayer = playersData?.find((p) => p.id === aId)
      const bPlayer = playersData?.find((p) => p.id === bId)
      cupidLinkedNames = [
        aPlayer ? seatLabel(aPlayer.id, aPlayer.name) : 'Unknown',
        bPlayer ? seatLabel(bPlayer.id, bPlayer.name) : 'Unknown',
      ]
    }

    const isLover = myPlayerState.is_lover
    const loverPartner = isLover ? playersData?.find((p) => p.id === myPlayerState!.lover_partner_player_id) : undefined
    const loverPartnerName = isLover ? (loverPartner ? seatLabel(loverPartner.id, loverPartner.name) : null) : null

    // Lover ids for the roster grid's heart badge — only visible to Cupid and the two Lovers
    // themselves, so their tiles are marked for people who already know, without outing them.
    let loverIds: MafiaMyState['loverIds'] = undefined
    if (session.cupid_lover_ids) {
      const [aId, bId] = session.cupid_lover_ids
      if (role === 'cupid' || myPlayerState.player_id === aId || myPlayerState.player_id === bId) {
        loverIds = [aId, bId]
      }
    }

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
      auraSeerResult,
      detectiveTeamCheckResult,
      seerResult,
      mafiaSeerResult,
      mafiaTeammates,
      mafiaTeammateIds,
      mafiaTeammateRoles,
      mafiaTeammateNightTargets,
      mafiaSeerRevealedRoles,
      mafiaChatMessages,
      trackerResult,
      bodyguardLastOutcome,
      doctorLastOutcome,
      vigilanteShotsRemaining,
      vigilanteRevealRemaining,
      vigilanteRevealResult,
      mediumReviveRemaining,
      priestHolyWaterRemaining,
      witchHealRemaining,
      witchKillRemaining,
      trapperTrappedNames,
      mediumGhostChat,
      framerLastTargetName,
      wolfCubRevengeTargetName,
      cupidLinkedNames,
      isLover,
      loverPartnerName,
      loverIds,
      enabledRoles: enabledRolesFrom(session),
    }
  }

  // Fetch Town Discussion history — visible at night too now (read-only there; see
  // MafiaDayChat's readOnly prop), so only role_reveal (before any town chat exists) skips it.
  let dayChatMessages: MafiaChatMessage[] = []
  const dayPhases: MafiaPhase[] = ['night', 'day_report', 'day', 'voting', 'elimination', 'game_over']
  if (dayPhases.includes(session.phase)) {
    // Fetch public day messages (target_player_id is null) and private ones addressed
    // to this player — investigation/tracking results persisted as private system lines.
    const { data: messages } = await admin
      .from('mafia_chat_messages')
      .select('*')
      .eq('game_id', gameId)
      .eq('scope', 'day')
      .or(
        myPlayerState
          ? `target_player_id.is.null,target_player_id.eq.${myPlayerState.player_id}`
          : 'target_player_id.is.null'
      )
      .order('created_at', { ascending: true })
      .limit(200)
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

  // Ghost chat — for eliminated players and alive Medium at night
  let ghostChatMessages: MafiaChatMessage[] | undefined = undefined
  const isMediumAtNight = myPlayerState?.is_alive && myPlayerState?.role === 'medium' && session.phase === 'night'
  if ((myPlayerState && !myPlayerState.is_alive) || isMediumAtNight) {
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

  // Calculate vote tallies + per-voter choices (who voted for whom), if votes are public.
  // votedPlayerIds (just *whether* someone voted, not for whom) is exposed even when
  // anonymous, so anonymous mode can still show a "?" sign on a voter's tile instead of no
  // sign at all — matching Wolvesville's anonymous-voting display.
  const voteTallies: Record<string, number> = {}
  const voteChoices: Record<string, string> = {}
  const votedPlayerIds: string[] = []
  playerStates.forEach((ps) => {
    if (ps.is_alive && ps.day_vote_target_player_id) {
      // The Mayor's vote counts double toward the lynch majority (see resolveMafiaDayVote) —
      // weight the displayed tally the same way so it agrees with the actual resolved outcome.
      const weight = ps.role === 'mayor' ? 2 : 1
      voteTallies[ps.day_vote_target_player_id] = (voteTallies[ps.day_vote_target_player_id] || 0) + weight
      voteChoices[ps.player_id] = ps.day_vote_target_player_id
      votedPlayerIds.push(ps.player_id)
    }
  })
  const aliveCount = playerStates.filter((ps) => ps.is_alive).length
  const votesRequired = Math.floor(aliveCount / 2) + 1

  // How many players are still alive with each role — shown as "x{count}" in the roles
  // drawer, matching Wolvesville, and decrementing as role-holders are eliminated.
  const roleCounts: Partial<Record<MafiaRole, number>> = {}
  playerStates.forEach((ps) => {
    if (ps.is_alive) roleCounts[ps.role] = (roleCounts[ps.role] ?? 0) + 1
  })

  // Roles actually assigned to someone this game (alive or dead) — the Roles drawer should
  // only advertise roles someone is really playing, not every role the host toggled on.
  const rolesInGame = Array.from(new Set(playerStates.map((ps) => ps.role)))

  // Skip-ahead tally for the current Discussion/Voting phase — same majority threshold as a
  // lynch vote, reset whenever a fresh 'day'/'voting' phase starts (see advance/route.ts).
  const skipRequestCount = session.skip_requested_player_ids?.length ?? 0
  const hasRequestedSkip =
    !!myPlayerState && (session.skip_requested_player_ids ?? []).includes(myPlayerState.player_id)

  return NextResponse.json({
    // Public state
    gameTitle: game.title,
    status: game.status,
    phase: session.phase,
    dayNumber: session.day_number,
    phaseDeadline: session.phase_deadline,
    doctorEnabled: session.doctor_enabled,
    detectiveEnabled: session.detective_enabled,
    auraSeerEnabled: session.aura_seer_enabled,
    anonymousVotes: session.anonymous_votes,
    winningTeam: session.winning_team,
    players: publicPlayers,
    lastNightKillPlayerId: session.night_kill_player_id,
    lastNightMafiaHadTarget: session.mafia_target_player_id != null,
    lastVoteResultPlayerId: session.vote_result_player_id,
    voteTallies: session.anonymous_votes && session.phase === 'voting' ? {} : voteTallies,
    voteChoices: session.anonymous_votes && session.phase === 'voting' ? {} : voteChoices,
    votedPlayerIds,
    votesRequired,
    dayChatMessages,
    ghostChatMessages,
    enabledRoles: enabledRolesFrom(session),
    rolesInGame,
    roleCounts,
    skipRequiredCount: votesRequired,
    skipRequestCount,
    hasRequestedSkip,

    // Private state
    myState,
  })
}
