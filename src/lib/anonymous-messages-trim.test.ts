import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ANONYMOUS_ROOM_MAX_MESSAGES,
  ANONYMOUS_ROOM_TRIM_BATCH,
  trimAnonymousMessagesIfDue,
} from './anonymous-messages'

type GameRow = { anonymous_messages_trimmed_at: string | null }

/**
 * Stateful fake: one games row, a message table that reports `messageCount`, and a delete counter.
 * The games UPDATE honours `.eq('anonymous_messages_trimmed_at', x)` / `.is(..., null)` against the
 * shared row, so concurrent callers behave like a compare-and-swap.
 */
function makeFake({
  messageCount = ANONYMOUS_ROOM_MAX_MESSAGES + 50,
  deleteFails = false,
  onDelete,
  rpcDeleted,
  releaseErrors = 0,
}: {
  messageCount?: number
  deleteFails?: boolean
  rpcDeleted?: number
  onDelete?: (game: GameRow) => void
  /** How many claim-release updates fail with a database error before one succeeds. */
  releaseErrors?: number
} = {}) {
  const game: GameRow = { anonymous_messages_trimmed_at: null }
  const state = { deletes: 0, releaseAttempts: 0, rpcCalls: [] as { fn: string; args: unknown }[] }
  let releaseErrorsLeft = releaseErrors

  const client = {
    rpc: async (fn: string, args: unknown) => {
      state.rpcCalls.push({ fn, args })
      state.deletes += 1
      onDelete?.(game)
      return deleteFails
        ? { data: null, error: { message: 'boom' } }
        : { data: rpcDeleted ?? ANONYMOUS_ROOM_TRIM_BATCH, error: null }
    },
    from(table: string) {
      if (table === 'anonymous_messages') {
        return {
          select: (_cols: string, _opts?: { head?: boolean }) => ({
            eq: async () => ({ count: messageCount, error: null }),
          }),
        }
      }
      if (table === 'games') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { ...game }, error: null }) }),
          }),
          update: (patch: Partial<GameRow>) => {
            const conds: Array<(row: GameRow) => boolean> = []
            const builder = {
              eq(col: string, value: unknown) {
                if (col === 'anonymous_messages_trimmed_at') {
                  conds.push((row) => row.anonymous_messages_trimmed_at === value)
                }
                return builder
              },
              is(col: string, value: null) {
                if (col === 'anonymous_messages_trimmed_at') {
                  conds.push((row) => row.anonymous_messages_trimmed_at === value)
                }
                return builder
              },
              select: async () => {
                if (!conds.every((c) => c(game))) return { data: [], error: null }
                Object.assign(game, patch)
                return { data: [{ id: 'G' }], error: null }
              },
              // Awaited directly when the caller does not chain .select() (the release path).
              then: (resolve: (v: unknown) => void) => {
                state.releaseAttempts += 1
                if (releaseErrorsLeft > 0) {
                  releaseErrorsLeft -= 1
                  resolve({ data: null, error: { message: 'release failed' } })
                  return
                }
                if (conds.every((c) => c(game))) Object.assign(game, patch)
                resolve({ data: null, error: null })
              },
            }
            return builder
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }

  return { client: client as unknown as SupabaseClient, game, state }
}

describe('trimAnonymousMessagesIfDue', () => {
  it('trims one batch and stamps the window', async () => {
    const { client, game, state } = makeFake()
    const result = await trimAnonymousMessagesIfDue(client, 'ABC123')
    expect(result.trimmed).toBe(ANONYMOUS_ROOM_TRIM_BATCH)
    expect(state.deletes).toBe(1)
    expect(state.rpcCalls).toEqual([
      {
        fn: 'trim_anonymous_messages',
        args: { p_game_id: 'ABC123', p_max: ANONYMOUS_ROOM_MAX_MESSAGES, p_batch: ANONYMOUS_ROOM_TRIM_BATCH },
      },
    ])
    expect(game.anonymous_messages_trimmed_at).not.toBeNull()
  })

  it('does nothing under the cap', async () => {
    const { client, state } = makeFake({ messageCount: 10 })
    const result = await trimAnonymousMessagesIfDue(client, 'ABC123')
    expect(result.trimmed).toBe(0)
    expect(state.deletes).toBe(0)
  })

  it('lets only one of several concurrent callers delete a batch', async () => {
    const { client, state } = makeFake()
    const results = await Promise.all([1, 2, 3, 4].map(() => trimAnonymousMessagesIfDue(client, 'ABC123')))
    expect(results.filter((r) => r.trimmed > 0)).toHaveLength(1)
    expect(state.deletes).toBe(1)
  })

  it('releases the claim when the SQL recheck finds the board is no longer over the cap', async () => {
    const { client, game } = makeFake({ rpcDeleted: 0 })
    const result = await trimAnonymousMessagesIfDue(client, 'ABC123')
    expect(result.trimmed).toBe(0)
    expect(game.anonymous_messages_trimmed_at).toBeNull()
  })

  it('hands the window back when the delete fails so a later call can retry', async () => {
    const { client, game, state } = makeFake({ deleteFails: true })
    const result = await trimAnonymousMessagesIfDue(client, 'ABC123')
    expect(result.trimmed).toBe(0)
    expect(state.deletes).toBe(1)
    expect(game.anonymous_messages_trimmed_at).toBeNull()
  })

  it('retries a failed claim release so the window is handed back', async () => {
    const { client, game, state } = makeFake({ deleteFails: true, releaseErrors: 2 })
    const result = await trimAnonymousMessagesIfDue(client, 'ABC123')
    expect(result.trimmed).toBe(0)
    expect(state.releaseAttempts).toBe(3)
    expect(game.anonymous_messages_trimmed_at).toBeNull()
  })

  it('logs and stops after repeated release failures instead of ignoring them', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { client, state } = makeFake({ deleteFails: true, releaseErrors: 10 })
      const result = await trimAnonymousMessagesIfDue(client, 'ABC123')
      expect(result.trimmed).toBe(0)
      expect(state.releaseAttempts).toBe(3)
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('does not overwrite a newer claim when a slow trim fails after its window expired', async () => {
    const newerClaim = '2099-01-01T00:00:00.000Z'
    const { client, game } = makeFake({
      deleteFails: true,
      // While our delete is in flight, another caller claims a fresh window.
      onDelete: (row) => {
        row.anonymous_messages_trimmed_at = newerClaim
      },
    })
    const result = await trimAnonymousMessagesIfDue(client, 'ABC123')
    expect(result.trimmed).toBe(0)
    expect(game.anonymous_messages_trimmed_at).toBe(newerClaim)
  })
})
