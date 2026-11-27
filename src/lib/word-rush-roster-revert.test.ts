import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revertWordRushRosterAfterFailedPlayerDelete, syncWordRushAfterPlayerRemoved } from './word-rush-server'

/**
 * A failed player delete reverts the roster change made for it. Between the removal RPC and the revert a finish,
 * Play Again and Start can replace the session row (same game id, a NEW id), so the revert must be bound to the
 * session the snapshot was taken on, or it would write the old roster / prompt setter onto the new session.
 */

type Call = { op: 'update'; patch: Record<string, unknown>; filters: Array<[string, unknown]> }

function recordingClient() {
  const calls: Call[] = []
  const client = {
    from: () => {
      const filters: Array<[string, unknown]> = []
      let patch: Record<string, unknown> = {}
      const api: Record<string, unknown> = {
        update: (p: Record<string, unknown>) => ((patch = p), api),
        eq: (k: string, v: unknown) => (filters.push([k, v]), api),
        then: (resolve: (v: unknown) => void) => {
          calls.push({ op: 'update', patch, filters })
          resolve({ error: null })
        },
      }
      return api
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

describe('revertWordRushRosterAfterFailedPlayerDelete', () => {
  const snapshot = { session_id: 'S-OLD', roster: ['a', 'b'], prompt_setter_player_id: 'a' }

  it('is bound to the session the snapshot was taken on (and the game)', async () => {
    const { client, calls } = recordingClient()
    await revertWordRushRosterAfterFailedPlayerDelete(client, 'GAME', snapshot)
    expect(calls).toHaveLength(1)
    expect(calls[0].filters).toContainEqual(['game_id', 'GAME'])
    expect(calls[0].filters).toContainEqual(['id', 'S-OLD'])
    expect(calls[0].patch).toMatchObject({ roster: ['a', 'b'], prompt_setter_player_id: 'a' })
  })

  it('a replaced session (a different id) is not matched, so its roster is never overwritten', async () => {
    // Model the table: the session row now has a NEW id; an update filtered on the old id matches nothing.
    const row: Record<string, unknown> = {
      id: 'S-NEW',
      game_id: 'GAME',
      roster: ['x', 'y', 'z'],
      prompt_setter_player_id: null,
    }
    const client = {
      from: () => {
        const filters: Array<[string, unknown]> = []
        let patch: Record<string, unknown> = {}
        const api: Record<string, unknown> = {
          update: (p: Record<string, unknown>) => ((patch = p), api),
          eq: (k: string, v: unknown) => (filters.push([k, v]), api),
          then: (resolve: (v: unknown) => void) => {
            if (filters.every(([k, v]) => row[k] === v)) Object.assign(row, patch)
            resolve({ error: null })
          },
        }
        return api
      },
    } as unknown as SupabaseClient
    await revertWordRushRosterAfterFailedPlayerDelete(client, 'GAME', snapshot)
    expect(row.roster).toEqual(['x', 'y', 'z'])
    expect(row.prompt_setter_player_id).toBeNull()
  })
})

describe('syncWordRushAfterPlayerRemoved snapshot', () => {
  it('records the session id with the roster it will restore', async () => {
    const session = {
      id: 'S-1',
      game_id: 'GAME',
      status: 'active',
      phase: 'playing',
      mode: 'team',
      prompt_mode: 'auto',
      roster: ['a', 'b', 'c'],
      prompt_setter_player_id: 'a',
      turn_index: 0,
      num_teams: 2,
      active_team: 1,
      round_finalize: null,
      turn_seconds: 60,
      turn_deadline_at: '2026-01-01T00:00:00.000Z',
      intermission_deadline_at: null,
      total_rounds: 3,
      current_round: 1,
      prompt_index: 0,
      used_pairs: [],
      difficulty: 'easy',
      min_word_length: 3,
      start_letter: 'a',
      end_letter: 'z',
      created_at: '2026-01-01T00:00:00.000Z',
    }
    const client = {
      from: (table: string) => {
        // Any chained query verb returns the same chainable; the reads resolve to the session / empty lists.
        const api: unknown = new Proxy(
          {},
          {
            get: (_t, prop) => {
              if (prop === 'maybeSingle')
                return async () => ({ data: table === 'games' ? { status: 'active' } : session, error: null })
              if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
              return () => api
            },
          }
        )
        return api
      },
    } as unknown as SupabaseClient
    const result = await syncWordRushAfterPlayerRemoved(client, 'GAME', 'b')
    expect(result.rollback).toEqual({ session_id: 'S-1', roster: ['a', 'b', 'c'], prompt_setter_player_id: 'a' })
  })
})

describe('syncWordRushAfterPlayerRemoved: a finish THIS removal caused', () => {
  const individualSession = (extra: Record<string, unknown> = {}) => ({
    id: 'S-1',
    game_id: 'GAME',
    status: 'active',
    phase: 'playing',
    mode: 'individual',
    prompt_mode: 'manual',
    roster: ['a', 'b'],
    // The only answerer is the leaver: with them gone nobody is left to answer, so the round ends.
    prompt_setter_player_id: 'a',
    turn_index: 2,
    num_teams: 2,
    active_team: 1,
    round_finalize: null,
    turn_seconds: 60,
    turn_deadline_at: '2026-01-01T00:00:00.000Z',
    intermission_deadline_at: null,
    total_rounds: 3,
    current_round: 3,
    prompt_index: 0,
    used_pairs: [],
    difficulty: 'easy',
    min_word_length: 3,
    start_letter: 'a',
    end_letter: 'z',
    created_at: '2026-01-01T00:00:00.000Z',
    ...extra,
  })

  /** `claimWins`: the compare-and-set that closes the round matches a row (this removal won it). */
  const clientFor = (session: Record<string, unknown>, claimWins: boolean) =>
    ({
      rpc: async () => ({ data: 'not_pending', error: null }),
      from: (table: string) => {
        let updating = false
        const api: unknown = new Proxy(
          {},
          {
            get: (_t, prop) => {
              if (prop === 'maybeSingle')
                return async () => ({ data: table === 'games' ? { status: 'active' } : session, error: null })
              if (prop === 'update')
                return () => {
                  updating = true
                  return api
                }
              if (prop === 'then')
                return (resolve: (v: unknown) => void) =>
                  resolve({
                    data: updating && table === 'word_rush_sessions' && claimWins ? [{ id: 'S-1' }] : [],
                    error: null,
                  })
              return () => api
            },
          }
        )
        return api
      },
    }) as unknown as SupabaseClient

  it("ending the LAST round is this removal's own finish", async () => {
    const result = await syncWordRushAfterPlayerRemoved(clientFor(individualSession(), true), 'GAME', 'b')
    expect(result.error).toBeUndefined()
    expect(result.ownFinish).toBe(true)
  })

  it('ending a round that is not the last is not a finish', async () => {
    const result = await syncWordRushAfterPlayerRemoved(
      clientFor(individualSession({ total_rounds: 5 }), true),
      'GAME',
      'b'
    )
    expect(result.ownFinish).toBe(false)
  })

  it("losing the claim (somebody else already ended the round) is not this removal's finish", async () => {
    const result = await syncWordRushAfterPlayerRemoved(clientFor(individualSession(), false), 'GAME', 'b')
    expect(result.ownFinish).toBe(false)
  })
})
