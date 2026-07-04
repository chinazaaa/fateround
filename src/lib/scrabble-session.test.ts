import { describe, it, expect } from 'vitest'
import {
  clampScrabbleTimer,
  clampScrabbleGameDuration,
  clampScrabbleTimeExtension,
  clampScrabbleClockSeconds,
  parseScrabbleClockMode,
  formatScrabbleClock,
  formatScrabbleGameDuration,
  scrabbleGameSessionExpired,
  processScrabbleExpireTurn,
  SCRABBLE_TIMER_OPTIONS,
  SCRABBLE_GAME_DURATION_OPTIONS,
  SCRABBLE_GAME_TIME_EXTENSION_OPTIONS,
  SCRABBLE_CLOCK_OPTIONS,
  SCRABBLE_DEFAULT_CLOCK_SECONDS,
} from './scrabble'

describe('clampScrabbleTimer', () => {
  it('keeps an allowed option', () => {
    for (const opt of SCRABBLE_TIMER_OPTIONS) expect(clampScrabbleTimer(opt)).toBe(opt)
  })
  it('falls back to 0 for anything else', () => {
    expect(clampScrabbleTimer(45)).toBe(0)
    expect(clampScrabbleTimer('nonsense')).toBe(0)
    expect(clampScrabbleTimer(undefined)).toBe(0)
    expect(clampScrabbleTimer(null)).toBe(0)
  })
  it('coerces numeric strings', () => {
    expect(clampScrabbleTimer('60')).toBe(60)
  })
})

describe('clampScrabbleGameDuration', () => {
  it('keeps an allowed option', () => {
    for (const opt of SCRABBLE_GAME_DURATION_OPTIONS) expect(clampScrabbleGameDuration(opt)).toBe(opt)
  })
  it('falls back to 0 for disallowed / missing', () => {
    expect(clampScrabbleGameDuration(999)).toBe(0)
    expect(clampScrabbleGameDuration(undefined)).toBe(0)
    expect(clampScrabbleGameDuration('abc')).toBe(0)
  })
})

describe('clampScrabbleTimeExtension', () => {
  it('keeps an allowed option', () => {
    for (const opt of SCRABBLE_GAME_TIME_EXTENSION_OPTIONS) expect(clampScrabbleTimeExtension(opt)).toBe(opt)
  })
  it('falls back to 0 for disallowed / missing', () => {
    expect(clampScrabbleTimeExtension(0)).toBe(0) // 0 isn't an extension option
    expect(clampScrabbleTimeExtension(120)).toBe(0)
    expect(clampScrabbleTimeExtension(undefined)).toBe(0)
  })
})

describe('formatScrabbleGameDuration', () => {
  it('describes "no limit" for zero / negative', () => {
    expect(formatScrabbleGameDuration(0)).toBe('No limit')
    expect(formatScrabbleGameDuration(-5)).toBe('No limit')
  })
  it('formats whole hours', () => {
    expect(formatScrabbleGameDuration(3600)).toBe('1 hour')
    expect(formatScrabbleGameDuration(7200)).toBe('2 hours')
  })
  it('formats sub-hour durations in minutes', () => {
    expect(formatScrabbleGameDuration(1800)).toBe('30 minutes')
    expect(formatScrabbleGameDuration(5400)).toBe('90 minutes')
  })
})

describe('scrabbleGameSessionExpired', () => {
  it('is never expired with no limit or no start time', () => {
    expect(scrabbleGameSessionExpired(new Date().toISOString(), 0)).toBe(false)
    expect(scrabbleGameSessionExpired(new Date().toISOString(), null)).toBe(false)
    expect(scrabbleGameSessionExpired(null, 3600)).toBe(false)
  })
  it('is expired once elapsed exceeds the duration', () => {
    // started two hours ago, 30-minute limit → expired
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    expect(scrabbleGameSessionExpired(twoHoursAgo, 1800)).toBe(true)
  })
  it('is not expired while still within the duration', () => {
    const tenSecondsAgo = new Date(Date.now() - 10 * 1000).toISOString()
    expect(scrabbleGameSessionExpired(tenSecondsAgo, 3600)).toBe(false)
  })
})

// ── Chess-clock mode ──────────────────────────────────────────────────────────

describe('clampScrabbleClockSeconds', () => {
  it('keeps an allowed option', () => {
    for (const opt of SCRABBLE_CLOCK_OPTIONS) expect(clampScrabbleClockSeconds(opt)).toBe(opt)
  })
  it('falls back to the default for disallowed / missing', () => {
    expect(clampScrabbleClockSeconds(45)).toBe(SCRABBLE_DEFAULT_CLOCK_SECONDS)
    expect(clampScrabbleClockSeconds(0)).toBe(SCRABBLE_DEFAULT_CLOCK_SECONDS)
    expect(clampScrabbleClockSeconds(undefined)).toBe(SCRABBLE_DEFAULT_CLOCK_SECONDS)
  })
  it('coerces numeric strings', () => {
    expect(clampScrabbleClockSeconds('600')).toBe(600)
  })
})

describe('parseScrabbleClockMode', () => {
  it('recognizes chess', () => {
    expect(parseScrabbleClockMode('chess')).toBe('chess')
  })
  it('defaults everything else to standard', () => {
    expect(parseScrabbleClockMode('standard')).toBe('standard')
    expect(parseScrabbleClockMode(undefined)).toBe('standard')
    expect(parseScrabbleClockMode('nonsense')).toBe('standard')
  })
})

describe('formatScrabbleClock', () => {
  it('formats mm:ss and zero-pads seconds', () => {
    expect(formatScrabbleClock(600)).toBe('10:00')
    expect(formatScrabbleClock(65)).toBe('1:05')
    expect(formatScrabbleClock(9)).toBe('0:09')
  })
  it('never goes negative', () => {
    expect(formatScrabbleClock(-5)).toBe('0:00')
  })
})

// A small stateful fake of the Supabase calls the chess-clock engine makes. Mutations
// (session CAS updates, per-player state updates, the games finish flag) land on the
// shared `session` / `states` / `games` objects so tests can assert on them directly.
type Row = Record<string, unknown>
function makeChessSupabase(init: {
  clockSeconds: number
  session: Row
  states: Row[]
  players: { id: string; name: string }[]
}) {
  const games: Row = {
    id: 'G',
    timer_seconds: 0,
    scrabble_dictionary_id: 'enable',
    scrabble_clock_mode: 'chess',
    scrabble_clock_seconds: init.clockSeconds,
    status: 'active',
    tournament_id: null,
  }
  const { session, states, players } = init
  let bump = 0

  function builder(table: string) {
    let op: 'select' | 'update' | 'insert' | 'delete' = 'select'
    let payload: Row | Row[] | null = null
    const filters: Row = {}
    const b: Record<string, unknown> = {
      select: () => b,
      update: (p: Row) => ((op = 'update'), (payload = p), b),
      insert: (p: Row) => ((op = 'insert'), (payload = p), b),
      delete: () => ((op = 'delete'), b),
      eq: (col: string, val: unknown) => ((filters[col] = val), b),
      order: () => b,
      maybeSingle: () => Promise.resolve(single()),
      then: (res: (v: Row) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(many()).then(res, rej),
    }
    function single(): Row {
      if (table === 'scrabble_sessions') return { data: { ...session }, error: null }
      if (table === 'games') return { data: { ...games }, error: null }
      return { data: null, error: null }
    }
    function many(): Row {
      if (op === 'update' && table === 'scrabble_sessions') {
        // CAS on updated_at — mirror persistSession's optimistic-concurrency claim.
        if (filters.updated_at !== undefined && filters.updated_at !== session.updated_at)
          return { data: [], error: null }
        Object.assign(session, payload as Row)
        session.updated_at = `u${++bump}`
        return { data: [{ game_id: 'G' }], error: null }
      }
      if (op === 'update' && table === 'scrabble_player_state') {
        const st = states.find((s) => s.id === filters.id)
        if (st) Object.assign(st, payload as Row)
        return { data: [{}], error: null }
      }
      if (op === 'update' && table === 'games') {
        Object.assign(games, payload as Row)
        return { data: [{ id: 'G' }], error: null }
      }
      if (op === 'select' && table === 'scrabble_player_state')
        return { data: states.map((s) => ({ ...s })), error: null }
      if (op === 'select' && table === 'players') return { data: players.map((p) => ({ ...p })), error: null }
      return { data: [], error: null }
    }
    return b
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: { from: (t: string) => builder(t) } as any, session, states, games }
}

function chessSession(overrides: Row): Row {
  return {
    id: 'S',
    game_id: 'G',
    turn_order: ['A', 'B'],
    current_turn_index: 0,
    board: [],
    bag: [],
    phase: 'playing',
    consecutive_passes: 0,
    last_move: null,
    winner_player_id: null,
    is_tie: false,
    status_message: '',
    turn_deadline_at: null,
    clock_mode: 'chess',
    turn_started_at: new Date(Date.now() - 60_000).toISOString(), // this turn started 60s ago
    updated_at: 'u0',
    created_at: 'c',
    ...overrides,
  }
}

describe('processScrabbleExpireTurn — chess-clock flag-out', () => {
  it('flags the timed-out player and passes the turn to the next player still on the clock', async () => {
    const { supabase, session, states } = makeChessSupabase({
      clockSeconds: 300,
      players: [
        { id: 'A', name: 'Alice' },
        { id: 'B', name: 'Bob' },
      ],
      session: chessSession({ current_turn_index: 0 }),
      states: [
        {
          id: 'sa',
          game_id: 'G',
          player_id: 'A',
          rack: ['A'],
          score: 10,
          player_order: 0,
          clock_ms_remaining: 5_000,
          timed_out: false,
        },
        {
          id: 'sb',
          game_id: 'G',
          player_id: 'B',
          rack: ['B'],
          score: 3,
          player_order: 1,
          clock_ms_remaining: 200_000,
          timed_out: false,
        },
      ],
    })

    await processScrabbleExpireTurn(supabase, 'G')

    const a = states.find((s) => s.id === 'sa') as Row
    expect(a.timed_out).toBe(true)
    expect(a.clock_ms_remaining).toBe(0)
    expect(session.phase).toBe('playing') // Bob is still on the clock
    expect(session.current_turn_index).toBe(1)
  })

  it('ends the game when the last clock expires — highest score wins', async () => {
    const { supabase, session, games } = makeChessSupabase({
      clockSeconds: 300,
      players: [
        { id: 'A', name: 'Alice' },
        { id: 'B', name: 'Bob' },
      ],
      // Alice already flagged out; Bob is the last on the clock and now runs out too.
      session: chessSession({ current_turn_index: 1 }),
      states: [
        {
          id: 'sa',
          game_id: 'G',
          player_id: 'A',
          rack: [],
          score: 40,
          player_order: 0,
          clock_ms_remaining: 0,
          timed_out: true,
        },
        {
          id: 'sb',
          game_id: 'G',
          player_id: 'B',
          rack: [],
          score: 12,
          player_order: 1,
          clock_ms_remaining: 2_000,
          timed_out: false,
        },
      ],
    })

    await processScrabbleExpireTurn(supabase, 'G')

    expect(session.phase).toBe('finished')
    expect(session.winner_player_id).toBe('A') // 40 > 12, empty racks so no penalty swing
    expect(games.status).toBe('finished')
  })

  it('does nothing when the active player still has time (guards a premature client fire)', async () => {
    const { supabase, session, states } = makeChessSupabase({
      clockSeconds: 300,
      players: [
        { id: 'A', name: 'Alice' },
        { id: 'B', name: 'Bob' },
      ],
      // Turn started 60s ago but Alice has 200s banked — not actually expired.
      session: chessSession({ current_turn_index: 0 }),
      states: [
        {
          id: 'sa',
          game_id: 'G',
          player_id: 'A',
          rack: ['A'],
          score: 10,
          player_order: 0,
          clock_ms_remaining: 200_000,
          timed_out: false,
        },
        {
          id: 'sb',
          game_id: 'G',
          player_id: 'B',
          rack: ['B'],
          score: 3,
          player_order: 1,
          clock_ms_remaining: 200_000,
          timed_out: false,
        },
      ],
    })

    await processScrabbleExpireTurn(supabase, 'G')

    const a = states.find((s) => s.id === 'sa') as Row
    expect(a.timed_out).toBe(false)
    expect(session.phase).toBe('playing')
    expect(session.current_turn_index).toBe(0) // still Alice's turn
  })
})
