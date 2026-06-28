import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'
import { clearBingoSessionData } from './bingo'
import { clearAnonymousRoomSessionData } from './anonymous-messages'
import { clearLudoSessionData } from './ludo'
import { clearMonopolySessionData } from './monopoly'
import { clearNpatSessionData } from './npat'
import { clearTwoTruthsSessionData } from './two-truths'

// Minimal Supabase stand-in that records which tables get .delete()'d and whether a
// spectator reset (players.update({ spectator: false })) was issued. Each builder
// method is both chainable (.eq().eq()) and awaitable, mirroring supabase-js.
function makeMockSupabase(errorOnTable?: string) {
  const deletedTables: string[] = []
  let spectatorsReset = false
  const thenable = (result: { error: { message: string } | null }) => {
    const p = Promise.resolve(result) as Promise<typeof result> & { eq: () => typeof p }
    p.eq = () => p
    return p
  }
  const supabase = {
    from(table: string) {
      return {
        delete: () => {
          deletedTables.push(table)
          return thenable(table === errorOnTable ? { error: { message: 'boom' } } : { error: null })
        },
        update: (vals: Record<string, unknown>) => {
          if (vals.spectator === false) spectatorsReset = true
          return thenable({ error: null })
        },
      }
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as any, deletedTables, getSpectatorsReset: () => spectatorsReset }
}

describe('clearSessionTables', () => {
  it('deletes each table by game_id, no spectator reset by default', async () => {
    const m = makeMockSupabase()
    const r = await clearSessionTables(m.supabase, 'GAME1', ['a', 'b', 'c'])
    expect(r).toEqual({ error: null })
    expect(m.deletedTables).toEqual(['a', 'b', 'c'])
    expect(m.getSpectatorsReset()).toBe(false)
  })
  it('resets spectators when asked', async () => {
    const m = makeMockSupabase()
    await clearSessionTables(m.supabase, 'G', ['x'], { resetSpectators: true })
    expect(m.getSpectatorsReset()).toBe(true)
  })
  it('returns the first error and stops deleting further tables', async () => {
    const m = makeMockSupabase('b')
    const r = await clearSessionTables(m.supabase, 'G', ['a', 'b', 'c'])
    expect(r.error).toBe('boom')
    expect(m.deletedTables).toEqual(['a', 'b']) // 'c' never attempted
  })
})

describe('engine clear functions delegate the correct tables', () => {
  const cases: Array<[string, (s: SupabaseClient, g: string) => Promise<{ error: string | null }>, string[], boolean]> =
    [
      ['bingo', clearBingoSessionData, ['bingo_claims', 'bingo_called_numbers', 'bingo_cards'], false],
      ['anonymous', clearAnonymousRoomSessionData, ['anonymous_messages', 'anonymous_room_bans'], false],
      ['ludo', clearLudoSessionData, ['ludo_sessions', 'ludo_player_state'], true],
      ['monopoly', clearMonopolySessionData, ['monopoly_player_state', 'monopoly_boards'], true],
      ['npat', clearNpatSessionData, ['npat_marks', 'npat_answers'], true],
      ['two_truths', clearTwoTruthsSessionData, ['ttl_guesses', 'ttl_statements'], true],
    ]
  for (const [name, fn, tables, resetsSpectators] of cases) {
    it(`${name} clears ${tables.join(', ')}${resetsSpectators ? ' + resets spectators' : ''}`, async () => {
      const m = makeMockSupabase()
      const r = await fn(m.supabase, 'GAME')
      expect(r).toEqual({ error: null })
      expect(m.deletedTables).toEqual(tables)
      expect(m.getSpectatorsReset()).toBe(resetsSpectators)
    })
  }
})
