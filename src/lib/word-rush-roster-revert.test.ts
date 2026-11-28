import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// The last-round finish goes through the game-finish module; only its outcome matters here.
const finish = vi.hoisted(() => ({ won: true, opts: null as unknown, bookkeeping: 'none' as string }))
vi.mock('@/lib/game-finish', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/game-finish')>()),
  markGameFinished: async (_s: unknown, _g: string, _t: unknown, opts: unknown) => {
    finish.opts = opts
    return { error: null, won: finish.won, bookkeeping: finish.bookkeeping }
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
      rpc: async () => ({ data: { status: 'applied' }, error: null }),
      from: (table: string) => {
        // Any chained query verb returns the same chainable; the reads resolve to the session / empty lists.
        const api: unknown = new Proxy(
          {},
          {
            get: (_t, prop) => {
              if (prop === 'maybeSingle')
                return async () => ({ data: table === 'games' ? { status: 'active' } : session, error: null })
              if (prop === 'update') return () => api
              // The forward roster write names the inspected session and must match it.
              if (prop === 'then')
                return (resolve: (v: unknown) => void) => resolve({ data: [{ id: 'S-1' }], error: null })
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
  /** The patch of each update to word_rush_sessions, index-aligned with sessionUpdateFilters. */
  const sessionUpdatePatches: Array<Record<string, unknown>> = []
  /** Every word_rush_remove_roster_member call (the compare-and-swap roster write). */
  const rosterCalls: Array<Record<string, unknown>> = []
  /** What the next roster compare-and-swap answers (`applied`, or `roster_changed` when a restore committed meanwhile). */
  /** The round's answers cannot be read. */
  let failAnswers = false
  /** Reads of word_rush_players (the team rows) that THROW: the n-th read onwards (1-based; 0 = never). */
  let failTeamReadsFrom = 0
  let teamReads = 0
  let rosterAnswer: { status?: string; error?: boolean } = { status: 'applied' }
  const clientFor = (
    session: Record<string, unknown>,
    claimWins: boolean,
    failClear = false,
    staleRoster = false,
    identities: Array<{ session_started_at: string | null; sessions_played: number | null }> = []
  ) => {
    let gameReads = 0
    sessionUpdateFilters.length = 0
    sessionUpdatePatches.length = 0
    rosterCalls.length = 0
    failAnswers = false
    failTeamReadsFrom = 0
    teamReads = 0
    rosterAnswer = { status: staleRoster ? 'roster_changed' : 'applied' }
    return {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        if (fn !== 'word_rush_remove_roster_member') return { data: 'applied', error: null }
        rosterCalls.push(args)
        return rosterAnswer.error
          ? { data: null, error: { message: 'boom' } }
          : { data: { status: rosterAnswer.status }, error: null }
      },
      from: (table: string) => {
        let updating = false
        let clearing = false
        const filters: Array<[string, unknown]> = []
        const api: unknown = new Proxy(
          {},
          {
            get: (_t, prop) => {
              if (prop === 'maybeSingle')
                return async () => ({
                  data:
                    table === 'games'
                      ? {
                          status: 'active',
                          ...(identities.length ? identities[Math.min(gameReads++, identities.length - 1)] : {}),
                        }
                      : session,
                  error: null,
                })
              if (prop === 'update')
                return (patch: Record<string, unknown>) => {
                  updating = true
                  clearing = patch.round_finalize === null
                  if (table === 'word_rush_sessions') {
                    sessionUpdateFilters.push(filters)
                    sessionUpdatePatches.push(patch)
                  }
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
                    error:
                      table === 'word_rush_players' && failTeamReadsFrom > 0 && ++teamReads >= failTeamReadsFrom
                        ? { message: 'team rows unreadable' }
                        : table === 'word_rush_answers' && failAnswers
                          ? { message: 'answers unreadable' }
                          : failClear && clearing
                            ? { message: 'clear failed' }
                            : null,
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
  ])('%s: EVERY update that closes or finishes the session names the inspected session id', async (_n, extra) => {
    await syncWordRushAfterPlayerRemoved(clientFor(individualSession(extra), true), 'GAME', 'b')
    // A closing update marks the session finished or moves it to the next round / turn; the ordinary roster write does not.
    const closing = sessionUpdateFilters.filter((_f, i) => {
      const patch = sessionUpdatePatches[i]
      return patch.status === 'finished' || patch.phase === 'finished' || patch.phase === 'intermission'
    })
    expect(closing.length).toBeGreaterThan(0)
    for (const filters of closing) expect(filters).toContainEqual(['id', 'S-1'])
  })

  it("a held / owed bookkeeping after the won finish still reports the finish as this removal's own", async () => {
    finish.bookkeeping = 'held'
    try {
      const result = await syncWordRushAfterPlayerRemoved(clientFor(individualSession(), true), 'GAME', 'b')
      expect(result.ownFinish).toBe(true)
    } finally {
      finish.bookkeeping = 'none'
    }
  })

  it('the roster write is a compare-and-swap on the roster the call READ (a restore that committed meanwhile is never overwritten)', async () => {
    await syncWordRushAfterPlayerRemoved(clientFor(individualSession(), true), 'GAME', 'b')
    expect(rosterCalls[0]).toMatchObject({
      p_session_id: 'S-1',
      p_expected_roster: ['a', 'b'],
      p_expected_turn_index: 2,
      p_expected_phase: 'playing',
      p_expected_setter: 'a',
      p_new_roster: ['a'],
    })
  })

  it('a removed player who is still the awaiting-prompt setter is replaced even when the roster already lacks them', async () => {
    const result = await syncWordRushAfterPlayerRemoved(
      clientFor(
        individualSession({ roster: ['a', 'c'], prompt_setter_player_id: 'b', phase: 'awaiting_prompt' }),
        true
      ),
      'GAME',
      'b'
    )
    expect(rosterCalls).toHaveLength(1)
    expect(rosterCalls[0]).toMatchObject({
      p_expected_roster: ['a', 'c'],
      p_new_roster: ['a', 'c'],
      p_set_setter: true,
      p_new_setter: 'a',
    })
    // Nothing of the roster changed in this call: no rollback (the earlier attempt's snapshot is the caller's).
    expect(result.rollback).toBeUndefined()
    expect(result.error).toBeUndefined()
  })

  it('a removed player who is NOT the setter and is already off the roster needs nothing', async () => {
    await syncWordRushAfterPlayerRemoved(
      clientFor(
        individualSession({ roster: ['a', 'c'], prompt_setter_player_id: 'a', phase: 'awaiting_prompt' }),
        true
      ),
      'GAME',
      'b'
    )
    expect(rosterCalls).toHaveLength(0)
  })

  it('a roster that changed since the read (`roster_changed`) writes nothing and is read again, then reported', async () => {
    const result = await syncWordRushAfterPlayerRemoved(clientFor(individualSession(), true, false, true), 'GAME', 'b')
    expect(rosterCalls).toHaveLength(3)
    expect(result.rollback).toBeUndefined()
    expect(result.error).toMatch(/changed while you were leaving/i)
  })

  it('unreadable answers after the roster write are an error carrying the rollback (never "nobody answered")', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // Another answerer remains, so only the answers decide whether the round is over.
      const client = clientFor(individualSession({ roster: ['a', 'b', 'c'] }), true)
      failAnswers = true
      const result = await syncWordRushAfterPlayerRemoved(client, 'GAME', 'b')
      expect(result.internal).toBe(true)
      expect(result.rollback).toMatchObject({ session_id: 'S-1', removed_player_id: 'b' })
      expect(result.ownFinish).toBeUndefined()
    } finally {
      log.mockRestore()
    }
  })

  it('a team read that fails INSIDE the round-ending helper (after the roster write) is an error WITH the rollback, never a throw', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // The first team read (the playable-teams check) succeeds; the second (inside endTeamTurn) fails.
      const client = clientFor(individualSession({ mode: 'team', roster: ['a', 'b', 'c'], active_team: 1 }), true)
      failTeamReadsFrom = 2
      const result = await syncWordRushAfterPlayerRemoved(client, 'GAME', 'b')
      expect(result.internal).toBe(true)
      expect(result.rollback).toMatchObject({ session_id: 'S-1', removed_player_id: 'b' })
    } finally {
      log.mockRestore()
    }
  })

  it('a failed roster write is an internal error (nothing proceeds)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const client = clientFor(individualSession(), true)
      rosterAnswer = { error: true }
      const result = await syncWordRushAfterPlayerRemoved(client, 'GAME', 'b')
      expect(result.internal).toBe(true)
      // The response may have been lost AFTER the write committed: the snapshot lets the route restore the roster (the
      // restore is idempotent when nothing was written).
      expect(result.rollback).toMatchObject({ session_id: 'S-1', removed_player_id: 'b' })
    } finally {
      log.mockRestore()
    }
  })

  it('an unreadable game is an error, never "not active" (the roster would be left unreconciled)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const client = {
        rpc: async () => ({ data: { status: 'applied' }, error: null }),
        from: () => {
          const api: unknown = new Proxy(
            {},
            {
              get: (_t, prop) =>
                prop === 'maybeSingle' ? async () => ({ data: null, error: { message: 'down' } }) : () => api,
            }
          )
          return api
        },
      } as unknown as SupabaseClient
      const result = await syncWordRushAfterPlayerRemoved(client, 'GAME', 'b')
      expect(result.internal).toBe(true)
      expect(result.error).toBeDefined()
      expect(result.rollback).toBeUndefined()
    } finally {
      log.mockRestore()
    }
  })

  it('a forward roster write that matches no session row (the session was replaced) is stale: nothing proceeds, it is re-read, then reported', async () => {
    const result = await syncWordRushAfterPlayerRemoved(clientFor(individualSession(), false, false, true), 'GAME', 'b')
    expect(result.rollback).toBeUndefined()
    expect(result.ownFinish).toBeUndefined()
    expect(result.error).toMatch(/changed while you were leaving/i)
  })

  it('a start / replay between the game read and the session load is detected (identity re-read) and the reconciliation reads again', async () => {
    const A = { session_started_at: null, sessions_played: 1 }
    const B = { session_started_at: '2026-01-01T00:00:00Z', sessions_played: 1 }
    // reads: attempt 1 (before: A, after the load: B -> stale), attempt 2 (before: B, after: B -> consistent)
    const result = await syncWordRushAfterPlayerRemoved(
      clientFor(individualSession(), false, false, false, [A, B, B, B]),
      'GAME',
      'b'
    )
    expect(result.error).toBeUndefined()
    expect(result.gameSession).toEqual({ startedAt: '2026-01-01T00:00:00Z', sessionsPlayed: 1 })
    expect(result.rollback).toBeDefined()
  })

  it('reports the game session its reconciliation was decided against (its own read)', async () => {
    const result = await syncWordRushAfterPlayerRemoved(clientFor(individualSession(), true), 'GAME', 'b')
    expect(result.gameSession).toEqual({ startedAt: null, sessionsPlayed: null })
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
