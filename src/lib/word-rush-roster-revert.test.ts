import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// The last-round finish goes through the game-finish module; only its outcome matters here.
const finish = vi.hoisted(() => ({ won: true, opts: null as unknown }))
vi.mock('@/lib/game-finish', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/game-finish')>()),
  markGameFinished: async (_s: unknown, _g: string, _t: unknown, opts: unknown) => {
    finish.opts = opts
    return { error: null, won: finish.won, bookkeeping: 'none' }
  },
  recoverFinishBookkeeping: async () => ({ state: 'none' }),
}))

import { revertWordRushRosterAfterFailedPlayerDelete, syncWordRushAfterPlayerRemoved } from './word-rush-server'

/**
 * A failed player delete compensates the roster change made for it. The compensation is ONE database step
 * (word_rush_restore_roster_member) that re-adds just the removed player, bound to the session the snapshot was taken
 * on: a finish + Play Again + Start replaces the session row (a new id under the same game id), and a player who left
 * in the meantime must not be put back without a seat (the whole saved roster is never rewritten).
 */
describe('revertWordRushRosterAfterFailedPlayerDelete', () => {
  const snapshot = {
    session_id: 'S-OLD',
    removed_player_id: 'a',
    removed_index: 0,
    turn_index: 2,
    prompt_setter_player_id: 'a',
    setter_after: 'b',
  }

  it('asks the database to re-add ONLY the removed player, bound to the session and the game', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => (
        calls.push({ name, args }),
        { data: { status: 'restored' }, error: null }
      ),
    } as unknown as SupabaseClient
    await revertWordRushRosterAfterFailedPlayerDelete(client, 'GAME', snapshot)
    expect(calls).toEqual([
      {
        name: 'word_rush_restore_roster_member',
        args: {
          p_game_id: 'GAME',
          p_session_id: 'S-OLD',
          p_player_id: 'a',
          p_index: 0,
          p_turn_index: 2,
          p_restore_setter: true,
          p_setter_after: 'b',
          p_setter_before: 'a',
        },
      },
    ])
  })

  it.each(['restored', 'not_current_session', 'no_seat'])('reports a %s answer', async (status) => {
    const client = { rpc: async () => ({ data: { status }, error: null }) } as unknown as SupabaseClient
    expect(await revertWordRushRosterAfterFailedPlayerDelete(client, 'GAME', snapshot)).toBe(status)
  })

  it('retries a transport error and reports `failed` only after every attempt (the roster is not restored)', async () => {
    let calls = 0
    const down = {
      rpc: async () => (calls++, { data: null, error: { message: 'unreachable' } }),
    } as unknown as SupabaseClient
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await revertWordRushRosterAfterFailedPlayerDelete(down, 'GAME', snapshot)).toBe('failed')
      expect(calls).toBe(3)
    } finally {
      log.mockRestore()
    }
    let n = 0
    const flaky = {
      rpc: async () =>
        n++ === 0 ? { data: null, error: { message: 'blip' } } : { data: { status: 'restored' }, error: null },
    } as unknown as SupabaseClient
    expect(await revertWordRushRosterAfterFailedPlayerDelete(flaky, 'GAME', snapshot)).toBe('restored')
  })

  it('leaves the prompt setter alone when the removal did not reassign it', async () => {
    const calls: Array<Record<string, unknown>> = []
    const client = {
      rpc: async (_n: string, args: Record<string, unknown>) => (
        calls.push(args),
        { data: { status: 'restored' }, error: null }
      ),
    } as unknown as SupabaseClient
    const { setter_after: _unused, ...untouched } = snapshot
    void _unused
    await revertWordRushRosterAfterFailedPlayerDelete(client, 'GAME', untouched)
    expect(calls[0].p_restore_setter).toBe(false)
  })
})

describe('syncWordRushAfterPlayerRemoved snapshot', () => {
  it('records the session id and the removed player (with their position) it will restore', async () => {
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
    // Only the removed player (and where they were) is recorded, never a copy of the whole roster.
    expect(result.rollback).toMatchObject({
      session_id: 'S-1',
      removed_player_id: 'b',
      removed_index: 1,
      turn_index: 0,
      prompt_setter_player_id: 'a',
    })
    expect(result.rollback).not.toHaveProperty('roster')
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
  /** Every `.eq` filter of an update to word_rush_sessions, in order (one list per update). */
  const sessionUpdateFilters: Array<Array<[string, unknown]>> = []
  const clientFor = (session: Record<string, unknown>, claimWins: boolean, failClear = false) => {
    sessionUpdateFilters.length = 0
    return {
      rpc: async () => ({ data: 'applied', error: null }),
      from: (table: string) => {
        let updating = false
        let clearing = false
        const filters: Array<[string, unknown]> = []
        const api: unknown = new Proxy(
          {},
          {
            get: (_t, prop) => {
              if (prop === 'maybeSingle')
                return async () => ({ data: table === 'games' ? { status: 'active' } : session, error: null })
              if (prop === 'update')
                return (patch: Record<string, unknown>) => {
                  updating = true
                  clearing = patch.round_finalize === null
                  if (table === 'word_rush_sessions') sessionUpdateFilters.push(filters)
                  return api
                }
              if (prop === 'eq')
                return (k: string, v: unknown) => {
                  filters.push([k, v])
                  return api
                }
              if (prop === 'then')
                return (resolve: (v: unknown) => void) =>
                  resolve({
                    data: updating && table === 'word_rush_sessions' && claimWins ? [{ id: 'S-1' }] : [],
                    error: failClear && clearing ? { message: 'clear failed' } : null,
                  })
              return () => api
            },
          }
        )
        return api
      },
    } as unknown as SupabaseClient
  }

  it("a failed marker clear after the won finish still reports the finish as this removal's own", async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await syncWordRushAfterPlayerRemoved(clientFor(individualSession(), true, true), 'GAME', 'b')
      expect(result.ownFinish).toBe(true)
    } finally {
      log.mockRestore()
    }
  })

  it("the individual round's claim (the compare-and-set that closes the round) is bound to the inspected session id", async () => {
    await syncWordRushAfterPlayerRemoved(clientFor(individualSession(), true), 'GAME', 'b')
    const claim = sessionUpdateFilters.find((f) => f.some(([k]) => k === 'turn_index'))
    expect(claim).toBeDefined()
    expect(claim).toContainEqual(['id', 'S-1'])
  })

  it.each([
    ['team', { mode: 'team', roster: ['a', 'b', 'c'], active_team: 1 }],
    ['individual', {}],
  ])(
    'the %s session claim is bound to the inspected session id (a replacement session cannot match)',
    async (_n, extra) => {
      await syncWordRushAfterPlayerRemoved(clientFor(individualSession(extra), true), 'GAME', 'b')
      const closing = sessionUpdateFilters.filter((f) => f.some(([k, v]) => k === 'game_id' && v === 'GAME'))
      // Every update that finishes / closes the session names it by id.
      expect(closing.length).toBeGreaterThan(1)
      expect(closing.filter((f) => f.some(([k, v]) => k === 'id' && v === 'S-1')).length).toBeGreaterThan(0)
      expect(closing.every((f) => f.some(([k]) => k === 'id' || k === 'turn_index' || k === 'game_id'))).toBe(true)
    }
  )

  it("ending the LAST round is this removal's own finish", async () => {
    const result = await syncWordRushAfterPlayerRemoved(clientFor(individualSession(), true), 'GAME', 'b')
    expect(result.error).toBeUndefined()
    expect(result.ownFinish).toBe(true)
  })

  it("an independent finish of the GAME that landed first (the game transition is lost) is not this removal's finish", async () => {
    finish.won = false
    try {
      const result = await syncWordRushAfterPlayerRemoved(clientFor(individualSession(), true), 'GAME', 'b')
      expect(result.ownFinish).toBe(false)
    } finally {
      finish.won = true
    }
  })

  it('a team game finish is bound to the session whose claim it won (a stale call cannot finish a replacement session)', async () => {
    finish.opts = null
    const result = await syncWordRushAfterPlayerRemoved(
      clientFor(individualSession({ mode: 'team', roster: ['a', 'b', 'c'], active_team: 1 }), true),
      'GAME',
      'b'
    )
    expect(result.ownFinish).toBe(true)
    expect(finish.opts).toMatchObject({
      roundGuard: { rpc: 'word_rush_finish_game_for_session', params: { p_session_id: 'S-1' } },
      trackBookkeeping: true,
    })
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
