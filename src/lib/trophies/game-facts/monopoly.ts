import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MONOPOLY_BOARD,
  MONOPOLY_BOARD_SIZE,
  MONOPOLY_MAX_HOUSES_PER_PROPERTY,
  countOwnedInGroup,
  ownsColorMonopoly,
  type MonopolyColorGroup,
} from '@/lib/monopoly-board'
import type { FactsContext } from './index'

/**
 * Monopoly's per-game facts, derived at finish from the two rows the game already persisted.
 *
 * Monopoly keeps a POSITION, not a record. There is no move log to replay: everything a trophy can
 * see is the final board — `monopoly_boards.property_owners` ({spaceIndex: playerId}) and
 * `.property_buildings` ({spaceIndex: level}) — plus each player's `monopoly_player_state`
 * (`passed_go_once`, `bankrupt`). So this builder is exactly the "bucket A" of the Monopoly
 * trophies: the ones whose truth is still on the board at the final buzzer. It touches no gameplay
 * route and reads only persisted state.
 *
 * WHAT IS NOT HERE, AND WHY. Rent collected, jail visits, auctions won, trades, doubles rolled,
 * cards drawn, bankrupting a rival, peak cash — none of those survive to the finished board, and
 * Monopoly's writes go exclusively through the `monopoly_claim_and_apply` RPC allowlist, so there
 * is nowhere for this builder to add an in-play counter without a gameplay change. Those trophies
 * are deliberately omitted until the RPC surface is extended; see the branch notes.
 *
 * THE BANKRUPTCY CAVEAT. When a player goes bankrupt their deeds return to the bank, i.e.
 * `property_owners` no longer names them anywhere. "Own X" is therefore only meaningful for a
 * player still solvent at finish — a bankrupt player simply owns nothing, which is correct, not a
 * gap. The ownership block below is guarded on `!bankrupt` so it never tries to reconstruct
 * holdings that no longer exist. `passed_go_once` is a durable fact on the player's own row and is
 * awarded regardless of bankruptcy — passing GO happened whether or not they later busted.
 *
 * WHY FLAGS AND NOT VALUES. Counters are lifetime sums (`bump_player_stats` adds deltas) and the
 * rule DSL only asks `counter >= n`. A per-game achievement is emitted as a 0/1 flag counted once,
 * and the rule reads `>= 1`. Nothing here is a per-game magnitude that could be summed into
 * nonsense.
 *
 * ROSTER SIZE COMES FROM turn_order. `removeMonopolyPlayer` deletes a player's `monopoly_player_state`
 * row, so counting those rows would undercount the table a win happened at. `monopoly_boards.turn_order`
 * holds the original seating and is the honest room size for the win gates.
 */

/** Property colour groups that form a monopoly (stations and utilities are handled separately). */
const PROPERTY_GROUPS: MonopolyColorGroup[] = [
  'brown',
  'light_blue',
  'pink',
  'orange',
  'red',
  'yellow',
  'green',
  'dark_blue',
]

/**
 * The four board sides, as the set of ownable space indices between the corners (GO / Jail /
 * Free Parking / Go-To-Jail sit at 0, 10, 20, 30 and own nothing). Precomputed once from the board.
 */
const SIDE_OWNABLE_INDICES: number[][] = [
  [1, 9],
  [11, 19],
  [21, 29],
  [31, MONOPOLY_BOARD_SIZE - 1],
].map(([lo, hi]) =>
  MONOPOLY_BOARD.filter(
    (s) => s.index >= lo! && s.index <= hi! && (s.type === 'property' || s.type === 'station' || s.type === 'utility')
  ).map((s) => s.index)
)

/** Theme values that ARE an edition: London is the classic 'default' board, Naija its counterpart. */
const THEME_LONDON = 'default'
const THEME_NAIJA = 'naija'

type BoardRow = {
  property_owners: Record<string, string> | null
  property_buildings: Record<string, number> | null
  turn_order: string[] | null
}

type PlayerStateRow = {
  player_id: string
  passed_go_once: boolean | null
  bankrupt: boolean | null
}

export async function monopolyFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: boardData }, { data: stateData }] = await Promise.all([
    supabase
      .from('monopoly_boards')
      .select('property_owners, property_buildings, turn_order')
      .eq('game_id', gameId)
      .maybeSingle(),
    supabase.from('monopoly_player_state').select('player_id, passed_go_once, bankrupt').eq('game_id', gameId),
  ])

  const board = boardData as BoardRow | null
  const states = (stateData ?? []) as PlayerStateRow[]
  if (!board || !states.length) return out

  const owners = board.property_owners ?? {}
  const buildings = board.property_buildings ?? {}
  // The room the game was actually played at, unaffected by mid-game removals.
  const playerCount = board.turn_order?.length || states.length

  const winners = new Set(ctx.winners)
  // Last One Standing needs "every OTHER player is bankrupt". A player removed mid-game has no
  // state row, so this is measured over the rows that survive — the players who saw it out.
  const others = (winnerId: string) => states.filter((s) => s.player_id !== winnerId)

  for (const state of states) {
    const playerId = state.player_id
    const facts: Record<string, number> = {}
    const won = winners.has(playerId)

    // ── Durable, bankruptcy-independent ─────────────────────────────────────────────────────
    if (state.passed_go_once) facts.monopoly_passed_go = 1

    // ── Ownership (solvent players only — a bankrupt player owns nothing on the final board) ──
    if (!state.bankrupt) {
      const ownedIndices = Object.entries(owners)
        .filter(([, pid]) => pid === playerId)
        .map(([idx]) => Number(idx))
      const ownedCount = ownedIndices.length

      if (ownedCount >= 3) facts.monopoly_three_properties = 1
      if (ownedCount >= 10) facts.monopoly_ten_properties = 1

      if (PROPERTY_GROUPS.some((g) => ownsColorMonopoly(owners, playerId, g))) facts.monopoly_full_color_set = 1

      if (ownsColorMonopoly(owners, playerId, 'utility')) facts.monopoly_both_utilities = 1

      const stations = countOwnedInGroup(owners, playerId, 'station')
      if (stations >= 2) facts.monopoly_two_stations = 1
      if (stations >= 4) facts.monopoly_all_stations = 1

      // Blue Chip: the two most expensive monopolies at once.
      if (ownsColorMonopoly(owners, playerId, 'dark_blue') && ownsColorMonopoly(owners, playerId, 'green')) {
        facts.monopoly_blue_chip = 1
      }

      // Every ownable space on any one side of the board.
      if (SIDE_OWNABLE_INDICES.some((side) => side.every((i) => owners[String(i)] === playerId))) {
        facts.monopoly_one_side = 1
      }

      // "Full House": four houses on a single property. The engine caps houses at the max (four)
      // before a property upgrades to a hotel (level 5), so `=== MONOPOLY_MAX_HOUSES_PER_PROPERTY`
      // is the full-houses milestone — a hotel is a different, later state and does not count here.
      if (ownedIndices.some((i) => buildings[String(i)] === MONOPOLY_MAX_HOUSES_PER_PROPERTY)) {
        facts.monopoly_four_houses = 1
      }
    }

    // ── Wins (gated by theme and table size) ────────────────────────────────────────────────
    if (won) {
      if (ctx.theme === THEME_NAIJA) facts.monopoly_naija_wins = 1
      if (ctx.theme === THEME_LONDON) facts.monopoly_london_wins = 1

      // Last One Standing: won a 3+ player game by bankrupting everyone else at the table.
      const rest = others(playerId)
      if (playerCount >= 3 && rest.length >= 2 && rest.every((s) => s.bankrupt)) {
        facts.monopoly_last_one_standing = 1
      }
    }

    if (Object.keys(facts).length) out.set(playerId, facts)
  }

  return out
}
