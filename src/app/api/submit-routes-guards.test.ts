import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * - sudoku/submit rejects spectators (403) before touching the scoring RPC.
 * - crossword/submit and word-search/found answer the loser of a concurrent identical submit
 *   (unique-index violation 23505) exactly like a sequential duplicate, not a 500.
 */

const { state } = vi.hoisted(() => ({
  state: {
    spectator: false,
    insertError: null as { code: string; message: string } | null,
    rpc: vi.fn(),
    finish: vi.fn(async () => ({ error: null })),
  },
}))

vi.mock('server-only', () => ({}))

const tables: Record<string, unknown> = {
  games: { id: 'ABCD', status: 'active', session_started_at: new Date().toISOString(), game_duration_seconds: 600 },
  rounds: {
    id: 'round-1',
    crossword_metadata: { size: 3, blocked: [], clues: [] },
    word_search_metadata: { size: 5, words: ['CAT'] },
  },
  crossword_solutions: { solution: [['A', 'B', 'C']] },
  word_search_solutions: { solution: [{ word: 'CAT', row: 0, col: 0, dir: 'E' }] },
}

function builder(table: string) {
  const b: Record<string, unknown> = {}
  const self = () => b
  Object.assign(b, {
    select: self,
    eq: self,
    maybeSingle: () => Promise.resolve({ data: table === 'crossword_submissions' ? null : (tables[table] ?? null) }),
    insert: () => Promise.resolve({ error: state.insertError }),
    // Awaiting the builder directly (word_search_found existing-list query) yields no rows.
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res),
  })
  return b
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ from: builder, rpc: state.rpc }),
}))
vi.mock('@/lib/game-admin', () => ({
  assertPlayer: async () => ({ error: null, player: { id: 'p1', spectator: state.spectator } }),
}))
vi.mock('@/lib/crossword', async (orig) => ({
  ...(await orig<typeof import('@/lib/crossword')>()),
  crosswordGameSessionExpired: () => false,
  parseCrosswordMetadata: () => ({ size: 3, blocked: [[false, false, false]], clues: [] }),
}))
vi.mock('@/lib/word-search', async (orig) => ({
  ...(await orig<typeof import('@/lib/word-search')>()),
  wordSearchGameSessionExpired: () => false,
  parseWordSearchMetadata: () => ({ size: 5, words: ['CAT'] }),
  matchSelectionToPlacement: () => ({ word: 'CAT', row: 0, col: 0, dir: 'E' }),
  placementEnd: () => [0, 2],
}))
vi.mock('@/lib/sudoku', () => ({ sudokuGameSessionExpired: () => false }))
vi.mock('@/lib/sudoku-finish', () => ({
  finishExpiredSudokuGame: vi.fn(),
  finishSudokuIfAllPlayersDone: state.finish,
}))
vi.mock('@/lib/crossword-finish', () => ({
  finishExpiredCrosswordGame: vi.fn(),
  finishCrosswordIfAnyPlayerDone: state.finish,
}))
vi.mock('@/lib/word-search-finish', () => ({
  finishExpiredWordSearchGame: vi.fn(),
  finishWordSearchIfAnyPlayerDone: state.finish,
}))

import { POST as sudokuPost } from './sudoku/submit/route'
import { POST as crosswordPost } from './crossword/submit/route'
import { POST as wordSearchPost } from './word-search/found/route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/x', { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  state.spectator = false
  state.insertError = null
  state.rpc.mockReset()
  state.finish.mockClear()
})

describe('sudoku/submit spectator guard', () => {
  const body = { gameId: 'abcd', resumeToken: 'token', row: 0, col: 0, value: 1 }

  it('returns 403 for a spectator without calling the scoring RPC', async () => {
    state.spectator = true
    const res = await sudokuPost(req(body))
    expect(res.status).toBe(403)
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('lets a regular player through to the RPC', async () => {
    state.rpc.mockResolvedValue({ data: { is_correct: true, points_awarded: 1, all_solved: false }, error: null })
    const res = await sudokuPost(req(body))
    expect(res.status).toBe(200)
    expect(state.rpc).toHaveBeenCalledOnce()
  })
})

describe('concurrent duplicate submit (23505)', () => {
  const dup = { code: '23505', message: 'duplicate key value violates unique constraint' }

  it('crossword/submit answers like a sequential duplicate', async () => {
    state.insertError = dup
    const res = await crosswordPost(req({ gameId: 'ABCD', resumeToken: 'token', row: 0, col: 0, letter: 'a' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, isCorrect: true, alreadySolved: true })
  })

  it('crossword/submit still 500s on other insert errors', async () => {
    state.insertError = { code: '42P01', message: 'boom' }
    const res = await crosswordPost(req({ gameId: 'ABCD', resumeToken: 'token', row: 0, col: 0, letter: 'a' }))
    expect(res.status).toBe(500)
  })

  it('word-search/found answers like a sequential duplicate', async () => {
    state.insertError = dup
    const res = await wordSearchPost(
      req({ gameId: 'ABCD', resumeToken: 'token', startRow: 0, startCol: 0, endRow: 0, endCol: 2 })
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ found: true, word: 'CAT', alreadyFound: true })
  })

  it('word-search/found still 500s on other insert errors', async () => {
    state.insertError = { code: '42P01', message: 'boom' }
    const res = await wordSearchPost(
      req({ gameId: 'ABCD', resumeToken: 'token', startRow: 0, startCol: 0, endRow: 0, endCol: 2 })
    )
    expect(res.status).toBe(500)
  })
})
