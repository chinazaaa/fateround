import { describe, it, expect } from 'vitest'
import { applyMoveLocally, getLegalMovesFromRemaining, getLegalMovesForSteps } from './ludo'
import type { LudoColor, LudoPiece, LudoPlayerState } from '@/types'

function state(color: LudoColor, pieces: LudoPiece[], id = `p-${color}`): LudoPlayerState {
  return { id: `s-${color}`, game_id: 'g', player_id: id, color, pieces, player_order: 0, created_at: '' }
}

/**
 * House rule: capturing an opponent sends the victim back to its yard AND
 * teleports the capturing piece straight to its own finished home as the reward.
 *
 * This is orthogonal to the "use all rolls when possible" rule: a leftover die is
 * forced onto any OTHER movable piece and is only forfeited when the player has no
 * other piece to move — i.e. they're genuinely back "in their house". The reward
 * teleport can never be used to dodge a die that another piece could still play.
 */
describe('capture teleports the capturer to its finish and the victim to its yard', () => {
  it('a bring-out capture finishes the capturing piece and yards the victim', () => {
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

    // Capturing piece is teleported to its own finished home.
    const movedPiece = next.find((s) => s.player_id === 'p-green')!.pieces.find((p) => p.id === bringOut!.pieceId)!
    expect(movedPiece.zone).toBe('finished')

    // Victim is back in its own yard.
    const victim = next.find((s) => s.player_id === 'p-yellow')!.pieces[0]!
    expect(victim.zone).toBe('base')
  })

  it('the leftover die is still forced onto another movable piece after a capture', () => {
    // Green already has a piece on the track (pos 5) plus pieces in the yard, and
    // a lone yellow piece sits on green's start. Roll 6 + 3: the 6 brings a piece
    // out and captures (capturer teleports home), and the leftover 3 must still be
    // usable — the on-track piece can move it, so the turn is NOT forfeited.
    const green: LudoPiece[] = [
      { id: 0, zone: 'track', pos: 5 },
      { id: 1, zone: 'base', pos: 1 },
      { id: 2, zone: 'base', pos: 2 },
      { id: 3, zone: 'base', pos: 3 },
    ]
    const yellow: LudoPiece[] = [{ id: 0, zone: 'track', pos: 0 }]
    const states = [state('green', green, 'p-green'), state('yellow', yellow, 'p-yellow')]

    const bringOut = getLegalMovesFromRemaining('green', green, [6, 3], states, 'p-green', 'traditional').find(
      (m) => m.from.zone === 'base' && m.diceValue === 6
    )!
    const afterCapture = applyMoveLocally(states, 'p-green', bringOut, 'green', 'traditional')
    const greenPieces = afterCapture.find((s) => s.player_id === 'p-green')!.pieces

    // The brought-out/capturing piece finished; the on-track piece (pos 5) remains.
    expect(greenPieces.find((p) => p.id === bringOut.pieceId)!.zone).toBe('finished')

    // The remaining die (3) has a legal move on the other piece → no forfeit.
    const leftover = getLegalMovesFromRemaining('green', greenPieces, [3], afterCapture, 'p-green', 'traditional')
    expect(leftover.some((m) => m.from.zone === 'track' && m.from.pos === 5 && m.to.pos === 8)).toBe(true)
  })

  it('forfeits the leftover die only when no other piece can move (back in the house)', () => {
    // Roll 6 + 3, all pieces in the yard, opponent on the start. The 6 brings a
    // piece out, captures, and it teleports home — leaving every remaining piece
    // in the yard. A 3 can't release a piece, so the leftover die is forfeited.
    const green: LudoPiece[] = [0, 1, 2, 3].map((id) => ({ id, zone: 'base', pos: id }))
    const yellow: LudoPiece[] = [{ id: 0, zone: 'track', pos: 0 }]
    const states = [state('green', green, 'p-green'), state('yellow', yellow, 'p-yellow')]

    const bringOut = getLegalMovesFromRemaining('green', green, [6, 3], states, 'p-green', 'traditional').find(
      (m) => m.from.zone === 'base' && m.diceValue === 6
    )!
    const afterCapture = applyMoveLocally(states, 'p-green', bringOut, 'green', 'traditional')
    const greenPieces = afterCapture.find((s) => s.player_id === 'p-green')!.pieces

    // No other piece can play the leftover 3 → the die is legitimately forfeited.
    const leftover = getLegalMovesFromRemaining('green', greenPieces, [3], afterCapture, 'p-green', 'traditional')
    expect(leftover.length).toBe(0)
  })
})
