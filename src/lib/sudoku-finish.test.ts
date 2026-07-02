import { describe, it, expect } from 'vitest'
import { finishSudokuIfAllPlayersDone } from './sudoku-finish'

type Sub = { player_id: string; cell_row: number | null; cell_col: number | null }

// Minimal Supabase stand-in: serves canned rows per table and records updates.
// Builders are both chainable (.select().eq().eq()) and awaitable, like supabase-js.
function makeMockSupabase(opts: {
  gameStatus?: string
  round?: { id: string; sudoku_metadata: unknown } | null
  players?: { id: string }[]
  subs?: Sub[]
}) {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = []
  const supabase = {
    from(table: string) {
      const resultFor = () => {
        if (table === 'games') return { data: opts.gameStatus ? { status: opts.gameStatus } : null, error: null }
        if (table === 'rounds') return { data: opts.round ?? null, error: null }
        if (table === 'players') return { data: opts.players ?? [], error: null }
        if (table === 'sudoku_submissions') return { data: opts.subs ?? [], error: null }
        return { data: null, error: null }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {}
      b.select = () => b
      b.eq = () => b
      b.maybeSingle = () => Promise.resolve(resultFor())
      b.update = (values: Record<string, unknown>) => {
        updates.push({ table, values })
        return b
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      b.then = (resolve: any, reject: any) => Promise.resolve(resultFor()).then(resolve, reject)
      return b
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as any, updates }
}

// 2 empty cells: (0,0) and (0,1).
const ROUND = { id: 'r1', sudoku_metadata: { puzzle: [[0, 0, 3, 4, 5, 6, 7, 8, 9]] } }

const solved = (playerId: string, cells: Array<[number, number]>): Sub[] =>
  cells.map(([row, col]) => ({ player_id: playerId, cell_row: row, cell_col: col }))

function gameFinished(updates: Array<{ table: string; values: Record<string, unknown> }>) {
  return updates.some((u) => u.table === 'games' && u.values.status === 'finished')
}

describe('finishSudokuIfAllPlayersDone', () => {
  it('finishes the game once every active player has solved all empty cells', async () => {
    const m = makeMockSupabase({
      gameStatus: 'active',
      round: ROUND,
      players: [{ id: 'p1' }, { id: 'p2' }],
      subs: [
        ...solved('p1', [
          [0, 0],
          [0, 1],
        ]),
        ...solved('p2', [
          [0, 0],
          [0, 1],
        ]),
      ],
    })
    const r = await finishSudokuIfAllPlayersDone(m.supabase, 'GAME')
    expect(r).toEqual({ finished: true, error: null })
    expect(gameFinished(m.updates)).toBe(true)
  })

  it('does not finish while any player still has unsolved cells', async () => {
    const m = makeMockSupabase({
      gameStatus: 'active',
      round: ROUND,
      players: [{ id: 'p1' }, { id: 'p2' }],
      subs: [
        ...solved('p1', [
          [0, 0],
          [0, 1],
        ]),
        ...solved('p2', [[0, 0]]),
      ],
    })
    const r = await finishSudokuIfAllPlayersDone(m.supabase, 'GAME')
    expect(r).toEqual({ finished: false, error: null })
    expect(gameFinished(m.updates)).toBe(false)
  })

  it('counts duplicate solves of the same cell only once', async () => {
    const m = makeMockSupabase({
      gameStatus: 'active',
      round: ROUND,
      players: [{ id: 'p1' }],
      subs: solved('p1', [
        [0, 0],
        [0, 0],
      ]),
    })
    const r = await finishSudokuIfAllPlayersDone(m.supabase, 'GAME')
    expect(r).toEqual({ finished: false, error: null })
    expect(gameFinished(m.updates)).toBe(false)
  })

  it('no-ops when the game is not active', async () => {
    const m = makeMockSupabase({
      gameStatus: 'finished',
      round: ROUND,
      players: [{ id: 'p1' }],
      subs: solved('p1', [
        [0, 0],
        [0, 1],
      ]),
    })
    const r = await finishSudokuIfAllPlayersDone(m.supabase, 'GAME')
    expect(r).toEqual({ finished: false, error: null })
    expect(gameFinished(m.updates)).toBe(false)
  })

  it('no-ops when there is no round or no active players', async () => {
    const noRound = makeMockSupabase({ gameStatus: 'active', round: null, players: [{ id: 'p1' }] })
    expect(await finishSudokuIfAllPlayersDone(noRound.supabase, 'GAME')).toEqual({ finished: false, error: null })

    const noPlayers = makeMockSupabase({ gameStatus: 'active', round: ROUND, players: [] })
    expect(await finishSudokuIfAllPlayersDone(noPlayers.supabase, 'GAME')).toEqual({ finished: false, error: null })
    expect(gameFinished(noPlayers.updates)).toBe(false)
  })
})
