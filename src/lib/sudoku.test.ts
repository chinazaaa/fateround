import { describe, it, expect } from 'vitest'
import {
  SUDOKU_CELL_SCORING,
  SUDOKU_WRONG_PENALTY,
  SUDOKU_MY_CELL_COLOR,
  buildCellOwnerGrid,
  buildClaimedValueGrid,
  buildPlayerDisplayGrid,
  buildPlayerSolvedGrid,
  countEmptyCells,
  generateSudokuPuzzle,
  getCellDisplayColor,
  getNewlyCompletedUnits,
  isPlayerUnitComplete,
  parseSudokuMetadata,
  playerCompletionPercent,
  playerHasSolvedCell,
  sudokuCellPoints,
  tallySudokuScores,
  getPlayerTimeSpent,
} from './sudoku'

const PUZZLE = [
  [5, 3, 0, 0, 7, 0, 0, 0, 0],
  [6, 0, 0, 1, 9, 5, 0, 0, 0],
  [0, 9, 8, 0, 0, 0, 0, 6, 0],
  [8, 0, 0, 0, 6, 0, 0, 0, 3],
  [4, 0, 0, 8, 0, 3, 0, 0, 1],
  [7, 0, 0, 0, 2, 0, 0, 0, 6],
  [0, 6, 0, 0, 0, 0, 2, 8, 0],
  [0, 0, 0, 4, 1, 9, 0, 0, 5],
  [0, 0, 0, 0, 8, 0, 0, 7, 9],
]

describe('sudokuCellPoints', () => {
  it('awards 10 / 6 / 4 / 2 by solve order', () => {
    expect(sudokuCellPoints(0)).toBe(10)
    expect(sudokuCellPoints(1)).toBe(6)
    expect(sudokuCellPoints(2)).toBe(4)
    expect(sudokuCellPoints(3)).toBe(2)
    expect(sudokuCellPoints(99)).toBe(2)
  })

  it('matches SUDOKU_CELL_SCORING', () => {
    expect(SUDOKU_CELL_SCORING).toEqual([10, 6, 4, 2])
    expect(SUDOKU_WRONG_PENALTY).toBe(-3)
  })
})

describe('tallySudokuScores', () => {
  const players = [
    { id: 'a', name: 'Alice' },
    { id: 'b', name: 'Bob' },
  ]

  it('sums points per player and sorts by score then name', () => {
    const submissions = [
      { player_id: 'a', points_awarded: 10 },
      { player_id: 'a', points_awarded: -3 },
      { player_id: 'b', points_awarded: 6 },
    ]
    expect(tallySudokuScores(submissions, players)).toEqual([
      { player_id: 'a', name: 'Alice', points: 7 },
      { player_id: 'b', name: 'Bob', points: 6 },
    ])
  })

  it('excludes spectators', () => {
    const submissions = [{ player_id: 'a', points_awarded: 10 }]
    const withSpectator = [...players, { id: 's', name: 'Sam', spectator: true }]
    expect(tallySudokuScores(submissions, withSpectator)).toHaveLength(2)
    expect(tallySudokuScores(submissions, withSpectator).some((r) => r.player_id === 's')).toBe(false)
  })
})

describe('buildCellOwnerGrid', () => {
  it('records the first correct solver per cell', () => {
    const submissions = [
      {
        player_id: 'alice',
        cell_row: 0,
        cell_col: 2,
        submitted_value: 4,
        is_correct: true,
        submitted_at: '2026-01-01T00:00:02Z',
      },
      {
        player_id: 'bob',
        cell_row: 0,
        cell_col: 2,
        submitted_value: 4,
        is_correct: true,
        submitted_at: '2026-01-01T00:00:03Z',
      },
      {
        player_id: 'bob',
        cell_row: 1,
        cell_col: 1,
        submitted_value: 7,
        is_correct: true,
        submitted_at: '2026-01-01T00:00:01Z',
      },
    ]
    const owners = buildCellOwnerGrid(submissions)
    expect(owners[0]![2]).toBe('alice')
    expect(owners[1]![1]).toBe('bob')
  })
})

describe('buildPlayerSolvedGrid', () => {
  it('marks cells the player solved correctly', () => {
    const submissions = [
      { player_id: 'me', cell_row: 0, cell_col: 2, is_correct: true },
      { player_id: 'me', cell_row: 0, cell_col: 3, is_correct: false },
      { player_id: 'other', cell_row: 1, cell_col: 1, is_correct: true },
    ]
    const grid = buildPlayerSolvedGrid(submissions, 'me')
    expect(grid[0]![2]).toBe(true)
    expect(grid[0]![3]).toBe(false)
    expect(grid[1]![1]).toBe(false)
  })
})

describe('buildPlayerDisplayGrid', () => {
  const submissions = [
    {
      player_id: 'alice',
      cell_row: 0,
      cell_col: 2,
      submitted_value: 4,
      is_correct: true,
    },
    {
      player_id: 'bob',
      cell_row: 0,
      cell_col: 3,
      submitted_value: 6,
      is_correct: true,
    },
  ]
  const emptyDrafts = Array.from({ length: 9 }, () => Array(9).fill(0))

  it('shows only your own correct values, not other players’', () => {
    const aliceView = buildPlayerDisplayGrid(PUZZLE, submissions, 'alice', emptyDrafts)
    expect(aliceView[0]![2]).toBe(4)
    expect(aliceView[0]![3]).toBe(0)

    const bobView = buildPlayerDisplayGrid(PUZZLE, submissions, 'bob', emptyDrafts)
    expect(bobView[0]![2]).toBe(0)
    expect(bobView[0]![3]).toBe(6)
  })

  it('includes local drafts on unsolved cells', () => {
    const drafts = emptyDrafts.map((row) => [...row])
    drafts[0]![5] = 7
    const view = buildPlayerDisplayGrid(PUZZLE, submissions, 'alice', drafts)
    expect(view[0]![5]).toBe(7)
  })
})

describe('unit completion', () => {
  it('detects when a row becomes complete for the player', () => {
    const submissions = [
      { player_id: 'me', cell_row: 0, cell_col: 3, is_correct: true },
      { player_id: 'me', cell_row: 0, cell_col: 5, is_correct: true },
      { player_id: 'me', cell_row: 0, cell_col: 6, is_correct: true },
      { player_id: 'me', cell_row: 0, cell_col: 7, is_correct: true },
      { player_id: 'me', cell_row: 0, cell_col: 8, is_correct: true },
    ]
    expect(isPlayerUnitComplete(PUZZLE, submissions, 'me', 'row', 0)).toBe(false)
    const withLast = [...submissions, { player_id: 'me', cell_row: 0, cell_col: 2, is_correct: true }]
    expect(isPlayerUnitComplete(PUZZLE, withLast, 'me', 'row', 0)).toBe(true)
    expect(getNewlyCompletedUnits(PUZZLE, submissions, 'me', 0, 2)).toEqual([{ type: 'row', index: 0 }])
  })

  it('detects when a block becomes complete for the player', () => {
    const block0Empties: [number, number][] = [
      [0, 2],
      [1, 1],
      [1, 2],
      [2, 0],
    ]
    const submissions = block0Empties.slice(0, -1).map(([row, col]) => ({
      player_id: 'me',
      cell_row: row,
      cell_col: col,
      is_correct: true,
    }))
    expect(getNewlyCompletedUnits(PUZZLE, submissions, 'me', 2, 0)).toEqual([{ type: 'block', index: 0 }])
  })
})

describe('getCellDisplayColor', () => {
  const playerColors = { alice: '#93c5fd', bob: '#fcd34d' }

  it('uses green when the current player solved the cell', () => {
    const mySolved = Array.from({ length: 9 }, () => Array(9).fill(false))
    mySolved[0]![2] = true
    expect(
      getCellDisplayColor(0, 2, {
        myPlayerId: 'bob',
        mySolvedCells: mySolved,
        firstSolverId: 'alice',
        playerColors,
      })
    ).toBe(SUDOKU_MY_CELL_COLOR)
  })

  it('uses the first solver color when the current player has not solved it', () => {
    const mySolved = Array.from({ length: 9 }, () => Array(9).fill(false))
    expect(
      getCellDisplayColor(0, 2, {
        myPlayerId: 'bob',
        mySolvedCells: mySolved,
        firstSolverId: 'alice',
        playerColors,
      })
    ).toBe('#93c5fd')
  })

  it('returns undefined for unsolved cells', () => {
    expect(getCellDisplayColor(0, 2, { myPlayerId: 'bob', mySolvedCells: undefined })).toBeUndefined()
  })
})

describe('playerHasSolvedCell', () => {
  const submissions = [{ player_id: 'me', cell_row: 2, cell_col: 4, is_correct: true }]

  it('is true only for that player’s correct cells', () => {
    expect(playerHasSolvedCell(submissions, 'me', 2, 4)).toBe(true)
    expect(playerHasSolvedCell(submissions, 'me', 2, 5)).toBe(false)
    expect(playerHasSolvedCell(submissions, 'other', 2, 4)).toBe(false)
  })
})

describe('completion helpers', () => {
  const submissions = [
    { player_id: 'a', cell_row: 0, cell_col: 2, is_correct: true },
    { player_id: 'b', cell_row: 0, cell_col: 3, is_correct: true },
    { player_id: 'a', cell_row: 0, cell_col: 5, is_correct: true },
  ]

  it('counts empty cells in the puzzle', () => {
    expect(countEmptyCells(PUZZLE)).toBe(51)
  })

  it('computes player completion percent from their correct cells', () => {
    expect(playerCompletionPercent(PUZZLE, submissions, 'a')).toBe(4) // 2/51
  })

  it('builds a display grid from first correct values', () => {
    const withValues = submissions.map((s) => ({ ...s, submitted_value: 4, submitted_at: 't' }))
    const grid = buildClaimedValueGrid(PUZZLE, withValues)
    expect(grid[0]![2]).toBe(4)
    expect(grid[0]![3]).toBe(4)
    expect(grid[0]![5]).toBe(4)
    expect(grid[0]![0]).toBe(5) // given preserved
  })
})

describe('generateSudokuPuzzle', () => {
  it('returns a 9×9 puzzle and solution with a unique fill', () => {
    const { puzzle, solution } = generateSudokuPuzzle(42)
    expect(puzzle).toHaveLength(9)
    expect(solution).toHaveLength(9)
    expect(puzzle.flat().filter((v) => v === 0).length).toBeGreaterThan(0)
    expect(solution.flat().every((v) => v >= 1 && v <= 9)).toBe(true)
  })

  it('is deterministic for the same seed', () => {
    const a = generateSudokuPuzzle(99)
    const b = generateSudokuPuzzle(99)
    expect(a.puzzle).toEqual(b.puzzle)
    expect(a.solution).toEqual(b.solution)
  })
})

describe('parseSudokuMetadata', () => {
  it('accepts puzzle-only metadata', () => {
    expect(parseSudokuMetadata({ puzzle: PUZZLE })).toEqual({ puzzle: PUZZLE })
  })

  it('rejects invalid metadata', () => {
    expect(parseSudokuMetadata(null)).toBeNull()
    expect(parseSudokuMetadata({ solution: PUZZLE })).toBeNull()
  })
})

describe('getPlayerTimeSpent', () => {
  const startAt = '2026-07-01T20:00:00Z'
  const startMs = new Date(startAt).getTime()
  const submissions = [
    {
      player_id: 'alice',
      is_correct: true,
      cell_row: 0,
      cell_col: 2,
      submitted_at: '2026-07-01T20:05:00Z',
    },
    {
      player_id: 'alice',
      is_correct: true,
      cell_row: 0,
      cell_col: 3,
      submitted_at: '2026-07-01T20:10:00Z',
    },
  ]

  it('returns 0 if game start is not defined', () => {
    expect(getPlayerTimeSpent(null, [], 'alice', 0, startMs + 1000)).toBe(0)
  })

  it('uses last correct submission when completionPercent >= 100', () => {
    const game = { session_started_at: startAt }
    // Alice has correct submissions, last one is at 20:10 (10 mins / 600s after start)
    expect(getPlayerTimeSpent(game, submissions, 'alice', 100, startMs + 900000)).toBe(600)
  })

  it('falls back to nowMs when completionPercent >= 100 but no correct submissions', () => {
    const game = { session_started_at: startAt }
    const nowMs = startMs + 300000 // 5 minutes
    expect(getPlayerTimeSpent(game, [], 'alice', 100, nowMs)).toBe(300)
  })

  it('uses nowMs for incomplete players when game is not finished', () => {
    const game = { session_started_at: startAt, finished_at: null }
    const nowMs = startMs + 300000 // 5 minutes
    expect(getPlayerTimeSpent(game, submissions, 'alice', 50, nowMs)).toBe(300)
  })

  it('uses finished_at for incomplete players when game is finished', () => {
    const game = { session_started_at: startAt, finished_at: '2026-07-01T20:08:00Z' }
    const nowMs = startMs + 600000 // 10 minutes
    // 8 minutes = 480 seconds
    expect(getPlayerTimeSpent(game, submissions, 'alice', 50, nowMs)).toBe(480)
  })
})
