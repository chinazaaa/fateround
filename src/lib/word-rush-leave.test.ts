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

import {
  completeWordRushLeaves,
  resumeAllWordRushFinalizations,
  ensureWordRushGameFinalized,
  leaveWordRushPlayer,
  reconcileWordRushRound,
} from './word-rush-server'

/**
 * Word Rush leaves are durable: ONE database function (word_rush_remove_player) takes the player off the roster, replaces
 * the prompt setter and records the leaver in one transaction; the application then decides what the departures mean for
 * the round (derived only from the current session) and asks the database to complete the seat deletion. Nothing is
 * compensated or rolled back, so there is no state a crash can strand.
 */
const baseSession = (extra: Record<string, unknown> = {}) => ({
  id: 'S-1',
  game_id: 'GAME',
  status: 'active',
  phase: 'playing',
  mode: 'individual',
  prompt_mode: 'manual',
  roster: ['a'],
  leavers: ['b'],
  // The only answerer left is the setter: nobody can answer, so the round ends.
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

type Fake = {
  client: SupabaseClient
  /** Every update of word_rush_sessions: its patch and `.eq` / `.is` / `.in` filters. */
  updates: Array<{ patch: Record<string, unknown>; filters: Array<[string, unknown]> }>
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>
  teamRows: Array<{ player_id: string; team: number; score: number; players: { spectator: boolean } }>
}

function fake(
  session: Record<string, unknown> | null,
  opts: {
    claimWins?: boolean
    answers?: Array<{ player_id: string; turn_index: number; correct: boolean; text?: string; created_at?: string }>
    failAnswers?: boolean
    rpc?: (fn: string, args: Record<string, unknown>) => { data?: unknown; error?: { message: string } | null }
    teamRows?: Fake['teamRows']
  } = {}
): Fake {
  const out: Fake = {
    client: null as unknown as SupabaseClient,
    updates: [],
    rpcCalls: [],
    teamRows: opts.teamRows ?? [],
  }
  out.client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      out.rpcCalls.push({ fn, args })
      const r = opts.rpc?.(fn, args) ?? { data: { status: 'deleted' } }
      return { data: r.data ?? null, error: r.error ?? null }
    },
    from: (table: string) => {
      let updating = false
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
                if (table === 'word_rush_sessions') out.updates.push({ patch, filters })
                return api
              }
            if (prop === 'eq' || prop === 'is' || prop === 'in' || prop === 'neq')
              return (k: string, v: unknown) => {
                filters.push([k, v])
                return api
              }
            if (prop === 'then')
              return (resolve: (v: unknown) => void) => {
                if (updating)
                  return resolve({
                    data: table === 'word_rush_sessions' && opts.claimWins !== false ? [{ id: 'S-1' }] : [],
                    error: null,
                  })
                if (table === 'word_rush_answers') {
                  return resolve(
                    opts.failAnswers
                      ? { data: null, error: { message: 'answers unreadable' } }
                      : { data: opts.answers ?? [], error: null }
                  )
                }
                if (table === 'word_rush_players') return resolve({ data: out.teamRows, error: null })
                // The cron backstop's listing of sessions that still have recorded leavers.
                if (table === 'word_rush_sessions' && filters.some(([k, v]) => k === 'leavers' && v === '{}')) {
                  return resolve({ data: [{ game_id: 'GAME' }], error: null })
                }
                return resolve({ data: [], error: null })
              }
            return () => api
          },
        }
      )
      return api
    },
  } as unknown as SupabaseClient
  return out
}

describe('reconcileWordRushRound: the decision is derived from the current session only', () => {
  it('nobody left to answer: the round is closed, and the closing claim is bound to the session, turn and phase', async () => {
    const f = fake(baseSession())
    expect(await reconcileWordRushRound(f.client, 'GAME')).toMatchObject({ finished: true })
    const claim = f.updates.find((u) => u.patch.status === 'finished')
    expect(claim).toBeDefined()
    expect(claim!.filters).toContainEqual(['id', 'S-1'])
    expect(claim!.filters).toContainEqual(['turn_index', 2])
  })

  it('an eligible answerer is still in: nothing is closed', async () => {
    const f = fake(baseSession({ roster: ['a', 'c'] }))
    expect(await reconcileWordRushRound(f.client, 'GAME')).toEqual({})
    expect(f.updates).toEqual([])
  })

  it('everyone who is left has answered: the round is closed', async () => {
    const f = fake(baseSession({ roster: ['a', 'c'] }), {
      answers: [{ player_id: 'c', turn_index: 2, correct: true, text: 'cat', created_at: '2026-01-01T00:00:10.000Z' }],
    })
    expect((await reconcileWordRushRound(f.client, 'GAME')).error).toBeUndefined()
    expect(f.updates.length).toBeGreaterThan(0)
  })

  it('unreadable answers are an error, never "nobody answered"', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const f = fake(baseSession({ roster: ['a', 'c'] }), { failAnswers: true })
      const result = await reconcileWordRushRound(f.client, 'GAME')
      expect(result.internal).toBe(true)
      expect(f.updates).toEqual([])
    } finally {
      log.mockRestore()
    }
  })

  it.each([
    ['no session', null],
    ['a finished session', baseSession({ status: 'finished' })],
    ['a round between turns', baseSession({ phase: 'intermission' })],
  ])('%s: nothing to decide', async (_n, session) => {
    const f = fake(session)
    expect(await reconcileWordRushRound(f.client, 'GAME')).toEqual({})
    expect(f.updates).toEqual([])
  })

  it('a TEAM whose players have left is closed; a player who has LEFT is not a member of their team', async () => {
    // Team 1 had a, b; b has left (still seated): team 1 cannot field a manual turn (setter + one answerer), team 2 cannot either.
    const rows = [
      { player_id: 'a', team: 1, score: 0, players: { spectator: false } },
      { player_id: 'b', team: 1, score: 0, players: { spectator: false } },
      { player_id: 'c', team: 2, score: 0, players: { spectator: false } },
      { player_id: 'd', team: 2, score: 0, players: { spectator: false } },
    ]
    const f = fake(baseSession({ mode: 'team', roster: ['a', 'c', 'd'], leavers: ['b'] }), { teamRows: rows })
    await reconcileWordRushRound(f.client, 'GAME')
    // Team 1 is dead without b (one member), so the turn is ended: some update closes or advances the session.
    expect(f.updates.length).toBeGreaterThan(0)
  })

  it('a TEAM finish is durable: the session claim writes the owed-finish marker in the same update', async () => {
    const rows = [
      { player_id: 'a', team: 1, score: 0, players: { spectator: false } },
      { player_id: 'b', team: 1, score: 0, players: { spectator: false } },
    ]
    const f = fake(baseSession({ mode: 'team', roster: ['a'], leavers: ['b'] }), { teamRows: rows })
    await reconcileWordRushRound(f.client, 'GAME')
    const finishing = f.updates.find((u) => u.patch.status === 'finished')
    expect(finishing).toBeDefined()
    expect(finishing!.patch.round_finalize).toMatchObject({ session_id: 'S-1', is_last: true, awarded: true })
    expect(finishing!.patch.round_finalize).not.toHaveProperty('leaver_id')
  })
})

describe('completeWordRushLeaves: every recorded leaver is completed by the database, after the round decision', () => {
  it('asks the delete stage for each leaver and reports what the database answered', async () => {
    const answers: Record<string, string> = { b: 'deleted', c: 'bookkeeping_owed' }
    const f = fake(baseSession({ roster: ['a', 'd'], leavers: ['b', 'c'] }), {
      rpc: (_fn, args) => ({ data: { status: answers[args.p_player_id as string] } }),
    })
    const result = await completeWordRushLeaves(f.client, 'GAME')
    expect(result.statuses).toEqual({ b: 'deleted', c: 'bookkeeping_owed' })
    expect(f.rpcCalls.map((c) => c.args)).toEqual([
      { p_game_id: 'GAME', p_player_id: 'b', p_stage: 'delete' },
      { p_game_id: 'GAME', p_player_id: 'c', p_stage: 'delete' },
    ])
  })

  it('a session with nobody recorded asks nothing', async () => {
    const f = fake(baseSession({ roster: ['a', 'd'], leavers: [] }))
    expect((await completeWordRushLeaves(f.client, 'GAME')).statuses).toEqual({})
    expect(f.rpcCalls).toEqual([])
  })

  it('a database error is reported (the leave stays recorded for the next runner)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const f = fake(baseSession({ roster: ['a', 'd'] }), { rpc: () => ({ error: { message: 'down' } }) })
      const result = await completeWordRushLeaves(f.client, 'GAME')
      expect(result.internal).toBe(true)
    } finally {
      log.mockRestore()
    }
  })

  it('the round decision comes BEFORE any seat is deleted (the order is part of the contract)', async () => {
    const order: string[] = []
    const f = fake(baseSession(), {
      rpc: (fn, args) => {
        order.push(`${fn}:${args.p_stage}`)
        return { data: { status: 'deleted' } }
      },
    })
    const original = f.client.from.bind(f.client)
    ;(f.client as unknown as { from: unknown }).from = (table: string) => {
      if (table === 'word_rush_sessions') order.push('read-session')
      return original(table)
    }
    await completeWordRushLeaves(f.client, 'GAME')
    const firstDelete = order.findIndex((o) => o === 'word_rush_remove_player:delete')
    expect(firstDelete).toBeGreaterThan(0)
    expect(order.slice(0, firstDelete)).toContain('read-session')
  })
})

describe('leaveWordRushPlayer', () => {
  const answerFor =
    (leave: unknown, del: unknown = { status: 'deleted' }) =>
    (_fn: string, args: Record<string, unknown>) => ({
      data: args.p_stage === 'leave' ? leave : del,
    })

  it('stage `leave` names the game and player; a host leave carries the session generation and the bookkeeping flag', async () => {
    const f = fake(baseSession({ leavers: [] }), { rpc: answerFor({ status: 'left' }) })
    await leaveWordRushPlayer(f.client, 'GAME', 'b', { hostLeave: { sessionsPlayed: 4, trackBookkeeping: true } })
    expect(f.rpcCalls[0]).toEqual({
      fn: 'word_rush_remove_player',
      args: {
        p_game_id: 'GAME',
        p_player_id: 'b',
        p_stage: 'leave',
        p_host_leave: true,
        p_sessions_played: 4,
        p_track_bookkeeping: true,
      },
    })
    const plain = fake(baseSession({ leavers: [] }), { rpc: answerFor({ status: 'left' }) })
    await leaveWordRushPlayer(plain.client, 'GAME', 'b')
    expect(plain.rpcCalls[0].args).toEqual({ p_game_id: 'GAME', p_player_id: 'b', p_stage: 'leave' })
  })

  it.each([
    [
      { status: 'host_ended', finished_at: 'T' },
      { status: 'host_ended', finishedAt: 'T' },
    ],
    [{ status: 'participant_ambiguous' }, { status: 'participant_ambiguous' }],
    [{ status: 'game_finished' }, { status: 'game_finished' }],
    [{ status: 'deleted' }, { status: 'deleted' }],
    [{ status: 'bookkeeping_owed' }, { status: 'pending' }],
  ])('the database answered %j', async (answer, expected) => {
    const f = fake(baseSession(), { rpc: answerFor(answer) })
    expect(await leaveWordRushPlayer(f.client, 'GAME', 'b')).toEqual(expected)
  })

  it('`left`: the round decision is made and the seat deletion asked for; the outcome is what the delete answered', async () => {
    const f = fake(baseSession({ leavers: ['b'] }), { rpc: answerFor({ status: 'left' }, { status: 'deleted' }) })
    expect(await leaveWordRushPlayer(f.client, 'GAME', 'b')).toEqual({ status: 'deleted' })
    expect(f.rpcCalls.filter((c) => c.fn === 'word_rush_remove_player').map((c) => c.args.p_stage)).toEqual([
      'leave',
      'delete',
    ])
    const held = fake(baseSession({ leavers: ['b'] }), { rpc: answerFor({ status: 'left' }, { status: 'finalizing' }) })
    expect(await leaveWordRushPlayer(held.client, 'GAME', 'b')).toEqual({ status: 'pending' })
  })

  it('a failure after the leave is recorded is `pending` (a runner completes it), never an error that implies a rollback', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // A still-playable round whose answers cannot be read: the decision cannot be made right now.
      const f = fake(baseSession({ roster: ['a', 'c'], leavers: ['b'] }), {
        failAnswers: true,
        rpc: answerFor({ status: 'left' }),
      })
      expect(await leaveWordRushPlayer(f.client, 'GAME', 'b')).toEqual({ status: 'pending' })
      // ...and no seat deletion was asked for before the decision could be made.
      expect(f.rpcCalls.filter((c) => c.args.p_stage === 'delete')).toEqual([])
    } finally {
      log.mockRestore()
    }
  })

  it('an unreachable database on the leave stage is an error (nothing was recorded)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const f = fake(baseSession(), { rpc: () => ({ error: { message: 'down' } }) })
      expect(await leaveWordRushPlayer(f.client, 'GAME', 'b')).toMatchObject({ status: 'error', internal: true })
    } finally {
      log.mockRestore()
    }
  })
})

describe('ensureWordRushGameFinalized completes the recorded leaves before Play Again resets', () => {
  it('refuses while a recorded leave cannot be completed yet', async () => {
    const f = fake(baseSession({ roster: ['a', 'd'], leavers: ['b'] }), {
      rpc: () => ({ data: { status: 'bookkeeping_owed' } }),
    })
    expect((await ensureWordRushGameFinalized(f.client, 'GAME')).error).toMatch(/still being finalized/)
  })

  it('passes when every recorded leave is completed (or retained for a result)', async () => {
    const f = fake(baseSession({ roster: ['a', 'd'], leavers: ['b', 'c'] }), {
      rpc: (_fn, args) => ({ data: { status: args.p_player_id === 'b' ? 'deleted' : 'game_finished' } }),
    })
    expect(await ensureWordRushGameFinalized(f.client, 'GAME')).toEqual({})
  })
})

describe('the cron backstop completes recorded leaves with no client involved', () => {
  it('lists the sessions that still have leavers and completes each one', async () => {
    const f = fake(baseSession({ roster: ['a', 'd'], leavers: ['b'] }), {
      rpc: () => ({ data: { status: 'deleted' } }),
    })
    const result = await resumeAllWordRushFinalizations(f.client)
    expect(f.rpcCalls.filter((c) => c.args.p_stage === 'delete').map((c) => c.args.p_player_id)).toEqual(['b'])
    expect(result.failed).toBe(0)
    expect(result.resumed).toBeGreaterThanOrEqual(1)
  })
})
