import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { makeSupabaseStub } from '@/test-support/host-auth'
import { WORD_GROUPING_MAX_MISTAKES, WORD_GROUPING_TOTAL_GROUPS } from '@/lib/word-grouping'

vi.mock('server-only', () => ({}))

const markGameFinished = vi.fn()
vi.mock('@/lib/game-finish', () => ({
  markGameFinished: (...args: unknown[]) => markGameFinished(...args),
}))

import {
  finishWordGroupingIfAllDone,
  settleAllWordGroupingGames,
  settleWordGroupingGame,
} from './word-grouping-completion'

type Sub = { player_id: string; is_correct: boolean }
const solved = (p: string): Sub[] =>
  Array.from({ length: WORD_GROUPING_TOTAL_GROUPS }, () => ({ player_id: p, is_correct: true }))
const outOfGuesses = (p: string): Sub[] =>
  Array.from({ length: WORD_GROUPING_MAX_MISTAKES }, () => ({ player_id: p, is_correct: false }))
const partway = (p: string): Sub[] => [{ player_id: p, is_correct: true }]

/** One game per entry: games.id -> { status, session_started_at, subs }. */
function makeClient(games: Record<string, { status: string; session: string | null; subs: Sub[] }>, fail?: string) {
  const reads: string[] = []
  const client = makeSupabaseStub({
    games: (ctx) => {
      reads.push('games')
      if (fail === 'games') return { data: null, error: { message: 'boom' } }
      if (ctx.filters.id !== undefined) {
        const g = games[ctx.filters.id as string]
        return { data: g ? { id: ctx.filters.id, status: g.status, session_started_at: g.session } : null, error: null }
      }
      // list: active word_grouping games
      return {
        data: Object.entries(games)
          .filter(([, g]) => g.status === 'active')
          .map(([id]) => ({ id })),
        error: null,
      }
    },
    rounds: (ctx) => ({ data: { id: `round-${ctx.filters.game_id as string}` }, error: null }),
    players: (ctx) => {
      if (fail === 'players') return { data: null, error: { message: 'boom' } }
      const g = games[ctx.filters.game_id as string]
      const ids = Array.from(new Set((g?.subs ?? []).map((s) => s.player_id)))
      return { data: ids.map((id) => ({ id })), error: null }
    },
    word_grouping_submissions: (ctx) => {
      const gameId = String(ctx.filters.round_id).replace('round-', '')
      return { data: games[gameId]?.subs ?? [], error: null }
    },
  })
  return { client: client as unknown as SupabaseClient, reads }
}

beforeEach(() => {
  markGameFinished.mockReset()
  markGameFinished.mockResolvedValue({ error: null, won: true })
})

describe('finishWordGroupingIfAllDone', () => {
  it('finishes the game, bound to the session, once every player is done', async () => {
    const { client } = makeClient({
      ABCD: { status: 'active', session: 'S1', subs: [...solved('a'), ...outOfGuesses('b')] },
    })
    const res = await finishWordGroupingIfAllDone(client, 'ABCD', 'round-ABCD', 'S1')
    expect(res).toEqual({ error: null, allDone: true })
    expect(markGameFinished).toHaveBeenCalledWith(
      expect.anything(),
      'ABCD',
      expect.any(String),
      expect.objectContaining({ onlyIfActive: true, onlySessionStartedAt: 'S1' })
    )
  })

  it('does nothing while someone is still playing', async () => {
    const { client } = makeClient({
      ABCD: { status: 'active', session: 'S1', subs: [...solved('a'), ...partway('b')] },
    })
    expect(await finishWordGroupingIfAllDone(client, 'ABCD', 'round-ABCD', 'S1')).toEqual({
      error: null,
      allDone: false,
    })
    expect(markGameFinished).not.toHaveBeenCalled()
  })

  it('reports a failed finish as an error (so the caller can retry) while still saying everyone is done', async () => {
    markGameFinished.mockResolvedValue({ error: 'db down', won: false })
    const { client } = makeClient({ ABCD: { status: 'active', session: 'S1', subs: solved('a') } })
    const res = await finishWordGroupingIfAllDone(client, 'ABCD', 'round-ABCD', 'S1')
    expect(res.allDone).toBe(true)
    expect(res.error?.message).toContain('markGameFinished failed')
  })

  it('reports a failed read as an error', async () => {
    const { client } = makeClient({ ABCD: { status: 'active', session: 'S1', subs: solved('a') } }, 'players')
    const res = await finishWordGroupingIfAllDone(client, 'ABCD', 'round-ABCD', 'S1')
    expect(res.error?.message).toContain('players read failed')
    expect(markGameFinished).not.toHaveBeenCalled()
  })
})

describe('settleWordGroupingGame — recovery with no submission involved', () => {
  it('finishes a stranded all-done game', async () => {
    const { client } = makeClient({
      ABCD: { status: 'active', session: 'S1', subs: [...solved('a'), ...outOfGuesses('b')] },
    })
    expect(await settleWordGroupingGame(client, 'ABCD')).toEqual({ finished: true })
    expect(markGameFinished).toHaveBeenCalledTimes(1)
  })

  it('is a no-op for a finished game, a missing game and a game still being played', async () => {
    const { client } = makeClient({
      DONE: { status: 'finished', session: 'S1', subs: solved('a') },
      LIVE: { status: 'active', session: 'S1', subs: partway('a') },
    })
    expect(await settleWordGroupingGame(client, 'DONE')).toEqual({ finished: false })
    expect(await settleWordGroupingGame(client, 'NOPE')).toEqual({ finished: false })
    expect(await settleWordGroupingGame(client, 'LIVE')).toEqual({ finished: false })
    expect(markGameFinished).not.toHaveBeenCalled()
  })

  it('surfaces a failure so the endpoint answers 500 and the client keeps asking', async () => {
    markGameFinished.mockResolvedValue({ error: 'db down', won: false })
    const { client } = makeClient({ ABCD: { status: 'active', session: 'S1', subs: solved('a') } })
    const res = await settleWordGroupingGame(client, 'ABCD')
    expect(res.finished).toBe(false)
    expect(res.error).toBeDefined()
  })
})

describe('settleAllWordGroupingGames — the server sweep', () => {
  it('finishes only the stranded games and counts them', async () => {
    const { client } = makeClient({
      STRANDED1: { status: 'active', session: 'S1', subs: solved('a') },
      STRANDED2: { status: 'active', session: 'S2', subs: outOfGuesses('a') },
      LIVE: { status: 'active', session: 'S3', subs: partway('a') },
      DONE: { status: 'finished', session: 'S4', subs: solved('a') },
    })
    expect(await settleAllWordGroupingGames(client)).toEqual({ finished: 2, failed: 0 })
    expect(markGameFinished).toHaveBeenCalledTimes(2)
  })

  it('counts a failing game and keeps going', async () => {
    markGameFinished.mockResolvedValueOnce({ error: 'db down', won: false })
    const { client } = makeClient({
      A: { status: 'active', session: 'S1', subs: solved('a') },
      B: { status: 'active', session: 'S2', subs: solved('a') },
    })
    expect(await settleAllWordGroupingGames(client)).toEqual({ finished: 1, failed: 1 })
  })

  it('reports a failed list read without throwing', async () => {
    const { client } = makeClient({ A: { status: 'active', session: 'S1', subs: solved('a') } }, 'games')
    expect(await settleAllWordGroupingGames(client)).toEqual({ finished: 0, failed: 1 })
  })
})
