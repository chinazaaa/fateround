import { describe, expect, it } from 'vitest'
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
function makeFake({ messageCount = ANONYMOUS_ROOM_MAX_MESSAGES + 50, deleteFails = false } = {}) {
  const game: GameRow = { anonymous_messages_trimmed_at: null }
  const state = { deletes: 0 }

  const client = {
    from(table: string) {
      if (table === 'anonymous_messages') {
        return {
          select: (_cols: string, opts?: { head?: boolean }) => {
            if (opts?.head) {
              return { eq: async () => ({ count: messageCount, error: null }) }
            }
            return {
              eq: () => ({
                order: () => ({
                  limit: async () => ({
                    data: Array.from({ length: ANONYMOUS_ROOM_TRIM_BATCH }, (_, i) => ({ id: `m${i}` })),
                    error: null,
                  }),
                }),
              }),
            }
          },
          delete: () => ({
            in: async () => {
              state.deletes += 1
              return { error: deleteFails ? { message: 'boom' } : null }
            },
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

  it('hands the window back when the delete fails so a later call can retry', async () => {
    const { client, game, state } = makeFake({ deleteFails: true })
    const result = await trimAnonymousMessagesIfDue(client, 'ABC123')
    expect(result.trimmed).toBe(0)
    expect(state.deletes).toBe(1)
    expect(game.anonymous_messages_trimmed_at).toBeNull()
  })
})
