import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { reconcileDeathTotals, syncTrollRunGameState } from '@/lib/troll-run-advance'
import { calculateTrollRunDnfScore } from '@/lib/troll-run'

const SESSION_ROW = {
  id: 'session-1',
  game_id: 'GAME',
  phase: 'racing',
  current_round: 1,
  total_rounds: 2,
  current_world: 'pits',
  level_order: [],
  round_time_limit: 120,
  round_started_at: '2026-01-01T00:00:00.000Z',
  turn_deadline_at: '2026-01-01T00:02:00.000Z',
}

const PLAYER_STATES = [
  {
    id: 'state-1',
    player_id: 'player-1',
    deaths: 1,
    levels_cleared: 4,
    total_time_ms: 40_000,
    total_score: 10,
    round_finished: true,
  },
  {
    id: 'state-2',
    player_id: 'player-2',
    deaths: 3,
    levels_cleared: 2,
    total_time_ms: 0,
    total_score: 7,
    round_finished: false,
  },
]

function makeTrollRunSupabase(failuresByStateId: Record<string, number> = {}) {
  const scoreWrites: string[] = []
  const remainingFailures = { ...failuresByStateId }

  function from(table: string) {
    const context = { isUpdate: false, stateId: '' }

    const resolve = () => {
      if (table === 'troll_run_sessions') {
        if (context.isUpdate) return Promise.resolve({ data: [{ id: 'session-1' }], error: null })
        return Promise.resolve({ data: SESSION_ROW, error: null })
      }

      if (table === 'troll_run_player_states') {
        if (!context.isUpdate) return Promise.resolve({ data: PLAYER_STATES, error: null })

        scoreWrites.push(context.stateId)
        const failuresLeft = remainingFailures[context.stateId] ?? 0
        if (failuresLeft > 0) {
          remainingFailures[context.stateId] = failuresLeft - 1
          return Promise.resolve({ data: null, error: { message: 'write rejected' } })
        }
        return Promise.resolve({ data: [{ id: context.stateId }], error: null })
      }

      return Promise.resolve({ data: null, error: null })
    }

    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      range: () => chain,
      update: () => {
        context.isUpdate = true
        return chain
      },
      eq: (column: string, value: unknown) => {
        if (column === 'id') context.stateId = String(value)
        return chain
      },
      maybeSingle: () => resolve(),
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        resolve().then(onFulfilled, onRejected),
    }
    return chain
  }

  return { supabase: { from } as unknown as SupabaseClient, scoreWrites }
}

const writesFor = (scoreWrites: string[], stateId: string) =>
  scoreWrites.filter((written) => written === stateId).length

describe('syncTrollRunGameState — round scoring writes', () => {
  it('scores every player once when the round ends cleanly', async () => {
    const mock = makeTrollRunSupabase()

    const result = await syncTrollRunGameState(mock.supabase, 'GAME', { forceNextRound: false })

    expect(result).toEqual({ ok: true, code: 'finished_round', phase: 'scoreboard' })
    expect(writesFor(mock.scoreWrites, 'state-1')).toBe(1)
    expect(writesFor(mock.scoreWrites, 'state-2')).toBe(1)
  })

  it('retries a rejected score write so one bad write does not lose a placement', async () => {
    const mock = makeTrollRunSupabase({ 'state-2': 1 })

    const result = await syncTrollRunGameState(mock.supabase, 'GAME', { forceNextRound: false })

    expect(result).toEqual({ ok: true, code: 'finished_round', phase: 'scoreboard' })
    expect(writesFor(mock.scoreWrites, 'state-1')).toBe(1)
    expect(writesFor(mock.scoreWrites, 'state-2')).toBe(2)
  })

  it('throws rather than reporting a finished round it could not score', async () => {
    const mock = makeTrollRunSupabase({ 'state-2': 5 })

    await expect(syncTrollRunGameState(mock.supabase, 'GAME', { forceNextRound: false })).rejects.toThrow(
      /left 1 of 2 players unwritten/
    )
    expect(writesFor(mock.scoreWrites, 'state-2')).toBe(2)
  })
})

describe('syncTrollRunGameState — death totals come from the event log', () => {
  it('scores a runner by their logged deaths when the stored total is stale', async () => {
    const roundScores: Record<string, unknown> = {}
    const supabase = {
      from(table: string) {
        let isUpdate = false
        let patch: Record<string, unknown> = {}
        let stateId = ''
        const chain: Record<string, unknown> = {
          select: () => chain,
          order: () => chain,
          range: () => chain,
          update: (p: Record<string, unknown>) => {
            isUpdate = true
            patch = p
            return chain
          },
          eq: (column: string, value: unknown) => {
            if (column === 'id') stateId = String(value)
            return chain
          },
          maybeSingle: () => new Promise((resolve) => (chain.then as (r: (v: unknown) => void) => void)(resolve)),
          then: (resolve: (value: unknown) => unknown) => {
            if (table === 'troll_run_sessions')
              return resolve(
                isUpdate ? { data: [{ id: 'session-1' }], error: null } : { data: SESSION_ROW, error: null }
              )
            if (table === 'troll_run_player_states') {
              if (!isUpdate) return resolve({ data: PLAYER_STATES, error: null })
              if ('round_score' in patch) roundScores[stateId] = patch.round_score
              return resolve({ data: [{ id: stateId }], error: null })
            }
            if (table === 'troll_run_events') {
              // Player 2's row says 3 deaths (a failed total write left it stale in the other
              // direction too); the log holds 1. Player 1 has no logged deaths at all.
              return resolve({ data: [{ player_id: 'player-2' }], error: null })
            }
            return resolve({ data: null, error: null })
          },
        }
        return chain
      },
    } as unknown as SupabaseClient

    await syncTrollRunGameState(supabase, 'GAME', { forceNextRound: false })

    // Player 2 is unfinished (DNF): 2 levels cleared, scored with 1 death (the log), not 3 (the row).
    expect(roundScores['state-2']).toBe(calculateTrollRunDnfScore(2, 1))
    expect(roundScores['state-2']).not.toBe(calculateTrollRunDnfScore(2, 3))
  })
})

describe('reconcileDeathTotals — paging through the death log', () => {
  const states = [
    { id: 's1', player_id: 'p1', deaths: 0 },
    { id: 's2', player_id: 'p2', deaths: 0 },
  ] as unknown as Parameters<typeof reconcileDeathTotals>[3]

  /** A death log served the way PostgREST does: ordered by id, `range` slices it. */
  function eventLog(rows: Array<{ id: string; player_id: string }>, failOnPage?: number) {
    const ranges: Array<[number, number]> = []
    const supabase = {
      from(table: string) {
        let range: [number, number] = [0, 0]
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          range: (a: number, b: number) => {
            range = [a, b]
            ranges.push(range)
            return chain
          },
          update: () => chain,
          then: (resolve: (v: unknown) => unknown) => {
            if (table === 'troll_run_events') {
              if (failOnPage !== undefined && ranges.length === failOnPage) {
                return resolve({ data: null, error: { message: 'read failed' } })
              }
              return resolve({ data: rows.slice(range[0], range[1] + 1), error: null })
            }
            return resolve({ data: null, error: null })
          },
        }
        return chain
      },
    } as unknown as SupabaseClient
    return { supabase, ranges }
  }

  it('counts deaths beyond the first page', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, player_id: i < 5 ? 'p1' : 'p2' }))
    const { supabase, ranges } = eventLog(rows)

    const result = await reconcileDeathTotals(supabase, 'GAME', 1, states, 3)

    expect(result.map((s) => s.deaths)).toEqual([5, 2])
    expect(ranges).toEqual([
      [0, 2],
      [3, 5],
      [6, 8],
    ])
  })

  it('stops after a page that exactly fills the last slot only once an empty page confirms it', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, player_id: 'p1' }))
    const { supabase, ranges } = eventLog(rows)
    const result = await reconcileDeathTotals(supabase, 'GAME', 1, states, 3)
    expect(result[0].deaths).toBe(6)
    expect(ranges).toHaveLength(3)
  })

  it('returns the stored totals untouched when a later page cannot be read', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, player_id: 'p1' }))
    const { supabase } = eventLog(rows, 2)
    const result = await reconcileDeathTotals(supabase, 'GAME', 1, states, 3)
    expect(result).toBe(states)
  })
})
