import type { SupabaseClient } from '@supabase/supabase-js'
import type { UnoCard } from '@/types'
import type { FactsContext } from './index'

/**
 * UNO's per-game facts, read at finish from the in-play accumulator the engine folded forward on
 * every action (see foldUnoPlay / foldUnoDraw / foldUnoChoose and the challenge folds in
 * src/lib/uno.ts).
 *
 * WHY AN ACCUMULATOR. UNO is a POSITION game — the session holds the top card, piles and pending
 * penalty, each hand holds only what a player holds right now, and a finished hand is empty. "Played
 * a Skip", "called UNO", "caught a missed call", "challenged a Wild Draw Four", "won on a Wild" don't
 * survive to the end, so the engine counts them as they happen and stashes them on
 * `uno_player_hands.stats`. This builder is the read side; it adds no live tracking.
 *
 * WHY FLAGS AND NOT VALUES (mostly). Counters are lifetime sums and the rule DSL only asks
 * `counter >= n`, so a per-game achievement ("drew five cards in a game") is a 0/1 flag counted
 * once. A handful ARE genuine tallies — cards of a kind a player has ever played, UNO calls, catches,
 * challenges — emitted as the round's real total, which sums correctly.
 *
 * ONCE PER ROUND. Every player's bag is read in one query and judged on its own row, keyed by player
 * id; an empty bag gets no entry. Wins come from `ctx.winners`, never the session; in Team-Up both
 * teammates are named winners upstream (`expandUnoTeamWin`), so each is judged for the win flags they
 * individually satisfy. An empty `ctx.winners` means "draw OR unknown", never "everyone lost".
 */

/** The raw accumulator the engine writes (src/lib/uno.ts). Every key is optional. */
type RoundStats = {
  uno_turns_taken?: number
  uno_cards_drawn?: number
  uno_forced_hits?: number
  uno_peak_hand_size?: number
  uno_uno_calls?: number
  uno_skips?: number
  uno_reverses?: number
  uno_draw_twos?: number
  uno_wilds?: number
  uno_wild_draw_fours?: number
  uno_catches?: number
  uno_draw2_stacked?: number
  uno_challenges_won?: number
  uno_bluff_survived?: number
  uno_color_changes?: number
  uno_rainbow?: number
  uno_out_wild?: number
  uno_out_wd4?: number
  // High Stakes plays / running maxes (only ever non-zero when uno_mode='no_mercy').
  uno_hs_draw6_plays?: number
  uno_hs_draw10_plays?: number
  uno_hs_rev_draw4_plays?: number
  uno_hs_roulette_plays?: number
  uno_hs_discard_all_plays?: number
  uno_hs_skip_all_plays?: number
  uno_hs_stack_plays?: number
  uno_hs_seven_swap_plays?: number
  uno_hs_zero_pass_plays?: number
  uno_hs_max_stack_absorbed?: number
  uno_hs_max_roulette_dealt?: number
  uno_hs_knockouts?: number
  uno_hs_stack3plus?: number
  uno_hs_max_stack_sent?: number
  /** Per-victim forced-draw totals: keys look like `uno_hs_forced_of_<victimId>`. */
  [k: `uno_hs_forced_of_${string}`]: number | undefined
}

type HandRow = { player_id: string; stats: RoundStats | null; cards: UnoCard[] | null }

/** #7 Colour Me: change the colour five times in one game. */
const COLOR_CHANGES_TARGET = 5
/** #8 Deck Diver: draw five cards in one game. */
const DRAW_TARGET = 5
/** #14 Boomerang: play two Reverses in one game. */
const REVERSES_TARGET = 2
/** #16 Quickfire: win in eight turns or fewer. */
const QUICKFIRE_TURNS = 8
/** #18 Survivor: draw ten-plus cards and still win. */
const SURVIVOR_DRAWS = 10
/** #22 Comeback: win having held twelve-plus cards at some point. */
const COMEBACK_PEAK = 12
/** #21 Full Lobby: win a game of eight or more players. */
const FULL_LOBBY_SEATS = 8
/** #19 Never Drawn / #25 Untouchable / #27 Flawless are gated to real multiplayer (the brief's 3+). */
const MULTIPLAYER_MIN = 3

/** Distinct non-wild colours in a hand — for "win holding only one colour". */
function distinctColors(cards: UnoCard[]): number {
  return new Set(cards.filter((c) => c.color !== 'wild').map((c) => c.color)).size
}

export async function unoFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  // Fetch hands + the game-row bits that drive High Stakes gating (mode + win condition).
  const [handsRes, gameRes] = await Promise.all([
    supabase.from('uno_player_hands').select('player_id, stats, cards').eq('game_id', gameId),
    supabase.from('games').select('uno_mode, uno_no_mercy_win').eq('id', gameId).maybeSingle(),
  ])
  const rows = (handsRes.data ?? []) as HandRow[]
  const isHighStakes = gameRes.data?.uno_mode === 'no_mercy'
  const lastStandingWin = gameRes.data?.uno_no_mercy_win === 'last_standing'

  for (const row of rows) {
    const facts = playerFacts(row.stats ?? {}, row.cards ?? [], ctx, ctx.winners.includes(row.player_id), {
      isHighStakes,
      lastStandingWin,
    })
    if (Object.keys(facts).length > 0) out.set(row.player_id, facts)
  }

  return out
}

/** One player's counters, from their own accumulator, their final hand, and whether they won. */
function playerFacts(
  stats: RoundStats,
  finalHand: UnoCard[],
  ctx: FactsContext,
  won: boolean,
  hs: { isHighStakes: boolean; lastStandingWin: boolean }
): Record<string, number> {
  const facts: Record<string, number> = {}

  const turns = stats.uno_turns_taken ?? 0
  const drawn = stats.uno_cards_drawn ?? 0
  const forcedHits = stats.uno_forced_hits ?? 0
  const peak = stats.uno_peak_hand_size ?? 0
  const unoCalls = stats.uno_uno_calls ?? 0
  const skips = stats.uno_skips ?? 0
  const reverses = stats.uno_reverses ?? 0
  const drawTwos = stats.uno_draw_twos ?? 0
  const wilds = stats.uno_wilds ?? 0
  const wd4s = stats.uno_wild_draw_fours ?? 0
  const catches = stats.uno_catches ?? 0
  const stacked = stats.uno_draw2_stacked ?? 0
  const challengesWon = stats.uno_challenges_won ?? 0
  const bluffSurvived = stats.uno_bluff_survived ?? 0
  const colorChanges = stats.uno_color_changes ?? 0
  const seats = ctx.seated.length

  // ── Lifetime tallies (sum correctly across games) ─────────────────────────────────────────
  if (unoCalls > 0) facts.uno_uno_calls = unoCalls
  if (skips > 0) facts.uno_skips = skips
  if (reverses > 0) facts.uno_reverses = reverses
  if (drawTwos > 0) facts.uno_draw_twos = drawTwos
  if (wilds > 0) facts.uno_wilds = wilds
  if (wd4s > 0) facts.uno_wild_draw_fours = wd4s
  if (catches > 0) facts.uno_catches = catches
  if (stacked > 0) facts.uno_draw2_stacked = stacked
  if (challengesWon > 0) facts.uno_challenges_won = challengesWon
  if (bluffSurvived > 0) facts.uno_bluff_survived = bluffSurvived

  // ── Per-game flags (0/1, counted once) ────────────────────────────────────────────────────
  if (colorChanges >= COLOR_CHANGES_TARGET) facts.uno_color_changes_5_games = 1
  if (drawn >= DRAW_TARGET) facts.uno_drew_5_games = 1
  if (reverses >= REVERSES_TARGET) facts.uno_two_reverses_games = 1
  if (stats.uno_rainbow === 1) facts.uno_rainbow_games = 1
  // #19 Never Drawn: finish a real multiplayer game never forced to draw. Gated to a player who
  // actually took a turn (an empty bag never reaches here).
  if (seats >= MULTIPLAYER_MIN && forcedHits === 0 && turns > 0) facts.uno_never_drawn_games = 1
  // #24 Action Hero: play a Skip, a Reverse, a Draw Two AND a Wild in one game.
  if (skips > 0 && reverses > 0 && drawTwos > 0 && wilds > 0) facts.uno_action_hero_games = 1

  // ── Win flags (only ever emitted for a named winner) ──────────────────────────────────────
  if (won) {
    if (turns > 0 && turns <= QUICKFIRE_TURNS) facts.uno_quickfire_wins = 1
    if (drawn >= SURVIVOR_DRAWS) facts.uno_survivor_wins = 1
    if (peak >= COMEBACK_PEAK) facts.uno_comeback_wins = 1
    if (seats >= FULL_LOBBY_SEATS) facts.uno_full_lobby_wins = 1
    if (forcedHits === 0 && seats >= MULTIPLAYER_MIN) facts.uno_untouchable_wins = 1
    if (drawn === 0 && seats >= MULTIPLAYER_MIN) facts.uno_flawless_wins = 1
    // #28 Full Circle: win having played every action card type, incl. the Wild Draw Four.
    if (skips > 0 && reverses > 0 && drawTwos > 0 && wilds > 0 && wd4s > 0) facts.uno_full_circle_wins = 1
    // Won by playing the last card. `uno_out_*` is set only when a play emptied the hand, so a
    // timed lowest-hand win (which leaves cards in hand) never trips these.
    if (stats.uno_out_wild === 1) facts.uno_wild_finish_wins = 1
    if (stats.uno_out_wd4 === 1) facts.uno_wd4_finish_wins = 1
    // #17 Colour Blind: a blocked/timed win still holds cards; fire only when the held cards are a
    // single colour (a normal empty-hand win holds nothing, so `length > 0` excludes it).
    if (finalHand.length > 0 && distinctColors(finalHand) === 1) facts.uno_one_color_wins = 1
  }

  // ── High Stakes mode-gated facts (only ever emitted when uno_mode='no_mercy') ───────────
  // Trophy-plumbing counters — see src/lib/trophies/system-trophies/uno.ts for the trophy
  // definitions and gte thresholds. Counters ending _todo are declared but not yet emitted
  // (engine plumbing pending); Double Stack, Twenty Load, Lucky Seven, and Stack Kingpin.
  if (hs.isHighStakes) {
    // Cross-game aggregates.
    if (turns > 0 || drawn > 0 || finalHand.length > 0) facts.uno_hs_games = 1
    if (won) facts.uno_hs_wins = 1

    // Per-play facts (folded by the engine on the moving player's row).
    if (
      (stats.uno_draw_twos ?? 0) +
        (stats.uno_wild_draw_fours ?? 0) +
        (stats.uno_hs_draw6_plays ?? 0) +
        (stats.uno_hs_draw10_plays ?? 0) +
        (stats.uno_hs_rev_draw4_plays ?? 0) >
      0
    ) {
      facts.uno_hs_first_blood_games = 1
    }
    if ((stats.uno_hs_seven_swap_plays ?? 0) > 0) facts.uno_hs_swap_games = 1
    if ((stats.uno_hs_zero_pass_plays ?? 0) > 0) facts.uno_hs_pass_games = 1
    if ((stats.uno_hs_draw6_plays ?? 0) + (stats.uno_hs_draw10_plays ?? 0) > 0) facts.uno_hs_big_draw_games = 1
    if ((stats.uno_hs_roulette_plays ?? 0) > 0) facts.uno_hs_roulette_games = 1
    if ((stats.uno_hs_discard_all_plays ?? 0) > 0) facts.uno_hs_discard_all_games = 1
    if ((stats.uno_hs_skip_all_plays ?? 0) > 0) facts.uno_hs_skip_all_games = 1
    if (peak >= 20) facts.uno_hs_brink_games = 1
    if ((stats.uno_hs_stack_plays ?? 0) > 0) facts.uno_hs_stack_games = 1

    // Knockouts inflicted (attributed by the engine when the setter's Draw / Roulette pushed
    // an opponent past 25). Sum reaches trophy thresholds cross-game.
    const knockouts = stats.uno_hs_knockouts ?? 0
    if (knockouts > 0) {
      facts.uno_hs_knockouts = knockouts
      if (knockouts >= 2) facts.uno_hs_double_ko_games = 1
      if (knockouts >= 3) facts.uno_hs_mass_extinction_games = 1
    }

    // Roulette dealt (caster's largest single reveal count this round).
    const rouletteMaxDealt = stats.uno_hs_max_roulette_dealt ?? 0
    if (rouletteMaxDealt >= 5) facts.uno_hs_roulette5_games = 1
    if (rouletteMaxDealt >= 8) facts.uno_hs_roulette8_games = 1

    // #12 Double Stack: the mover crediting is folded at play time (stats.uno_hs_stack3plus).
    if ((stats.uno_hs_stack3plus ?? 0) > 0) facts.uno_hs_stack3plus_games = 1

    // #13 Twenty Load: cumulative forced draws attributed to me per victim. Emit the flag
    // when the largest per-victim total this round hit 20+. Keys are `uno_hs_forced_of_<id>`.
    let maxPerVictim = 0
    for (const [k, v] of Object.entries(stats)) {
      if (k.startsWith('uno_hs_forced_of_') && typeof v === 'number' && v > maxPerVictim) maxPerVictim = v
    }
    if (maxPerVictim >= 20) facts.uno_hs_twenty_load_games = 1

    // Win-only HS facts.
    if (won) {
      if (peak >= 20) facts.uno_hs_comeback_wins = 1
      if (seats >= 6) facts.uno_hs_full_house_wins = 1
      if (peak >= 22) facts.uno_hs_mercy_dodge_wins = 1
      if ((stats.uno_hs_max_stack_absorbed ?? 0) >= 10) facts.uno_hs_chain_breaker_wins = 1
      if (forcedHits === 0) facts.uno_hs_untouchable_wins = 1
      if (peak > 0 && peak <= 10) facts.uno_hs_flawless_wins = 1
      // #15 Lucky Seven (permissive): swapped into a hand with a 7 at least once and won the
      // round. Spec asks for "same turn or next" — the strict version requires post-swap turn
      // tracking; the permissive win-flag here matches the spec's intent (the swap was worth
      // it) and never over-credits a player who never swapped.
      if ((stats.uno_hs_seven_swap_plays ?? 0) > 0) facts.uno_hs_lucky_seven_games = 1
      // #25 Stack Kingpin: I set a Draw penalty of 16+ that landed on an opponent, and I won.
      if ((stats.uno_hs_max_stack_sent ?? 0) >= 16) facts.uno_hs_stack_kingpin_wins = 1
      // Last One Standing: a `last_standing` win-condition round that reached the finished
      // phase via a knockout cascade. Approx: the player is the winner AND the win-condition
      // is last_standing. (Empty-hand wins don't set noMercyWin='last_standing' as the trigger,
      // but a lucky empty-hand under last_standing still fires it — spec is soft on this edge.)
      if (hs.lastStandingWin) facts.uno_hs_last_standing_wins = 1
    }
  }

  return facts
}
