import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

import { markGameFinished, recoverAllFinishBookkeeping, recoverFinishBookkeeping } from './game-finish'
import { normalizeWordRushWord, wordRushIndividualGuessPointsAt } from './word-rush'
import {
  clearWordRushSessionData,
  processWordRushEndRoundEarly,
  processWordRushExpireTurn,
  processWordRushPrompt,
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
    id: 'S-old',
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
      /** Fail this many reads of the finished game by recordRoundFacts (the trophy snapshot). */
      failFactsReads?: number
      /** Fail this many lease renewals (a transient RPC error). */
      failRenewals?: number
      session?: Record<string, unknown>
      /** Answers returned by the n-th read of word_rush_answers (the last entry repeats). */
      answersByRead?: Array<Array<{ player_id: string; created_at: string; text: string }>>
      /** Runs right after the setter award lands (simulate a replay while a finalizer is in flight). */
      afterAward?: (state: { session: Record<string, unknown>; game: Record<string, unknown> }) => void
    } = {}
  ) {
    const state = {
      session: { ...lastRound, ...opts.session } as Record<string, unknown>,
      game: { id: GAME, host_token: 'host', status: 'active' } as Record<string, unknown>,
      score: 0,
      answerReads: 0,
      awardOutcomes: [] as string[],
      gameFinishFailed: false,
      finishArgs: [] as Array<Record<string, unknown>>,
      events: [] as string[],
      failFactsReads: opts.failFactsReads ?? 0,
      failures: [] as Array<Record<string, unknown>>,
      failRenewals: opts.failRenewals ?? 0,
    }
    const client = {
      rpc: (fn: string, args: Record<string, unknown>) => {
        if (fn === 'word_rush_finish_game_for_session') {
          state.finishArgs.push(args)
          if (opts.failGameFinish && !state.gameFinishFailed) {
            state.gameFinishFailed = true
            return Promise.resolve({ data: null, error: { message: 'boom' } })
          }
          // Mirrors the SQL function: only the session the round belonged to, only while it is finished.
          const ok =
            state.game.status === 'active' &&
            state.session.id === args.p_session_id &&
            state.session.status === 'finished'
          if (ok) {
            state.game.status = 'finished'
            state.game.finished_at = new Date().toISOString()
            state.game.finish_bookkeeping = { finished_at: state.game.finished_at, attempts: 0 }
            state.events.push('finish')
          }
          return Promise.resolve({ data: ok, error: null })
        }
        // Mirrors claim/complete/fail_finish_bookkeeping: the durable post-finish marker on the games row.
        if (fn === 'claim_finish_bookkeeping') {
          const marker = state.game.finish_bookkeeping as Record<string, unknown> | null | undefined
          if (!marker) return Promise.resolve({ data: { status: 'none' }, error: null })
          const until = marker.lease_until as string | undefined
          if (until && new Date(until).getTime() > Date.now()) {
            return Promise.resolve({ data: { status: 'held' }, error: null })
          }
          state.game.finish_bookkeeping = {
            ...marker,
            lease_until: new Date(Date.now() + (args.p_lease_seconds as number) * 1000).toISOString(),
            owner: args.p_owner,
          }
          state.events.push('claim')
          return Promise.resolve({
            data: { status: 'claimed', finished_at: marker.finished_at, attempts: marker.attempts ?? 0 },
            error: null,
          })
        }
        if (fn === 'release_finish_bookkeeping') {
          const marker = state.game.finish_bookkeeping as Record<string, unknown> | null | undefined
          if (!marker) return Promise.resolve({ data: 'none', error: null })
          if (marker.owner !== args.p_owner) return Promise.resolve({ data: 'not_owner', error: null })
          const { lease_until: _rl, owner: _ro, ...rest } = marker // no attempt counted
          state.game.finish_bookkeeping = rest
          state.events.push('release')
          return Promise.resolve({ data: 'released', error: null })
        }
        if (fn === 'renew_finish_bookkeeping') {
          if (state.failRenewals > 0) {
            state.failRenewals -= 1
            return Promise.resolve({ data: null, error: { message: 'renew blip' } })
          }
          const marker = state.game.finish_bookkeeping as Record<string, unknown> | null | undefined
          if (!marker) return Promise.resolve({ data: 'none', error: null })
          if (marker.owner !== args.p_owner) return Promise.resolve({ data: 'not_owner', error: null })
          state.game.finish_bookkeeping = {
            ...marker,
            lease_until: new Date(Date.now() + (args.p_lease_seconds as number) * 1000).toISOString(),
          }
          state.events.push('renew')
          return Promise.resolve({ data: 'renewed', error: null })
        }
        if (fn === 'complete_finish_bookkeeping' || fn === 'fail_finish_bookkeeping') {
          const marker = state.game.finish_bookkeeping as Record<string, unknown> | null | undefined
          if (!marker) return Promise.resolve({ data: 'none', error: null })
          if (marker.owner !== args.p_owner) return Promise.resolve({ data: 'not_owner', error: null })
          if (fn === 'complete_finish_bookkeeping') {
            state.game.finish_bookkeeping = null
            state.events.push('complete')
            return Promise.resolve({ data: 'completed', error: null })
          }
          const attempts = ((marker.attempts as number) ?? 0) + 1
          if (attempts >= (args.p_max_attempts as number)) {
            // Mirrors the SQL: an append-only per-generation record, then the marker is dropped.
            state.failures.push({ finished_at: marker.finished_at, attempts })
            state.game.finish_bookkeeping = null
            state.events.push('gave_up')
            return Promise.resolve({ data: 'gave_up', error: null })
          }
          const { lease_until: _l, owner: _o, ...rest } = marker
          state.game.finish_bookkeeping = { ...rest, attempts }
          state.events.push('fail')
          return Promise.resolve({ data: 'retry', error: null })
        }
        if (fn !== 'word_rush_finalize_award') return Promise.resolve({ data: null, error: null })
        // Mirrors the SQL function: once per marker of THIS session, atomically with the `awarded` flag.
        const marker = state.session.round_finalize as Record<string, unknown> | null
        let outcome = 'not_pending'
        if (marker && marker.session_id === args.p_session_id && marker.turn_index === args.p_turn_index) {
          if (marker.awarded) outcome = 'already_awarded'
          else {
            if (args.p_player_id && (args.p_delta as number) > 0) state.score += args.p_delta as number
            state.session.round_finalize = { ...marker, awarded: true }
            outcome = 'awarded'
            state.events.push('award')
          }
        }
        state.awardOutcomes.push(outcome)
        if (outcome === 'awarded') opts.afterAward?.(state)
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
            // `leavers != '{}'` (PostgREST array literal): only a session that has someone recorded as having left.
            if (f.method === 'neq' && f.val === '{}') return Array.isArray(v) && v.length > 0
            if (f.method === 'neq') return v !== f.val
            if (f.method === 'in') return (f.val as unknown[]).includes(v)
            if (f.method === 'is') return (v ?? null) === f.val
            return true
          })
        const resolve = () => {
          if (op === 'delete') {
            state.events.push(`delete:${table}`)
            return { data: null, error: null }
          }
          if (table === 'room_games') state.events.push('bookkeeping') // awardRoomGamePoints starts here
          if (table === 'games') {
            if (op === 'update') {
              if (!matches(state.game)) return { data: [], error: null }
              Object.assign(state.game, patch)
              return { data: [{ id: GAME }], error: null }
            }
            if (listMode) {
              return { data: state.game.finish_bookkeeping ? [{ id: GAME }] : [], error: null }
            }
            // recordRoundFacts' read of the finished game: make the trophy snapshot fail.
            if (state.game.status === 'finished' && state.failFactsReads > 0) {
              state.failFactsReads -= 1
              return { data: null, error: { message: 'snapshot read failed' } }
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
              // (the leaves sweep asks for sessions with a recorded leaver only: none here)
              if (filters.some((f) => f.method === 'neq' && f.val === '{}') && !matches(state.session)) {
                return { data: [], error: null }
              }
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
            const byRead = opts.answersByRead
            const rows = byRead ? byRead[Math.min(state.answerReads - 1, byRead.length - 1)] : [answer]
            return { data: rows, error: null }
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
        q.delete = () => {
          op = 'delete'
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

  it('the last-round finish names exactly the game and the session it finalizes (no leaver, no other bookkeeping in the payload)', async () => {
    const owed = {
      session_id: 'S-old',
      turn_index: 0,
      setter_id: SETTER,
      is_last: true,
      awarded: false,
    }
    const resumed = makeStatefulClient({ session: { phase: 'finished', status: 'finished', round_finalize: owed } })
    await processWordRushExpireTurn(resumed.client, GAME)
    expect(resumed.state.finishArgs[0]).toEqual(expect.objectContaining({ p_game_id: GAME, p_session_id: 'S-old' }))
    expect(resumed.state.finishArgs[0]).not.toHaveProperty('p_leaver_player_id')
  })

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
  it('awards exactly the points of the FINAL answer set and reports its count', async () => {
    // The pre-claim read sees one correct answer; a second one is admitted before the claim lands.
    const second = { player_id: 'p2', created_at: new Date(Date.now() - 5_000).toISOString(), text: 'coat' }
    const { client, state } = makeStatefulClient({
      session: { total_rounds: 3 },
      answersByRead: [[answer], [answer, second]],
    })
    await processWordRushEndRoundEarly(client, GAME, 'host')

    const pointsFor = (a: { created_at: string; text: string }) =>
      wordRushIndividualGuessPointsAt(
        lastRound.turn_deadline_at,
        lastRound.turn_seconds,
        new Date(a.created_at).getTime(),
        normalizeWordRushWord(a.text).length
      )
    expect(state.score).toBe(pointsFor(answer) + pointsFor(second))
    expect(state.score).toBeGreaterThan(pointsFor(answer)) // not the earlier, smaller read
    expect(state.session.status_message).toBe('Round 1 complete — 2 guessed it')
  })

  it('an in-flight finalizer cannot award or finish a NEW game started by Play Again', async () => {
    // Play Again replaces the session (new id) and resets the game while the old finalizer is mid-way.
    const { client, state } = makeStatefulClient({
      afterAward: (st) => {
        st.session = { ...lastRound, id: 'S-new', status: 'active', phase: 'playing', round_finalize: null }
        st.game.status = 'active'
      },
    })
    await processWordRushEndRoundEarly(client, GAME, 'host')

    expect(state.game.status).toBe('active') // the stale finish was rejected by the session guard
    expect(state.events).not.toContain('finish')
  })

  it('a stale marker for the old session cannot be awarded against the new session', async () => {
    const { client, state } = makeStatefulClient({ failAnswerReads: 1 })
    await processWordRushEndRoundEarly(client, GAME, 'host')
    const stale = state.session.round_finalize
    expect(stale).toMatchObject({ session_id: 'S-old', awarded: false })

    // A replay gives the game a new session whose first round also has turn_index 0.
    state.session = {
      ...lastRound,
      id: 'S-new',
      status: 'active',
      phase: 'playing',
      round_finalize: { ...(stale as object), session_id: 'S-new' },
    }
    const outcome = await client.rpc('word_rush_finalize_award', {
      p_game_id: GAME,
      p_session_id: 'S-old',
      p_turn_index: 0,
      p_player_id: SETTER,
      p_delta: 50,
    })
    expect(outcome.data).toBe('not_pending')
    expect(state.score).toBe(0)
  })

  it('Play Again finishes owed effects BEFORE it deletes the session and answers', async () => {
    const { client, state } = makeStatefulClient({ failAnswerReads: 1 })
    await processWordRushEndRoundEarly(client, GAME, 'host')
    expect(state.session.round_finalize).not.toBeNull()
    state.events.length = 0

    expect(await clearWordRushSessionData(client, GAME)).toEqual({})
    expect(state.score).toBeGreaterThan(0)
    const award = state.events.indexOf('award')
    const firstDelete = state.events.findIndex((e) => e.startsWith('delete:'))
    expect(award).toBeGreaterThanOrEqual(0)
    expect(firstDelete).toBeGreaterThan(award)
  })

  it('Play Again refuses to reset while the owed effects cannot be completed', async () => {
    const { client, state } = makeStatefulClient({ failTurnReads: 0 })
    await processWordRushEndRoundEarly(client, GAME, 'host')
    expect(state.session.round_finalize).not.toBeNull()
    state.events.length = 0

    const res = await clearWordRushSessionData(client, GAME)
    expect(res.error).toBeDefined()
    expect(state.events.filter((e) => e.startsWith('delete:'))).toEqual([]) // marker and answers kept
    expect(state.session.round_finalize).not.toBeNull()
  })
  const stageTakeoverDuringBookkeeping = (client: SupabaseClient, state: { game: Record<string, unknown> }) => {
    // While this runner is in its bookkeeping (room_games read) its lease expires and a second runner takes
    // over the game's marker with its own owner id.
    let staged = false
    const realFrom = client.from.bind(client)
    ;(client as { from: unknown }).from = (table: string) => {
      if (table === 'room_games' && !staged) {
        staged = true
        state.game.finish_bookkeeping = {
          ...(state.game.finish_bookkeeping as Record<string, unknown>),
          owner: 'someone-else',
          lease_until: new Date(Date.now() + 120_000).toISOString(),
        }
      }
      return realFrom(table)
    }
    return () => staged
  }
  const pendingGame = (state: { game: Record<string, unknown> }, extra: Record<string, unknown>) => {
    state.game.status = 'finished'
    state.game.finished_at = new Date(Date.now() - 10 * 60_000).toISOString()
    state.game.finish_bookkeeping = { finished_at: state.game.finished_at, attempts: 0, ...extra }
  }

  it('the winning finalizer flips the game with the durable marker, runs the bookkeeping once, and clears it', async () => {
    const { client, state } = makeStatefulClient()
    await processWordRushEndRoundEarly(client, GAME, 'host')
    expect(state.events.filter((e) => e === 'claim')).toHaveLength(1)
    expect(state.events.filter((e) => e === 'bookkeeping')).toHaveLength(1)
    expect(state.events.filter((e) => e === 'complete')).toHaveLength(1)
    // The runner renews its lease before every bookkeeping step, so a slow-but-alive runner is never taken over.
    expect(state.events.filter((e) => e === 'renew')).toHaveLength(5)
    expect(state.events.indexOf('finish')).toBeLessThan(state.events.indexOf('claim'))
    expect(state.game.finish_bookkeeping).toBeNull()
    expect(state.session.round_finalize).toBeNull()
  })

  it('Play Again does NOT delete the rows while a live runner holds the bookkeeping lease', async () => {
    const { client, state } = makeStatefulClient({ failAnswerReads: 1 })
    await processWordRushEndRoundEarly(client, GAME, 'host')
    pendingGame(state, { owner: 'live-runner', lease_until: new Date(Date.now() + 120_000).toISOString() })
    state.events.length = 0

    const res = await clearWordRushSessionData(client, GAME)
    expect(res.error).toBeDefined()
    expect(state.events.filter((e) => e.startsWith('delete:'))).toEqual([])
    expect(state.events).not.toContain('bookkeeping')
    expect(state.session.round_finalize).not.toBeNull()
  })

  it('a runner that died mid-bookkeeping is recovered: lease expires, bookkeeping re-runs, THEN Play Again resets', async () => {
    const { client, state } = makeStatefulClient({ failAnswerReads: 1 })
    await processWordRushEndRoundEarly(client, GAME, 'host')
    pendingGame(state, { owner: 'dead-runner', lease_until: new Date(Date.now() - 1000).toISOString() })
    state.events.length = 0

    expect(await clearWordRushSessionData(client, GAME)).toEqual({})
    const bookkeeping = state.events.indexOf('bookkeeping')
    const firstDelete = state.events.findIndex((e) => e.startsWith('delete:'))
    expect(bookkeeping).toBeGreaterThanOrEqual(0)
    expect(firstDelete).toBeGreaterThan(bookkeeping)
    expect(state.game.finish_bookkeeping).toBeNull()
  })

  it('covers a finish that never went through the round finalizer (admin / idle reaper): Play Again recovers it too', async () => {
    // No round_finalize marker at all — the game was finished by adminEndGame, which still recorded the marker.
    const { client, state } = makeStatefulClient()
    state.session.round_finalize = null
    pendingGame(state, { owner: 'idle-reaper', lease_until: new Date(Date.now() + 120_000).toISOString() })
    state.events.length = 0
    expect((await clearWordRushSessionData(client, GAME)).error).toBeDefined() // reaper still running
    expect(state.events.filter((e) => e.startsWith('delete:'))).toEqual([])

    pendingGame(state, { owner: 'idle-reaper', lease_until: new Date(Date.now() - 1000).toISOString() }) // it died
    expect(await clearWordRushSessionData(client, GAME)).toEqual({})
    expect(state.events.indexOf('bookkeeping')).toBeLessThan(state.events.findIndex((e) => e.startsWith('delete:')))
  })

  it('a failed trophy snapshot is retried, not declared done: the marker stays and Play Again refuses until it succeeds', async () => {
    const { client, state } = makeStatefulClient({ failFactsReads: 1 })
    await processWordRushEndRoundEarly(client, GAME, 'host')
    // The snapshot failed: the game is finished but its bookkeeping is still owed, and so is the round marker.
    expect(state.game.status).toBe('finished')
    expect(state.game.finish_bookkeeping).toMatchObject({ attempts: 1 })
    expect(state.session.round_finalize).not.toBeNull()
    state.events.length = 0

    // The next attempt (the finalize endpoint / cron / Play Again) succeeds and only then clears everything.
    expect(await clearWordRushSessionData(client, GAME)).toEqual({})
    expect(state.game.finish_bookkeeping).toBeNull()
    expect(state.session.round_finalize).toBeNull()
    expect(state.events.indexOf('complete')).toBeLessThan(state.events.findIndex((e) => e.startsWith('delete:')))
  })

  it('gives up after the attempt cap without blocking Play Again, and the failure record survives replay and the next finish', async () => {
    const { client, state } = makeStatefulClient({ failFactsReads: 1000 })
    await processWordRushEndRoundEarly(client, GAME, 'host')
    const firstFinish = (state.game.finish_bookkeeping as Record<string, unknown>).finished_at
    for (let i = 0; i < 10 && state.game.finish_bookkeeping; i++) await recoverFinishBookkeeping(client, GAME)

    // The marker is dropped (nothing blocks the replay), but WHICH finish lost its bookkeeping is on record.
    expect(state.game.finish_bookkeeping).toBeNull()
    expect(state.events).toContain('gave_up')
    expect(state.failures).toEqual([{ finished_at: firstFinish, attempts: 5 }])
    expect(await recoverAllFinishBookkeeping(client)).toEqual({ recovered: 0, pending: 0, failed: 0 })
    expect(await clearWordRushSessionData(client, GAME)).toEqual({})

    // Play Again reuses the game id: the next game's finish writes its own marker and the old record stays.
    state.failFactsReads = 0
    state.game.status = 'active'
    await new Promise((r) => setTimeout(r, 5)) // a later finished_at than the first generation
    const next = await markGameFinished(client, GAME, new Date().toISOString(), { trackBookkeeping: true })
    expect(next).toMatchObject({ won: true, bookkeeping: 'done' })
    expect(state.game.finish_bookkeeping).toBeNull()
    expect(state.failures).toEqual([{ finished_at: firstFinish, attempts: 5 }]) // survives, per generation
  })

  it('renewal errors never consume bookkeeping attempts: no reset while they last, and a later success runs the bookkeeping first', async () => {
    const { client, state } = makeStatefulClient({ failRenewals: 12 }) // more errors than the attempt cap (5)
    await processWordRushEndRoundEarly(client, GAME, 'host')
    state.events.length = 0
    let succeeded = false
    for (let i = 0; i < 30 && !succeeded; i++) {
      const res = await clearWordRushSessionData(client, GAME)
      if (res.error) {
        // While renewals fail nothing has run, so nothing may be deleted and nothing may be given up on.
        expect(state.events.filter((e) => e.startsWith('delete:'))).toEqual([])
        expect(state.events).not.toContain('gave_up')
      } else {
        succeeded = true
      }
    }
    expect(succeeded).toBe(true)
    expect(state.failures).toEqual([]) // never recorded as a failed bookkeeping
    // The reset only happened after the bookkeeping genuinely ran and completed.
    expect(state.events.indexOf('bookkeeping')).toBeGreaterThanOrEqual(0)
    expect(state.events.indexOf('complete')).toBeLessThan(state.events.findIndex((e) => e.startsWith('delete:')))
  })

  it('a runner that outlived its lease neither clears the marker nor reports success', async () => {
    const { client, state } = makeStatefulClient({ failAnswerReads: 1 })
    await processWordRushEndRoundEarly(client, GAME, 'host')
    pendingGame(state, {}) // owed, no live lease: the resume below will claim it
    const staged = stageTakeoverDuringBookkeeping(client, state)
    state.events.length = 0

    const res = await resumeWordRushFinalization(client, GAME)
    expect(staged()).toBe(true)
    expect(res.error).toBeDefined() // its complete found another owner: not taken for completion
    expect(state.game.finish_bookkeeping).toMatchObject({ owner: 'someone-else' }) // not wiped
    expect(state.session.round_finalize).not.toBeNull()
    expect(state.events.filter((e) => e.startsWith('delete:'))).toEqual([])
  })

  it('Play Again aborts when the bookkeeping it recovers loses its lease to another runner mid-way', async () => {
    const { client, state } = makeStatefulClient()
    state.session.round_finalize = null
    pendingGame(state, {})
    const staged = stageTakeoverDuringBookkeeping(client, state)
    state.events.length = 0

    const res = await clearWordRushSessionData(client, GAME)
    expect(staged()).toBe(true)
    expect(res.error).toBeDefined()
    expect(state.events.filter((e) => e.startsWith('delete:'))).toEqual([])
    expect(state.game.finish_bookkeeping).toMatchObject({ owner: 'someone-else' })
  })

  it('the cron sweep recovers owed bookkeeping for finished games with no client involved', async () => {
    const { client, state } = makeStatefulClient()
    state.session.round_finalize = null
    pendingGame(state, { owner: 'dead-runner', lease_until: new Date(Date.now() - 1000).toISOString() })
    expect(await recoverAllFinishBookkeeping(client)).toEqual({ recovered: 1, pending: 0, failed: 0 })
    expect(state.game.finish_bookkeeping).toBeNull()
  })

  it("an overlapping unguarded tracked finish (admin / host) cannot replace a live finalizer's marker", async () => {
    const { client, state } = makeStatefulClient({ failAnswerReads: 1 })
    await processWordRushEndRoundEarly(client, GAME, 'host')
    const liveLease = new Date(Date.now() + 120_000).toISOString()
    pendingGame(state, { owner: 'finalizer', lease_until: liveLease })
    const before = JSON.stringify(state.game.finish_bookkeeping)
    state.events.length = 0

    // adminEndGame read the game while it was active, then the finalizer finished it; now admin's update runs.
    const res = await markGameFinished(client, GAME, new Date().toISOString(), { trackBookkeeping: true })
    expect(res.won).toBe(false)
    expect(JSON.stringify(state.game.finish_bookkeeping)).toBe(before) // owner and lease untouched
    expect(state.events).not.toContain('claim')
    expect(state.events).not.toContain('bookkeeping')
  })

  it('a host/admin finish of a still-active game flips it with the marker and runs the bookkeeping once', async () => {
    const { client, state } = makeStatefulClient()
    state.session.round_finalize = null
    const res = await markGameFinished(client, GAME, new Date().toISOString(), { trackBookkeeping: true })
    expect(res).toMatchObject({ won: true, bookkeeping: 'done' })
    expect(state.game.status).toBe('finished')
    expect(state.game.finish_bookkeeping).toBeNull()
    expect(state.events.filter((e) => e === 'bookkeeping')).toHaveLength(1)
  })
})

describe('processWordRushPrompt claims the prompt for the setter it checked', () => {
  const promptSession = {
    ...session,
    id: 'S-1',
    status: 'active',
    phase: 'awaiting_prompt',
    prompt_mode: 'manual',
    prompt_setter_player_id: 'a',
    roster: ['a', 'b'],
    used_pairs: [],
    round_finalize: null,
    current_round: 1,
    difficulty: 'easy',
  }

  function client(claimMatches: boolean, afterClaim: Record<string, unknown>) {
    const claimFilters: Array<[string, unknown]> = []
    let reads = 0
    const c = {
      from: () => {
        let updating = false
        const api: Record<string, unknown> = {}
        api.select = () => api
        api.update = () => {
          updating = true
          return api
        }
        api.eq = (k: string, v: unknown) => {
          if (updating) claimFilters.push([k, v])
          return api
        }
        api.maybeSingle = async () => ({
          data: reads++ === 0 ? promptSession : { ...promptSession, ...afterClaim },
          error: null,
        })
        api.then = (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: claimMatches ? [{ id: 'S-1' }] : [], error: null }).then(res)
        return api
      },
    } as unknown as SupabaseClient
    return { c, claimFilters }
  }

  it('the claim names the requesting setter, so a setter change in between matches no row', async () => {
    const { c, claimFilters } = client(true, {})
    expect(await processWordRushPrompt(c, GAME, 'a', 'c', 't')).toEqual({})
    expect(claimFilters).toContainEqual(['prompt_setter_player_id', 'a'])
    expect(claimFilters).toContainEqual(['id', 'S-1'])
  })

  it('a refused claim from a removed setter says so (not "Prompt already set")', async () => {
    const { c } = client(false, { prompt_setter_player_id: 'b' })
    expect(await processWordRushPrompt(c, GAME, 'a', 'c', 't')).toEqual({
      error: 'Only the prompt setter can enter letters',
    })
  })

  it('a refused claim on a prompt that was already set keeps the existing message', async () => {
    const { c } = client(false, { phase: 'playing' })
    expect(await processWordRushPrompt(c, GAME, 'a', 'c', 't')).toEqual({ error: 'Prompt already set' })
  })
})
