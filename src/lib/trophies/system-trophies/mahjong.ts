import type { SystemTrophySpec } from './types'

/**
 * Mahjong — folded at finish from the per-MATCH in-play accumulator. See `./game-facts/mahjong.ts`,
 * `../../mahjong-hand-resolution.ts`, and migration 20260812030000. A Mahjong match is many hands
 * and per-hand state is wiped each hand, so every counter below is recorded IN PLAY (at the meld
 * call, the discard, the hand's resolution) into a blob that survives the wipe, then summed here.
 *
 * From the 30-trophy Mahjong brief:
 *
 * OMITTED — already built generically for every game, so a second copy is the same trophy:
 *  - #1 "Take a Seat" (finish your first game) ≈ the generic first-play / games_played track.
 *  - #30 "Mahjong Champion" (win 5/15/30/50) IS the generic `games_won` Champion track.
 *
 * DEFERRED — needs machinery this change does not add:
 *  - #22 "All Rulesets" (win under Simple, HK, Riichi AND MCR) is a DISTINCT-SET rule: it must
 *    dedupe rulesets across DIFFERENT matches, which a summed counter cannot do. The engine
 *    already records a per-ruleset win flag each match (`mahjong_won_fate_round|hong_kong|riichi
 *    |mcr`), so the DATA exists — but earning the trophy needs (a) a `mahjong_rulesets_won`
 *    distinct set in counters.ts, (b) the award pass to emit its members from the facts, and (c)
 *    the distinct-rule criteria (SystemTrophySpec is counter-only today). Left out until that
 *    lands rather than shipped as an unearnable row. See the task report.
 *
 * REWORDED — the brief assumed a mechanic that per-hand wiping cannot preserve, so the copy is
 * corrected to what the engine can actually witness at HAND RESOLUTION (a hand's melds/kongs are
 * gone the moment it doesn't win, so these are scoped to the WINNING hand):
 *  - #14 "Triple Meld" / #23 "Four Melds" → three / four EXPOSED melds in the winning hand.
 *  - #24 "Double Kong" → win a hand holding two or more Kongs.
 *  - #21 "Quick Hand" → win with ten or fewer tiles discarded at the table.
 *  - #29 "Grand Slam" → win a fully concealed standard (four-meld) hand.
 *
 * GATED — #27 "Heavenly Hand" (Tenhou) is Riichi-only; the counter is set only under the Riichi
 * ruleset (see mahjong-hand-resolution.ts), so the trophy can never fire under Simple/HK/MCR.
 *
 * PER-RULESET BAR — #26 "High Fan" uses a different threshold per ruleset (fan/point scales are
 * not comparable across them); the bar lives beside the counter in mahjong-hand-resolution.ts.
 *
 * PLAYER MINIMUMS. Mahjong requires exactly four players, so every player-count minimum in the
 * brief is automatic — no seat gate is needed on any counter here.
 *
 * NOTHING HERE IS `instant`. Several (Chow, Pung, Kong, First Discard) are decidable at a single
 * action and so are instant-ELIGIBLE, but a mid-round pop needs an `unlockNow` call in the play
 * route, which is out of scope for this change. They award at finish through the counters.
 */
export const MAHJONG: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_discard',
    tier: 'bronze',
    title: 'First discard',
    description: 'Discard your first tile.',
    counter: 'mahjong_discards',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'chow',
    tier: 'bronze',
    title: 'Chow',
    description: "Call a Chow on an opponent's discard.",
    counter: 'mahjong_chows_called',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'pung',
    tier: 'bronze',
    title: 'Pung',
    description: "Call a Pung on an opponent's discard.",
    counter: 'mahjong_pungs_called',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'kong',
    tier: 'bronze',
    title: 'Kong',
    description: 'Declare a Kong.',
    counter: 'mahjong_kongs_called',
    points: 15,
    sortOrder: 40,
  },
  {
    suffix: 'east_wind',
    tier: 'bronze',
    title: 'East wind',
    description: 'Play a hand seated as East.',
    counter: 'mahjong_hands_as_east',
    points: 10,
    sortOrder: 50,
  },
  {
    suffix: 'full_circle',
    tier: 'bronze',
    title: 'Full circle',
    description: 'Play a hand from all four seat positions in one match.',
    counter: 'mahjong_all_seats',
    points: 15,
    sortOrder: 60,
  },
  {
    suffix: 'wall_watcher',
    tier: 'bronze',
    title: 'Wall watcher',
    description: 'Play a hand all the way to the end of the wall.',
    counter: 'mahjong_exhaustive_draws_seen',
    points: 15,
    sortOrder: 70,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'mahjong',
    tier: 'silver',
    title: 'Mahjong!',
    description: 'Win a hand.',
    counter: 'mahjong_hands_won',
    points: 25,
    sortOrder: 80,
  },
  {
    suffix: 'concealed_kong',
    tier: 'silver',
    title: 'Concealed Kong',
    description: 'Declare a concealed Kong.',
    counter: 'mahjong_concealed_kongs',
    points: 25,
    sortOrder: 90,
  },
  {
    suffix: 'added_kong',
    tier: 'silver',
    title: 'Added Kong',
    description: 'Upgrade a Pung to a Kong.',
    counter: 'mahjong_added_kongs',
    points: 25,
    sortOrder: 100,
  },
  {
    suffix: 'seven_pairs',
    tier: 'silver',
    title: 'Seven pairs',
    description: 'Win with a seven pairs hand.',
    counter: 'mahjong_seven_pairs_wins',
    points: 30,
    sortOrder: 110,
  },
  {
    suffix: 'self_draw',
    tier: 'silver',
    title: 'Self draw',
    description: 'Win on a tile you drew yourself.',
    counter: 'mahjong_self_draw_wins',
    points: 25,
    sortOrder: 120,
  },
  {
    suffix: 'triple_meld',
    tier: 'silver',
    title: 'Triple meld',
    description: 'Win a hand with three or more exposed melds.',
    counter: 'mahjong_triple_meld',
    points: 25,
    sortOrder: 130,
  },
  {
    suffix: 'hong_kong',
    tier: 'silver',
    title: 'Hong Kong',
    description: 'Win a hand under Hong Kong rules.',
    counter: 'mahjong_won_hong_kong',
    points: 30,
    sortOrder: 140,
  },
  {
    suffix: 'riichi',
    tier: 'silver',
    title: 'Riichi',
    description: 'Win a hand under Riichi rules.',
    counter: 'mahjong_won_riichi',
    points: 30,
    sortOrder: 150,
  },
  {
    suffix: 'ten_hands',
    tier: 'silver',
    title: 'Ten hands',
    description: 'Play ten games of Mahjong.',
    counter: 'games_played',
    gte: 10,
    points: 25,
    sortOrder: 160,
  },
  {
    suffix: 'clean_hand',
    tier: 'silver',
    title: 'Clean hand',
    description: 'Win a hand without calling from any discard.',
    counter: 'mahjong_no_call_wins',
    points: 30,
    sortOrder: 170,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'thirteen_orphans',
    tier: 'gold',
    title: 'Thirteen orphans',
    description: 'Win with a thirteen orphans hand.',
    counter: 'mahjong_thirteen_orphans_wins',
    points: 70,
    sortOrder: 180,
  },
  {
    suffix: 'concealed_win',
    tier: 'gold',
    title: 'Concealed win',
    description: 'Win with a fully concealed hand.',
    counter: 'mahjong_concealed_wins',
    points: 70,
    sortOrder: 190,
  },
  {
    suffix: 'quick_hand',
    tier: 'gold',
    title: 'Quick hand',
    description: 'Win with ten or fewer tiles discarded at the table.',
    counter: 'mahjong_quick_hand',
    points: 70,
    sortOrder: 200,
  },
  {
    suffix: 'four_melds',
    tier: 'gold',
    title: 'Four melds',
    description: 'Win a hand with four exposed melds and the pair.',
    counter: 'mahjong_four_melds',
    points: 60,
    sortOrder: 210,
  },
  {
    suffix: 'double_kong',
    tier: 'gold',
    title: 'Double Kong',
    description: 'Win a hand holding two or more Kongs.',
    counter: 'mahjong_double_kong',
    points: 60,
    sortOrder: 220,
  },
  {
    suffix: 'table_sweep',
    tier: 'gold',
    title: 'Table sweep',
    description: 'Win three consecutive hands at one table.',
    counter: 'mahjong_table_sweep',
    points: 80,
    sortOrder: 230,
  },
  {
    suffix: 'high_fan',
    tier: 'gold',
    title: 'High fan',
    description: 'Win a hand scoring high on the fan summary (bar varies by ruleset).',
    counter: 'mahjong_high_fan',
    points: 70,
    sortOrder: 240,
  },

  // ── Platinum ────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'heavenly_hand',
    tier: 'platinum',
    title: 'Heavenly hand',
    description: 'Win on your opening draw as East (Riichi rules).',
    counter: 'mahjong_heavenly_hand',
    points: 150,
    sortOrder: 250,
  },
  {
    suffix: 'orphan_master',
    tier: 'platinum',
    title: 'Orphan master',
    description: 'Win two thirteen orphans hands.',
    counter: 'mahjong_thirteen_orphans_wins',
    gte: 2,
    points: 150,
    sortOrder: 260,
  },
  {
    suffix: 'grand_slam',
    tier: 'platinum',
    title: 'Grand slam',
    description: 'Win a fully concealed hand with all four melds.',
    counter: 'mahjong_grand_slam',
    points: 150,
    sortOrder: 270,
    hidden: true,
  },
]
