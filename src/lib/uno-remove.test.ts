import { describe, it, expect } from 'vitest'
import { removeUnoPlayer } from './uno'

// removeUnoPlayer (non-team path) drops a leaver from turn_order and ends the game once
// fewer than two players are still IN PLAY. Players who already went out (finish_order)
// or were knocked out (eliminated_player_ids) stay seated in turn_order — they're skipped
// on their turn — but are NOT still playing. These tests pin that such seats never count
// as active players, so a lone survivor is never left playing against themselves.

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
          if (table === 'uno_sessions') return chain({ data: opts.session, error: null })
          // Non-team game: uno_team_mode false so the team-leave branch is skipped.
          if (table === 'games') return chain({ data: { timer_seconds: 0, uno_team_mode: false }, error: null })
          if (table === 'players') return chain({ data: opts.players, error: null })
          return chain({ data: null, error: null })
        },
        update(vals: Record<string, unknown>) {
          if (table === 'uno_sessions') sessionUpdates.push(vals)
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
    eliminated_player_ids: [],
    uno_pending_player: null,
    ...over,
  }
}

describe('removeUnoPlayer — finished / eliminated seats do not count as active players', () => {
  it('ends the game when only a finished winner + one survivor remain', async () => {
    const m = makeMock({ session: session({ turn_order: ['W', 'X', 'Z'] }), players })
    const res = await removeUnoPlayer(m.supabase, 'G1', 'Z', 'Zola')

    expect(res.error).toBeNull()
    const patch = m.sessionUpdates[0]
    expect(patch.phase).toBe('finished')
    expect(patch.winner_player_id).toBe('W')
    expect(patch.turn_deadline_at).toBeNull()
    expect(String(patch.status_message)).toContain('Winner wins')
  })

  it('treats an eliminated seat as out of play too', async () => {
    // W finished, Y eliminated (knocked out), X and Z active. Z leaves → only X remains active.
    const m = makeMock({
      session: session({ turn_order: ['W', 'X', 'Y', 'Z'], finish_order: ['W'], eliminated_player_ids: ['Y'] }),
      players,
    })
    const res = await removeUnoPlayer(m.supabase, 'G1', 'Z', 'Zola')

    expect(res.error).toBeNull()
    const patch = m.sessionUpdates[0]
    expect(patch.phase).toBe('finished')
    expect(patch.winner_player_id).toBe('W')
  })

  it('keeps playing while two players still hold cards, ignoring the finished seat', async () => {
    const m = makeMock({ session: session(), players })
    const res = await removeUnoPlayer(m.supabase, 'G1', 'Z', 'Zola')

    expect(res.error).toBeNull()
    const patch = m.sessionUpdates[0]
    expect(patch.phase).toBeUndefined()
    expect(patch.turn_order).toEqual(['W', 'X', 'Y'])
  })

  it('lone survivor wins when nobody had finished yet', async () => {
    const m = makeMock({ session: session({ turn_order: ['X', 'Y'], finish_order: [] }), players })
    const res = await removeUnoPlayer(m.supabase, 'G1', 'Y', 'Yusuf')

    expect(res.error).toBeNull()
    const patch = m.sessionUpdates[0]
    expect(patch.phase).toBe('finished')
    expect(patch.winner_player_id).toBe('X')
  })
})
