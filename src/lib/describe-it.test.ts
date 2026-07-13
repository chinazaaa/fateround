import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  describeItPlayableTeams,
  describeItRoleLeaderboards,
  describerForIndividualTurn,
  nextIndividualDescriberIndex,
  nextPlayableTeamIndex,
  processDescribeItAdvance,
} from './describe-it'

describe('describeItPlayableTeams / nextPlayableTeamIndex', () => {
  it('lists only teams with at least a describer + a guesser (2 members)', () => {
    const roster = new Map([
      [1, ['A', 'B']],
      [2, ['C']],
      [3, ['D', 'E', 'F']],
    ])
    expect(describeItPlayableTeams(roster, 3)).toEqual([1, 3])
  })

  it('skips a collapsed team when finding the next turn', () => {
    // 3 teams, 2 rounds → turns 0..5 map to teams 1,2,3,1,2,3. Team 2 collapsed.
    const playable = new Set([1, 3])
    // From turn 1 (team 2) → skip to turn 2 (team 3).
    expect(nextPlayableTeamIndex(1, 3, 2, playable)).toBe(2)
    // From turn 4 (team 2) → skip to turn 5 (team 3).
    expect(nextPlayableTeamIndex(4, 3, 2, playable)).toBe(5)
  })

  it('returns the total (match over) when no team is playable', () => {
    // No team can field a turn → run off the end (caller treats as match over).
    expect(nextPlayableTeamIndex(1, 3, 2, new Set())).toBe(6)
  })

  it('returns startIndex when its own team is still playable', () => {
    // turn 2 → team 3, which is playable, so no skip.
    expect(nextPlayableTeamIndex(2, 3, 2, new Set([1, 3]))).toBe(2)
  })
})

describe('describeItRoleLeaderboards', () => {
  const players = [
    { id: 'A', name: 'Ann' },
    { id: 'B', name: 'Bob' },
    { id: 'C', name: 'Cid' },
  ]
  // roster A,B,C over 2 rounds → turns: 0=A 1=B 2=C 3=A 4=B 5=C describe.
  const roster = ['A', 'B', 'C']

  it('splits guesser and describer points from the raw scored guesses', () => {
    const at = '2026-01-01T00:00:00Z'
    const guesses = [
      // Turn 0 (A describes): B and C guess correctly.
      { player_id: 'B', turn_index: 0, points: 30, created_at: at },
      { player_id: 'C', turn_index: 0, points: 20, created_at: at },
      // Turn 1 (B describes): A guesses.
      { player_id: 'A', turn_index: 1, points: 40, created_at: at },
      // Turn 2 (C describes): A guesses.
      { player_id: 'A', turn_index: 2, points: 10, created_at: at },
    ]
    const { guessers, describers } = describeItRoleLeaderboards(guesses, roster, players)

    // Guesser totals: A=50, B=30, C=20.
    expect(guessers.map((g) => [g.id, g.score])).toEqual([
      ['A', 50],
      ['B', 30],
      ['C', 20],
    ])
    // Describer totals: A earned 30+20=50 (turn 0), B earned 40 (turn 1), C earned 10 (turn 2).
    expect(describers.map((d) => [d.id, d.score])).toEqual([
      ['A', 50],
      ['B', 40],
      ['C', 10],
    ])
  })

  it('ignores unscored (team-mode) guesses and excludes spectators', () => {
    const guesses = [
      { player_id: 'B', turn_index: 0, points: 0, created_at: '2026-01-01T00:00:00Z' }, // team-mode: points 0 → ignored
      { player_id: 'C', turn_index: 0, points: 15, created_at: '2026-01-01T00:00:00Z' },
    ]
    const withSpectator = [...players, { id: 'S', name: 'Spec', spectator: true }]
    const { guessers, describers } = describeItRoleLeaderboards(guesses, roster, withSpectator)
    expect(guessers.find((g) => g.id === 'S')).toBeUndefined()
    expect(guessers[0]).toEqual({ id: 'C', name: 'Cid', score: 15 })
    // A described turn 0, so A gets C's 15 describer points.
    expect(describers[0]).toEqual({ id: 'A', name: 'Ann', score: 15 })
  })
})

describe('nextIndividualDescriberIndex', () => {
  const roster = ['A', 'B', 'C'] // rounds=2 → 6 turns: A B C A B C
  const total = 6

  it('keeps the next turn when its describer is still present', () => {
    const live = new Set(roster)
    // After A's turn (index 0), index 1 is B who is present.
    expect(nextIndividualDescriberIndex(roster, 1, live, total)).toBe(1)
  })

  it('skips a turn whose describer has left, landing on the next live describer', () => {
    const live = new Set(['A', 'C']) // B left mid-game
    // From index 1 (B) → skip to index 2 (C), who is present.
    expect(nextIndividualDescriberIndex(roster, 1, live, total)).toBe(2)
    // B's round-2 slot (index 4) is also skipped → index 5 (C).
    expect(nextIndividualDescriberIndex(roster, 4, live, total)).toBe(5)
  })

  it('skips several consecutive departed describers', () => {
    const live = new Set(['A']) // only A remains
    // From index 1: B(1) and C(2) gone → A again at index 3.
    expect(nextIndividualDescriberIndex(roster, 1, live, total)).toBe(3)
  })

  it('returns totalTurns (match over) when no live describer remains', () => {
    const live = new Set<string>() // everyone left
    expect(nextIndividualDescriberIndex(roster, 1, live, total)).toBe(total)
  })

  it('returns totalTurns when the only remaining turns belong to departed players', () => {
    const live = new Set(['A']) // A already had both turns (indices 0 and 3)
    // Starting after A's final turn, only B/C slots (4, 5) remain — both gone.
    expect(nextIndividualDescriberIndex(roster, 4, live, total)).toBe(total)
  })

  it('never returns a turn whose rostered describer is absent', () => {
    const live = new Set(['B'])
    const idx = nextIndividualDescriberIndex(roster, 0, live, total)
    expect(idx).toBeLessThan(total)
    expect(describerForIndividualTurn(roster, idx)).toBe('B')
  })
})

/**
 * Minimal Supabase stand-in for processDescribeItAdvance. Each builder method is
 * chainable and awaitable (and exposes maybeSingle), mirroring supabase-js. The
 * `describe_it_sessions` UPDATE result is supplied per-call so a test can make the
 * first claim fail (e.g. an FK violation) and a later one succeed.
 */
function makeAdvanceSupabase(sessionUpdateResults: Array<{ error: unknown }>) {
  const sessionRow = {
    status: 'active',
    phase: 'break',
    break_deadline_at: new Date(Date.now() - 1000).toISOString(),
    turn_index: 0,
    mode: 'individual',
    roster: ['A', 'B', 'C'],
    num_teams: 0,
    total_rounds: 2,
    turn_seconds: 90,
    used_words: [],
  }
  let sessionUpdates = 0
  function from(table: string) {
    const ctx = { table, isUpdate: false }
    const result = () => {
      if (table === 'describe_it_sessions' && ctx.isUpdate) {
        return Promise.resolve(sessionUpdateResults[sessionUpdates++] ?? { error: null })
      }
      if (table === 'describe_it_sessions') return Promise.resolve({ data: sessionRow, error: null })
      if (table === 'describe_it_players') {
        return Promise.resolve({
          data: [
            { player_id: 'A', team: 1 },
            { player_id: 'B', team: 1 },
            { player_id: 'C', team: 1 },
          ],
          error: null,
        })
      }
      if (table === 'games') return Promise.resolve({ data: { question_source: 'platform' }, error: null })
      if (table === 'players') return Promise.resolve({ data: { name: 'Bob' }, error: null })
      return Promise.resolve({ data: null, error: null })
    }
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: () => {
        ctx.isUpdate = true
        return chain
      },
      eq: () => chain,
      order: () => chain,
      is: () => chain,
      maybeSingle: () => result(),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => result().then(res, rej),
    }
    return chain
  }
  return { supabase: { from } as unknown as SupabaseClient, sessionUpdateCount: () => sessionUpdates }
}

describe('processDescribeItAdvance — departed describer race', () => {
  const FK = { code: '23503', message: 'insert or update ... violates foreign key constraint' }

  it('retries once on an FK violation (describer left mid-advance) and resolves', async () => {
    const m = makeAdvanceSupabase([{ error: FK }, { error: null }])
    const r = await processDescribeItAdvance(m.supabase, 'GAME', { force: true })
    expect(r).toEqual({})
    expect(m.sessionUpdateCount()).toBe(2) // first claim trips the FK, retry succeeds
  })

  it('maps a non-recoverable write failure to an internal (5xx) error without leaking it', async () => {
    const dbError = { code: '08006', message: 'connection failure to db host' }
    const m = makeAdvanceSupabase([{ error: dbError }, { error: dbError }])
    const r = await processDescribeItAdvance(m.supabase, 'GAME', { force: true })
    expect(r.internal).toBe(true)
    expect(r.error).toBeTruthy()
    expect(r.error).not.toContain('connection failure') // raw message never surfaced
    expect(m.sessionUpdateCount()).toBe(1) // non-FK error is not retried
  })
})
