import { describe, it, expect } from 'vitest'
import { processWhotExpireTurn } from './whot'

// The game-duration deadline must be enforced server-side, off the server clock — not
// left to whichever client mounts the timer bar (that fires off the client's clock, so a
// fast/throttled tab or a dropped /expire-whot request lets turns keep advancing past
// time while the display reads 0:00). These tests pin that the turn-expiry path, which
// every viewing client reliably pokes, finalizes the game by lowest hand once the buzzer
// has passed — and leaves an in-time game alone.

type Row = { data: unknown; error: unknown }

function makeMockSupabase(opts: { session: unknown; hands: unknown; game: unknown; players: unknown }) {
  const updates: Array<{ table: string; vals: Record<string, unknown> }> = []

  // Chainable + awaitable stand-in: every builder method returns the same thenable, so
  // .select().eq().eq().order()/.maybeSingle()/.select('…') all resolve to `result`.
  function chain(result: Row): Promise<Row> & Record<string, unknown> {
    const p = Promise.resolve(result) as Promise<Row> & Record<string, unknown>
    p.eq = () => chain(result)
    p.order = () => chain(result)
    p.select = () => chain(result)
    p.maybeSingle = () => Promise.resolve(result)
    return p
  }

  const supabase = {
    from(table: string) {
      return {
        select() {
          if (table === 'whot_sessions') return chain({ data: opts.session, error: null })
          if (table === 'whot_player_hands') return chain({ data: opts.hands, error: null })
          if (table === 'games') return chain({ data: opts.game, error: null })
          if (table === 'players') return chain({ data: opts.players, error: null })
          return chain({ data: null, error: null })
        },
        update(vals: Record<string, unknown>) {
          updates.push({ table, vals })
          // finishWhotByLowestHand's CAS update ends with .select('game_id') and checks
          // for a non-empty data array; return one so it counts as "won the race".
          return chain({ data: [{ game_id: 'GAME1' }], error: null })
        },
      }
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as any, updates }
}

const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString() // an hour ago
const FUTURE = new Date(Date.now() + 60 * 1000).toISOString()

function baseInputs(sessionStartedAt: string, durationSeconds: number) {
  return {
    session: {
      game_id: 'GAME1',
      phase: 'playing',
      turn_order: ['A', 'B'],
      current_turn_index: 0,
      finish_order: [],
      top_card: { id: 'circle-3', shape: 'circle', number: 3 },
      turn_deadline_at: FUTURE, // turn clock NOT due — only the game clock decides here
      updated_at: '2026-01-01T00:00:00.000Z',
      draw_pile: [],
      discard_pile: [],
      pick_two_stack: 0,
      pick_five_stack: 0,
    },
    // A holds a low total (5), B a high total (28). Lowest-hand winner must be A.
    hands: [
      { player_id: 'A', cards: [{ id: 'circle-5', shape: 'circle', number: 5 }], player_order: 0 },
      {
        player_id: 'B',
        cards: [
          { id: 'star-14', shape: 'star', number: 14 },
          { id: 'cross-14', shape: 'cross', number: 14 },
        ],
        player_order: 1,
      },
    ],
    game: {
      timer_seconds: 20,
      game_duration_seconds: durationSeconds,
      session_started_at: sessionStartedAt,
      whot_pick3_enabled: false,
      whot_cards_enabled: false,
      whot_number_calls_enabled: false,
      whot_pick2_stacking: false,
    },
    players: [
      { id: 'A', name: 'Alice' },
      { id: 'B', name: 'Bob' },
    ],
  }
}

describe('processWhotExpireTurn — game-clock enforcement', () => {
  it('finalizes by lowest hand once the game duration has elapsed', async () => {
    const m = makeMockSupabase(baseInputs(PAST, 600)) // started an hour ago, 10-min cap → expired
    const result = await processWhotExpireTurn(m.supabase, 'GAME1')

    expect(result.error).toBeUndefined()
    const finish = m.updates.find((u) => u.table === 'whot_sessions' && u.vals.phase === 'finished')
    expect(finish).toBeTruthy()
    expect(finish!.vals.winner_player_id).toBe('A') // lowest hand total wins
    expect(String(finish!.vals.status_message)).toContain("Time's up!")
    expect(finish!.vals.turn_deadline_at).toBeNull()
    // The game row is flipped to finished too.
    expect(m.updates.some((u) => u.table === 'games' && u.vals.status === 'finished')).toBe(true)
  })

  it('leaves an in-time game running (no finish write)', async () => {
    const m = makeMockSupabase(baseInputs(FUTURE, 600)) // started "now"+, plenty of time left
    const result = await processWhotExpireTurn(m.supabase, 'GAME1')

    // Turn deadline is in the future and the game clock has time left → nothing to do.
    expect(result.skipped).toBe(true)
    expect(m.updates.some((u) => u.table === 'whot_sessions' && u.vals.phase === 'finished')).toBe(false)
  })

  it('does not enforce a game clock when no duration is set (untimed game)', async () => {
    const m = makeMockSupabase(baseInputs(PAST, 0)) // duration 0 → no game cap
    const result = await processWhotExpireTurn(m.supabase, 'GAME1')

    expect(result.skipped).toBe(true)
    expect(m.updates.some((u) => u.table === 'whot_sessions' && u.vals.phase === 'finished')).toBe(false)
  })
})
