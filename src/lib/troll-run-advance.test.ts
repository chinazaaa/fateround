import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { syncTrollRunGameState } from '@/lib/troll-run-advance'

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
