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

/** Fake client: the pre-check sees no row, but the unique index admits only one insert. */
function makeClient() {
  const calls = { inserts: 0, scoreRpcs: 0 }
  let inserted = false
  const client = {
    rpc: (fn: string) => {
      if (fn === 'word_rush_add_score') calls.scoreRpcs++
      return Promise.resolve({ data: null, error: null })
    },
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      let op = 'select'
      const result = () => {
        if (table === 'word_rush_sessions') return { data: op === 'select' ? session : null, error: null }
        if (table === 'word_rush_players') return { data: [{ player_id: 'p1', team: 0, score: 0 }], error: null }
        if (table === 'word_rush_answers' && op === 'insert') {
          calls.inserts++
          if (inserted) return { data: null, error: { code: '23505', message: 'duplicate key' } }
          inserted = true
          return { data: [{ id: 'a1' }], error: null }
        }
        return { data: null, error: null }
      }
      for (const m of ['select', 'eq', 'not', 'order']) q[m] = () => q
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
    expect(calls.inserts).toBe(4)
    expect(calls.scoreRpcs).toBe(1)
  })
})
