import { describe, expect, it } from 'vitest'
import { boardGridCell, buildBoardSpaceGrid, monopolyGridSize } from './monopoly-board-layout'

describe('Estate Kings board geometry', () => {
  it.each([
    [40, 11, [0, 10, 20, 30]],
    [48, 13, [0, 12, 24, 36]],
  ] as const)('maps a %i-space board to a %i by %i perimeter', (boardSize, gridSize, corners) => {
    expect(monopolyGridSize(boardSize)).toBe(gridSize)
    expect(buildBoardSpaceGrid(boardSize).size).toBe(boardSize)
    expect(corners.map((index) => boardGridCell(index, boardSize))).toEqual([
      { col: gridSize, row: gridSize },
      { col: 1, row: gridSize },
      { col: 1, row: 1 },
      { col: gridSize, row: 1 },
    ])
  })
})
