import { describe, it, expect } from 'vitest'
import { getLegalMovesForSteps } from './ludo'
import type { LudoColor, LudoPiece, LudoPlayerState } from '@/types'

function state(color: LudoColor, pieces: LudoPiece[]): LudoPlayerState {
  return {
    id: `state-${color}`,
    game_id: 'g',
    player_id: `p-${color}`,
    color,
    pieces,
    player_order: 0,
    created_at: '',
  }
}

/**
 * Regression: a piece must turn into its home column at its home-mouth cell, not
 * one square past it. Green's home mouth is track index 50 (50 steps from its
 * start at index 0); a roll of 1 from there used to sail past the home lane and
 * land on track index 51, carrying the piece on around the board.
 */
describe('ludo home entry', () => {
  it('enters the home lane from the home mouth on a roll of 1 (green)', () => {
    const green = [{ id: 0, zone: 'track', pos: 50 } as LudoPiece]
    const states = [state('green', green)]

    const moves = getLegalMovesForSteps('green', green, 1, states, 'p-green')

    expect(moves).toHaveLength(1)
    expect(moves[0]!.to).toMatchObject({ zone: 'home', pos: 0 })
  })

  it('finishes exactly from the home mouth on a roll of 6 (green)', () => {
    const green = [{ id: 0, zone: 'track', pos: 50 } as LudoPiece]
    const states = [state('green', green)]

    const moves = getLegalMovesForSteps('green', green, 6, states, 'p-green')

    expect(moves).toHaveLength(1)
    expect(moves[0]!.to).toMatchObject({ zone: 'finished' })
  })

  it('turns into home for every colour at its own mouth', () => {
    // Each colour reaches its home mouth 50 steps after its own start cell.
    const mouths: Record<LudoColor, number> = { green: 50, red: 11, blue: 24, yellow: 37 }
    for (const [color, mouthPos] of Object.entries(mouths) as [LudoColor, number][]) {
      const pieces = [{ id: 0, zone: 'track', pos: mouthPos } as LudoPiece]
      const moves = getLegalMovesForSteps(color, pieces, 1, [state(color, pieces)], `p-${color}`)
      expect(moves, `${color} at mouth ${mouthPos}`).toHaveLength(1)
      expect(moves[0]!.to, color).toMatchObject({ zone: 'home', pos: 0 })
    }
  })
})
