import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import type { MafiaPlayerState, MafiaSession, MafiaRole, MafiaTeam, MafiaPublicPlayer, MafiaMyState } from '@/types'
import { checkMafiaWinCondition } from '@/lib/mafia'

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
  const [{ data: game }, { data: playersData }, { data: mafiaSession }, { data: mafiaPlayerStates }] = await Promise.all([
    admin.from('games').select('status, title').eq('id', gameId).maybeSingle(),
    admin.from('players').select('id, name, spectator, is_eliminated').eq('game_id', gameId),
    admin.from('mafia_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    admin.from('mafia_player_states').select('*').eq('game_id', gameId),
  ])

  if (!game || !mafiaSession || !mafiaPlayerStates) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  const session = mafiaSession as MafiaSession
  const playerStates = mafiaPlayerStates as MafiaPlayerState[]

  // Determine auth player
  let myPlayerState: MafiaPlayerState | undefined = undefined
  let isAuthorizedPlayer = false
  if (resumeToken) {
    const auth = await assertPlayer(admin, gameId, resumeToken)
    if (auth.player) {
      myPlayerState = playerStates.find(p => p.player_id === auth.player.id)
      isAuthorizedPlayer = !!myPlayerState
    }
  }

  // 2. Map players to public information
  const playersMap = new Map(playersData?.map(p => [p.id, p]) ?? [])
  const publicPlayers: MafiaPublicPlayer[] = playerStates.map(ps => {
    const p = playersMap.get(ps.player_id)
    const isGameOver = session.phase === 'game_over'
    const revealRole = !ps.is_alive || isGameOver
    return {
      id: ps.player_id,
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
    const team: MafiaTeam = role === 'mafia' ? 'mafia' : 'village'
    
    // Mafia teammates names
    let mafiaTeammates: string[] = []
    if (role === 'mafia') {
      const mafiaIds = playerStates.filter(p => p.role === 'mafia').map(p => p.player_id)
      mafiaTeammates = playersData
        ?.filter(p => mafiaIds.includes(p.id))
        .map(p => p.name) ?? []
    }

    // Detective result — use the session-level resolved target (persists across day cycles)
    // rather than the player's live action target which is cleared at the start of each night
    let detectiveResult: MafiaMyState['detectiveResult'] = null
    if (role === 'detective' && session.detect_target_player_id && session.phase !== 'night') {
      const targetState = playerStates.find(p => p.player_id === session.detect_target_player_id)
      const targetPlayer = playersData?.find(p => p.id === session.detect_target_player_id)
      if (targetState && targetPlayer) {
        detectiveResult = {
          targetName: targetPlayer.name,
          alignment: targetState.role === 'mafia' ? 'mafia' : 'village',
        }
      }
    }

    // Mafia night chat — only for alive Mafia members during the night phase
    let mafiaChatMessages: MafiaMyState['mafiaChatMessages'] = undefined
    if (role === 'mafia' && myPlayerState.is_alive && session.phase === 'night') {
      const { data: messages } = await admin
        .from('mafia_chat_messages')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: true })
        .limit(50)
      if (messages) {
        mafiaChatMessages = messages.map(m => ({
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
    }
  }

  // Calculate vote tallies if public votes
  // Let's count day votes for display
  const voteTallies: Record<string, number> = {}
  playerStates.forEach(ps => {
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
    
    // Private state
    myState,
  })
}
