import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { awardTournamentPlacements } from '@/lib/tournament-scoring'
import { isTriviaGame, parseGameType } from '@/lib/game-types'
import { TRIVIA_DEFAULT_TIMER, TRIVIA_REVEAL_SECONDS } from '@/lib/trivia'
import type { Game, Round } from '@/types'
import { applyEliminationRule } from './elimination'
import type { EliminationConfig } from '@/types/elimination'

export type TriviaAdvanceCode =
  | 'round_active'
  | 'ended_round'
  | 'synced_pointer'
  | 'advanced_next'
  | 'advanced_finish'
  | 'already_done'
  | 'game_not_found'
  | 'not_trivia'
  | 'not_active'
  | 'reveal_pending'
  | 'not_finished'

export type TriviaAdvanceResult = {
  ok: boolean
  code: TriviaAdvanceCode
  nextRound?: number
}

type SyncOptions = {
  force?: boolean
}

async function countPlayers(supabase: SupabaseClient, gameId: string): Promise<number> {
  const { count } = await supabase.from('players').select('id', { count: 'exact', head: true }).eq('game_id', gameId)
  return count ?? 0
}

async function countRoundAnswers(supabase: SupabaseClient, roundId: string): Promise<number> {
  const { count } = await supabase
    .from('trivia_answers')
    .select('id', { count: 'exact', head: true })
    .eq('round_id', roundId)
  return count ?? 0
}

function timerExpired(game: Game, round: Round): boolean {
  if (!round.started_at) return false
  const timerMs = (game.timer_seconds ?? TRIVIA_DEFAULT_TIMER) * 1000
  return Date.now() >= new Date(round.started_at).getTime() + timerMs
}

async function shouldEndActiveRound(supabase: SupabaseClient, game: Game, round: Round): Promise<boolean> {
  if (timerExpired(game, round)) return true
  const [playerCount, answerCount] = await Promise.all([
    countPlayers(supabase, game.id),
    countRoundAnswers(supabase, round.id),
  ])
  return playerCount > 0 && answerCount >= playerCount
}

async function endActiveRound(supabase: SupabaseClient, roundId: string): Promise<boolean> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('rounds')
    .update({ status: 'finished', ended_at: now })
    .eq('id', roundId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle()
  return !error && !!data
}

async function syncGamePointer(supabase: SupabaseClient, gameId: string, roundNumber: number): Promise<boolean> {
  const { error } = await supabase.from('games').update({ current_round_number: roundNumber }).eq('id', gameId)
  return !error
}

async function advanceAfterReveal(supabase: SupabaseClient, game: Game, force: boolean): Promise<TriviaAdvanceResult> {
  const code = game.id

  const { data: currentRound } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', code)
    .eq('round_number', game.current_round_number)
    .maybeSingle()

  if (!currentRound || currentRound.status !== 'finished' || !currentRound.ended_at) {
    return { ok: false, code: 'not_finished' }
  }

  if (!force) {
    const revealDeadline = new Date(currentRound.ended_at).getTime() + TRIVIA_REVEAL_SECONDS * 1000
    if (Date.now() < revealDeadline) {
      return { ok: false, code: 'reveal_pending' }
    }
  }

  // Elimination hook: apply elimination rule after reveal
  const { data: gameForElim, error: elimConfigError } = await supabase
    .from('games')
    .select('elimination_config, game_type')
    .eq('id', code)
    .maybeSingle()
  if (elimConfigError) {
    console.error('Failed to load elimination config:', elimConfigError.message)
  }

  if (gameForElim?.elimination_config) {
    const elimConfig = gameForElim.elimination_config as EliminationConfig
    const result = await applyEliminationRule(
      supabase,
      code,
      gameForElim.game_type ?? 'trivia',
      game.current_round_number,
      elimConfig
    )
    if (result.gameFinished) {
      const { error: finishError } = await markGameFinished(supabase, code)
      if (finishError) console.error('Failed to mark game finished after elimination:', finishError)
      // Score the tournament when a game ends on its own (not just via finish-game).
      try {
        await awardTournamentPlacements(supabase, code)
      } catch {
        // Best-effort — never block finishing the game.
      }
      return { ok: true, code: 'advanced_finish' }
    }
  }

  const isLastRound = game.current_round_number >= game.rounds_count

  if (isLastRound) {
    const { data: lastRound } = await supabase
      .from('rounds')
      .select('status')
      .eq('game_id', code)
      .eq('round_number', game.rounds_count)
      .maybeSingle()

    if (!lastRound || lastRound.status !== 'finished') {
      return { ok: false, code: 'not_finished' }
    }

    const { error } = await markGameFinished(supabase, code)
    if (error) return { ok: false, code: 'not_finished' }
    // Score the tournament when the last round completes on its own.
    try {
      await awardTournamentPlacements(supabase, code)
    } catch {
      // Best-effort — never block finishing the game.
    }
    return { ok: true, code: 'advanced_finish' }
  }

  const nextRoundNumber = game.current_round_number + 1
  if (nextRoundNumber > game.rounds_count) {
    return { ok: true, code: 'already_done' }
  }

  const { data: existingNext } = await supabase
    .from('rounds')
    .select('id, status')
    .eq('game_id', code)
    .eq('round_number', nextRoundNumber)
    .maybeSingle()

  if (existingNext?.status === 'active') {
    const synced = await syncGamePointer(supabase, code, nextRoundNumber)
    return synced
      ? { ok: true, code: 'synced_pointer', nextRound: nextRoundNumber }
      : { ok: false, code: 'not_finished' }
  }

  const now = new Date().toISOString()
  const { data: activatedRound, error: roundError } = await supabase
    .from('rounds')
    .update({ status: 'active', started_at: now })
    .eq('game_id', code)
    .eq('round_number', nextRoundNumber)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (roundError) return { ok: false, code: 'not_finished' }

  if (!activatedRound) {
    return { ok: false, code: 'not_finished' }
  }

  const synced = await syncGamePointer(supabase, code, nextRoundNumber)
  if (!synced) {
    await supabase
      .from('rounds')
      .update({ status: 'pending', started_at: null })
      .eq('id', activatedRound.id)
      .eq('status', 'active')
    return { ok: false, code: 'not_finished' }
  }

  return { ok: true, code: 'advanced_next', nextRound: nextRoundNumber }
}

/** Keeps trivia rounds in sync: auto-end, heal pointer drift, advance after reveal. */
export async function syncTriviaGameState(
  supabase: SupabaseClient,
  gameId: string,
  options: SyncOptions = {}
): Promise<TriviaAdvanceResult> {
  const code = gameId.toUpperCase()
  const force = options.force === true

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return { ok: false, code: 'game_not_found' }
  if (!isTriviaGame(parseGameType(game.game_type))) return { ok: false, code: 'not_trivia' }
  if (game.status === 'finished') return { ok: true, code: 'already_done' }
  if (game.status !== 'active') return { ok: false, code: 'not_active' }

  const { data: activeRound } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', code)
    .eq('status', 'active')
    .maybeSingle()

  if (activeRound) {
    if (game.current_round_number !== activeRound.round_number) {
      const synced = await syncGamePointer(supabase, code, activeRound.round_number)
      return synced
        ? { ok: true, code: 'synced_pointer', nextRound: activeRound.round_number }
        : { ok: false, code: 'not_finished' }
    }

    if (await shouldEndActiveRound(supabase, game, activeRound)) {
      const ended = await endActiveRound(supabase, activeRound.id)
      return ended ? { ok: true, code: 'ended_round' } : { ok: false, code: 'not_finished' }
    }

    return { ok: true, code: 'round_active' }
  }

  const { data: pointerRound } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', code)
    .eq('round_number', game.current_round_number)
    .maybeSingle()

  if (pointerRound?.status === 'pending') {
    const now = new Date().toISOString()
    const { data: activated, error } = await supabase
      .from('rounds')
      .update({ status: 'active', started_at: now })
      .eq('id', pointerRound.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (!error && activated) {
      return { ok: true, code: 'advanced_next', nextRound: pointerRound.round_number }
    }
  }

  return advanceAfterReveal(supabase, game, force)
}

/** @deprecated Use syncTriviaGameState */
export async function tryAdvanceTriviaAfterReveal(
  supabase: SupabaseClient,
  gameId: string
): Promise<TriviaAdvanceResult> {
  return syncTriviaGameState(supabase, gameId)
}
