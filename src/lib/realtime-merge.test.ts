import { describe, expect, it } from 'vitest'
import type { Game } from '@/types'
import { mergeRealtimeGame } from './realtime-merge'

function game(overrides: Partial<Game>): Game {
  return { id: 'G1', status: 'active', current_round_number: 1, ...overrides } as Game
}

describe('mergeRealtimeGame', () => {
  it('returns the incoming row unchanged when there is no previous game', () => {
    const next = game({ custom_questions: [1, 2, 3] })
    expect(mergeRealtimeGame(null, next)).toBe(next)
  })

  // The bug: a round advance UPDATEs current_round_number, and realtime drops the unchanged
  // TOAST-ed custom_questions (arrives null). Preserve the pool from the previous state.
  it('preserves custom_questions when the realtime payload dropped it (null)', () => {
    const prev = game({ custom_questions: ['q1', 'q2'], current_round_number: 1 })
    const next = game({ custom_questions: null, current_round_number: 2 })
    const merged = mergeRealtimeGame(prev, next)
    expect(merged.custom_questions).toEqual(['q1', 'q2'])
    expect(merged.current_round_number).toBe(2) // the real change still applies
  })

  it('preserves ai_generated_questions and custom_slots on null', () => {
    const prev = game({
      ai_generated_questions: { questions: ['a'] } as unknown as Game['ai_generated_questions'],
      custom_slots: { slots: ['x'] } as unknown as Game['custom_slots'],
    })
    const next = game({ ai_generated_questions: null, custom_slots: null })
    const merged = mergeRealtimeGame(prev, next)
    expect(merged.ai_generated_questions).toEqual(prev.ai_generated_questions)
    expect(merged.custom_slots).toEqual(prev.custom_slots)
  })

  it('takes the incoming value when it is present (a real edit, not a dropped column)', () => {
    const prev = game({ custom_questions: ['old'] })
    const next = game({ custom_questions: ['new'] })
    expect(mergeRealtimeGame(prev, next).custom_questions).toEqual(['new'])
  })

  it('leaves a legitimately-null column null when the previous was also null', () => {
    const merged = mergeRealtimeGame(game({ custom_questions: null }), game({ custom_questions: null }))
    expect(merged.custom_questions == null).toBe(true)
  })
  // A publication column list (see 20261110120000 for monopoly_boards) makes Realtime deliver
  // ONLY the listed columns — the rest are absent from the payload object, not null. Absent must
  // never overwrite a known value, or narrowing a publication silently blanks client state.
  it('keeps columns the payload omits entirely, rather than blanking them', () => {
    const prev = game({ title: 'Game night', uno_stacking: true } as Partial<Game>)
    const merged = mergeRealtimeGame(prev, { id: 'G1', status: 'finished' } as Partial<Game>)
    expect(merged.title).toBe('Game night')
    expect((merged as unknown as Record<string, unknown>).uno_stacking).toBe(true)
    expect(merged.status).toBe('finished')
  })

  // Only the TOAST-prone jsonb columns treat null as "unchanged". An ordinary column's null is a
  // real clear — play-again resets finished_at — and must win.
  it('honours a genuine null on an ordinary column', () => {
    const prev = game({ finished_at: '2026-01-01T00:00:00Z' } as Partial<Game>)
    const merged = mergeRealtimeGame(prev, { finished_at: null } as unknown as Partial<Game>)
    expect(merged.finished_at).toBeNull()
  })
})
