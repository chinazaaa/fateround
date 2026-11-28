import { describe, it, expect } from 'vitest'
import { initializeUnoGame } from './uno'
import { INTERNAL_ERROR_MESSAGE } from './api-errors'

// A start deals the room and the caller then flips the game to `active` in a SEPARATE statement. If that flip fails the
// room keeps a live session while the game stays `waiting`; the next start must complete the start (the caller re-runs
// the idempotent flip) instead of failing on the duplicate session forever.

type Result = { data: unknown; error: unknown; count?: number | null }

function makeMock(opts: {
  gameError?: boolean
  existing?: { phase: string; turn_order: string[] } | null
  hands?: number
}) {
  const ops: string[] = []
  function chain(result: Result): Promise<Result> & Record<string, unknown> {
    const p = Promise.resolve(result) as Promise<Result> & Record<string, unknown>
    p.eq = () => chain(result)
    p.select = () => chain(result)
    p.maybeSingle = () => Promise.resolve(result)
    return p
  }
  const supabase = {
    from(table: string) {
      return {
        select() {
          if (table === 'games') {
            return opts.gameError
              ? chain({ data: null, error: { message: 'boom' } })
              : chain({ data: { timer_seconds: 0, uno_team_mode: false, uno_mode: 'classic' }, error: null })
          }
          if (table === 'uno_sessions') return chain({ data: opts.existing ?? null, error: null })
          if (table === 'uno_player_hands') return chain({ data: null, error: null, count: opts.hands ?? 0 })
          if (table === 'players')
            return chain({
              data: [
                { id: 'A', name: 'A' },
                { id: 'B', name: 'B' },
              ],
              error: null,
            })
          return chain({ data: null, error: null })
        },
        insert() {
          ops.push(`${table}:insert`)
          return chain({ data: null, error: null })
        },
        delete() {
          ops.push(`${table}:delete`)
          return chain({ data: null, error: null })
        },
      }
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as any, ops }
}

describe('initializeUnoGame — a retry after a failed games flip', () => {
  it('a live session with every hand is resumed: nothing is dealt a second time', async () => {
    const { supabase, ops } = makeMock({ existing: { phase: 'playing', turn_order: ['A', 'B'] }, hands: 2 })
    expect(await initializeUnoGame(supabase, 'G', ['A', 'B'])).toEqual({})
    expect(ops).toEqual([])
  })

  it('a half-written deal (a session without all of its hands) is cleared and dealt again', async () => {
    const { supabase, ops } = makeMock({ existing: { phase: 'playing', turn_order: ['A', 'B'] }, hands: 1 })
    expect(await initializeUnoGame(supabase, 'G', ['A', 'B'])).toEqual({})
    expect(ops).toEqual(['uno_sessions:delete', 'uno_sessions:insert', 'uno_player_hands:insert'])
  })

  it('a first start deals normally', async () => {
    const { supabase, ops } = makeMock({ existing: null })
    expect(await initializeUnoGame(supabase, 'G', ['A', 'B'])).toEqual({})
    expect(ops).toEqual(['uno_sessions:insert', 'uno_player_hands:insert'])
  })

  it('a failed settings read stops the deal (never dealt as a classic game)', async () => {
    const { supabase, ops } = makeMock({ gameError: true })
    expect(await initializeUnoGame(supabase, 'G', ['A', 'B'])).toEqual({ error: INTERNAL_ERROR_MESSAGE })
    expect(ops).toEqual([])
  })
})
