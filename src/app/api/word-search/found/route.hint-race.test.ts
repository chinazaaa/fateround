import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { placementEnd, type WordSearchPlacement } from '@/lib/word-search'
import { GAME_CODE, PLAYER_ID, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * A hint must reveal a word the player did not already have. If a concurrent normal find saves the
 * hinted word first (unique index on player/round/word), the hint moves on to another unfound word
 * instead of reporting a successful no-op.
 */

vi.mock('server-only', () => ({}))

const PLACEMENTS: WordSearchPlacement[] = [
  { word: 'APPLE', row: 0, col: 0, direction: 'E' },
  { word: 'PEAR', row: 2, col: 0, direction: 'E' },
]

let insertErrors: Array<{ code: string; message: string } | null> = []
const inserted: string[] = []
const insertedRows: Array<Record<string, unknown>> = []

const supabase = makeSupabaseStub({
  games: () => ({
    data: gameRow({ status: 'active', session_started_at: null, game_duration_seconds: 0 }),
    error: null,
  }),
  players: () => ({ data: { id: PLAYER_ID, spectator: false }, error: null }),
  rounds: () => ({ data: { id: 'round-1', word_search_metadata: { ok: true } }, error: null }),
  word_search_solutions: () => ({ data: { solution: PLACEMENTS }, error: null }),
  word_search_found: ({ op, payload }) => {
    if (op === 'insert') {
      const error = insertErrors.shift() ?? null
      if (!error) {
        inserted.push((payload as { word: string }).word)
        insertedRows.push(payload as Record<string, unknown>)
      }
      return { data: null, error }
    }
    return { data: [], error: null }
  },
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/game-admin', () => ({
  assertPlayer: async () => ({ player: { id: PLAYER_ID, spectator: false }, error: null }),
}))
vi.mock('@/lib/word-search-finish', () => ({
  finishExpiredWordSearchGame: async () => ({ error: null }),
  finishWordSearchIfAnyPlayerDone: async () => ({ error: null }),
}))
vi.mock('@/lib/word-search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/word-search')>()),
  parseWordSearchMetadata: () => ({ ok: true }),
}))

let POST: typeof import('./route').POST
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  insertErrors = []
  inserted.length = 0
  insertedRows.length = 0
  vi.restoreAllMocks()
})

const hint = () =>
  POST(
    jsonRequest('/api/word-search/found', {
      gameId: GAME_CODE,
      resumeToken: 'resume-token',
      startRow: 0,
      startCol: 0,
      endRow: 0,
      endCol: 0,
      hint: true,
    })
  )

describe('POST /api/word-search/found — hint races a normal find', () => {
  it('reveals the other word when the first pick was just saved by a concurrent find', async () => {
    // Pin the first pick to APPLE so the lost race forces a move to PEAR (different endpoint).
    vi.spyOn(Math, 'random').mockReturnValue(0)
    insertErrors = [{ code: '23505', message: 'duplicate key' }]
    const res = await hint()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.found).toBe(true)
    expect(json.alreadyFound).toBeUndefined()
    expect(json.hint).toBe(true)
    // Exactly one new word was stored, and it is the one the response names.
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toBe(json.word)
    // The retry must store and return the endpoints of the word it actually picked, not the
    // endpoint calculated for the placement that lost the race.
    const placement = PLACEMENTS.find((p) => p.word === json.word)!
    const end = placementEnd(placement)
    expect(insertedRows[0]).toMatchObject({
      start_row: placement.row,
      start_col: placement.col,
      end_row: end[0],
      end_col: end[1],
    })
    expect(json.start).toEqual([placement.row, placement.col])
    expect(json.end).toEqual(end)
    expect(json.word).toBe('PEAR')
  })

  it('reports completion when every remaining word turns out to be taken', async () => {
    insertErrors = [
      { code: '23505', message: 'duplicate key' },
      { code: '23505', message: 'duplicate key' },
    ]
    const json = await (await hint()).json()
    expect(json).toEqual({ found: false, complete: true })
    expect(inserted).toHaveLength(0)
  })

  it('still maps other insert errors to 500', async () => {
    insertErrors = [{ code: '23503', message: 'fk' }]
    expect((await hint()).status).toBe(500)
  })
})
