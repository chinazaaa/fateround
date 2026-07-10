import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { isQuickDrawGame, parseGameType } from '@/lib/game-types'
import {
  QUICK_DRAW_DEFAULT_DRAW_TIMER,
  QUICK_DRAW_DEFAULT_TITLE_TIMER,
  QUICK_DRAW_REVEAL_SECONDS,
  clampQuickDrawTitleTimer,
  clampQuickDrawVoteTimer,
  eligibleDrawingVoters,
  eligibleTitleSubmitters,
  orderedRoundDrawings,
} from '@/lib/quick-draw'
import type { QuickDrawDrawing, QuickDrawSession, QuickDrawTitle, QuickDrawVote, Game } from '@/types'

export type QuickDrawAdvanceCode =
  | 'drawing'
  | 'titling'
  | 'voting'
  | 'reveal'
  | 'ended_round'
  | 'advanced_next'
  | 'advanced_finish'
  | 'already_done'
  | 'game_not_found'
  | 'not_quick_draw'
  | 'not_active'
  | 'reveal_pending'
  | 'not_finished'

export type QuickDrawAdvanceResult = {
  ok: boolean
  code: QuickDrawAdvanceCode
  nextRound?: number
}

async function countParticipants(supabase: SupabaseClient, gameId: string): Promise<number> {
  const { count } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .not('spectator', 'is', true)
    .eq('is_eliminated', false)
  return count ?? 0
}

function deadlinePassed(deadlineAt: string | null | undefined): boolean {
  if (!deadlineAt) return false
  return Date.now() >= new Date(deadlineAt).getTime()
}

async function loadSession(supabase: SupabaseClient, gameId: string): Promise<QuickDrawSession | null> {
  const { data } = await supabase.from('quick_draw_sessions').select('*').eq('game_id', gameId).maybeSingle()
  return (data as QuickDrawSession | null) ?? null
}

async function loadActiveRound(supabase: SupabaseClient, gameId: string) {
  const { data } = await supabase.from('rounds').select('*').eq('game_id', gameId).eq('status', 'active').maybeSingle()
  return data
}

async function loadRoundDrawings(supabase: SupabaseClient, roundId: string): Promise<QuickDrawDrawing[]> {
  const { data } = await supabase.from('quick_draw_drawings').select('*').eq('round_id', roundId)
  return (data ?? []) as QuickDrawDrawing[]
}

async function loadDrawingTitles(supabase: SupabaseClient, drawingId: string): Promise<QuickDrawTitle[]> {
  const { data } = await supabase.from('quick_draw_titles').select('*').eq('drawing_id', drawingId)
  return (data ?? []) as QuickDrawTitle[]
}

async function loadDrawingVotes(supabase: SupabaseClient, drawingId: string): Promise<QuickDrawVote[]> {
  const { data } = await supabase.from('quick_draw_votes').select('*').eq('drawing_id', drawingId)
  return (data ?? []) as QuickDrawVote[]
}

async function loadPlayers(supabase: SupabaseClient, gameId: string) {
  const { data } = await supabase
    .from('players')
    .select('id, name')
    .eq('game_id', gameId)
    .not('spectator', 'is', true)
    .eq('is_eliminated', false)
    .order('name')
  return data ?? []
}

async function ensureRealTitle(supabase: SupabaseClient, gameId: string, drawing: QuickDrawDrawing): Promise<void> {
  const { data: existing } = await supabase
    .from('quick_draw_titles')
    .select('id')
    .eq('drawing_id', drawing.id)
    .eq('is_real', true)
    .maybeSingle()
  if (existing) return

  const { data: assignment } = await supabase
    .from('quick_draw_assignments')
    .select('prompt')
    .eq('round_id', drawing.round_id)
    .eq('player_id', drawing.player_id)
    .maybeSingle()
  if (!assignment?.prompt) return

  await supabase.from('quick_draw_titles').insert({
    game_id: gameId,
    drawing_id: drawing.id,
    player_id: null,
    text: assignment.prompt,
    is_real: true,
  })
}

async function startDrawingPhase(supabase: SupabaseClient, game: Game, roundId: string): Promise<void> {
  const drawTimer = game.timer_seconds ?? QUICK_DRAW_DEFAULT_DRAW_TIMER
  const deadline = new Date(Date.now() + drawTimer * 1000).toISOString()
  const now = new Date().toISOString()
  await supabase
    .from('quick_draw_sessions')
    .update({
      phase: 'drawing',
      drawing_index: 0,
      turn_deadline_at: deadline,
      updated_at: now,
    })
    .eq('game_id', game.id)

  await supabase
    .from('rounds')
    .update({ status: 'active', started_at: now, ended_at: null })
    .eq('id', roundId)
    .eq('status', 'pending')
}

async function startTitlingForDrawing(
  supabase: SupabaseClient,
  gameId: string,
  drawingIndex: number,
  titleTimerSeconds: number
): Promise<void> {
  const now = new Date().toISOString()
  const deadline = new Date(Date.now() + titleTimerSeconds * 1000).toISOString()
  await supabase
    .from('quick_draw_sessions')
    .update({
      phase: 'titling',
      drawing_index: drawingIndex,
      turn_deadline_at: deadline,
      updated_at: now,
    })
    .eq('game_id', gameId)
}

async function startVotingForDrawing(
  supabase: SupabaseClient,
  gameId: string,
  drawingIndex: number,
  voteTimerSeconds: number
): Promise<void> {
  const now = new Date().toISOString()
  const deadline = new Date(Date.now() + voteTimerSeconds * 1000).toISOString()
  await supabase
    .from('quick_draw_sessions')
    .update({
      phase: 'voting',
      drawing_index: drawingIndex,
      turn_deadline_at: deadline,
      updated_at: now,
    })
    .eq('game_id', gameId)
}

async function startReveal(supabase: SupabaseClient, gameId: string, drawingIndex: number): Promise<void> {
  const now = new Date().toISOString()
  const deadline = new Date(Date.now() + QUICK_DRAW_REVEAL_SECONDS * 1000).toISOString()
  await supabase
    .from('quick_draw_sessions')
    .update({
      phase: 'reveal',
      drawing_index: drawingIndex,
      turn_deadline_at: deadline,
      updated_at: now,
    })
    .eq('game_id', gameId)
}

async function endRoundAndAdvance(
  supabase: SupabaseClient,
  game: Game,
  roundNumber: number
): Promise<QuickDrawAdvanceResult> {
  const now = new Date().toISOString()
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', game.id)
    .eq('round_number', roundNumber)
    .maybeSingle()

  if (round) {
    await supabase.from('rounds').update({ status: 'finished', ended_at: now }).eq('id', round.id)
  }

  const isLast = roundNumber >= game.rounds_count
  if (isLast) {
    await supabase
      .from('quick_draw_sessions')
      .update({ phase: 'finished', turn_deadline_at: null, updated_at: now })
      .eq('game_id', game.id)
    const { error } = await markGameFinished(supabase, game.id)
    if (error) console.error('Failed to mark quick_draw game finished:', error)
    return { ok: true, code: 'advanced_finish' }
  }

  const nextRoundNumber = roundNumber + 1
  const { data: nextRound } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', game.id)
    .eq('round_number', nextRoundNumber)
    .maybeSingle()

  if (!nextRound) return { ok: false, code: 'not_finished' }

  await supabase.from('games').update({ current_round_number: nextRoundNumber }).eq('id', game.id)
  await startDrawingPhase(supabase, game, nextRound.id)
  return { ok: true, code: 'advanced_next', nextRound: nextRoundNumber }
}

async function transitionDrawingToTitling(
  supabase: SupabaseClient,
  game: Game,
  roundId: string,
  titleTimerSeconds: number,
  participantCount: number
): Promise<QuickDrawAdvanceResult> {
  const players = await loadPlayers(supabase, game.id)
  const drawings = await loadRoundDrawings(supabase, roundId)
  const ordered = orderedRoundDrawings(
    drawings,
    roundId,
    players.map((p) => ({ id: p.id, name: p.name }))
  )

  if (ordered.length === 0) {
    return endRoundAndAdvance(supabase, game, game.current_round_number)
  }

  const firstDrawing = ordered[0]!
  await ensureRealTitle(supabase, game.id, firstDrawing)

  // Solo artist with no one to title — skip straight through drawings
  if (participantCount <= 1) {
    await startReveal(supabase, game.id, 0)
    return { ok: true, code: 'reveal' }
  }

  await startTitlingForDrawing(supabase, game.id, 0, titleTimerSeconds)
  return { ok: true, code: 'titling' }
}

async function transitionTitlingToVoting(
  supabase: SupabaseClient,
  gameId: string,
  drawingIndex: number,
  voteTimerSeconds: number,
  participantCount: number
): Promise<QuickDrawAdvanceResult> {
  if (participantCount <= 1) {
    await startReveal(supabase, gameId, drawingIndex)
    return { ok: true, code: 'reveal' }
  }

  await startVotingForDrawing(supabase, gameId, drawingIndex, voteTimerSeconds)
  return { ok: true, code: 'voting' }
}

async function advanceAfterReveal(
  supabase: SupabaseClient,
  game: Game,
  roundId: string,
  drawingIndex: number,
  titleTimerSeconds: number,
  participantCount: number
): Promise<QuickDrawAdvanceResult> {
  const players = await loadPlayers(supabase, game.id)
  const drawings = await loadRoundDrawings(supabase, roundId)
  const ordered = orderedRoundDrawings(
    drawings,
    roundId,
    players.map((p) => ({ id: p.id, name: p.name }))
  )

  const nextIndex = drawingIndex + 1
  if (nextIndex < ordered.length) {
    const nextDrawing = ordered[nextIndex]!
    await ensureRealTitle(supabase, game.id, nextDrawing)
    await startTitlingForDrawing(supabase, game.id, nextIndex, titleTimerSeconds)
    return { ok: true, code: 'titling' }
  }

  return endRoundAndAdvance(supabase, game, game.current_round_number)
}

export async function syncQuickDrawGameState(
  supabase: SupabaseClient,
  gameId: string,
  opts?: { force?: boolean }
): Promise<QuickDrawAdvanceResult> {
  const { data: game } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle()
  if (!game) return { ok: false, code: 'game_not_found' }
  if (!isQuickDrawGame(parseGameType(game.game_type))) return { ok: false, code: 'not_quick_draw' }
  if (game.status === 'finished') return { ok: true, code: 'already_done' }
  if (game.status !== 'active') return { ok: false, code: 'not_active' }

  const session = await loadSession(supabase, gameId)
  if (!session) return { ok: false, code: 'not_finished' }

  const activeRound = await loadActiveRound(supabase, gameId)
  if (!activeRound) {
    if (session.phase === 'finished') return { ok: true, code: 'already_done' }
    return { ok: true, code: 'not_finished' }
  }

  const participantCount = await countParticipants(supabase, gameId)
  const titleTimer = clampQuickDrawTitleTimer(game.operative_timer_seconds)
  const voteTimer = clampQuickDrawVoteTimer(game.game_duration_seconds)

  if (session.phase === 'drawing') {
    const drawings = await loadRoundDrawings(supabase, activeRound.id)
    const allSubmitted = drawings.length >= participantCount
    const timerDone = deadlinePassed(session.turn_deadline_at)

    if (!allSubmitted && !timerDone && !opts?.force) {
      return { ok: true, code: 'drawing' }
    }

    return transitionDrawingToTitling(supabase, game, activeRound.id, titleTimer, participantCount)
  }

  if (session.phase === 'titling') {
    const players = await loadPlayers(supabase, gameId)
    const drawings = await loadRoundDrawings(supabase, activeRound.id)
    const ordered = orderedRoundDrawings(
      drawings,
      activeRound.id,
      players.map((p) => ({ id: p.id, name: p.name }))
    )
    const activeDrawing = ordered[session.drawing_index]
    if (!activeDrawing) {
      return endRoundAndAdvance(supabase, game, game.current_round_number)
    }

    const titles = await loadDrawingTitles(supabase, activeDrawing.id)
    const fakeTitles = titles.filter((t) => !t.is_real)
    const needed = eligibleTitleSubmitters(participantCount)
    const allSubmitted = needed === 0 || fakeTitles.length >= needed
    const timerDone = deadlinePassed(session.turn_deadline_at)

    if (!allSubmitted && !timerDone && !opts?.force) {
      return { ok: true, code: 'titling' }
    }

    await ensureRealTitle(supabase, gameId, activeDrawing)
    return transitionTitlingToVoting(supabase, gameId, session.drawing_index, voteTimer, participantCount)
  }

  if (session.phase === 'voting') {
    const players = await loadPlayers(supabase, gameId)
    const drawings = await loadRoundDrawings(supabase, activeRound.id)
    const ordered = orderedRoundDrawings(
      drawings,
      activeRound.id,
      players.map((p) => ({ id: p.id, name: p.name }))
    )
    const activeDrawing = ordered[session.drawing_index]
    if (!activeDrawing) {
      return endRoundAndAdvance(supabase, game, game.current_round_number)
    }

    const votes = await loadDrawingVotes(supabase, activeDrawing.id)
    const needed = eligibleDrawingVoters(participantCount)
    const allVoted = needed === 0 || votes.length >= needed
    const timerDone = deadlinePassed(session.turn_deadline_at)

    if (!allVoted && !timerDone && !opts?.force) {
      return { ok: true, code: 'voting' }
    }

    await startReveal(supabase, gameId, session.drawing_index)
    return { ok: true, code: 'reveal' }
  }

  if (session.phase === 'reveal') {
    if (!deadlinePassed(session.turn_deadline_at) && !opts?.force) {
      return { ok: true, code: 'reveal_pending' }
    }

    return advanceAfterReveal(supabase, game, activeRound.id, session.drawing_index, titleTimer, participantCount)
  }

  return { ok: true, code: 'not_finished' }
}
