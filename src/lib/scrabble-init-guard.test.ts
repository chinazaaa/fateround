import { describe, it, expect } from 'vitest'
import { initializeScrabbleGame } from './scrabble'

// A live Scrabble game must never be re-dealt: initialization deletes every
// player_state row and re-inserts with score 0, so re-running it mid-game wipes
// everyone's score to zero. This regression pins that initializeScrabbleGame
// refuses when the existing session is still in the 'playing' phase (the tournament
// round-restart path used to hit exactly this), while still allowing a rematch to
// re-deal a *finished* session.

type Row = { data: unknown; error: unknown }

function makeMockSupabase(opts: { session: unknown }) {
  const ops: Array<{ table: string; op: string }> = []

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
          if (table === 'scrabble_sessions') return chain({ data: opts.session, error: null })
          if (table === 'games') return chain({ data: { timer_seconds: 0, scrabble_dictionary_id: null }, error: null })
          if (table === 'players')
            return chain({
              data: [
                { id: 'A', name: 'Alice' },
                { id: 'B', name: 'Bob' },
              ],
              error: null,
            })
          return chain({ data: null, error: null })
        },
        insert() {
          ops.push({ table, op: 'insert' })
          return chain({ data: null, error: null })
        },
        update() {
          ops.push({ table, op: 'update' })
          return chain({ data: null, error: null })
        },
        delete() {
          ops.push({ table, op: 'delete' })
          return chain({ data: null, error: null })
        },
      }
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as any, ops }
}

describe('initializeScrabbleGame — never wipes a game in progress', () => {
  it('refuses to re-deal a session that is still playing (score-wipe guard)', async () => {
    const { supabase, ops } = makeMockSupabase({ session: { id: 'S1', phase: 'playing' } })

    const result = await initializeScrabbleGame(supabase, 'GAME1', ['A', 'B'])

    expect(result.error).toBe('Game already in progress')
    // Crucially, no player_state was deleted/re-inserted — scores are left intact.
    expect(ops.some((o) => o.table === 'scrabble_player_state')).toBe(false)
  })

  it('still allows a rematch to re-deal a finished session', async () => {
    const { supabase } = makeMockSupabase({ session: { id: 'S1', phase: 'finished' } })

    const result = await initializeScrabbleGame(supabase, 'GAME1', ['A', 'B'])

    // Whatever happens downstream, it must NOT be blocked by the in-progress guard.
    expect(result.error).not.toBe('Game already in progress')
  })

  it('allows a fresh start when no session exists yet', async () => {
    const { supabase } = makeMockSupabase({ session: null })

    const result = await initializeScrabbleGame(supabase, 'GAME1', ['A', 'B'])

    expect(result.error).not.toBe('Game already in progress')
  })
})
