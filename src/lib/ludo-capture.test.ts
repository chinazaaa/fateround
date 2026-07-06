import { describe, it, expect } from 'vitest'
import { applyMoveLocally, getLegalMovesFromRemaining, getLegalMovesForSteps } from './ludo'
import type { LudoColor, LudoPiece, LudoPlayerState } from '@/types'

function state(color: LudoColor, pieces: LudoPiece[], id = `p-${color}`): LudoPlayerState {
  return { id: `s-${color}`, game_id: 'g', player_id: id, color, pieces, player_order: 0, created_at: '' }
}

/**
 * Standard Ludo capture: the victim returns to its yard and the capturing piece
 * STAYS on the square it landed on — it is never teleported home. This matters
 * for the "use all rolls" rule: a player must never be able to dodge a leftover
 * die by capturing (e.g. a 6 that brings a piece out onto an opponent still
 * leaves that piece on the board for the second die to move).
 */
describe('capture keeps the piece on the board', () => {
  it('a bring-out capture lands on the start square and does not finish the piece', () => {
    // Traditional variant: green's start (pos 0) is not safe. Green has all
    // pieces in the yard and a lone yellow piece sits on green's start.
    const green: LudoPiece[] = [0, 1, 2, 3].map((id) => ({ id, zone: 'base', pos: id }))
    const yellow: LudoPiece[] = [{ id: 0, zone: 'track', pos: 0 }]
    const states = [state('green', green, 'p-green'), state('yellow', yellow, 'p-yellow')]

    const bringOut = getLegalMovesForSteps('green', green, 6, states, 'p-green', 'traditional').find(
      (m) => m.from.zone === 'base' && m.to.zone === 'track' && m.to.pos === 0
    )
    expect(bringOut?.captures).toBe(true)

    const next = applyMoveLocally(states, 'p-green', bringOut!, 'green', 'traditional')

    // Capturing piece stays on the start square (not sent to `finished`).
    const movedPiece = next.find((s) => s.player_id === 'p-green')!.pieces.find((p) => p.id === bringOut!.pieceId)!
    expect(movedPiece).toMatchObject({ zone: 'track', pos: 0 })

    // Victim is back in its own yard.
    const victim = next.find((s) => s.player_id === 'p-yellow')!.pieces[0]!
    expect(victim.zone).toBe('base')
  })

  it('leaves a piece for the leftover die after a capturing bring-out (no forfeit dodge)', () => {
    // The reported bug: roll 6 + 3, all in yard, opponent on the start square.
    // The 6 brings a piece out and captures; the leftover 3 must still be usable.
    const green: LudoPiece[] = [0, 1, 2, 3].map((id) => ({ id, zone: 'base', pos: id }))
    const yellow: LudoPiece[] = [{ id: 0, zone: 'track', pos: 0 }]
    const states = [state('green', green, 'p-green'), state('yellow', yellow, 'p-yellow')]

    const bringOut = getLegalMovesFromRemaining('green', green, [6, 3], states, 'p-green', 'traditional').find(
      (m) => m.from.zone === 'base' && m.diceValue === 6
    )!
    const afterCapture = applyMoveLocally(states, 'p-green', bringOut, 'green', 'traditional')
    const greenPieces = afterCapture.find((s) => s.player_id === 'p-green')!.pieces

    // The remaining die (3) now has a legal move — the just-released piece can advance.
    const leftover = getLegalMovesFromRemaining('green', greenPieces, [3], afterCapture, 'p-green', 'traditional')
    expect(leftover.length).toBeGreaterThan(0)
    expect(leftover.some((m) => m.from.zone === 'track' && m.to.pos === 3)).toBe(true)
  })
})
