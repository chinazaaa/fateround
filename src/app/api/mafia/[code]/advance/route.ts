import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { markGameFinished } from '@/lib/game-finish'
import {
  checkMafiaWinCondition,
  checkJesterWin,
  checkLoversWin,
  resolveMafiaNight,
  resolveMafiaDayVote,
} from '@/lib/mafia'
import type { MafiaPlayerState, MafiaSession, MafiaPhase } from '@/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  const admin = getSupabaseAdmin()

  let body: { hostToken?: unknown; nextPhase?: unknown; isAuto?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { hostToken, nextPhase, isAuto } = body

  // 1. Fetch game, session, and player states
  const [{ data: game }, { data: mafiaSession }, { data: mafiaPlayerStates }] = await Promise.all([
    admin
      .from('games')
      .select('host_token, status, timer_seconds, mafia_day_seconds, mafia_voting_seconds')
      .eq('id', gameId)
      .maybeSingle(),
    admin.from('mafia_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    admin.from('mafia_player_states').select('*').eq('game_id', gameId),
  ])

  if (!game || !mafiaSession || !mafiaPlayerStates) {
    return NextResponse.json({ error: 'Game or session not initialized' }, { status: 404 })
  }

  const session = mafiaSession as MafiaSession
  const playerStates = mafiaPlayerStates as MafiaPlayerState[]

  let authorized = false
  if (typeof hostToken === 'string' && game.host_token === hostToken) {
    authorized = true
  } else if (isAuto === true && session.phase_deadline) {
    const deadlineTime = new Date(session.phase_deadline).getTime()
    if (Date.now() + 1000 >= deadlineTime) {
      authorized = true
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized or phase not expired yet' }, { status: 403 })
  }

  if (game.status === 'finished' || session.phase === 'game_over') {
    return NextResponse.json({ error: 'Game is already finished' }, { status: 400 })
  }

  const currentPhase = session.phase
  const phaseOrder: MafiaPhase[] = ['role_reveal', 'night', 'day_report', 'day', 'voting', 'elimination']
  let targetPhase: MafiaPhase
  if (typeof nextPhase === 'string') {
    if (!phaseOrder.includes(nextPhase as MafiaPhase)) {
      return NextResponse.json({ error: 'Invalid phase' }, { status: 400 })
    }
    targetPhase = nextPhase as MafiaPhase
  } else {
    // Determine next phase automatically
    const idx = phaseOrder.indexOf(currentPhase)
    if (idx === -1 || currentPhase === 'elimination') {
      targetPhase = 'night'
    } else {
      targetPhase = phaseOrder[idx + 1]
    }
  }

  const updateFields: Partial<MafiaSession> = {
    phase: targetPhase,
  }

  // Define timer durations — Night, Day (discussion), and Voting each have their own dial,
  // matching Wolvesville's separate phase timers rather than one duration doubled for day.
  let durationSeconds = 30
  if (targetPhase === 'role_reveal') {
    durationSeconds = 10
  } else if (targetPhase === 'night') {
    durationSeconds = game.timer_seconds || 45
  } else if (targetPhase === 'day_report') {
    durationSeconds = 8
  } else if (targetPhase === 'day') {
    durationSeconds = game.mafia_day_seconds || 90
  } else if (targetPhase === 'voting') {
    durationSeconds = game.mafia_voting_seconds || 45
  } else if (targetPhase === 'elimination') {
    durationSeconds = 8
  }

  updateFields.phase_deadline = new Date(Date.now() + durationSeconds * 1000).toISOString()

  const applyLoversOverlay = (winTeam: NonNullable<MafiaSession['winning_team']>) => {
    updateFields.winning_team = checkLoversWin(playerStates) ? 'lovers' : winTeam
  }

  // 3. Resolve current phase transitions
  if (currentPhase === 'night' && targetPhase === 'day_report') {
    const resolution = resolveMafiaNight(session, playerStates)
    const {
      mafiaTarget,
      doctorTarget,
      detectiveTarget,
      bodyguardTarget,
      bodyguardSacrificePlayerId,
      trackerVisited,
      framedPlayerId,
      serialKillerTarget,
      arsonistIgnited,
      cursedConvertedPlayerId,
      wolfCubDiedThisNight,
      deaths,
    } = resolution

    updateFields.mafia_target_player_id = mafiaTarget
    updateFields.doctor_target_player_id = doctorTarget
    updateFields.detect_target_player_id = detectiveTarget
    updateFields.bodyguard_target_player_id = bodyguardTarget
    updateFields.bodyguard_sacrifice_player_id = bodyguardSacrificePlayerId
    updateFields.tracker_visited_player_id = trackerVisited
    updateFields.framed_player_id = framedPlayerId
    updateFields.serial_kill_player_id = serialKillerTarget
    updateFields.arson_ignite = arsonistIgnited
    updateFields.night_kill_player_id = deaths[0]?.playerId ?? null
    updateFields.wolf_cub_revenge_pending = wolfCubDiedThisNight

    if (cursedConvertedPlayerId) {
      await admin
        .from('mafia_player_states')
        .update({ role: 'mafia' })
        .eq('game_id', gameId)
        .eq('player_id', cursedConvertedPlayerId)
      const pIndex = playerStates.findIndex((p) => p.player_id === cursedConvertedPlayerId)
      if (pIndex !== -1) playerStates[pIndex].role = 'mafia'
    }

    for (const death of deaths) {
      await admin
        .from('mafia_player_states')
        .update({ is_alive: false, death_day: session.day_number, death_cause: death.cause })
        .eq('game_id', gameId)
        .eq('player_id', death.playerId)
      await admin.from('players').update({ is_eliminated: true }).eq('game_id', gameId).eq('id', death.playerId)
      const pIndex = playerStates.findIndex((p) => p.player_id === death.playerId)
      if (pIndex !== -1) playerStates[pIndex].is_alive = false
    }

    // Check win condition
    const winTeam = checkMafiaWinCondition(playerStates)
    if (winTeam) {
      updateFields.phase = 'game_over'
      applyLoversOverlay(winTeam)
      updateFields.phase_deadline = null
      await markGameFinished(admin, gameId)
    }
  } else if (currentPhase === 'voting' && targetPhase === 'elimination') {
    // Resolve Voting
    const votedPlayerId = resolveMafiaDayVote(playerStates)
    updateFields.vote_result_player_id = votedPlayerId

    if (votedPlayerId) {
      // Set eliminated player is_alive = false
      await admin
        .from('mafia_player_states')
        .update({
          is_alive: false,
          death_day: session.day_number,
          death_cause: 'village_vote',
        })
        .eq('game_id', gameId)
        .eq('player_id', votedPlayerId)

      // Set is_eliminated = true in players table
      await admin.from('players').update({ is_eliminated: true }).eq('game_id', gameId).eq('id', votedPlayerId)

      // Update local state for win check
      const pIndex = playerStates.findIndex((p) => p.player_id === votedPlayerId)
      if (pIndex !== -1) {
        playerStates[pIndex].is_alive = false
      }
    }

    // Jester wins outright if they were just lynched, ahead of the normal team win check
    if (checkJesterWin(votedPlayerId, playerStates)) {
      updateFields.phase = 'game_over'
      updateFields.winning_team = 'jester'
      updateFields.phase_deadline = null
      await markGameFinished(admin, gameId)
    } else {
      const winTeam = checkMafiaWinCondition(playerStates)
      if (winTeam) {
        updateFields.phase = 'game_over'
        applyLoversOverlay(winTeam)
        updateFields.phase_deadline = null
        await markGameFinished(admin, gameId)
      }
    }
  } else if (targetPhase === 'night' && currentPhase !== 'role_reveal') {
    // Moving to next day cycle night
    updateFields.day_number = session.day_number + 1
    // A vigilante who fired this past night has used their one shot, permanently.
    const firedVigilante = playerStates.find(
      (p) => p.role === 'vigilante' && p.is_alive && p.night_action_target_player_id && p.vigilante_shots_used < 1
    )
    if (firedVigilante) {
      await admin
        .from('mafia_player_states')
        .update({ vigilante_shots_used: firedVigilante.vigilante_shots_used + 1 })
        .eq('id', firedVigilante.id)
    }
    // Arsonist's douse target (from the night just resolved) becomes permanently doused.
    const arsonist = playerStates.find((p) => p.role === 'arsonist' && p.is_alive)
    if (
      arsonist &&
      arsonist.night_action_target_player_id &&
      arsonist.night_action_target_player_id !== arsonist.player_id
    ) {
      await admin
        .from('mafia_player_states')
        .update({ doused_by_arsonist: true })
        .eq('game_id', gameId)
        .eq('player_id', arsonist.night_action_target_player_id)
    }
    // Clear all targets and votes in player states
    await admin
      .from('mafia_player_states')
      .update({
        night_action_target_player_id: null,
        day_vote_target_player_id: null,
      })
      .eq('game_id', gameId)
  } else if (targetPhase === 'night' && currentPhase === 'role_reveal') {
    // Moving from role reveal to night 1 (keep day_number = 1)
    await admin
      .from('mafia_player_states')
      .update({
        night_action_target_player_id: null,
        day_vote_target_player_id: null,
      })
      .eq('game_id', gameId)
  }

  // 4. Save session updates — guard with current phase to prevent double-processing
  const { error: sessionError, data: updatedSession } = await admin
    .from('mafia_sessions')
    .update(updateFields)
    .eq('game_id', gameId)
    .eq('phase', currentPhase)
    .select('phase')

  if (sessionError) {
    console.error('Failed to advance phase:', sessionError)
    return NextResponse.json({ error: 'Failed to update game phase' }, { status: 500 })
  }

  if (!updatedSession || updatedSession.length === 0) {
    // Another request already advanced this phase — treat as success
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ success: true })
}
