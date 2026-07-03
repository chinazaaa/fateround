import { describe, it, expect } from 'vitest'
import { getLegalMovesFromRemaining, getLegalMovesForSteps } from './ludo'
import type { LudoColor, LudoPiece, LudoPlayerState } from '@/types'

function state(color: LudoColor, pieces: LudoPiece[], id = `p-${color}`): LudoPlayerState {
  return { id: `s-${color}`, game_id: 'g', player_id: id, color, pieces, player_order: 0, created_at: '' }
}

/**
 * Regression: a stack of pieces on a SAFE square (a colour's ★ start, or a
 * mid-arm safe star) must not act as a blockade. Safe squares are shared ground
 * where any pieces coexist, so opponents parked there can never wall a player
 * out. Previously an opponent 2-stack on your start froze you: you couldn't
 * bring pieces onto the board and, if the yard held your only pieces, you had no
 * legal move at all.
 */
describe('safe-square stacks are not blockades', () => {
  it('lets a piece enter its own start even when opponents sit there on a blockade', () => {
    const green: LudoPiece[] = [0, 1, 2, 3].map((id) => ({ id, zone: 'base', pos: id }))
    const red: LudoPiece[] = [
      { id: 0, zone: 'track', pos: 0 }, // green's start
      { id: 1, zone: 'track', pos: 0 },
    ]
    const states = [state('green', green, 'p-green'), state('red', red, 'p-red')]

    const moves = getLegalMovesFromRemaining('green', green, [6, 6], states, 'p-green')
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.some((m) => m.from.zone === 'base' && m.to.zone === 'track' && m.to.pos === 0)).toBe(true)
    // Landing on the safe start does not capture the opponents there.
    expect(moves.every((m) => m.captures === false)).toBe(true)
  })

  it('lets a piece pass through a safe square occupied by an opponent stack', () => {
    // Green piece just before the mid-arm safe star at index 8; a roll of 3 must
    // be able to pass the star (index 8) even with two blue pieces parked on it.
    const green: LudoPiece[] = [{ id: 0, zone: 'track', pos: 6 }]
    const blue: LudoPiece[] = [
      { id: 0, zone: 'track', pos: 8 },
      { id: 1, zone: 'track', pos: 8 },
    ]
    const states = [state('green', green, 'p-green'), state('blue', blue, 'p-blue')]
    const moves = getLegalMovesForSteps('green', green, 3, states, 'p-green')
    expect(moves.some((m) => m.to.zone === 'track' && m.to.pos === 9)).toBe(true)
  })

  it('traditional variant: a lone piece on a start square CAN be captured', () => {
    // Green sits on its own start (pos 0). Red is one step behind (pos 12) and
    // rolls a 1 to land on pos 13... no — reach pos 0 from red's perspective.
    // Red start = 13, so red at pos 51 rolling 1 lands on pos 0 (green's start).
    const green: LudoPiece[] = [{ id: 0, zone: 'track', pos: 0 }]
    const red: LudoPiece[] = [{ id: 0, zone: 'track', pos: 51 }]
    const states = [state('green', green, 'p-green'), state('red', red, 'p-red')]

    // Modern: start is safe → no capture.
    const modern = getLegalMovesForSteps('red', red, 1, states, 'p-red', 'modern')
    expect(modern.find((m) => m.to.zone === 'track' && m.to.pos === 0)?.captures).toBe(false)

    // Traditional: start is NOT safe → capturing move.
    const traditional = getLegalMovesForSteps('red', red, 1, states, 'p-red', 'traditional')
    expect(traditional.find((m) => m.to.zone === 'track' && m.to.pos === 0)?.captures).toBe(true)
  })

  it('traditional variant: mid-arm star is not safe (capture allowed there)', () => {
    // Blue lone piece on the star at index 8; green lands on it.
    const green: LudoPiece[] = [{ id: 0, zone: 'track', pos: 6 }]
    const blue: LudoPiece[] = [{ id: 0, zone: 'track', pos: 8 }]
    const states = [state('green', green, 'p-green'), state('blue', blue, 'p-blue')]
    const traditional = getLegalMovesForSteps('green', green, 2, states, 'p-green', 'traditional')
    expect(traditional.find((m) => m.to.zone === 'track' && m.to.pos === 8)?.captures).toBe(true)
    const modern = getLegalMovesForSteps('green', green, 2, states, 'p-green', 'modern')
    expect(modern.find((m) => m.to.zone === 'track' && m.to.pos === 8)?.captures).toBe(false)
  })

  it('still blocks an opponent blockade on a NON-safe square', () => {
    const green: LudoPiece[] = [{ id: 0, zone: 'track', pos: 1 }]
    const red: LudoPiece[] = [
      { id: 0, zone: 'track', pos: 3 }, // non-safe
      { id: 1, zone: 'track', pos: 3 },
    ]
    const states = [state('green', green, 'p-green'), state('red', red, 'p-red')]
    // Roll of 2 would land on the opponent blockade at index 3 — must be illegal.
    const land = getLegalMovesForSteps('green', green, 2, states, 'p-green')
    expect(land.some((m) => m.to.zone === 'track' && m.to.pos === 3)).toBe(false)
    // Roll of 4 would pass through the blockade at index 3 — must be illegal too.
    const pass = getLegalMovesForSteps('green', green, 4, states, 'p-green')
    expect(pass.some((m) => m.to.zone === 'track' && m.to.pos === 5)).toBe(false)
  })
})
