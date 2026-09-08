import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// `finishAnonymousRoomSession` resolves the finish through a dynamic import, so the
// mock has to be registered before the module under test pulls it in.
const markGameFinished = vi.hoisted(() =>
  vi.fn(async (): Promise<{ error: { message: string } | null; won: boolean }> => ({ error: null, won: true }))
)
vi.mock('@/lib/game-finish', () => ({ markGameFinished }))

import { clearSessionTables } from './session-clear'
import { clearBingoSessionData } from './bingo'
import { clearAnonymousRoomSessionData, finishExpiredAnonymousSession } from './anonymous-messages'
import { clearLudoSessionData } from './ludo'
import { clearMonopolySessionData } from './monopoly'
import { clearNpatSessionData } from './npat'
import { clearTwoTruthsSessionData } from './two-truths'

// Minimal Supabase stand-in that records which tables get .delete()'d and whether a
// spectator reset (players.update({ spectator: false })) was issued. Each builder
// method is both chainable (.eq().eq()) and awaitable, mirroring supabase-js.
function makeMockSupabase(errorOnTable?: string) {
  const deletedTables: string[] = []
  let spectatorsReset = false
  const thenable = (result: { error: { message: string } | null }) => {
    const p = Promise.resolve(result) as Promise<typeof result> & { eq: () => typeof p }
    p.eq = () => p
    return p
  }
  const supabase = {
    from(table: string) {
      return {
        delete: () => {
          deletedTables.push(table)
          return thenable(table === errorOnTable ? { error: { message: 'boom' } } : { error: null })
        },
        update: (vals: Record<string, unknown>) => {
          if (vals.spectator === false) spectatorsReset = true
          return thenable({ error: null })
        },
      }
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as any, deletedTables, getSpectatorsReset: () => spectatorsReset }
}

describe('clearSessionTables', () => {
  it('deletes each table by game_id, no spectator reset by default', async () => {
    const m = makeMockSupabase()
    const r = await clearSessionTables(m.supabase, 'GAME1', ['a', 'b', 'c'])
    expect(r).toEqual({ error: null })
    expect(m.deletedTables).toEqual(['a', 'b', 'c'])
    expect(m.getSpectatorsReset()).toBe(false)
  })
  it('resets spectators when asked', async () => {
    const m = makeMockSupabase()
    await clearSessionTables(m.supabase, 'G', ['x'], { resetSpectators: true })
    expect(m.getSpectatorsReset()).toBe(true)
  })
  it('returns a sanitized error and stops deleting further tables', async () => {
    const m = makeMockSupabase('b')
    const r = await clearSessionTables(m.supabase, 'G', ['a', 'b', 'c'])
    // The raw DB message is never surfaced to the caller (and so the client).
    expect(r.error).toBeTruthy()
    expect(r.error).not.toBe('boom')
    expect(m.deletedTables).toEqual(['a', 'b']) // 'c' never attempted
  })
})

describe('engine clear functions delegate the correct tables', () => {
  const cases: Array<[string, (s: SupabaseClient, g: string) => Promise<{ error: string | null }>, string[], boolean]> =
    [
      ['bingo', clearBingoSessionData, ['bingo_claims', 'bingo_called_numbers', 'bingo_cards'], false],
      ['anonymous', clearAnonymousRoomSessionData, ['anonymous_messages', 'anonymous_room_bans'], false],
      ['ludo', clearLudoSessionData, ['ludo_sessions', 'ludo_player_state'], true],
      ['monopoly', clearMonopolySessionData, ['monopoly_player_state', 'monopoly_boards'], true],
      ['npat', clearNpatSessionData, ['npat_marks', 'npat_answers'], true],
      ['two_truths', clearTwoTruthsSessionData, ['ttl_guesses', 'ttl_statements'], true],
    ]
  for (const [name, fn, tables, resetsSpectators] of cases) {
    it(`${name} clears ${tables.join(', ')}${resetsSpectators ? ' + resets spectators' : ''}`, async () => {
      const m = makeMockSupabase()
      const r = await fn(m.supabase, 'GAME')
      expect(r).toEqual({ error: null })
      expect(m.deletedTables).toEqual(tables)
      expect(m.getSpectatorsReset()).toBe(resetsSpectators)
    })
  }
})

/**
 * The session wipe runs AFTER the game row is already `finished`, so a failed wipe
 * cannot un-finish the room. `finishAnonymousRoomSession` therefore reports it in
 * `cleanupError`, not `error` — and a caller that reads only `error` would return a
 * clean success and swallow the failed wipe entirely. Nothing retries it (later passes
 * select `status='active'` rows only), so it has to be logged for an operator.
 */
describe('finishExpiredAnonymousSession surfaces a failed post-finish wipe', () => {
  const EXPIRED = {
    id: 'GAME',
    status: 'active',
    game_type: 'anonymous_messages',
    // Well past ANONYMOUS_ROOM_SESSION_SECONDS, so the session counts as expired.
    session_started_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  }

  afterEach(() => {
    vi.restoreAllMocks()
    markGameFinished.mockClear()
  })

  it('still reports success but logs the cleanup failure when the wipe fails', async () => {
    const m = makeMockSupabase('anonymous_messages')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const finished = await finishExpiredAnonymousSession(m.supabase, EXPIRED)

    // The finish won; only the wipe failed, so this must NOT become a failure.
    expect(finished).toBe(true)
    expect(markGameFinished).toHaveBeenCalledTimes(1)
    // `internalErrorMessage` logs the raw DB error too, so match on our own line.
    const logged = spy.mock.calls.filter(([m]) => typeof m === 'string' && m.includes('not retried'))
    expect(logged).toHaveLength(1)
    expect(logged[0][0]).toContain('GAME')
    expect(logged[0][1]).toBeTruthy()
  })

  it('logs nothing when the wipe succeeds', async () => {
    const m = makeMockSupabase()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await finishExpiredAnonymousSession(m.supabase, EXPIRED)).toBe(true)
    expect(m.deletedTables).toEqual(['anonymous_messages', 'anonymous_room_bans'])
    expect(spy).not.toHaveBeenCalled()
  })

  it('reports failure and logs nothing when the finish itself fails', async () => {
    markGameFinished.mockResolvedValueOnce({ error: { message: 'db down' }, won: false })
    const m = makeMockSupabase()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await finishExpiredAnonymousSession(m.supabase, EXPIRED)).toBe(false)
    // No cleanup line: the finish failed, so there was no completed finish to report on.
    expect(spy.mock.calls.filter(([m]) => typeof m === 'string' && m.includes('not retried'))).toHaveLength(0)
  })
})
