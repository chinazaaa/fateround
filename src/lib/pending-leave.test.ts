import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

import { completePendingFinishedLeave } from './pending-leave'
import { removeChessPlayer } from './chess'
import { removeCheckersPlayer } from './checkers'
import { removeDraughts10Player } from './draughts10'
import { removeWhotPlayer } from './whot'

type Row = Record<string, unknown>

/**
 * Tiny stateful Supabase stand-in: equality filters, update, delete, and one-shot failures
 * (`failNext['players:delete']`) so a leave can commit its session write and then fail its cleanup.
 */
function makeDb(tables: Record<string, Row[]>) {
  const failNext: Record<string, number> = {}
  const deletes: string[] = []
  const builder = (table: string) => {
    const filters: [string, unknown][] = []
    let patch: Row | null = null
    let deleting = false
    const match = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v))
    const run = async () => {
      await Promise.resolve()
      if (deleting) {
        const key = `${table}:delete`
        if (failNext[key] > 0) {
          failNext[key]--
          return { data: null, error: { message: 'boom' } }
        }
        const doomed = match()
        for (const d of doomed) deletes.push(`${table}:${String(d.id ?? d.player_id)}`)
        tables[table] = tables[table].filter((r) => !doomed.includes(r))
        return { data: null, error: null }
      }
      if (patch) {
        const rows = match()
        for (const r of rows) Object.assign(r, patch)
        return { data: rows.map((r) => ({ ...r })), error: null }
      }
      return { data: match().map((r) => ({ ...r })), error: null }
    }
    const api: Record<string, unknown> = {
      select: () => api,
      order: () => api,
      eq: (k: string, v: unknown) => (filters.push([k, v]), api),
      update: (p: Row) => ((patch = p), api),
      delete: () => ((deleting = true), api),
      maybeSingle: async () => {
        const res = await run()
        return { data: (res.data as Row[] | null)?.[0] ?? null, error: res.error }
      },
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => run().then(resolve, reject),
    }
    return api
  }
  const client = {
    from: builder,
    rpc: async () => ({ data: true, error: null }),
  } as unknown as SupabaseClient
  return { client, tables, failNext, deletes }
}

const seat = (id: string, name: string, extra: Row = {}) => ({ id, game_id: 'G', name, ...extra })
const ids = (tables: Record<string, Row[]>) => tables.players.map((p) => p.id)

describe('completePendingFinishedLeave: heads-up engines', () => {
  const cases = [
    {
      type: 'chess',
      table: 'chess_sessions',
      cols: { player_white_id: 'a', player_black_id: 'b' },
      leave: removeChessPlayer,
    },
    {
      type: 'checkers',
      table: 'checkers_sessions',
      cols: { player_red_id: 'a', player_black_id: 'b' },
      leave: removeCheckersPlayer,
    },
    {
      type: 'checkers_international',
      table: 'checkers10_sessions',
      cols: { player_red_id: 'a', player_black_id: 'b' },
      leave: removeDraughts10Player,
    },
  ] as const

  for (const tc of cases) {
    describe(tc.type, () => {
      const build = () =>
        makeDb({
          [tc.table]: [{ game_id: 'G', status: 'active', winner_player_id: null, status_message: null, ...tc.cols }],
          players: [seat('a', 'Ann'), seat('b', 'Bob')],
          games: [{ id: 'G', status: 'active' }],
        })

      it('finishes the seat removal that failed after the forfeit committed, exactly once', async () => {
        const db = build()
        db.failNext['players:delete'] = 1
        const first = await tc.leave(db.client, 'G', 'a', 'Ann')
        expect(first.error).toBeTruthy() // route answers 500
        expect(db.tables[tc.table][0].status).toBe('finished')
        expect(ids(db.tables)).toEqual(['a', 'b'])

        const repeat = await completePendingFinishedLeave(db.client, tc.type, 'G', 'a', 'Ann')
        expect(repeat).toEqual({ error: null })
        expect(ids(db.tables)).toEqual(['b'])

        // Nothing is pending any more; the winner and a second repeat are untouched.
        expect(await completePendingFinishedLeave(db.client, tc.type, 'G', 'a', 'Ann')).toBeNull()
        expect(await completePendingFinishedLeave(db.client, tc.type, 'G', 'b', 'Bob')).toBeNull()
        expect(ids(db.tables)).toEqual(['b'])
        expect(db.deletes.filter((d) => d === 'players:a')).toHaveLength(1)
      })

      it('keeps the rows of a loser who resigned and of the winner', async () => {
        const db = build()
        Object.assign(db.tables[tc.table][0], {
          status: 'finished',
          winner_player_id: 'b',
          status_message: 'Ann resigned — Bob wins!',
        })
        expect(await completePendingFinishedLeave(db.client, tc.type, 'G', 'a', 'Ann')).toBeNull()
        expect(await completePendingFinishedLeave(db.client, tc.type, 'G', 'b', 'Bob')).toBeNull()
        expect(ids(db.tables)).toEqual(['a', 'b'])
      })

      it('keeps the rows after a draw and reports a failing cleanup so the repeat can retry', async () => {
        const db = build()
        Object.assign(db.tables[tc.table][0], { status: 'finished', is_draw: true, status_message: 'Draw' })
        expect(await completePendingFinishedLeave(db.client, tc.type, 'G', 'a', 'Ann')).toBeNull()

        const forfeit = build()
        forfeit.failNext['players:delete'] = 2
        await tc.leave(forfeit.client, 'G', 'a', 'Ann')
        const failed = await completePendingFinishedLeave(forfeit.client, tc.type, 'G', 'a', 'Ann')
        expect(failed).toMatchObject({ status: 500 })
        expect(ids(forfeit.tables)).toContain('a')
        expect(await completePendingFinishedLeave(forfeit.client, tc.type, 'G', 'a', 'Ann')).toEqual({ error: null })
      })
    })
  }
})

describe('completePendingFinishedLeave: whot', () => {
  const build = () =>
    makeDb({
      whot_sessions: [
        { game_id: 'G', phase: 'playing', turn_order: ['a', 'b'], current_turn_index: 0, finish_order: [] },
      ],
      whot_player_hands: [
        { id: 'h1', game_id: 'G', player_id: 'a', cards: [] },
        { id: 'h2', game_id: 'G', player_id: 'b', cards: [] },
      ],
      players: [seat('a', 'Ann'), seat('b', 'Bob')],
      games: [{ id: 'G', status: 'active', timer_seconds: 0 }],
    })

  it('completes a seat removal that failed after the finishing leave committed', async () => {
    const db = build()
    db.failNext['players:delete'] = 1
    const first = await removeWhotPlayer(db.client, 'G', 'a', 'Ann')
    expect(first.error).toBeTruthy()
    expect(db.tables.whot_sessions[0].phase).toBe('finished')
    expect(ids(db.tables)).toEqual(['a', 'b'])

    expect(await completePendingFinishedLeave(db.client, 'whot', 'G', 'a', 'Ann')).toEqual({ error: null })
    expect(ids(db.tables)).toEqual(['b'])
    expect(db.tables.whot_player_hands.map((h) => h.player_id)).toEqual(['b'])
    expect(await completePendingFinishedLeave(db.client, 'whot', 'G', 'a', 'Ann')).toBeNull()
  })

  it('keeps the rows of everyone still in the session, finishers and spectators', async () => {
    const db = build()
    Object.assign(db.tables.whot_sessions[0], { phase: 'finished', finish_order: ['b'] })
    db.tables.players.push(seat('w', 'Watcher', { spectator: true }))
    for (const [id, name] of [
      ['a', 'Ann'],
      ['b', 'Bob'],
      ['w', 'Watcher'],
    ]) {
      expect(await completePendingFinishedLeave(db.client, 'whot', 'G', id, name)).toBeNull()
    }
    expect(ids(db.tables)).toEqual(['a', 'b', 'w'])
  })
})
