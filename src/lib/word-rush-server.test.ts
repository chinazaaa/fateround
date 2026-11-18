import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

import { processWordRushSubmit } from './word-rush-server'

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
