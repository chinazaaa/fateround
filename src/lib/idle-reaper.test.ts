import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const adminEndGame = vi.fn()
vi.mock('@/lib/admin-end-game', () => ({
  adminEndGame: (...args: unknown[]) => adminEndGame(...args),
}))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({}) }))

import { closeIdleActiveGames, isIdleReaperDisabled, resolveIdleMinutes } from './idle-reaper'

/**
 * `closeIdleActiveGames` force-finishes live games, and for a couple of game
 * families finishing also DELETES their data. Every guard below is therefore a
 * data-loss guard, not a tidiness one — the selection predicate decides whose
 * game gets ended without asking.
 */

type Row = { id: string; status: string; game_type: string }

type Recorded = {
  select?: unknown
  eq?: Array<[string, unknown]>
  lt?: Array<[string, unknown]>
  not?: [string, string, unknown]
  order?: [string, unknown]
  limit?: number
  reasonUpdates: Array<{ patch: Record<string, unknown>; column: string; id: unknown }>
}

function mockSupabase(
  rows: Row[],
  opts: { selectError?: { message: string }; reasonError?: { message: string } } = {}
): { supabase: SupabaseClient; recorded: Recorded } {
  const recorded: Recorded = { eq: [], lt: [], reasonUpdates: [] }

  const supabase = {
    from: (table: string) => {
      expect(table).toBe('games')
      const chain = {
        select: (cols: unknown) => {
          recorded.select = cols
          return chain
        },
        eq: (column: string, value: unknown) => {
          recorded.eq!.push([column, value])
          return chain
        },
        lt: (column: string, value: unknown) => {
          recorded.lt!.push([column, value])
          return chain
        },
        not: (column: string, operator: string, value: unknown) => {
          recorded.not = [column, operator, value]
          return chain
        },
        order: (column: string, options: unknown) => {
          recorded.order = [column, options]
          return chain
        },
        // Terminal call in the reaper's select chain.
        limit: async (count: number) => {
          recorded.limit = count
          return { data: opts.selectError ? null : rows, error: opts.selectError ?? null }
        },
        update: (patch: Record<string, unknown>) => ({
          eq: async (column: string, id: unknown) => {
            recorded.reasonUpdates.push({ patch, column, id })
            return { error: opts.reasonError ?? null }
          },
        }),
      }
      return chain
    },
  } as unknown as SupabaseClient

  return { supabase, recorded }
}

const game = (id: string, game_type = 'trivia'): Row => ({ id, status: 'active', game_type })

describe('closeIdleActiveGames — selection predicate', () => {
  beforeEach(() => {
    adminEndGame.mockReset()
    adminEndGame.mockResolvedValue({ error: null })
  })

  it('only considers active games idle past the cutoff, oldest first, capped to one batch', async () => {
    const { supabase, recorded } = mockSupabase([])
    const before = Date.now()
    await closeIdleActiveGames(supabase, 30)
    const after = Date.now()

    expect(recorded.eq).toEqual([['status', 'active']])
    expect(recorded.lt).toHaveLength(1)
    const [column, cutoff] = recorded.lt![0]
    expect(column).toBe('last_activity_at')
    // The cutoff is exactly `now - olderThanMinutes`, so nothing touched inside
    // the window can be selected.
    const cutoffMs = new Date(cutoff as string).getTime()
    expect(cutoffMs).toBeGreaterThanOrEqual(before - 30 * 60 * 1000)
    expect(cutoffMs).toBeLessThanOrEqual(after - 30 * 60 * 1000)

    expect(recorded.order).toEqual(['last_activity_at', { ascending: true }])
    expect(recorded.limit).toBe(20)
  })

  it('honours the threshold argument when computing the cutoff', async () => {
    const { supabase, recorded } = mockSupabase([])
    const before = Date.now()
    await closeIdleActiveGames(supabase, 120)
    const cutoffMs = new Date(recorded.lt![0][1] as string).getTime()
    expect(cutoffMs).toBeLessThanOrEqual(Date.now() - 120 * 60 * 1000)
    expect(cutoffMs).toBeGreaterThanOrEqual(before - 120 * 60 * 1000)
  })

  it('reports a failed select instead of throwing, and ends nothing', async () => {
    const { supabase } = mockSupabase([], { selectError: { message: 'connection reset' } })
    const result = await closeIdleActiveGames(supabase, 30)
    expect(result).toEqual({ closed: 0, failed: 0, errors: ['connection reset'] })
    expect(adminEndGame).not.toHaveBeenCalled()
  })
})

describe('closeIdleActiveGames — message inboxes are never reaped', () => {
  beforeEach(() => {
    adminEndGame.mockReset()
    adminEndGame.mockResolvedValue({ error: null })
  })

  it('excludes inbox game types in the database filter so they never eat a batch slot', async () => {
    const { supabase, recorded } = mockSupabase([])
    await closeIdleActiveGames(supabase, 30)
    expect(recorded.not).toEqual(['game_type', 'in', '(anonymous_messages,secret_message)'])
  })

  it('re-filters inbox rows client-side if the database filter ever lets one through', async () => {
    // A secret_message board is created `status='active'` and is *meant* to sit
    // idle; ending it deletes every message in the host's inbox. If the `not in`
    // filter regresses, this second check still has to save the inbox.
    const rows = [game('AAAA', 'secret_message'), game('BBBB', 'anonymous_messages'), game('CCCC', 'trivia')]
    const { supabase } = mockSupabase(rows)
    const result = await closeIdleActiveGames(supabase, 30)

    expect(adminEndGame).toHaveBeenCalledTimes(1)
    expect(adminEndGame.mock.calls[0][1]).toMatchObject({ id: 'CCCC' })
    expect(result.closed).toBe(1)
  })

  it('does nothing at all when the whole batch is inboxes', async () => {
    const { supabase, recorded } = mockSupabase([game('AAAA', 'secret_message')])
    const result = await closeIdleActiveGames(supabase, 30)
    expect(adminEndGame).not.toHaveBeenCalled()
    expect(recorded.reasonUpdates).toEqual([])
    expect(result).toEqual({ closed: 0, failed: 0, errors: [] })
  })
})

describe('closeIdleActiveGames — finishing each game', () => {
  beforeEach(() => {
    adminEndGame.mockReset()
    adminEndGame.mockResolvedValue({ error: null })
  })

  it('finishes with onlyIfActive so overlapping sweeps cannot double-award', async () => {
    // The cron route has no in-flight guard: an ops curl during a slow sweep, or a
    // manual timer start, can select the same batch twice. Without the CAS both
    // runs award room points and both resolve the tournament match.
    const { supabase } = mockSupabase([game('AAAA')])
    await closeIdleActiveGames(supabase, 30)
    expect(adminEndGame).toHaveBeenCalledExactlyOnceWith(
      supabase,
      { id: 'AAAA', status: 'active', game_type: 'trivia' },
      { onlyIfActive: true }
    )
  })

  it('stamps result_reason=idle_timeout on each game it closed', async () => {
    const { supabase, recorded } = mockSupabase([game('AAAA'), game('BBBB')])
    const result = await closeIdleActiveGames(supabase, 30)
    expect(result).toEqual({ closed: 2, failed: 0, errors: [] })
    expect(recorded.reasonUpdates).toEqual([
      { patch: { result_reason: 'idle_timeout' }, column: 'id', id: 'AAAA' },
      { patch: { result_reason: 'idle_timeout' }, column: 'id', id: 'BBBB' },
    ])
  })

  it('keeps the game counted as closed when only the reason stamp fails', async () => {
    const { supabase } = mockSupabase([game('AAAA')], { reasonError: { message: 'no column' } })
    const result = await closeIdleActiveGames(supabase, 30)
    expect(result.closed).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.errors).toEqual(['AAAA: result_reason update failed: no column'])
  })

  it('isolates a per-game failure — one bad game does not abort the sweep', async () => {
    adminEndGame.mockImplementation(async (_supabase: unknown, g: Row) =>
      g.id === 'BBBB' ? { error: 'reveal failed' } : { error: null }
    )
    const { supabase, recorded } = mockSupabase([game('AAAA'), game('BBBB'), game('CCCC')])
    const result = await closeIdleActiveGames(supabase, 30)

    expect(adminEndGame).toHaveBeenCalledTimes(3)
    expect(result.closed).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.errors).toEqual(['BBBB: reveal failed'])
    // The failed game must not be stamped as an idle timeout — it is still active.
    expect(recorded.reasonUpdates.map((u) => u.id)).toEqual(['AAAA', 'CCCC'])
  })

  it('caps the reported errors so a fully broken batch cannot flood the log line', async () => {
    adminEndGame.mockResolvedValue({ error: 'boom' })
    const rows = Array.from({ length: 8 }, (_, i) => game(`G${i}`))
    const { supabase } = mockSupabase(rows)
    const result = await closeIdleActiveGames(supabase, 30)
    expect(result.failed).toBe(8)
    expect(result.errors).toHaveLength(5)
  })
})

describe('resolveIdleMinutes', () => {
  const original = process.env.IDLE_REAPER_MINUTES
  afterEach(() => {
    if (original === undefined) delete process.env.IDLE_REAPER_MINUTES
    else process.env.IDLE_REAPER_MINUTES = original
  })

  it('defaults to 30 minutes', () => {
    delete process.env.IDLE_REAPER_MINUTES
    expect(resolveIdleMinutes()).toBe(30)
  })

  it('reads a widened threshold from the env', () => {
    process.env.IDLE_REAPER_MINUTES = '180'
    expect(resolveIdleMinutes()).toBe(180)
  })

  it('falls back to the default rather than reaping aggressively on junk input', () => {
    for (const bad of ['', 'soon', '0', '-5', 'NaN']) {
      process.env.IDLE_REAPER_MINUTES = bad
      expect(resolveIdleMinutes(), bad).toBe(30)
    }
  })
})

describe('isIdleReaperDisabled', () => {
  const original = process.env.IDLE_REAPER_DISABLED
  afterEach(() => {
    if (original === undefined) delete process.env.IDLE_REAPER_DISABLED
    else process.env.IDLE_REAPER_DISABLED = original
  })

  it('is enabled when unset or empty', () => {
    delete process.env.IDLE_REAPER_DISABLED
    expect(isIdleReaperDisabled()).toBe(false)
    process.env.IDLE_REAPER_DISABLED = '   '
    expect(isIdleReaperDisabled()).toBe(false)
  })

  it('accepts every plausible spelling of "stop" — not just the literal 1', () => {
    // Ops set this through SSM in an incident. `=== '1'` silently ignored
    // true/yes/on and left the destructive sweep running.
    for (const value of ['1', 'true', 'TRUE', 'True', 'yes', 'on', 'y', 'disabled', ' 1 ']) {
      process.env.IDLE_REAPER_DISABLED = value
      expect(isIdleReaperDisabled(), value).toBe(true)
    }
  })

  it('treats only 0 / false as "leave it running"', () => {
    for (const value of ['0', 'false', 'FALSE', ' false ']) {
      process.env.IDLE_REAPER_DISABLED = value
      expect(isIdleReaperDisabled(), value).toBe(false)
    }
  })
})
