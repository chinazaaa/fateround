import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, PLAYER_ID, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'
import type { FilterCall } from '@/test-support/host-auth'

/**
 * A clue request read the board in blue's clue phase and is held in flight. Blue and red then play
 * a full turn cycle, so the board is back in blue's turn with an empty clue: the state-only
 * compare-and-swap (clue empty, no winner, same team) matches again. The write must still be
 * rejected, because it was validated under an earlier turn. The fake keeps the board in memory,
 * applies the write's filters to it, and mirrors the codewords_bump_turn_seq trigger.
 */

vi.mock('server-only', () => ({}))

type Board = {
  id: string
  game_id: string
  words: string[]
  key: string[]
  revealed_indices: number[]
  current_turn: 'red' | 'blue'
  turn_phase: string
  current_clue_word: string | null
  current_clue_number: number | null
  guesses_remaining: number | null
  operative_timer_seconds: number
  winner: string | null
  clue_seq?: number
  turn_seq?: number
}

let board: Board
let writeGate: Promise<void> | null = null
let onBoardRead: (() => void) | null = null

/** Every way a turn can change hands, as the guess RPC, end-turn and expire-turn do it. */
function setBoard(patch: Partial<Board>) {
  const next = { ...board, ...patch }
  // codewords_bump_turn_seq: any change of current_turn advances the sequence.
  if (next.current_turn !== board.current_turn && typeof board.turn_seq === 'number') {
    next.turn_seq = board.turn_seq + 1
  }
  board = next
}
function passTurn() {
  setBoard({
    current_turn: board.current_turn === 'blue' ? 'red' : 'blue',
    current_clue_word: null,
    current_clue_number: null,
    guesses_remaining: null,
    turn_phase: 'clue',
  })
}

function matches(filters: readonly FilterCall[]) {
  const row = board as unknown as Record<string, unknown>
  return filters.every((f) => {
    const [col, val] = f.args as [string, unknown]
    if (f.method === 'is') return row[col] === val
    if (f.method === 'eq') return row[col] === val
    return true
  })
}

const supabase = makeSupabaseStub({
  games: () => ({ data: gameRow({ status: 'active', game_type: 'codewords' }), error: null }),
  players: () => ({ data: { id: PLAYER_ID }, error: null }),
  codewords_player_roles: () => ({ data: { team: 'blue', role: 'spymaster' }, error: null }),
  codewords_boards: async (ctx) => {
    if (ctx.op === 'select') {
      const snapshot = { ...board }
      onBoardRead?.()
      return { data: snapshot, error: null }
    }
    // The request is "in flight": it has validated and now waits before its write reaches the database.
    if (writeGate) await writeGate
    const eqFilters = ctx.filterCalls.filter((f) => f.method === 'eq' && (f.args[0] as string) !== 'id')
    const isFilters = ctx.filterCalls.filter((f) => f.method === 'is')
    if (!matches([...eqFilters, ...isFilters])) return { data: null, error: null }
    setBoard(ctx.payload as Partial<Board>)
    return { data: { ...board }, error: null }
  },
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

let POST: typeof import('./route').POST
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  writeGate = null
  onBoardRead = null
  board = {
    id: 'board-1',
    game_id: 'ABCD',
    words: ['apple', 'banana', 'cherry', 'date'],
    key: ['blue', 'blue', 'red', 'assassin'],
    revealed_indices: [],
    current_turn: 'blue',
    turn_phase: 'clue',
    current_clue_word: null,
    current_clue_number: null,
    guesses_remaining: null,
    operative_timer_seconds: 60,
    winner: null,
    clue_seq: 4,
    turn_seq: 0,
  }
})

const post = (clueWord = 'fruit', clueNumber = 2) =>
  POST(jsonRequest('/api/codewords/clue', { gameId: GAME_CODE, resumeToken: 'resume-token', clueWord, clueNumber }))

describe('POST /api/codewords/clue — request held across a full turn cycle', () => {
  it('rejects a stale clue request when the same team is back on turn with an empty clue', async () => {
    let release!: () => void
    writeGate = new Promise<void>((resolve) => (release = resolve))

    const read = new Promise<void>((resolve) => (onBoardRead = resolve))
    const stale = post('old', 1) // validated against blue's first turn, then held
    await read

    // The clue timer expires for blue, then for red, so blue is up again with an empty clue.
    passTurn() // blue -> red (clue-phase timeout)
    passTurn() // red -> blue (clue-phase timeout)
    expect(board.current_turn).toBe('blue')
    expect(board.current_clue_word).toBeNull()

    release()
    const res = await stale
    expect(res.status).toBe(409)
    expect(board.current_clue_word).toBeNull()
  })

  it('still accepts a request whose turn did not change while it was in flight', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(board.current_clue_word).toBe('fruit')
  })

  it('does not send the server-side counters back with the posted clue', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    const { board: sent } = await res.json()
    expect(sent.current_clue_word).toBe('fruit') // the rest of the row still reaches the spymaster
    expect(sent).not.toHaveProperty('clue_seq')
    expect(sent).not.toHaveProperty('turn_seq')
  })

  it('accepts a fresh request made after the cycle completed', async () => {
    passTurn()
    passTurn()
    const res = await post()
    expect(res.status).toBe(200)
    expect(board.current_clue_word).toBe('fruit')
  })

  it('filters the write on the turn_seq it read', async () => {
    board.turn_seq = 7
    let seen: readonly FilterCall[] = []
    const original = supabase.from
    supabase.from = ((table: string) => {
      const chain = original(table)
      const eq = chain.eq
      chain.eq = (c: string, v: unknown) => {
        if (c === 'turn_seq') seen = [...seen, { method: 'eq', args: [c, v] }]
        return eq(c, v)
      }
      return chain
    }) as typeof supabase.from
    try {
      await post()
    } finally {
      supabase.from = original
    }
    expect(seen).toContainEqual({ method: 'eq', args: ['turn_seq', 7] })
  })
})
