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
  runPostFinishBookkeeping: async (...args: unknown[]) => {
    deferred.bookkeeping.push(args.slice(1))
    return 'done'
  },
}))
// What a deferred host-left finish owes besides the bookkeeping: the session-bound cleanup.
const deferred = vi.hoisted(() => ({ bookkeeping: [] as unknown[][], cleanup: [] as unknown[][] }))
vi.mock('@/lib/admin-end-game', () => ({
  completeHostLeftCleanup: async (...args: unknown[]) => {
    deferred.cleanup.push(args.slice(1))
    return { finished: true, error: null }
  },
}))

import {
  completeWordRushLeaves,
  resumeAllWordRushFinalizations,
  ensureWordRushGameFinalized,
  leaveWordRushPlayer,
  processWordRushAdvance,
  processWordRushPrompt,
  resumeWordRushFinalization,
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
  /** Everything the code did, in order: `select:<table>:<columns>`, `update:<table>:<status>`, `rpc:<fn>:<stage>`. */
  events: string[]
}

function fake(
  session: Record<string, unknown> | null,
  opts: {
    claimWins?: boolean
    answers?: Array<{ player_id: string; turn_index: number; correct: boolean; text?: string; created_at?: string }>
    failAnswers?: boolean
    rpc?: (fn: string, args: Record<string, unknown>) => { data?: unknown; error?: { message: string } | null }
    teamRows?: Fake['teamRows']
    failMarkerQuery?: boolean
    failTeamRows?: boolean
    /** Successive reads of the session row (the last one repeats), instead of the one `session`. */
    sessionReads?: Array<Record<string, unknown>>
  } = {}
): Fake {
  const out: Fake = {
    client: null as unknown as SupabaseClient,
    updates: [],
    rpcCalls: [],
    teamRows: opts.teamRows ?? [],
    events: [],
  }
  let sessionReads = 0
  out.client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      out.rpcCalls.push({ fn, args })
      out.events.push(`rpc:${fn}:${String(args.p_stage ?? '')}`)
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
              return async () => {
                if (table === 'word_rush_sessions' && opts.sessionReads) {
                  return {
                    data: opts.sessionReads[Math.min(sessionReads++, opts.sessionReads.length - 1)],
                    error: null,
                  }
                }
                return { data: table === 'games' ? { status: 'active' } : session, error: null }
              }
            if (prop === 'order' || prop === 'limit')
              return (a: unknown) => {
                out.events.push(`${String(prop)}:${table}:${String(a)}`)
                return api
              }
            if (prop === 'update')
              return (patch: Record<string, unknown>) => {
                updating = true
                if (table === 'word_rush_sessions') out.updates.push({ patch, filters })
                out.events.push(`update:${table}:${String(patch.status ?? '')}`)
                return api
              }
            if (prop === 'select')
              return (cols?: string) => {
                out.events.push(`select:${table}:${cols ?? ''}`)
                return api
              }
            if (prop === 'not')
              return (k: string) => {
                filters.push([k, 'not'])
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
                if (table === 'word_rush_players') {
                  return resolve(
                    opts.failTeamRows
                      ? { data: null, error: { message: 'teams unreadable' } }
                      : { data: out.teamRows, error: null }
                  )
                }
                if (
                  opts.failMarkerQuery &&
                  table === 'word_rush_sessions' &&
                  filters.some(([k]) => k === 'round_finalize')
                ) {
                  return resolve({ data: null, error: { message: 'marker query failed' } })
                }
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
    // ...and to a round that is still being played (a closed or intermission round must match nothing).
    expect(claim!.filters).toContainEqual(['phase', ['playing', 'awaiting_prompt']])
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

  it('the recorded leavers are READ first, then the round is closed, then the seats are deleted (the order is the contract)', async () => {
    const f = fake(baseSession(), { rpc: () => ({ data: { status: 'deleted' } }) })
    await completeWordRushLeaves(f.client, 'GAME')
    const read = f.events.indexOf('select:word_rush_sessions:leavers')
    // The round-closing update recorded for THIS fixture (nobody but the setter is left, so the round must be closed).
    const closed = f.events.indexOf('update:word_rush_sessions:finished')
    const firstDelete = f.events.indexOf('rpc:word_rush_remove_player:delete')
    expect(read).toBeGreaterThanOrEqual(0)
    expect(closed).toBeGreaterThan(read)
    expect(firstDelete).toBeGreaterThan(closed)
  })

  it('only the leavers captured BEFORE the decision are deleted (one recorded meanwhile waits for the next runner)', async () => {
    // The first read of the session (the leavers) sees ['b']; later reads (the round decision) see a newer leave.
    const f = fake(null, {
      rpc: () => ({ data: { status: 'deleted' } }),
      sessionReads: [baseSession({ leavers: ['b'] }), baseSession({ leavers: ['b', 'late'] })],
    })
    await completeWordRushLeaves(f.client, 'GAME')
    expect(f.rpcCalls.filter((c) => c.args.p_stage === 'delete').map((c) => c.args.p_player_id)).toEqual(['b'])
  })

  it('a departed host whose handoff was settled in the deleting transaction: a game that ENDED there owes its bookkeeping and cleanup', async () => {
    deferred.bookkeeping.length = 0
    deferred.cleanup.length = 0
    const f = fake(baseSession({ roster: ['a', 'd'], leavers: ['b'] }), {
      rpc: () => ({
        data: { status: 'deleted', settled: { status: 'finished', finished_now: true, finished_at: 'F1' } },
      }),
    })
    await completeWordRushLeaves(f.client, 'GAME')
    expect(deferred.bookkeeping).toEqual([['GAME', 'F1', true]])
    expect(deferred.cleanup).toEqual([['GAME', { finishedAt: 'F1' }]])
  })

  it('...while a settlement that only nominated a successor owes nothing more', async () => {
    deferred.bookkeeping.length = 0
    deferred.cleanup.length = 0
    const f = fake(baseSession({ roster: ['a', 'd'], leavers: ['b'] }), {
      rpc: () => ({ data: { status: 'deleted', settled: { status: 'nominated' } } }),
    })
    await completeWordRushLeaves(f.client, 'GAME')
    expect(deferred.bookkeeping).toEqual([])
    expect(deferred.cleanup).toEqual([])
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
    await leaveWordRushPlayer(f.client, 'GAME', 'b', {
      hostLeave: { sessionsPlayed: 4, sessionStartedAt: 'S-T', trackBookkeeping: true },
    })
    expect(f.rpcCalls[0]).toEqual({
      fn: 'word_rush_remove_player',
      args: {
        p_game_id: 'GAME',
        p_player_id: 'b',
        p_stage: 'leave',
        p_host_leave: true,
        p_sessions_played: 4,
        p_track_bookkeeping: true,
        p_session_started_at: 'S-T',
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
    [{ status: 'finalizing' }, { status: 'pending' }],
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

  it('a departing HOST leave is durable: the outcome says the database settles the handoff with the seat deletion', async () => {
    const hostLeave = { sessionsPlayed: 4, sessionStartedAt: 'S-T', trackBookkeeping: true }
    const deletedNow = fake(baseSession({ leavers: ['b'] }), {
      rpc: answerFor({ status: 'left' }, { status: 'deleted' }),
    })
    expect(await leaveWordRushPlayer(deletedNow.client, 'GAME', 'b', { hostLeave })).toEqual({
      status: 'deleted',
      durableHandoff: true,
    })
    const deferredDelete = fake(baseSession({ leavers: ['b'] }), {
      rpc: answerFor({ status: 'left' }, { status: 'bookkeeping_owed' }),
    })
    expect(await leaveWordRushPlayer(deferredDelete.client, 'GAME', 'b', { hostLeave })).toEqual({
      status: 'pending',
      durableHandoff: true,
    })
    // A result that keeps the seat leaves the handoff to the caller (the retained host stays the host).
    const finished = fake(baseSession({ leavers: ['b'] }), {
      rpc: answerFor({ status: 'left' }, { status: 'game_finished' }),
    })
    expect(await leaveWordRushPlayer(finished.client, 'GAME', 'b', { hostLeave })).toEqual({ status: 'game_finished' })
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

  it('refuses while a recorded leave could not be deleted at all (an ambiguous participant): the reset would discard the record', async () => {
    const f = fake(baseSession({ roster: ['a', 'd'], leavers: ['b'] }), {
      rpc: () => ({ data: { status: 'participant_ambiguous' } }),
    })
    expect((await ensureWordRushGameFinalized(f.client, 'GAME')).error).toMatch(/could not be removed/)
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

  it('counts only seats it actually deleted: a blocked or retained seat is neither completed nor failed', async () => {
    const f = fake(baseSession({ roster: ['a', 'd'], leavers: ['b'] }), {
      rpc: () => ({ data: { status: 'participant_ambiguous' } }),
    })
    expect(await resumeAllWordRushFinalizations(f.client)).toEqual({ resumed: 0, failed: 0 })
  })

  it('looks at a window wider than the work per tick, oldest first, so a retained entry cannot hide the ones behind it', async () => {
    const f = fake(baseSession({ roster: ['a', 'd'], leavers: ['b'] }))
    await resumeAllWordRushFinalizations(f.client, 4)
    expect(f.events).toContain('order:word_rush_sessions:updated_at')
    expect(f.events).toContain('limit:word_rush_sessions:20')
  })

  it('when the marker query fails AFTER the leave pass, the leave pass totals are kept and the failure is added', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const f = fake(baseSession({ roster: ['a', 'd'], leavers: ['b'] }), {
        rpc: () => ({ data: { status: 'deleted' } }),
        failMarkerQuery: true,
      })
      expect(await resumeAllWordRushFinalizations(f.client)).toEqual({ resumed: 1, failed: 1 })
    } finally {
      log.mockRestore()
    }
  })
})

describe('advancing into a manual round revalidates the prepared prompt setter', () => {
  const intermission = (extra: Record<string, unknown> = {}) =>
    baseSession({
      phase: 'intermission',
      start_letter: null,
      end_letter: null,
      intermission_deadline_at: '2000-01-01T00:00:00.000Z',
      prompt_setter_player_id: 'gone',
      roster: ['a', 'c'],
      leavers: ['gone'],
      turn_index: 1,
      ...extra,
    })

  it('a setter who left during the intermission is replaced from the current roster', async () => {
    const f = fake(intermission())
    expect(await processWordRushAdvance(f.client, 'GAME')).toEqual({})
    const advance = f.updates.find((u) => u.patch.phase === 'awaiting_prompt')
    expect(advance?.patch.prompt_setter_player_id).toBe('c')
  })

  it('a setter who is still in keeps the round untouched', async () => {
    const f = fake(intermission({ prompt_setter_player_id: 'a' }))
    await processWordRushAdvance(f.client, 'GAME')
    const advance = f.updates.find((u) => u.patch.phase === 'awaiting_prompt')
    expect(advance).toBeDefined()
    expect(advance!.patch).not.toHaveProperty('prompt_setter_player_id')
  })

  it('automatic prompts have no setter to revalidate', async () => {
    const f = fake(intermission({ prompt_mode: 'automatic', start_letter: 'a', end_letter: 'z' }))
    await processWordRushAdvance(f.client, 'GAME')
    const advance = f.updates.find((u) => u.patch.phase === 'playing')
    expect(advance).toBeDefined()
    expect(advance!.patch).not.toHaveProperty('prompt_setter_player_id')
  })
})

describe('review 6098178725', () => {
  const owed = (extra: Record<string, unknown> = {}) => ({
    session_id: 'S-1',
    turn_index: 2,
    round: 3,
    setter_id: null,
    is_last: true,
    turn_deadline_at: null,
    turn_seconds: 60,
    awarded: true,
    ...extra,
  })

  it('a finish marker that is already awarded needs no answer read: an unreadable answer set cannot hold the game finish back', async () => {
    const f = fake(baseSession({ status: 'finished', phase: 'finished', round_finalize: owed() }), {
      failAnswers: true,
    })
    finish.opts = null
    expect((await resumeWordRushFinalization(f.client, 'GAME')).error).toBeUndefined()
    expect(f.events.some((e) => e.startsWith('select:word_rush_answers'))).toBe(false)
    // The finish itself IS attempted, bound to the session the marker belongs to (it does not return early).
    expect(finish.opts).toMatchObject({
      trackBookkeeping: true,
      roundGuard: { params: { p_session_id: 'S-1' } },
    })
  })

  it('...while a marker that still owes the award reads them (and fails when they are unreadable)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const f = fake(baseSession({ status: 'finished', round_finalize: owed({ awarded: false, setter_id: 'a' }) }), {
        failAnswers: true,
      })
      expect((await resumeWordRushFinalization(f.client, 'GAME')).error).toBeDefined()
    } finally {
      log.mockRestore()
    }
  })

  it('the intermission advance is bound to the turn it inspected', async () => {
    const f = fake({
      ...baseSession({
        phase: 'intermission',
        start_letter: 'a',
        intermission_deadline_at: '2000-01-01T00:00:00.000Z',
      }),
    })
    await processWordRushAdvance(f.client, 'GAME')
    const advance = f.updates.find((u) => u.patch.phase === 'playing')
    expect(advance!.filters).toContainEqual(['turn_index', 2])
  })

  it('a deletion that committed before a later seat failed still counts as completed work, and the failure counts too', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const f = fake(baseSession({ roster: ['a', 'd'], leavers: ['b', 'c'] }), {
        rpc: (_fn, args) =>
          args.p_player_id === 'c' ? { error: { message: 'down' } } : { data: { status: 'deleted' } },
      })
      expect(await resumeAllWordRushFinalizations(f.client)).toEqual({ resumed: 1, failed: 1 })
    } finally {
      log.mockRestore()
    }
  })

  it("the caller's own confirmed deletion is not hidden by a later seat's failure", async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const f = fake(baseSession({ roster: ['a', 'd'], leavers: ['b', 'c'] }), {
        rpc: (_fn, args) =>
          args.p_stage === 'leave'
            ? { data: { status: 'left' } }
            : args.p_player_id === 'c'
              ? { error: { message: 'down' } }
              : { data: { status: 'deleted' } },
      })
      expect(await leaveWordRushPlayer(f.client, 'GAME', 'b')).toEqual({ status: 'deleted' })
      // ...while an unknown own outcome stays pending.
      const g = fake(baseSession({ roster: ['a', 'd'], leavers: ['c', 'b'] }), {
        rpc: (_fn, args) => (args.p_stage === 'leave' ? { data: { status: 'left' } } : { error: { message: 'down' } }),
      })
      expect(await leaveWordRushPlayer(g.client, 'GAME', 'b')).toEqual({ status: 'pending' })
    } finally {
      log.mockRestore()
    }
  })

  it('a leave another runner already completed: a seat the database KEPT is not reported as deleted', async () => {
    // b is no longer in the recorded list (the finish with a reason dropped it) but the seat is still there.
    const kept = fake(baseSession({ roster: ['a', 'd'], leavers: [] }), { rpc: () => ({ data: { status: 'left' } }) })
    expect(await leaveWordRushPlayer(kept.client, 'GAME', 'b')).toEqual({ status: 'game_finished' })
  })

  it('a host whose seat deletion became a host-alone finish is reported to its own request, which owes the work', async () => {
    const f = fake(baseSession({ roster: ['a'], leavers: ['b'] }), {
      rpc: (_fn, args) =>
        args.p_stage === 'leave' ? { data: { status: 'left' } } : { data: { status: 'host_ended', finished_at: 'F9' } },
    })
    deferred.bookkeeping.length = 0
    expect(
      await leaveWordRushPlayer(f.client, 'GAME', 'b', {
        hostLeave: { sessionsPlayed: 1, sessionStartedAt: null, trackBookkeeping: true },
      })
    ).toEqual({ status: 'host_ended', finishedAt: 'F9' })
    expect(deferred.bookkeeping).toEqual([])
    // ...while a runner that is not that host's request does the work itself.
    const sweep = fake(baseSession({ roster: ['a'], leavers: ['b'] }), {
      rpc: () => ({ data: { status: 'host_ended', finished_at: 'F9' } }),
    })
    await completeWordRushLeaves(sweep.client, 'GAME')
    expect(deferred.bookkeeping).toEqual([['GAME', 'F9', true]])
  })

  it('team rows are read AFTER the recorded leavers (a leave in between can never leave a departed player in)', async () => {
    const rows = [
      { player_id: 'a', team: 1, score: 0, players: { spectator: false } },
      { player_id: 'c', team: 2, score: 0, players: { spectator: false } },
    ]
    const f = fake(baseSession({ mode: 'team', roster: ['a', 'c'], leavers: [] }), { teamRows: rows })
    await reconcileWordRushRound(f.client, 'GAME')
    const leavers = f.events.indexOf('select:word_rush_sessions:leavers')
    const seats = f.events.findIndex((e) => e.startsWith('select:word_rush_players'))
    expect(leavers).toBeGreaterThanOrEqual(0)
    expect(seats).toBeGreaterThan(leavers)
  })

  it('a lost prompt claim that finds ANOTHER turn is not reported as a setter change; the same turn still is', async () => {
    const awaiting = (extra: Record<string, unknown>) =>
      baseSession({ phase: 'awaiting_prompt', prompt_setter_player_id: 'a', turn_index: 2, ...extra })
    const moved = fake(null, {
      claimWins: false,
      sessionReads: [awaiting({}), awaiting({ turn_index: 3, prompt_setter_player_id: 'b' })],
    })
    const other = await processWordRushPrompt(moved.client, 'GAME', 'a', 'a', 'z')
    expect(other.error).not.toBe('Only the prompt setter can enter letters')
    const same = fake(null, {
      claimWins: false,
      sessionReads: [awaiting({}), awaiting({ prompt_setter_player_id: 'b' })],
    })
    expect((await processWordRushPrompt(same.client, 'GAME', 'a', 'a', 'z')).error).toBe(
      'Only the prompt setter can enter letters'
    )
  })

  it('a team turn advance never matches a session that has been finished meanwhile', async () => {
    const rows = [
      { player_id: 'a', team: 1, score: 0, players: { spectator: false } },
      { player_id: 'b', team: 1, score: 0, players: { spectator: false } },
      { player_id: 'c', team: 2, score: 0, players: { spectator: false } },
      { player_id: 'd', team: 2, score: 0, players: { spectator: false } },
      { player_id: 'e', team: 3, score: 0, players: { spectator: false } },
      { player_id: 'f', team: 3, score: 0, players: { spectator: false } },
    ]
    // Team 1 can no longer field a turn (its setter + answerer are gone): the turn is ended and the next team's turn started.
    const f = fake(
      baseSession({
        mode: 'team',
        roster: ['c', 'd', 'e', 'f'],
        leavers: ['a', 'b'],
        num_teams: 3,
        active_team: 1,
        total_rounds: 3,
        turn_index: 0,
      }),
      {
        teamRows: rows,
      }
    )
    await reconcileWordRushRound(f.client, 'GAME')
    const advance = f.updates.find((u) => u.patch.phase === 'intermission')
    expect(advance).toBeDefined()
    expect(advance!.filters).toContainEqual(['status', 'finished'])
  })

  it('an unreadable team read while advancing into a manual round is an internal failure, not a throw', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const f = fake(
        baseSession({
          mode: 'team',
          phase: 'intermission',
          start_letter: null,
          intermission_deadline_at: '2000-01-01T00:00:00.000Z',
          prompt_setter_player_id: 'a',
        }),
        { failTeamRows: true }
      )
      const result = await processWordRushAdvance(f.client, 'GAME')
      expect(result.internal).toBe(true)
      expect(f.updates).toEqual([])
    } finally {
      log.mockRestore()
    }
  })
})
