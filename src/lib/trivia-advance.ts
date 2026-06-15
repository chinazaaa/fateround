import type { SupabaseClient } from '@supabase/supabase-js'
import { isTriviaGame, parseGameType } from '@/lib/game-types'
import { TRIVIA_REVEAL_SECONDS } from '@/lib/trivia'

export type TriviaAdvanceCode =
  | 'advanced_next'
  | 'advanced_finish'
  | 'already_done'
  | 'game_not_found'
  | 'not_trivia'
  | 'not_active'
  | 'round_active'
  | 'reveal_pending'
  | 'not_finished'

export type TriviaAdvanceResult = {
  ok: boolean
  code: TriviaAdvanceCode
  nextRound?: number
}

export async function tryAdvanceTriviaAfterReveal(
  supabase: SupabaseClient,
  gameId: string
): Promise<TriviaAdvanceResult> {
  const code = gameId.toUpperCase()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return { ok: false, code: 'game_not_found' }
  if (!isTriviaGame(parseGameType(game.game_type))) return { ok: false, code: 'not_trivia' }
  if (game.status === 'finished') return { ok: true, code: 'already_done' }
  if (game.status !== 'active') return { ok: false, code: 'not_active' }

  const { data: activeRound } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', code)
    .eq('status', 'active')
    .maybeSingle()

  if (activeRound) return { ok: true, code: 'already_done' }

  const { data: currentRound } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', code)
    .eq('round_number', game.current_round_number)
    .maybeSingle()

  if (!currentRound || currentRound.status !== 'finished' || !currentRound.ended_at) {
    return { ok: false, code: 'not_finished' }
  }

  const revealDeadline = new Date(currentRound.ended_at).getTime() + TRIVIA_REVEAL_SECONDS * 1000
  if (Date.now() < revealDeadline) {
    return { ok: false, code: 'reveal_pending' }
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

    const { error } = await supabase.from('games').update({ status: 'finished' }).eq('id', code)
    if (error) return { ok: false, code: 'not_active' }
    return { ok: true, code: 'advanced_finish' }
  }

  const nextRoundNumber = game.current_round_number + 1
  if (nextRoundNumber > game.rounds_count) {
    return { ok: true, code: 'already_done' }
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
    const { data: existingNext } = await supabase
      .from('rounds')
      .select('status')
      .eq('game_id', code)
      .eq('round_number', nextRoundNumber)
      .maybeSingle()

    if (existingNext?.status === 'active') return { ok: true, code: 'already_done' }
    return { ok: false, code: 'not_finished' }
  }

  const { error: gameError } = await supabase
    .from('games')
    .update({ current_round_number: nextRoundNumber })
    .eq('id', code)

  if (gameError) return { ok: false, code: 'not_finished' }

  return { ok: true, code: 'advanced_next', nextRound: nextRoundNumber }
}
