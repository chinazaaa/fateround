import { describe, expect, it } from 'vitest'
import { codewordsFacts } from './codewords'

/**
 * The facts builder reads three tables and nothing else, so the mock is three arrays.
 * Every case here is a rule someone could write in admin — if the derivation is wrong the
 * trophy is silently unearnable, which is indistinguishable from a typo.
 */
function db(parts: {
  boards?: Record<string, unknown>[]
  roles?: Record<string, unknown>[]
  guesses?: Record<string, unknown>[]
}) {
  return {
    from(table: string) {
      const rows =
        table === 'codewords_boards'
          ? (parts.boards ?? [])
          : table === 'codewords_player_roles'
            ? (parts.roles ?? [])
            : (parts.guesses ?? [])
      return { select: () => ({ eq: () => Promise.resolve({ data: rows }) }) }
    },
  } as never
}

const CTX = { timerSeconds: 60, questionSource: null, won: false, seated: 4 }

/** A standard 25-card key: 9 red (the starting team), 8 blue, 7 neutral, 1 assassin. */
const KEY = [
  ...Array<string>(9).fill('red'),
  ...Array<string>(8).fill('blue'),
  ...Array<string>(7).fill('neutral'),
  'assassin',
]
const board = (over: Record<string, unknown> = {}) => [{ key: KEY, revealed_indices: [], assassin_team: null, ...over }]

const roles = [
  { player_id: 'me', team: 'red', role: 'operative' },
  { player_id: 'boss', team: 'red', role: 'spymaster' },
]

let clock = 0
/** Guesses are ordered by `created_at`, so the helper hands out increasing timestamps. */
const guess = (over: Record<string, unknown>) => ({
  player_id: 'me',
  cell_index: clock,
  cell_type: 'red',
  clue_word: 'TREE',
  clue_number: 3,
  team: 'red',
  created_at: new Date(1_700_000_000_000 + clock++ * 1000).toISOString(),
  ...over,
})

describe('codewordsFacts', () => {
  it('tallies each kind of card this player turned over', async () => {
    const guesses = [
      guess({ cell_type: 'red' }),
      guess({ cell_type: 'red' }),
      guess({ cell_type: 'neutral' }),
      guess({ cell_type: 'blue' }),
      guess({ cell_type: 'assassin' }),
      // Someone else's mistakes are not this player's tally.
      guess({ player_id: 'boss', cell_type: 'blue' }),
    ]
    const f = await codewordsFacts(db({ boards: board(), roles, guesses }), 'G', 'me', CTX)
    expect(f.codewords_own_word_guesses).toBe(2)
    expect(f.codewords_neutral_guesses).toBe(1)
    expect(f.codewords_opponent_guesses).toBe(1)
    expect(f.codewords_assassin_guesses).toBe(1)
  })

  it('flags a clue for 3 only when all three were found', async () => {
    const full = [
      guess({ clue_word: 'TREE', clue_number: 3 }),
      guess({ clue_word: 'TREE', clue_number: 3 }),
      guess({ clue_word: 'TREE', clue_number: 3 }),
    ]
    const short = [
      guess({ clue_word: 'OCEAN', clue_number: 3 }),
      guess({ clue_word: 'OCEAN', clue_number: 3 }),
      guess({ clue_word: 'OCEAN', clue_number: 3, cell_type: 'neutral' }),
    ]
    const hit = await codewordsFacts(db({ boards: board(), roles, guesses: full }), 'G', 'me', CTX)
    const miss = await codewordsFacts(db({ boards: board(), roles, guesses: short }), 'G', 'me', CTX)
    expect(hit.codewords_clue3_full).toBe(1)
    expect(miss.codewords_clue3_full).toBeUndefined()
    // The clue-for-3 is credited to the spymaster too — the guess rows name the finder, never
    // the clue-giver, so a team achievement is credited to the team.
    const spy = await codewordsFacts(db({ boards: board(), roles, guesses: full }), 'G', 'boss', CTX)
    expect(spy.codewords_clue3_full).toBe(1)
  })

  it('separates two clues for the same number into two runs', async () => {
    const guesses = [
      guess({ clue_word: 'TREE', clue_number: 2 }),
      guess({ clue_word: 'TREE', clue_number: 2 }),
      guess({ clue_word: 'OCEAN', clue_number: 2, cell_type: 'neutral' }),
    ]
    const f = await codewordsFacts(db({ boards: board(), roles, guesses }), 'G', 'me', CTX)
    expect(f.codewords_clue2_full).toBe(1)
    // Two clean cards then a botched second turn: only the first turn was clean.
    expect(f.codewords_clean_turns).toBe(1)
  })

  it('counts a personal run of four under one clue', async () => {
    const four = [1, 2, 3, 4].map(() => guess({ clue_word: 'SUN', clue_number: 4 }))
    const shared = [
      guess({ clue_word: 'SUN', clue_number: 4 }),
      guess({ clue_word: 'SUN', clue_number: 4 }),
      guess({ player_id: 'boss', clue_word: 'SUN', clue_number: 4 }),
      guess({ player_id: 'boss', clue_word: 'SUN', clue_number: 4 }),
    ]
    const solo = await codewordsFacts(db({ boards: board(), roles, guesses: four }), 'G', 'me', CTX)
    const split = await codewordsFacts(db({ boards: board(), roles, guesses: shared }), 'G', 'me', CTX)
    expect(solo.codewords_run4_guesses).toBe(1)
    expect(solo.codewords_run5_guesses).toBeUndefined()
    // The clue was fully found, but this player only turned over two of the four.
    expect(split.codewords_clue4_full).toBe(1)
    expect(split.codewords_run4_guesses).toBeUndefined()
  })

  it('cannot see a clue that drew no guesses, so runs are undercounted', async () => {
    // Three recorded turns here, but the team also had a fourth clue that timed out before anyone
    // touched a card. That turn leaves NO row anywhere, so it is invisible: the win reads as a
    // three-run flawless sweep. The bias is generous for the sweep counters and safe for every
    // other one — documented in codewords.ts rather than silently absorbed.
    const guesses = [
      guess({ clue_word: 'A', clue_number: 1 }),
      guess({ clue_word: 'B', clue_number: 1 }),
      guess({ clue_word: 'C', clue_number: 1 }),
    ]
    const f = await codewordsFacts(db({ boards: board(), roles, guesses }), 'G', 'me', { ...CTX, won: true })
    expect(f.codewords_clean_turns).toBe(3)
    expect(f.codewords_sweep_wins).toBe(1)
    expect(f.codewords_flawless_sweep_wins).toBe(1)
  })

  it('splits a team win by the role the player finished in', async () => {
    const guesses = [guess({})]
    const mine = await codewordsFacts(db({ boards: board(), roles, guesses }), 'G', 'me', { ...CTX, won: true })
    const spy = await codewordsFacts(db({ boards: board(), roles, guesses }), 'G', 'boss', { ...CTX, won: true })
    expect(mine.codewords_operative_wins).toBe(1)
    expect(mine.codewords_spymaster_wins).toBeUndefined()
    expect(spy.codewords_spymaster_wins).toBe(1)
    expect(spy.codewords_operative_wins).toBeUndefined()
    // The spymaster never guessed, yet the win is theirs: Codewords wins are team wins.
    expect(spy.codewords_own_word_guesses).toBeUndefined()
  })

  it('a single wrong card by anyone on the team costs the perfect win', async () => {
    const clean = [guess({}), guess({})]
    const smudged = [guess({}), guess({ player_id: 'boss', cell_type: 'neutral' })]
    const perfect = await codewordsFacts(db({ boards: board(), roles, guesses: clean }), 'G', 'me', {
      ...CTX,
      won: true,
    })
    const flawed = await codewordsFacts(db({ boards: board(), roles, guesses: smudged }), 'G', 'me', {
      ...CTX,
      won: true,
    })
    expect(perfect.codewords_perfect_wins).toBe(1)
    expect(perfect.codewords_flawless_sweep_wins).toBe(1)
    expect(flawed.codewords_perfect_wins).toBeUndefined()
    expect(flawed.codewords_flawless_sweep_wins).toBeUndefined()
    expect(flawed.codewords_sweep_wins).toBe(1)
  })

  it('marks a clutch win only when the opponent was one card away', async () => {
    // Blue's cards are indices 9..16; leaving one unrevealed is a one-card-away loss for them.
    const nearly = board({ revealed_indices: [9, 10, 11, 12, 13, 14, 15] })
    const comfortable = board({ revealed_indices: [9, 10] })
    const guesses = [guess({})]
    const tight = await codewordsFacts(db({ boards: nearly, roles, guesses }), 'G', 'me', { ...CTX, won: true })
    const easy = await codewordsFacts(db({ boards: comfortable, roles, guesses }), 'G', 'me', { ...CTX, won: true })
    expect(tight.codewords_clutch_wins).toBe(1)
    expect(easy.codewords_clutch_wins).toBeUndefined()
  })

  it('marks a comeback only when the team was three or more words behind', async () => {
    // Red starts 9 to blue's 8. Blue turning over four of their own puts red 4 behind.
    const behind = [
      guess({ team: 'blue', player_id: 'rival', cell_type: 'blue', cell_index: 9 }),
      guess({ team: 'blue', player_id: 'rival', cell_type: 'blue', cell_index: 10 }),
      guess({ team: 'blue', player_id: 'rival', cell_type: 'blue', cell_index: 11 }),
      guess({ team: 'blue', player_id: 'rival', cell_type: 'blue', cell_index: 12 }),
      guess({ cell_index: 0 }),
    ]
    const level = [
      guess({ team: 'blue', player_id: 'rival', cell_type: 'blue', cell_index: 9 }),
      guess({ cell_index: 0 }),
    ]
    const back = await codewordsFacts(db({ boards: board(), roles, guesses: behind }), 'G', 'me', { ...CTX, won: true })
    const even = await codewordsFacts(db({ boards: board(), roles, guesses: level }), 'G', 'me', { ...CTX, won: true })
    expect(back.codewords_comeback_wins).toBe(1)
    expect(even.codewords_comeback_wins).toBeUndefined()
  })

  it('holds the win counters back for the losing team', async () => {
    const f = await codewordsFacts(db({ boards: board(), roles, guesses: [guess({})] }), 'G', 'me', CTX)
    expect(f.codewords_own_word_guesses).toBe(1)
    expect(f.codewords_operative_wins).toBeUndefined()
    expect(f.codewords_perfect_wins).toBeUndefined()
  })

  it('returns nothing for a player who was never in the game', async () => {
    const f = await codewordsFacts(db({ boards: board(), roles, guesses: [] }), 'G', 'ghost', CTX)
    expect(f).toEqual({})
  })

  it('returns nothing rather than throwing when the tables are empty', async () => {
    const f = await codewordsFacts(db({}), 'G', 'me', { ...CTX, won: true })
    expect(f).toEqual({})
  })
})
