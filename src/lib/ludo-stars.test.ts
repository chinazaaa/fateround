import { describe, it, expect } from 'vitest'
import { boardCellKind, SAFE_TRACK_POSITIONS, trackIndexAt } from './ludo-board-layout'

describe('ludo safe-star squares', () => {
  it('classifies the four mid-arm star cells as safe with the guarding colour', () => {
    expect(boardCellKind(2, 6)).toEqual({ kind: 'safe', color: 'red' })
    expect(boardCellKind(6, 12)).toEqual({ kind: 'safe', color: 'blue' })
    expect(boardCellKind(12, 8)).toEqual({ kind: 'safe', color: 'yellow' })
    expect(boardCellKind(8, 2)).toEqual({ kind: 'safe', color: 'green' })
  })

  it('no longer treats the old home-mouth cells as safe', () => {
    for (const [r, c] of [
      [7, 0],
      [0, 7],
      [7, 14],
      [14, 7],
    ]) {
      expect(boardCellKind(r!, c!).kind).toBe('track')
    }
  })

  it('keeps the four start cells as star squares', () => {
    expect(boardCellKind(6, 1).kind).toBe('start') // green
    expect(boardCellKind(1, 8).kind).toBe('start') // red
    expect(boardCellKind(8, 13).kind).toBe('start') // blue
    expect(boardCellKind(13, 6).kind).toBe('start') // yellow
  })

  it('safe track positions are the 4 starts + 4 mid-arm stars (8 total)', () => {
    const starts = [0, 13, 26, 39]
    const stars = [trackIndexAt(2, 6), trackIndexAt(6, 12), trackIndexAt(12, 8), trackIndexAt(8, 2)]
    expect(stars).toEqual([8, 21, 34, 47])
    const expected = new Set([...starts, ...(stars as number[])])
    expect(SAFE_TRACK_POSITIONS).toEqual(expected)
  })
})
