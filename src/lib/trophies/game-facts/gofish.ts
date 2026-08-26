import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'
import type { GoFishEvent, GoFishRank } from '@/types'

/**
 * Go Fish per-game facts, derived at finish from `gofish_sessions.event_log` +
 * `gofish_player_hands.books`. Everything the trophy set needs is in the event log,
 * which the ask processor writes append-only during play.
 *
 * OMITTED (need data that isn't persisted):
 *  - "Fastest game" — no per-turn timestamps beyond event.at, and no fastest-game trophy
 *    is worth the extra column right now.
 *  - "Broke a losing streak" — no per-round streak persistence.
 */

type HandRow = { player_id: string; books: number[] | null }
type SessionRow = { event_log: GoFishEvent[] | null }

export async function gofishFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: sessionData }, { data: handsData }] = await Promise.all([
    supabase.from('gofish_sessions').select('event_log').eq('game_id', gameId).maybeSingle(),
    supabase.from('gofish_player_hands').select('player_id, books').eq('game_id', gameId),
  ])

  const events = ((sessionData as SessionRow | null)?.event_log ?? []) as GoFishEvent[]
  const hands = ((handsData as HandRow[] | null) ?? []) as HandRow[]

  // Per-player tallies from the log.
  const hits = new Map<string, number>()
  const misses = new Map<string, number>()
  const luckyDraws = new Map<string, number>()
  for (const event of events) {
    if (event.kind === 'ask_hit') {
      hits.set(event.from_id, (hits.get(event.from_id) ?? 0) + 1)
    } else if (event.kind === 'ask_miss') {
      misses.set(event.from_id, (misses.get(event.from_id) ?? 0) + 1)
      if (event.lucky_draw) luckyDraws.set(event.from_id, (luckyDraws.get(event.from_id) ?? 0) + 1)
    }
  }

  const winners = new Set(ctx.winners ?? [])
  const seated = ctx.seated ?? []
  const bigRoom = seated.length >= 5

  for (const hand of hands) {
    const facts: Record<string, number> = {}
    const bookCount = (hand.books ?? []).length
    const hitCount = hits.get(hand.player_id) ?? 0
    const missCount = misses.get(hand.player_id) ?? 0
    const luckyCount = luckyDraws.get(hand.player_id) ?? 0
    const won = winners.has(hand.player_id)

    if (bookCount > 0) facts.gofish_books_completed = bookCount
    if (hitCount > 0) facts.gofish_successful_asks = hitCount
    if (missCount > 0) facts.gofish_go_fish_draws = missCount
    if (luckyCount > 0) facts.gofish_lucky_draws = luckyCount

    // Per-game flags.
    if (bookCount >= 4) facts.gofish_four_book_games = 1
    if (bookCount >= 7) facts.gofish_seven_book_games = 1
    if (won && bookCount >= 7) facts.gofish_dominant_wins = 1
    if (won && missCount === 0 && hitCount > 0) facts.gofish_no_miss_wins = 1
    if (won && bigRoom) facts.gofish_big_room_wins = 1

    if (Object.keys(facts).length) out.set(hand.player_id, facts)
  }

  return out
}
