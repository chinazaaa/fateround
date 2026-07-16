import type { Game } from '@/types'

/**
 * Merge a realtime `games` UPDATE payload over the previous game, preserving large content
 * columns the payload may have dropped.
 *
 * Supabase Realtime omits unchanged TOAST-ed columns from UPDATE payloads — a large jsonb value
 * stored out-of-line arrives as `null` on any update that didn't touch it. `games` rows are
 * updated frequently during play (current_round_number, status, …), so applying `payload.new`
 * whole would blank these columns locally. Pick-a-Number reads `game.custom_questions` live to
 * size its picker grid; a round advance (which updates `current_round_number`, leaving
 * custom_questions untouched) would otherwise null the pool and break the picker.
 *
 * These columns are set at config time and never legitimately nulled mid-game, so falling back to
 * the previous value whenever the incoming one is null/undefined is always correct.
 */
export function mergeRealtimeGame(prev: Game | null, next: Game): Game {
  if (!prev) return next
  return {
    ...next,
    custom_questions: next.custom_questions ?? prev.custom_questions,
    ai_generated_questions: next.ai_generated_questions ?? prev.ai_generated_questions,
    custom_slots: next.custom_slots ?? prev.custom_slots,
  }
}
