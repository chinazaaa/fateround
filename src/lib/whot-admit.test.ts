import { describe, it, expect } from 'vitest'
import { admitWhotPlayer } from './whot'
import type { WhotCard } from '@/types'

// admitWhotPlayer seats a spectator into a live Whot game: append to turn_order, deal a
// hand from the draw pile, flip spectator=false — all guarded so cards are never
// duplicated and went-out/finished players can't be re-dealt-in. These tests pin the
// CAS ordering (claim the session BEFORE materializing the hand), the deal count, the
// reshuffle path, every rejection guard, and the retry-on-lost-race behavior.

type Row = { data: unknown; error: unknown }

function cards(n: number, prefix = 'c'): WhotCard[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, shape: 'circle', number: (i % 13) + 1 }))
}

type Ops = {
  sessionUpdates: Record<string, unknown>[]
  handInserts: Record<string, unknown>[]
  playerUpdates: Record<string, unknown>[]
  handDeletes: number
}

function makeMock(opts: {
  session: unknown
  player: unknown
  casWins: boolean[]
  handError?: unknown
  flipError?: unknown
}) {
  const ops: Ops = { sessionUpdates: [], handInserts: [], playerUpdates: [], handDeletes: 0 }
  let casCall = 0

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
          if (table === 'players') return chain({ data: opts.player, error: null })
          return chain({ data: null, error: null })
        },
        update(vals: Record<string, unknown>) {
          if (table === 'whot_sessions') {
            // Forward CAS claims are gated by casWins; the compensating rollback is a later
            // whot_sessions.update with no casWins entry left, so it just resolves.
            ops.sessionUpdates.push(vals)
            const won = opts.casWins[casCall] ?? false
            casCall += 1
            return chain({ data: won ? [{ game_id: 'G1' }] : [], error: null })
          }
          if (table === 'players') {
            ops.playerUpdates.push(vals)
            return chain({ data: null, error: opts.flipError ?? null })
          }
          return chain({ data: null, error: null })
        },
        insert(vals: Record<string, unknown>) {
          if (table === 'whot_player_hands') ops.handInserts.push(vals)
          return chain({ data: null, error: table === 'whot_player_hands' ? (opts.handError ?? null) : null })
        },
        delete() {
          if (table === 'whot_player_hands') ops.handDeletes += 1
          return chain({ data: null, error: null })
        },
      }
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as any, ops }
}

function baseSession(over: Record<string, unknown> = {}) {
  return {
    game_id: 'G1',
    phase: 'playing',
    turn_order: ['A', 'B', 'C'],
    current_turn_index: 1,
    finish_order: [],
    reshuffle_count: 0,
    draw_pile: cards(10, 'draw'),
    discard_pile: [],
    top_card: { id: 'circle-3', shape: 'circle', number: 3 },
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

const latecomer = { id: 'D', name: 'Dana', spectator: true, is_eliminated: false }

describe('admitWhotPlayer', () => {
  it('seats the spectator, deals 5, flips spectator — and never touches the turn clock', async () => {
    const m = makeMock({ session: baseSession(), player: latecomer, casWins: [true] })
    const res = await admitWhotPlayer(m.supabase, 'G1', 'D', 6)

    expect(res).toEqual({ error: null, status: 200 })
    const patch = m.ops.sessionUpdates[0]
    expect(patch.turn_order).toEqual(['A', 'B', 'C', 'D'])
    expect((patch.draw_pile as WhotCard[]).length).toBe(5) // 10 − 5 dealt
    // The current player's turn + countdown must be preserved.
    expect('current_turn_index' in patch).toBe(false)
    expect('turn_deadline_at' in patch).toBe(false)

    expect(m.ops.handInserts).toHaveLength(1)
    expect(m.ops.handInserts[0].player_id).toBe('D')
    expect((m.ops.handInserts[0].cards as WhotCard[]).length).toBe(5)
    expect(m.ops.handInserts[0].player_order).toBe(3) // appended at end

    expect(m.ops.playerUpdates).toEqual([{ spectator: false }])
  })

  it('deals 5 even when admitting into a heads-up (2→3) table', async () => {
    const m = makeMock({ session: baseSession({ turn_order: ['A', 'B'] }), player: latecomer, casWins: [true] })
    await admitWhotPlayer(m.supabase, 'G1', 'D', 6)
    expect((m.ops.handInserts[0].cards as WhotCard[]).length).toBe(5)
  })

  it('reshuffles the discard pile when the draw pile is short (top_card untouched)', async () => {
    const session = baseSession({ draw_pile: cards(2, 'draw'), discard_pile: cards(10, 'disc') })
    const m = makeMock({ session, player: latecomer, casWins: [true] })
    const res = await admitWhotPlayer(m.supabase, 'G1', 'D', 6)

    expect(res.status).toBe(200)
    expect((m.ops.handInserts[0].cards as WhotCard[]).length).toBe(5)
    expect(String(m.ops.sessionUpdates[0].status_message)).toContain('reshuffled')
    // We pass draw_pile/discard_pile (not the live top_card) to the draw, so top_card is never
    // consumed — the session patch carries no top_card change.
    expect('top_card' in m.ops.sessionUpdates[0]).toBe(false)
  })

  it('blocks when fewer than a full hand can be dealt — no writes', async () => {
    const session = baseSession({ draw_pile: cards(2, 'draw'), discard_pile: cards(1, 'disc') }) // 3 < 5
    const m = makeMock({ session, player: latecomer, casWins: [true] })
    const res = await admitWhotPlayer(m.supabase, 'G1', 'D', 6)

    expect(res.status).toBe(409)
    expect(res.error).toMatch(/Not enough cards/i)
    expect(m.ops.sessionUpdates).toHaveLength(0)
    expect(m.ops.handInserts).toHaveLength(0)
    expect(m.ops.playerUpdates).toHaveLength(0)
  })

  it('rejects a player already seated (covers went-out players) — no writes', async () => {
    const m = makeMock({ session: baseSession({ turn_order: ['A', 'B', 'D'] }), player: latecomer, casWins: [true] })
    const res = await admitWhotPlayer(m.supabase, 'G1', 'D', 6)
    expect(res.status).toBe(400)
    expect(res.error).toMatch(/already seated/i)
    expect(m.ops.sessionUpdates).toHaveLength(0)
  })

  it('rejects a player already in finish_order — no writes', async () => {
    const m = makeMock({ session: baseSession({ finish_order: ['D'] }), player: latecomer, casWins: [true] })
    const res = await admitWhotPlayer(m.supabase, 'G1', 'D', 6)
    expect(res.status).toBe(400)
    expect(res.error).toMatch(/already finished/i)
    expect(m.ops.sessionUpdates).toHaveLength(0)
  })

  it('rejects a non-spectator (already in the game) — no writes', async () => {
    const m = makeMock({ session: baseSession(), player: { ...latecomer, spectator: false }, casWins: [true] })
    const res = await admitWhotPlayer(m.supabase, 'G1', 'D', 6)
    expect(res.status).toBe(400)
    expect(res.error).toMatch(/already in the game/i)
    expect(m.ops.sessionUpdates).toHaveLength(0)
  })

  it('rejects an eliminated player — no writes', async () => {
    const m = makeMock({ session: baseSession(), player: { ...latecomer, is_eliminated: true }, casWins: [true] })
    const res = await admitWhotPlayer(m.supabase, 'G1', 'D', 6)
    expect(res.status).toBe(400)
    expect(res.error).toMatch(/eliminated/i)
    expect(m.ops.sessionUpdates).toHaveLength(0)
  })

  it('blocks while the board is mid-choice (phase !== playing) — no writes', async () => {
    for (const phase of ['choose_whot', 'finished']) {
      const m = makeMock({ session: baseSession({ phase }), player: latecomer, casWins: [true] })
      const res = await admitWhotPlayer(m.supabase, 'G1', 'D', 6)
      expect(res.status).toBe(409)
      expect(m.ops.sessionUpdates).toHaveLength(0)
    }
  })

  it('rejects when the seated count is at the cap — no writes', async () => {
    const session = baseSession({ turn_order: ['A', 'B', 'C', 'E', 'F', 'G'] }) // 6 seated
    const m = makeMock({ session, player: latecomer, casWins: [true] })
    const res = await admitWhotPlayer(m.supabase, 'G1', 'D', 6)
    expect(res.status).toBe(409)
    expect(res.error).toMatch(/full/i)
    expect(m.ops.handInserts).toHaveLength(0)
  })

  it('retries a lost CAS race and inserts the hand exactly once', async () => {
    const m = makeMock({ session: baseSession(), player: latecomer, casWins: [false, true] })
    const res = await admitWhotPlayer(m.supabase, 'G1', 'D', 6)
    expect(res.status).toBe(200)
    expect(m.ops.sessionUpdates).toHaveLength(2) // one lost, one won
    expect(m.ops.handInserts).toHaveLength(1) // hand only materializes after the win
    expect(m.ops.playerUpdates).toHaveLength(1)
  })

  it('gives up after repeated lost races without dealing anyone in', async () => {
    const m = makeMock({ session: baseSession(), player: latecomer, casWins: [false, false, false] })
    const res = await admitWhotPlayer(m.supabase, 'G1', 'D', 6)
    expect(res.status).toBe(409)
    expect(res.error).toMatch(/try again/i)
    expect(m.ops.handInserts).toHaveLength(0)
    expect(m.ops.playerUpdates).toHaveLength(0)
  })

  it('returns 404 when the session is missing — no writes', async () => {
    const m = makeMock({ session: null, player: latecomer, casWins: [true] })
    const res = await admitWhotPlayer(m.supabase, 'G1', 'D', 6)
    expect(res).toEqual({ error: 'Session not found', status: 404 })
    expect(m.ops.sessionUpdates).toHaveLength(0)
    expect(m.ops.handInserts).toHaveLength(0)
  })

  it('returns 404 when the player row is missing — no writes', async () => {
    const m = makeMock({ session: baseSession(), player: null, casWins: [true] })
    const res = await admitWhotPlayer(m.supabase, 'G1', 'D', 6)
    expect(res).toEqual({ error: 'Player not found', status: 404 })
    expect(m.ops.sessionUpdates).toHaveLength(0)
    expect(m.ops.handInserts).toHaveLength(0)
  })

  it('rolls back the seat when the hand insert fails (500) — turn_order + deck restored', async () => {
    const m = makeMock({ session: baseSession(), player: latecomer, casWins: [true], handError: { message: 'boom' } })
    const res = await admitWhotPlayer(m.supabase, 'G1', 'D', 6)

    expect(res.status).toBe(500)
    // Forward claim + compensating rollback.
    expect(m.ops.sessionUpdates).toHaveLength(2)
    expect(m.ops.sessionUpdates[1].turn_order).toEqual(['A', 'B', 'C']) // seat undone
    expect((m.ops.sessionUpdates[1].draw_pile as WhotCard[]).length).toBe(10) // full deck restored
    expect(m.ops.playerUpdates).toHaveLength(0) // never got to the spectator flip
  })

  it('rolls back the seat AND removes the hand when the spectator flip fails (500)', async () => {
    const m = makeMock({ session: baseSession(), player: latecomer, casWins: [true], flipError: { message: 'boom' } })
    const res = await admitWhotPlayer(m.supabase, 'G1', 'D', 6)

    expect(res.status).toBe(500)
    expect(m.ops.handInserts).toHaveLength(1) // hand was inserted before the flip
    expect(m.ops.handDeletes).toBeGreaterThanOrEqual(1) // ...then removed by the rollback
    expect(m.ops.sessionUpdates).toHaveLength(2)
    expect(m.ops.sessionUpdates[1].turn_order).toEqual(['A', 'B', 'C'])
  })
})
