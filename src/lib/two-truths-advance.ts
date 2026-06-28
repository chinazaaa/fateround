import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { isTwoTruthsGame, parseGameType } from '@/lib/game-types'
import { applyEliminationRule } from './elimination'
import type { EliminationConfig } from '@/types/elimination'
import { TTL_DEFAULT_TIMER, TTL_REVEAL_SECONDS } from '@/lib/two-truths'
import type { Game, Round } from '@/types'

export type TtlAdvanceCode =
  | 'round_active'
  | 'ended_round'
  | 'synced_pointer'
  | 'advanced_next'
  | 'advanced_finish'
  | 'already_done'
  | 'game_not_found'
  | 'not_two_truths'
  | 'not_active'
  | 'reveal_pending'
  | 'not_finished'

export type TtlAdvanceResult = {
  ok: boolean
  code: TtlAdvanceCode
  nextRound?: number
}

async function countPlayers(supabase: SupabaseClient, gameId: string): Promise<number> {
  const { count } = await supabase.from('players').select('id', { count: 'exact', head: true }).eq('game_id', gameId)
  return count ?? 0
}

async function countRoundGuesses(supabase: SupabaseClient, roundId: string): Promise<number> {
  const { count } = await supabase
    .from('ttl_guesses')
    .select('id', { count: 'exact', head: true })
    .eq('round_id', roundId)
  return count ?? 0
}

function timerExpired(game: Game, round: Round): boolean {
  if (!round.started_at) return false
  const timerMs = (game.timer_seconds ?? TTL_DEFAULT_TIMER) * 1000
  return Date.now() >= new Date(round.started_at).getTime() + timerMs
}

function revealPending(round: Round): boolean {
  if (!round.ended_at) return false
  const deadline = new Date(round.ended_at).getTime() + TTL_REVEAL_SECONDS * 1000
  return Date.now() < deadline
}

async function shouldEndActiveRound(
  supabase: SupabaseClient,
  game: Game,
  round: Round,
  playerCount: number
): Promise<boolean> {
  if (timerExpired(game, round)) return true
  const submitterId = round.submitter_player_id
  const guesserCount = Math.max(0, playerCount - (submitterId ? 1 : 0))
  if (guesserCount === 0) return true
  const guessCount = await countRoundGuesses(supabase, round.id)
  return guessCount >= guesserCount
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

async function activateRound(supabase: SupabaseClient, roundId: string): Promise<boolean> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('rounds')
    .update({ status: 'active', started_at: now, ended_at: null })
    .eq('id', roundId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  return !error && !!data
}

export async function syncTwoTruthsGameState(
  supabase: SupabaseClient,
  gameId: string,
  opts?: { force?: boolean }
): Promise<TtlAdvanceResult> {
  const { data: game } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle()
  if (!game) return { ok: false, code: 'game_not_found' }
  if (!isTwoTruthsGame(parseGameType(game.game_type))) return { ok: false, code: 'not_two_truths' }
  if (game.status === 'finished') return { ok: true, code: 'already_done' }
  if (game.status !== 'active') return { ok: false, code: 'not_active' }

  const { data: rounds } = await supabase.from('rounds').select('*').eq('game_id', gameId).order('round_number')

  const roundList = rounds ?? []
  const activeRound = roundList.find((r) => r.status === 'active') ?? null
  const pointerRound = roundList.find((r) => r.round_number === game.current_round_number) ?? null

  if (pointerRound && pointerRound.status === 'finished' && revealPending(pointerRound) && !opts?.force) {
    return { ok: true, code: 'reveal_pending' }
  }

  if (activeRound) {
    const playerCount = await countPlayers(supabase, gameId)
    if (await shouldEndActiveRound(supabase, game, activeRound, playerCount)) {
      const ended = await endActiveRound(supabase, activeRound.id)
      if (!ended) return { ok: true, code: 'round_active' }
      return { ok: true, code: 'ended_round' }
    }
    return { ok: true, code: 'round_active' }
  }

  const lastFinished = [...roundList].reverse().find((r) => r.status === 'finished') ?? null
  if (lastFinished && revealPending(lastFinished) && !opts?.force) {
    return { ok: true, code: 'reveal_pending' }
  }

  if (pointerRound && pointerRound.status === 'finished') {
    // Elimination hook: run before isLast so final-round eliminations are recorded
    const { data: gameForElim, error: elimConfigError } = await supabase
      .from('games')
      .select('elimination_config')
      .eq('id', gameId)
      .maybeSingle()
    if (elimConfigError) {
      console.error('Failed to load elimination config:', elimConfigError.message)
    }

    if (gameForElim?.elimination_config) {
      const elimConfig = gameForElim.elimination_config as EliminationConfig
      const result = await applyEliminationRule(supabase, gameId, 'two-truths', pointerRound.round_number, elimConfig)
      if (result.gameFinished) {
        const { error: finishError } = await markGameFinished(supabase, gameId)
        if (finishError) console.error('Failed to mark game finished after elimination:', finishError)
        return { ok: true, code: 'advanced_finish' }
      }
    }

    const isLast = pointerRound.round_number >= game.rounds_count
    if (isLast) {
      const { error: finishError } = await markGameFinished(supabase, gameId)
      if (finishError) console.error('Failed to mark game finished:', finishError)
      return { ok: true, code: 'advanced_finish' }
    }

    const nextRound = roundList.find((r) => r.round_number === pointerRound.round_number + 1)
    if (!nextRound) return { ok: false, code: 'not_finished' }

    // Skip eliminated submitters
    if (nextRound.submitter_player_id) {
      const { data: submitter } = await supabase
        .from('players')
        .select('is_eliminated')
        .eq('id', nextRound.submitter_player_id)
        .maybeSingle()

      if (submitter?.is_eliminated) {
        // Find the next non-eliminated round in sequence
        const laterRounds = roundList
          .filter((r) => r.round_number > pointerRound.round_number)
          .sort((a, b) => a.round_number - b.round_number)

        let replacement: typeof nextRound | undefined
        for (const r of laterRounds) {
          if (!r.submitter_player_id) continue
          const { data: sub } = await supabase
            .from('players')
            .select('is_eliminated')
            .eq('id', r.submitter_player_id)
            .maybeSingle()
          if (!sub?.is_eliminated) {
            replacement = r
            break
          }
        }

        if (!replacement) {
          const { error: finishError } = await markGameFinished(supabase, gameId)
          if (finishError) console.error('Failed to mark game finished after elimination:', finishError)
          return { ok: true, code: 'advanced_finish' }
        }

        const activated = await activateRound(supabase, replacement.id)
        if (!activated) return { ok: false, code: 'not_finished' }
        await syncGamePointer(supabase, gameId, replacement.round_number)
        return { ok: true, code: 'advanced_next', nextRound: replacement.round_number }
      }
    }

    const activated = await activateRound(supabase, nextRound.id)
    if (!activated) return { ok: false, code: 'not_finished' }
    await syncGamePointer(supabase, gameId, nextRound.round_number)
    return { ok: true, code: 'advanced_next', nextRound: nextRound.round_number }
  }

  if (pointerRound && pointerRound.status === 'pending') {
    const activated = await activateRound(supabase, pointerRound.id)
    if (activated) return { ok: true, code: 'synced_pointer' }
  }

  return { ok: true, code: 'not_finished' }
}
