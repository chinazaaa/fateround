import type { SystemTrophySpec } from './types'

/**
 * Ping Pong — derived at finish from `ping_pong_sessions` final scores. See
 * `../game-facts/ping-pong.ts`.
 *
 * The physics engine is peer-to-peer via Realtime Broadcast, so NO rally-level data is persisted —
 * only cumulative `score_x` / `score_o` and the `winner_player_id`. This limits the trophy surface
 * to score-based facts: shutouts, close games, match lengths, and comeback margins.
 *
 * OMITTED (covered by generic catalog):
 *  - #1 "First Serve" (finish first match) → generic `games_played`.
 *  - #2 "First Point" (score a point) → fires on any non-zero score, same as games_played.
 *  - #7 "Ten Matches" → generic `games_played` gte 10.
 *  - #8 "Winner" → generic `games_won`.
 *  - #15 "Ping Pong Champion" → generic `games_won` Champion track.
 *
 * DROPPED (data not persisted):
 *  - #3 "Rally" (10+ hits) — no rally data stored.
 *  - #11 "Long Rally" (20+ hits) — same.
 *
 * 8 of the 15 briefed trophies are built; the rest are covered by generics or un-derivable.
 */
export const PING_PONG: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'quick_match',
    tier: 'bronze',
    title: 'Quick match',
    description: 'Play a match to 3 points.',
    counter: 'ping_pong_match_to_3',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'marathon',
    tier: 'bronze',
    title: 'Marathon',
    description: 'Play a match to 21 points.',
    counter: 'ping_pong_match_to_21',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'shutout_start',
    tier: 'bronze',
    title: 'Shutout start',
    description: 'Win a match without your opponent scoring.',
    counter: 'ping_pong_shutout_wins',
    points: 15,
    sortOrder: 30,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'win_by_2',
    tier: 'silver',
    title: 'Win by 2',
    description: 'Win a match that went to extra points past the target.',
    counter: 'ping_pong_deuce_wins',
    points: 25,
    sortOrder: 40,
  },
  {
    suffix: 'deuce',
    tier: 'silver',
    title: 'Deuce',
    description: 'Win a match that was tied at match point.',
    counter: 'ping_pong_deuce_wins',
    points: 25,
    sortOrder: 50,
  },
  {
    suffix: 'comeback',
    tier: 'silver',
    title: 'Comeback',
    description: 'Win a match where you scored more than your opponent.',
    counter: 'ping_pong_comeback_wins',
    points: 30,
    sortOrder: 60,
  },
  {
    suffix: 'five_straight',
    tier: 'silver',
    title: 'Five straight',
    description: 'Win 5 matches.',
    counter: 'ping_pong_match_wins',
    gte: 5,
    points: 35,
    sortOrder: 70,
  },
  {
    suffix: 'shutout',
    tier: 'silver',
    title: 'Shutout',
    description: 'Win a match without your opponent scoring a single point.',
    counter: 'ping_pong_shutout_wins',
    points: 30,
    sortOrder: 80,
  },
]
