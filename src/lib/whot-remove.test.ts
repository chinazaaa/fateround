import { describe, it, expect } from 'vitest'
import { removeWhotPlayer } from './whot'

// removeWhotPlayer drops a leaver from turn_order and ends the game once fewer than
// two players are still IN PLAY. The tricky case: a player who already emptied their
// hand (winner) stays seated in turn_order but lives in finish_order — they are not
// still playing. These tests pin that a finished seat never counts toward "enough
// players to keep going", so a lone survivor isn't left playing against themselves.

type Row = { data: unknown; error: unknown }

function makeMock(opts: { session: unknown; players: { id: string; name: string }[] }) {
  const sessionUpdates: Record<string, unknown>[] = []

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
          if (table === 'games') return chain({ data: { timer_seconds: 0 }, error: null })
          if (table === 'players') return chain({ data: opts.players, error: null })
          return chain({ data: null, error: null })
        },
        update(vals: Record<string, unknown>) {
          if (table === 'whot_sessions') sessionUpdates.push(vals)
          return chain({ data: null, error: null })
        },
        delete() {
          return chain({ data: null, error: null })
        },
      }
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as any, sessionUpdates }
}

const players = [
  { id: 'W', name: 'Winner' },
  { id: 'X', name: 'Xena' },
  { id: 'Y', name: 'Yusuf' },
  { id: 'Z', name: 'Zola' },
]

function session(over: Record<string, unknown> = {}) {
  return {
    game_id: 'G1',
    phase: 'playing',
    turn_order: ['W', 'X', 'Y', 'Z'],
    current_turn_index: 1,
    finish_order: ['W'], // W already emptied their hand and won
    ...over,
  }
}

describe('removeWhotPlayer — finished seats do not count as active players', () => {
  it('ends the game when only a finished winner + one survivor remain', async () => {
    // W finished (in finish_order), still seated. Y and Z already gone, so turn_order
    // is [W, X, Z] and Z now leaves — leaving [W, X]. Raw length is 2, but only X is
    // still in play, so the game must end rather than let X play alone.
    const m = makeMock({ session: session({ turn_order: ['W', 'X', 'Z'] }), players })
    const res = await removeWhotPlayer(m.supabase, 'G1', 'Z', 'Zola')

    expect(res.error).toBeNull()
    const patch = m.sessionUpdates[0]
    expect(patch.phase).toBe('finished')
    expect(patch.winner_player_id).toBe('W') // first to empty wins
    expect(patch.turn_deadline_at).toBeNull()
    expect(String(patch.status_message)).toContain('Winner wins')
  })

  it('keeps playing while two players still hold cards, ignoring the finished seat', async () => {
    // [W(finished), X, Y, Z] — Z leaves, leaving [W, X, Y]: X and Y are both still in
    // play, so the game continues.
    const m = makeMock({ session: session(), players })
    const res = await removeWhotPlayer(m.supabase, 'G1', 'Z', 'Zola')

    expect(res.error).toBeNull()
    const patch = m.sessionUpdates[0]
    expect(patch.phase).toBeUndefined()
    expect(patch.turn_order).toEqual(['W', 'X', 'Y'])
  })

  it('lone survivor wins when nobody had finished yet', async () => {
    // No finishers. [X, Y] and Y leaves — X is the last player standing and wins.
    const m = makeMock({ session: session({ turn_order: ['X', 'Y'], finish_order: [] }), players })
    const res = await removeWhotPlayer(m.supabase, 'G1', 'Y', 'Yusuf')

    expect(res.error).toBeNull()
    const patch = m.sessionUpdates[0]
    expect(patch.phase).toBe('finished')
    expect(patch.winner_player_id).toBe('X')
  })
})
