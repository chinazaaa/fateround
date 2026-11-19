import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

import {
  processWordRushEndRoundEarly,
  processWordRushExpireTurn,
  processWordRushSubmit,
  resumeAllWordRushFinalizations,
  resumeWordRushFinalization,
} from './word-rush-server'

const GAME = 'GAME1'
const session = {
  game_id: GAME,
  status: 'playing',
  phase: 'playing',
  mode: 'individual',
  prompt_mode: 'automatic',
  prompt_setter_player_id: null,
  start_letter: 'c',
  end_letter: 't',
  min_word_length: 3,
  current_round: 1,
  turn_index: 0,
  prompt_index: 0,
  turn_seconds: 60,
  turn_deadline_at: new Date(Date.now() + 30_000).toISOString(),
  difficulty: 'easy',
  used_pairs: [],
}

type Outcome = 'recorded' | 'round_closed' | 'already_correct'

/**
 * Fake client: the pre-check sees no row; the record RPC (one transaction in the database) is
 * the only writer of answers/score, and admits exactly one of the racing submits.
 */
function makeClient(opts: { rpcError?: { message: string }; closed?: boolean } = {}) {
  const calls = { recordRpcs: 0, scoreRpcs: 0, answerWrites: 0 }
  let recorded = false
  const client = {
    rpc: (fn: string) => {
      if (fn === 'word_rush_add_score') calls.scoreRpcs++
      if (fn !== 'word_rush_record_individual_answer') return Promise.resolve({ data: null, error: null })
      calls.recordRpcs++
      if (opts.rpcError) return Promise.resolve({ data: null, error: opts.rpcError })
      let outcome: Outcome = 'recorded'
      if (opts.closed) outcome = 'round_closed'
      else if (recorded) outcome = 'already_correct'
      recorded = true
      return Promise.resolve({ data: outcome, error: null })
    },
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      let op = 'select'
      const result = () => {
        if (table === 'word_rush_sessions') return { data: op === 'select' ? session : null, error: null }
        if (table === 'word_rush_players') return { data: [{ player_id: 'p1', team: 0, score: 0 }], error: null }
        if (table === 'word_rush_answers' && op !== 'select') calls.answerWrites++
        return { data: null, error: null }
      }
      for (const m of ['select', 'eq', 'not', 'order', 'in']) q[m] = () => q
      q.update = () => {
        op = 'update'
        return q
      }
      q.insert = () => {
        op = 'insert'
        return q
      }
      q.maybeSingle = () => Promise.resolve(result())
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej)
      return q
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

describe('processWordRushSubmit individual duplicates', () => {
  it('awards points once when identical submits race', async () => {
    const { client, calls } = makeClient()
    const results = await Promise.all(Array.from({ length: 4 }, () => processWordRushSubmit(client, GAME, 'p1', 'cat')))
    expect(results.filter((r) => r.correct)).toHaveLength(1)
    const rejected = results.filter((r) => !r.correct)
    expect(rejected).toHaveLength(3)
    for (const r of rejected) expect(r.error).toBe('You already got this round right')
    expect(calls.recordRpcs).toBe(4)
    // Scoring happens inside the record function, never as a separate client call.
    expect(calls.scoreRpcs).toBe(0)
    expect(calls.answerWrites).toBe(0)
  })

  it('rejects an answer admitted after the round closed', async () => {
    const { client, calls } = makeClient({ closed: true })
    const result = await processWordRushSubmit(client, GAME, 'p1', 'cat')
    expect(result.correct).toBeUndefined()
    expect(result.error).toBe('This round has ended — wait for the next one')
    expect(calls.scoreRpcs).toBe(0)
  })

  it('fails (retryable) instead of reporting success when the transaction errors', async () => {
    const { client } = makeClient({ rpcError: { message: 'score update failed' } })
    const result = await processWordRushSubmit(client, GAME, 'p1', 'cat')
    expect(result.correct).toBeUndefined()
    expect(result.points).toBeUndefined()
    expect(result.internal).toBe(true)
  })
})

describe('individual round finalization is resumable', () => {
  const SETTER = 'setter'
  const lastRound = {
    ...session,
    prompt_mode: 'manual',
    prompt_setter_player_id: SETTER,
    total_rounds: 1,
    roster: [SETTER, 'p1'],
    phase: 'playing',
    round_finalize: null as Record<string, unknown> | null,
  }
  const answer = { player_id: 'p1', created_at: new Date(Date.now() - 10_000).toISOString(), text: 'cat' }

  /**
   * Stateful fake of the few tables the round-end path touches. It evaluates the filters the code
   * chains (eq / neq / in / is, including the `round_finalize->>turn_index` JSON path), so the
   * session claim, the marker and the compare-and-set updates behave like the database.
   * `failAnswerReads` fails that many answers reads AFTER the first (pre-claim) one;
   * `failGameFinish` fails the first games update (the game-finish CAS).
   */
  function makeStatefulClient(
    opts: {
      failAnswerReads?: number
      failTurnReads?: number
      failGameFinish?: boolean
      session?: Record<string, unknown>
    } = {}
  ) {
    const state = {
      session: { ...lastRound, ...opts.session } as Record<string, unknown>,
      game: { id: GAME, host_token: 'host', status: 'active' } as Record<string, unknown>,
      score: 0,
      answerReads: 0,
      awardOutcomes: [] as string[],
      gameFinishFailed: false,
    }
    const client = {
      rpc: (fn: string, args: Record<string, unknown>) => {
        if (fn !== 'word_rush_finalize_award') return Promise.resolve({ data: null, error: null })
        // Mirrors the SQL function: once per marker, atomically with the `awarded` flag.
        const marker = state.session.round_finalize as Record<string, unknown> | null
        let outcome = 'not_pending'
        if (marker && marker.turn_index === args.p_turn_index) {
          if (marker.awarded) outcome = 'already_awarded'
          else {
            if (args.p_player_id && (args.p_delta as number) > 0) state.score += args.p_delta as number
            state.session.round_finalize = { ...marker, awarded: true }
            outcome = 'awarded'
          }
        }
        state.awardOutcomes.push(outcome)
        return Promise.resolve({ data: outcome, error: null })
      },
      from: (table: string) => {
        const filters: Array<{ method: string; col: string; val: unknown }> = []
        let op = 'select'
        let patch: Record<string, unknown> = {}
        const read = (row: Record<string, unknown>, col: string) => {
          const [base, key] = col.split('->>')
          if (key === undefined) return row[base]
          const json = row[base] as Record<string, unknown> | null
          return json == null ? undefined : String(json[key])
        }
        const matches = (row: Record<string, unknown>) =>
          filters.every((f) => {
            const v = read(row, f.col)
            if (f.method === 'eq') return v === f.val
            if (f.method === 'neq') return v !== f.val
            if (f.method === 'in') return (f.val as unknown[]).includes(v)
            if (f.method === 'is') return (v ?? null) === f.val
            return true
          })
        const resolve = () => {
          if (table === 'games') {
            if (op === 'update') {
              if (opts.failGameFinish && !state.gameFinishFailed) {
                state.gameFinishFailed = true
                return { data: null, error: { message: 'boom' } }
              }
              if (!matches(state.game)) return { data: [], error: null }
              Object.assign(state.game, patch)
              return { data: [{ id: GAME }], error: null }
            }
            return { data: state.game, error: null }
          }
          if (table === 'word_rush_sessions') {
            if (op === 'update') {
              if (!matches(state.session)) return { data: [], error: null }
              Object.assign(state.session, patch)
              return { data: [{ id: 'S1' }], error: null }
            }
            if (listMode) {
              return { data: state.session.round_finalize ? [{ ...state.session }] : [], error: null }
            }
            return { data: { ...state.session }, error: null }
          }
          if (table === 'word_rush_answers') {
            state.answerReads += 1
            const turn = filters.find((f) => f.method === 'eq' && f.col === 'turn_index')?.val
            if (state.answerReads > 1 && state.answerReads - 1 <= (opts.failAnswerReads ?? 0)) {
              return { data: null, error: { message: 'boom' } }
            }
            // Every read of this round's answers fails after the first (pre-claim) one.
            if (state.answerReads > 1 && opts.failTurnReads !== undefined && turn === opts.failTurnReads) {
              return { data: null, error: { message: 'boom' } }
            }
            return { data: [answer], error: null }
          }
          return { data: null, error: null }
        }
        const q: Record<string, unknown> = {}
        for (const m of ['eq', 'neq', 'in', 'is'] as const) {
          q[m] = (col: string, val: unknown) => {
            filters.push({ method: m, col, val })
            return q
          }
        }
        let listMode = false
        for (const m of ['select', 'not', 'order']) q[m] = () => q
        q.limit = () => {
          listMode = true
          return q
        }
        q.update = (v: Record<string, unknown>) => {
          op = 'update'
          patch = v
          return q
        }
        q.maybeSingle = () => Promise.resolve(resolve())
        q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(resolve()).then(res, rej)
        return q
      },
    }
    return { client: client as unknown as SupabaseClient, state }
  }

  it('applies the points and the game finish in the same request when nothing fails', async () => {
    const { client, state } = makeStatefulClient()
    expect(await processWordRushEndRoundEarly(client, GAME, 'host')).toEqual({})
    expect(state.score).toBeGreaterThan(0)
    expect(state.game.status).toBe('finished')
    expect(state.session.round_finalize).toBeNull()
  })

  it('records what is owed in the same claim, so a failed final read loses nothing', async () => {
    const { client, state } = makeStatefulClient({ failAnswerReads: 1 })
    // The round still ends for the caller...
    expect(await processWordRushEndRoundEarly(client, GAME, 'host')).toEqual({})
    expect(state.session.phase).toBe('finished')
    // ...and the owed effects are durable, not applied yet.
    expect(state.session.round_finalize).toMatchObject({
      turn_index: 0,
      setter_id: SETTER,
      is_last: true,
      awarded: false,
    })
    expect(state.score).toBe(0)
    expect(state.game.status).toBe('active')

    // Any later request that loads the session resumes the finalization from the marker.
    await processWordRushExpireTurn(client, GAME)
    expect(state.score).toBeGreaterThan(0)
    expect(state.game.status).toBe('finished')
    expect(state.session.round_finalize).toBeNull()
  })

  it('never awards the setter twice when a resumed finalization is retried', async () => {
    // The game-finish step fails after the points were awarded: the marker must remember that.
    const { client, state } = makeStatefulClient({ failGameFinish: true })
    await processWordRushEndRoundEarly(client, GAME, 'host')
    const awarded = state.score
    expect(awarded).toBeGreaterThan(0)
    expect(state.game.status).toBe('active')
    expect(state.session.round_finalize).toMatchObject({ awarded: true })

    await processWordRushExpireTurn(client, GAME)
    await processWordRushExpireTurn(client, GAME)
    expect(state.score).toBe(awarded)
    expect(state.game.status).toBe('finished')
    expect(state.session.round_finalize).toBeNull()
  })

  it('does not close another round over effects that are still owed', async () => {
    // A three-round game whose first round's finalization keeps failing.
    const { client, state } = makeStatefulClient({ failTurnReads: 0, session: { total_rounds: 3 } })
    await processWordRushEndRoundEarly(client, GAME, 'host')
    const marker = state.session.round_finalize
    expect(marker).toMatchObject({ turn_index: 0, is_last: false })
    expect(state.session.turn_index).toBe(1)

    // Round 2 ends while round 1's effects are still owed: the claim filter requires
    // round_finalize IS NULL, so it must neither close round 2 nor replace round 1's marker.
    state.session.phase = 'playing'
    await processWordRushEndRoundEarly(client, GAME, 'host')
    expect(state.session.round_finalize).toEqual(marker)
    expect(state.session.phase).toBe('playing')
  })
  it('resumes through the dedicated entry point even after the session AND the game are finished', async () => {
    // The normal client path after the last round: the session is finished (so no timer runs) and
    // the game-finish already landed, but clearing the marker did not.
    const { client, state } = makeStatefulClient({ failAnswerReads: 1 })
    await processWordRushEndRoundEarly(client, GAME, 'host')
    expect(state.session.round_finalize).not.toBeNull()
    state.game.status = 'finished'

    expect(await resumeWordRushFinalization(client, GAME)).toEqual({ resumed: true })
    expect(state.score).toBeGreaterThan(0)
    expect(state.session.round_finalize).toBeNull()

    // Nothing owed any more: a second call is a no-op and does not award again.
    const awarded = state.score
    expect(await resumeWordRushFinalization(client, GAME)).toEqual({ resumed: false })
    expect(state.score).toBe(awarded)
  })

  it('reports an error and keeps the marker when the resume itself fails', async () => {
    const { client, state } = makeStatefulClient({ failAnswerReads: 3 })
    await processWordRushEndRoundEarly(client, GAME, 'host') // final read #1 fails
    const res = await resumeWordRushFinalization(client, GAME) // read #2 fails
    expect(res.resumed).toBe(false)
    expect(res.error).toBeDefined()
    expect(state.session.round_finalize).not.toBeNull()
    expect(state.score).toBe(0)
  })

  it('the server sweep finishes every pending game without any client', async () => {
    const { client, state } = makeStatefulClient({ failAnswerReads: 1 })
    await processWordRushEndRoundEarly(client, GAME, 'host')
    expect(state.game.status).toBe('active')

    expect(await resumeAllWordRushFinalizations(client)).toEqual({ resumed: 1, failed: 0 })
    expect(state.score).toBeGreaterThan(0)
    expect(state.game.status).toBe('finished')
    expect(state.session.round_finalize).toBeNull()
    // Idle on the next tick.
    expect(await resumeAllWordRushFinalizations(client)).toEqual({ resumed: 0, failed: 0 })
  })
})
