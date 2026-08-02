import type { SupabaseClient } from '@supabase/supabase-js'
import type { YahtzeeCategoryPoints } from '@/types'
import { YAHTZEE_LOWER_CATEGORIES, YAHTZEE_UPPER_BONUS_POINTS, totalScore, upperBonus, upperScore } from '@/lib/yahtzee'

/**
 * Yahtzee's per-game facts, derived at finish from the scorecard the game already stored.
 *
 * The whole game reduces to one persisted row: `yahtzee_player_scores` holds `scores.categories`,
 * the 13-cell card, UNIQUE per (game, player). A cell is `null` while unscored and a real number
 * once taken — a taken zero is `0`, which is distinguishable from `null`, so "they scratched Full
 * House" is recoverable and not confused with "they never got there". A game only finishes when
 * every card is complete, so at award time all 13 cells are non-null. Nothing here touches a
 * gameplay route; no new tracking is added.
 *
 * WHY FLAGS AND NOT VALUES. Counters are lifetime sums (`bump_player_stats` adds deltas) and the
 * rule DSL only asks `counter >= n`. A per-game achievement therefore cannot be stored as a value —
 * "I totalled 312 this game" would be summed across games into nonsense. Each per-game achievement
 * is emitted as a 0/1 flag counted once, and the rule reads `>= 1`. The category-scored counters
 * are genuine lifetime tallies: one per game in which that category was taken for more than zero.
 *
 * SOLO PLAY IS A FIRST-CLASS CASE. Yahtzee's minimum is one player, and the award pass refuses to
 * call a solo game a win, so `opts.won` is false there. That is correct for win trophies and wrong
 * for everything else — a 300-point solo card is still a 300-point card. Only the two win-gated
 * counters at the bottom (`yahtzee_multiplayer_wins`, `yahtzee_big_table_wins`) read `opts.won` or
 * `opts.seated`; every score-shaped counter above them fires regardless of table size.
 *
 * DELIBERATELY ABSENT. The brief lists a "Yahtzee Bonus (100 points)" trophy and a "Joker rule"
 * trophy. Neither rule exists in this implementation: `categoryScore` has no bonus branch for a
 * second five-of-a-kind, and `full_house` explicitly returns 0 for five of a kind ("MVP rules:
 * Yahtzee does NOT count as full house"). Emitting a counter that can never be non-zero would make
 * those trophies silently unearnable, so nothing is emitted for them until the rules land.
 */

/** Chance is 5 dice, so 30 is the ceiling — five sixes taken as Chance. */
const CHANCE_STRONG = 25
const CHANCE_PERFECT = 30
/** A Yahtzee cell is either 0 (scratched) or the fixed 50. */
const YAHTZEE_POINTS = 50
/** "Sixes mastery": four or more sixes in the Sixes box. */
const SIXES_STRONG = 24
/** A four-of-a-kind worth 27+ means big faces, not just any four matching dice. */
const FOUR_KIND_STRONG = 27
/** Comfortably past the bonus rather than scraping it. */
const UPPER_STRONG = 70

type ScoreRow = { scores: { categories: YahtzeeCategoryPoints } | null } | null

export async function yahtzeeFacts(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  opts: { timerSeconds: number | null; questionSource: string | null; won: boolean; seated: number }
): Promise<Record<string, number>> {
  const facts: Record<string, number> = {}

  const { data } = await supabase
    .from('yahtzee_player_scores')
    .select('scores')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .maybeSingle()

  const cats = (data as ScoreRow)?.scores?.categories
  if (!cats) return facts

  // A cell is `null` only if the player never took it. Everything below asks `> 0`, which reads
  // "took it for points" and correctly excludes both an unscored cell and a scratched zero.
  const scored = (v: number | null | undefined) => typeof v === 'number' && v > 0

  // ── Categories taken for points ───────────────────────────────────────────────────────
  // Lifetime tallies: at most one per game each, but they sum across games.
  if (scored(cats.full_house)) facts.yahtzee_full_house_scored = 1
  if (scored(cats.small_straight)) facts.yahtzee_small_straight_scored = 1
  if (scored(cats.large_straight)) facts.yahtzee_large_straight_scored = 1
  if (scored(cats.three_kind)) facts.yahtzee_three_kind_scored = 1
  if (scored(cats.four_kind)) facts.yahtzee_four_kind_scored = 1

  // ── Quality of individual boxes ───────────────────────────────────────────────────────
  if ((cats.chance ?? 0) >= CHANCE_STRONG) facts.yahtzee_chance_25_plus = 1
  if ((cats.chance ?? 0) >= CHANCE_PERFECT) facts.yahtzee_chance_perfect_30 = 1
  if ((cats.sixes ?? 0) >= SIXES_STRONG) facts.yahtzee_sixes_24_plus = 1
  if ((cats.four_kind ?? 0) >= FOUR_KIND_STRONG) facts.yahtzee_four_kind_27_plus = 1

  // The brief words this trophy as "Roll five of a kind". Rolling is not persisted — a player who
  // rolls five 6s and takes them as Sixes leaves an ordinary-looking 30 in the upper section and
  // no trace anywhere else. Only SCORING the roll in the Yahtzee box is recoverable, so the
  // counter is deliberately narrowed to that: a 50 in the Yahtzee cell. This under-counts (a
  // five-of-a-kind spent elsewhere is invisible) but never over-counts.
  if ((cats.yahtzee ?? 0) === YAHTZEE_POINTS) facts.yahtzee_scored_yahtzee = 1

  // ── Upper section ─────────────────────────────────────────────────────────────────────
  // Reuse the engine's own arithmetic so "did they get the bonus" means exactly what the scorecard
  // showed the player: `upperBonus` owns the 63 threshold and returns the +35, so the boundary is
  // never re-derived (and never drifts) here.
  const upper = upperScore(cats)
  const gotBonus = upperBonus(cats) === YAHTZEE_UPPER_BONUS_POINTS
  if (gotBonus) facts.yahtzee_upper_bonus_games = 1
  if (upper >= UPPER_STRONG) facts.yahtzee_upper_70_plus = 1

  // ── Whole-card shapes ─────────────────────────────────────────────────────────────────
  if (scored(cats.small_straight) && scored(cats.large_straight)) facts.yahtzee_both_straights_games = 1

  const lowerSweep = YAHTZEE_LOWER_CATEGORIES.every((c) => scored(cats[c]))
  if (lowerSweep) facts.yahtzee_lower_sweep_games = 1

  // No scratches anywhere: every one of the 13 boxes took points. Because a finished card has no
  // nulls left, this is exactly "never had to write a zero".
  const noZero = Object.values(cats).every((v) => scored(v))
  if (noZero) facts.yahtzee_no_zero_games = 1

  // Flawless: the bonus earned AND not a single zero on the card.
  if (gotBonus && noZero) facts.yahtzee_flawless_card_games = 1

  // ── Final total ───────────────────────────────────────────────────────────────────────
  const total = totalScore(cats)
  if (total >= 200) facts.yahtzee_games_200_plus = 1
  if (total >= 250) facts.yahtzee_games_250_plus = 1
  if (total >= 300) facts.yahtzee_games_300_plus = 1

  // ── Wins (the only opts-dependent counters) ───────────────────────────────────────────
  // Solo games never reach here with `won` true, by design — see the header note.
  if (opts.won && opts.seated >= 2) facts.yahtzee_multiplayer_wins = 1
  if (opts.won && opts.seated >= 4) facts.yahtzee_big_table_wins = 1

  return facts
}
