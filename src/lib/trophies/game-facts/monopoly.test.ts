import { describe, expect, it } from 'vitest'
import type { FactsContext } from './index'
import { monopolyFacts } from './monopoly'

/**
 * The builder reads exactly two tables — the board and the per-player state — so the mock is the
 * finished game: one `monopoly_boards` row and one `monopoly_player_state` row per player. Each
 * case is a rule someone could write in admin; a wrong derivation is a silently unearnable trophy.
 */
type Board = {
  property_owners: Record<string, string>
  property_buildings?: Record<string, number>
  turn_order: string[]
}
type State = { player_id: string; passed_go_once?: boolean; bankrupt?: boolean }

function db(board: Board | null, states: State[]) {
  return {
    from(table: string) {
      if (table === 'monopoly_boards') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: board }) }),
          }),
        }
      }
      // monopoly_player_state
      return { select: () => ({ eq: () => Promise.resolve({ data: states }) }) }
    },
  } as never
}

const CTX: FactsContext = {
  timerSeconds: null,
  questionSource: null,
  theme: 'default',
  seated: ['me', 'rival'],
  winners: [],
}

/** Owner map from a list of [spaceIndex, playerId]. */
function owners(...pairs: [number, string][]): Record<string, string> {
  return Object.fromEntries(pairs.map(([i, p]) => [String(i), p]))
}

async function factsFor(supabase: never, player = 'me', ctx: FactsContext = CTX) {
  const map = await monopolyFacts(supabase, 'G', ctx)
  return map.get(player) ?? {}
}

describe('monopolyFacts — ownership', () => {
  it('flags a full colour set (brown = spaces 1 and 3)', async () => {
    const f = await factsFor(
      db({ property_owners: owners([1, 'me'], [3, 'me']), turn_order: ['me', 'rival'] }, [{ player_id: 'me' }])
    )
    expect(f.monopoly_full_color_set).toBe(1)
    // Two properties is not yet "three properties".
    expect(f.monopoly_three_properties).toBeUndefined()
  })

  it('does not flag a colour set when only part of the group is owned', async () => {
    const f = await factsFor(
      db({ property_owners: owners([1, 'me']), turn_order: ['me', 'rival'] }, [{ player_id: 'me' }])
    )
    expect(f.monopoly_full_color_set).toBeUndefined()
  })

  it('flags three and ten properties by count', async () => {
    const three: [number, string][] = [
      [1, 'me'],
      [3, 'me'],
      [6, 'me'],
    ]
    const f3 = await factsFor(
      db({ property_owners: owners(...three), turn_order: ['me', 'rival'] }, [{ player_id: 'me' }])
    )
    expect(f3.monopoly_three_properties).toBe(1)
    expect(f3.monopoly_ten_properties).toBeUndefined()

    const ten: [number, string][] = [1, 3, 6, 8, 9, 11, 13, 14, 16, 18].map((i) => [i, 'me'] as [number, string])
    const f10 = await factsFor(
      db({ property_owners: owners(...ten), turn_order: ['me', 'rival'] }, [{ player_id: 'me' }])
    )
    expect(f10.monopoly_ten_properties).toBe(1)
  })

  it('flags stations at 2 and all-stations at 4 (spaces 5,15,25,35)', async () => {
    const two = await factsFor(
      db({ property_owners: owners([5, 'me'], [15, 'me']), turn_order: ['me', 'rival'] }, [{ player_id: 'me' }])
    )
    expect(two.monopoly_two_stations).toBe(1)
    expect(two.monopoly_all_stations).toBeUndefined()

    const all = await factsFor(
      db({ property_owners: owners([5, 'me'], [15, 'me'], [25, 'me'], [35, 'me']), turn_order: ['me', 'rival'] }, [
        { player_id: 'me' },
      ])
    )
    expect(all.monopoly_two_stations).toBe(1)
    expect(all.monopoly_all_stations).toBe(1)
  })

  it('flags both utilities (spaces 12 and 28)', async () => {
    const f = await factsFor(
      db({ property_owners: owners([12, 'me'], [28, 'me']), turn_order: ['me', 'rival'] }, [{ player_id: 'me' }])
    )
    expect(f.monopoly_both_utilities).toBe(1)
  })

  it('flags Blue Chip only with BOTH dark blue (37,39) and green (31,32,34)', async () => {
    const onlyBlue = await factsFor(
      db({ property_owners: owners([37, 'me'], [39, 'me']), turn_order: ['me', 'rival'] }, [{ player_id: 'me' }])
    )
    expect(onlyBlue.monopoly_full_color_set).toBe(1)
    expect(onlyBlue.monopoly_blue_chip).toBeUndefined()

    const both = await factsFor(
      db(
        {
          property_owners: owners([37, 'me'], [39, 'me'], [31, 'me'], [32, 'me'], [34, 'me']),
          turn_order: ['me', 'rival'],
        },
        [{ player_id: 'me' }]
      )
    )
    expect(both.monopoly_blue_chip).toBe(1)
  })

  it('flags owning a whole side of the board (side 4: 31,32,34,35,37,39)', async () => {
    const side4: [number, string][] = [31, 32, 34, 35, 37, 39].map((i) => [i, 'me'] as [number, string])
    const f = await factsFor(
      db({ property_owners: owners(...side4), turn_order: ['me', 'rival'] }, [{ player_id: 'me' }])
    )
    expect(f.monopoly_one_side).toBe(1)

    // Missing one ownable space on the side → not the whole side.
    const missing: [number, string][] = [31, 32, 34, 35, 37].map((i) => [i, 'me'] as [number, string])
    const g = await factsFor(
      db({ property_owners: owners(...missing), turn_order: ['me', 'rival'] }, [{ player_id: 'me' }])
    )
    expect(g.monopoly_one_side).toBeUndefined()
  })

  it('flags four houses at level exactly 4 (not at 3, not at a hotel)', async () => {
    const four = await factsFor(
      db({ property_owners: owners([1, 'me']), property_buildings: { '1': 4 }, turn_order: ['me', 'rival'] }, [
        { player_id: 'me' },
      ])
    )
    expect(four.monopoly_four_houses).toBe(1)

    // Three houses is below the max now (four before a hotel), so it does not count.
    const three = await factsFor(
      db({ property_owners: owners([1, 'me']), property_buildings: { '1': 3 }, turn_order: ['me', 'rival'] }, [
        { player_id: 'me' },
      ])
    )
    expect(three.monopoly_four_houses).toBeUndefined()

    const hotel = await factsFor(
      db({ property_owners: owners([1, 'me']), property_buildings: { '1': 5 }, turn_order: ['me', 'rival'] }, [
        { player_id: 'me' },
      ])
    )
    expect(hotel.monopoly_four_houses).toBeUndefined()
  })
})

describe('monopolyFacts — passed GO and bankruptcy', () => {
  it('awards Passed GO from the durable flag, even to a bankrupt player', async () => {
    const f = await factsFor(
      db({ property_owners: {}, turn_order: ['me', 'rival'] }, [
        { player_id: 'me', passed_go_once: true, bankrupt: true },
      ])
    )
    expect(f.monopoly_passed_go).toBe(1)
  })

  it('does not reconstruct a bankrupt player: their cleared holdings earn no ownership trophy', async () => {
    // A player who owned a full set but went bankrupt has had `property_owners` cleared for them.
    const f = await factsFor(
      db({ property_owners: owners([1, 'winner'], [3, 'winner']), turn_order: ['me', 'winner'] }, [
        { player_id: 'me', passed_go_once: true, bankrupt: true },
        { player_id: 'winner' },
      ])
    )
    // Only the durable flag survives; no ownership facts.
    expect(f).toEqual({ monopoly_passed_go: 1 })
  })
})

describe('monopolyFacts — wins', () => {
  const win = (theme: string, states: State[], turn_order: string[], winner = 'me') =>
    factsFor(db({ property_owners: {}, turn_order }, states), winner, { ...CTX, theme, winners: [winner] })

  it('London win fires on the default board, Naija does not', async () => {
    const f = await win('default', [{ player_id: 'me' }, { player_id: 'rival' }], ['me', 'rival'])
    expect(f.monopoly_london_wins).toBe(1)
    expect(f.monopoly_naija_wins).toBeUndefined()
  })

  it('Naija win fires on the naija board, London does not', async () => {
    const f = await win('naija', [{ player_id: 'me' }, { player_id: 'rival' }], ['me', 'rival'])
    expect(f.monopoly_naija_wins).toBe(1)
    expect(f.monopoly_london_wins).toBeUndefined()
  })

  it('a skin theme (arctic) earns neither edition trophy', async () => {
    const f = await win('arctic', [{ player_id: 'me' }, { player_id: 'rival' }], ['me', 'rival'])
    expect(f.monopoly_london_wins).toBeUndefined()
    expect(f.monopoly_naija_wins).toBeUndefined()
  })

  it('Last One Standing needs 3+ players AND every other player bankrupt', async () => {
    // 3 players, both rivals bankrupt.
    const f = await win(
      'default',
      [{ player_id: 'me' }, { player_id: 'a', bankrupt: true }, { player_id: 'b', bankrupt: true }],
      ['me', 'a', 'b']
    )
    expect(f.monopoly_last_one_standing).toBe(1)

    // 3 players but one rival still solvent → not the last one standing.
    const g = await win(
      'default',
      [{ player_id: 'me' }, { player_id: 'a', bankrupt: true }, { player_id: 'b', bankrupt: false }],
      ['me', 'a', 'b']
    )
    expect(g.monopoly_last_one_standing).toBeUndefined()

    // Only 2 players → below the table gate, even if the other is bankrupt.
    const h = await win('default', [{ player_id: 'me' }, { player_id: 'a', bankrupt: true }], ['me', 'a'])
    expect(h.monopoly_last_one_standing).toBeUndefined()
  })

  it('win gates use turn_order for room size, not the surviving state rows', async () => {
    // A rival was removed mid-game (no state row) but turn_order still records a 3-player table.
    const f = await win('default', [{ player_id: 'me' }, { player_id: 'a', bankrupt: true }], ['me', 'a', 'removed'])
    // Only 'a' has a surviving row and is bankrupt, so "others" = 1 row → below the >=2 rest gate.
    expect(f.monopoly_last_one_standing).toBeUndefined()
  })

  it('a non-winner gets no win trophies', async () => {
    const f = await factsFor(
      db({ property_owners: {}, turn_order: ['me', 'rival'] }, [{ player_id: 'me' }, { player_id: 'rival' }]),
      'rival',
      { ...CTX, theme: 'default', winners: ['me'] }
    )
    expect(f.monopoly_london_wins).toBeUndefined()
  })
})

describe('monopolyFacts — empties', () => {
  it('returns an empty map when there is no board', async () => {
    const map = await monopolyFacts(db(null, [{ player_id: 'me' }]) as never, 'G', CTX)
    expect(map.size).toBe(0)
  })

  it('omits players with nothing to say', async () => {
    const map = await monopolyFacts(
      db({ property_owners: {}, turn_order: ['me'] }, [{ player_id: 'me' }]) as never,
      'G',
      CTX
    )
    expect(map.has('me')).toBe(false)
  })
})
