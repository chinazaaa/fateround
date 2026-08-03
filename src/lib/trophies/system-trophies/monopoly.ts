import type { SystemTrophySpec } from './types'

/**
 * Monopoly — derived entirely from the finished board. See `./game-facts/monopoly.ts`.
 *
 * These are the "bucket A" trophies: the ones whose truth is still visible on the final board
 * (`property_owners`, `property_buildings`) or on a player's `monopoly_player_state`
 * (`passed_go_once`, `bankrupt`). Ordered bronze → platinum.
 *
 * Nothing here is `instant`. Monopoly's writes all go through the `monopoly_claim_and_apply` RPC
 * allowlist, so a route cannot compute-and-unlock mid-turn without a gameplay change; every trophy
 * below is settled at the finished screen from persisted state.
 *
 * WHAT IS DELIBERATELY ABSENT.
 * - "Monopoly Champion" (win N games) and a "first game" trophy are already built for every game by
 *   the generic catalog from `games_won` / `games_played`; a second copy would be the same trophy
 *   twice.
 * - Rent collected, jail visits, auctions, trades, doubles rolled, cards drawn, bankrupting a rival,
 *   and peak cash all need in-play tracking that the finished board does not keep and the RPC
 *   allowlist does not expose. They wait for the RPC surface to be extended.
 *
 * PAIRED EDITIONS. "Naija Landlord" and "London Calling" are a real pair keyed off the theme the
 * game was played on: Naija is `theme === 'naija'`, London is the classic `theme === 'default'`
 * board. Every other cosmetic theme (arctic, pirate, tropical, …) earns neither — they are skins,
 * not editions.
 *
 * OWNERSHIP TROPHIES ARE FOR THE SOLVENT. A bankrupt player's deeds return to the bank, so "own X"
 * is only ever true for a player still standing at finish — which is exactly what those trophies
 * mean. The win trophies name their table minimum in the description, matching the counter's gate.
 */
export const MONOPOLY: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'passed_go',
    tier: 'bronze',
    title: 'Passing GO',
    description: 'Pass GO and collect your salary.',
    counter: 'monopoly_passed_go',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'three_properties',
    tier: 'bronze',
    title: 'Getting started',
    description: 'Own three or more properties at the end of a game.',
    counter: 'monopoly_three_properties',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'two_stations',
    tier: 'bronze',
    title: 'All aboard',
    description: 'Own two or more stations at the end of a game.',
    counter: 'monopoly_two_stations',
    points: 15,
    sortOrder: 30,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'full_color_set',
    tier: 'silver',
    title: 'Monopoly',
    description: 'Own every property in a colour group.',
    counter: 'monopoly_full_color_set',
    points: 25,
    sortOrder: 40,
  },
  {
    suffix: 'both_utilities',
    tier: 'silver',
    title: 'Power and water',
    description: 'Own both utilities at the end of a game.',
    counter: 'monopoly_both_utilities',
    points: 25,
    sortOrder: 50,
  },
  {
    suffix: 'three_houses',
    tier: 'silver',
    title: 'Full house',
    description: 'Build four houses on a single property.',
    counter: 'monopoly_three_houses',
    points: 30,
    sortOrder: 60,
  },
  {
    suffix: 'ten_properties',
    tier: 'silver',
    title: 'Landlord',
    description: 'Own ten or more properties at the end of a game.',
    counter: 'monopoly_ten_properties',
    points: 30,
    sortOrder: 70,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'all_stations',
    tier: 'gold',
    title: 'Stationmaster',
    description: 'Own all four stations at the end of a game.',
    counter: 'monopoly_all_stations',
    points: 60,
    sortOrder: 80,
  },
  {
    suffix: 'one_side',
    tier: 'gold',
    title: 'My whole street',
    description: 'Own every property on one side of the board.',
    counter: 'monopoly_one_side',
    points: 60,
    sortOrder: 90,
  },
  {
    suffix: 'london_wins',
    tier: 'gold',
    title: 'London calling',
    description: 'Win a game on the classic London board.',
    counter: 'monopoly_london_wins',
    points: 60,
    sortOrder: 100,
  },
  {
    suffix: 'naija_wins',
    tier: 'gold',
    title: 'Naija landlord',
    description: 'Win a game on the Naija board.',
    counter: 'monopoly_naija_wins',
    points: 60,
    sortOrder: 110,
  },
  {
    suffix: 'blue_chip',
    tier: 'gold',
    title: 'Blue chip',
    description: 'Own both the dark blue and green monopolies at once.',
    counter: 'monopoly_blue_chip',
    points: 70,
    sortOrder: 120,
  },

  // ── Platinum ────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'last_one_standing',
    tier: 'platinum',
    title: 'Last one standing',
    description: 'Win a game of three or more by bankrupting every other player.',
    counter: 'monopoly_last_one_standing',
    points: 150,
    sortOrder: 130,
  },
]
