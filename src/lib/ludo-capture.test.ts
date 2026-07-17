import { describe, it, expect } from 'vitest'
import { applyMoveLocally, getLegalMovesFromRemaining, getLegalMovesForSteps } from './ludo'
import type { LudoColor, LudoPiece, LudoPlayerState } from '@/types'

function state(color: LudoColor, pieces: LudoPiece[], id = `p-${color}`): LudoPlayerState {
  return { id: `s-${color}`, game_id: 'g', player_id: id, color, pieces, player_order: 0, created_at: '' }
}

/**
 * House rule: capturing an opponent (by counting a die and moving onto them on
 * the track) sends the victim back to its yard AND teleports the capturing piece
 * straight to its own finished home as the reward.
 *
 * Emerging from the yard is NOT a capture: stepping out of your house onto your
 * start square can never "chase home" an opponent parked there — you have to earn
 * the capture by counting a die and moving onto them.
 */
describe('a track-move capture teleports the capturer to its finish and the victim to its yard', () => {
  it('moving onto a lone opponent captures, finishing the capturer and yarding the victim', () => {
    // Traditional variant: no safe squares on the track. Green has a piece on the
    // track and a lone yellow piece sits 3 squares ahead.
    const green: LudoPiece[] = [
      { id: 0, zone: 'track', pos: 2 },
      { id: 1, zone: 'base', pos: 1 },
      { id: 2, zone: 'base', pos: 2 },
      { id: 3, zone: 'base', pos: 3 },
    ]
    const yellow: LudoPiece[] = [{ id: 0, zone: 'track', pos: 5 }]
    const states = [state('green', green, 'p-green'), state('yellow', yellow, 'p-yellow')]

    const capture = getLegalMovesForSteps('green', green, 3, states, 'p-green', 'traditional').find(
      (m) => m.from.zone === 'track' && m.to.zone === 'track' && m.to.pos === 5
    )
    expect(capture?.captures).toBe(true)

    const next = applyMoveLocally(states, 'p-green', capture!, 'green', 'traditional')

    // Capturing piece is teleported to its own finished home.
    const movedPiece = next.find((s) => s.player_id === 'p-green')!.pieces.find((p) => p.id === capture!.pieceId)!
    expect(movedPiece.zone).toBe('finished')

    // Victim is back in its own yard.
    const victim = next.find((s) => s.player_id === 'p-yellow')!.pieces[0]!
    expect(victim.zone).toBe('base')
  })
})

describe('emerging from the yard never captures an opponent on the start square', () => {
  it('a bring-out onto a lone opponent does NOT capture — the opponent stays put', () => {
    // Traditional variant: green's start (pos 0) is not safe. Green has all pieces
    // in the yard and a lone yellow piece sits on green's start.
    const green: LudoPiece[] = [0, 1, 2, 3].map((id) => ({ id, zone: 'base', pos: id }))
    const yellow: LudoPiece[] = [{ id: 0, zone: 'track', pos: 0 }]
    const states = [state('green', green, 'p-green'), state('yellow', yellow, 'p-yellow')]

    const bringOut = getLegalMovesForSteps('green', green, 6, states, 'p-green', 'traditional').find(
      (m) => m.from.zone === 'base' && m.to.zone === 'track' && m.to.pos === 0
    )
    expect(bringOut?.captures).toBe(false)

    const next = applyMoveLocally(states, 'p-green', bringOut!, 'green', 'traditional')

    // The emerging piece simply lands on the start square — no reward teleport.
    const movedPiece = next.find((s) => s.player_id === 'p-green')!.pieces.find((p) => p.id === bringOut!.pieceId)!
    expect(movedPiece.zone).toBe('track')
    expect(movedPiece.pos).toBe(0)

    // The opponent is untouched — still on the track, not sent home.
    const opponent = next.find((s) => s.player_id === 'p-yellow')!.pieces[0]!
    expect(opponent.zone).toBe('track')
    expect(opponent.pos).toBe(0)
  })

  it('after emerging, the leftover die can still be counted onto the opponent to capture', () => {
    // Roll 6 + 3, all pieces in the yard, opponent parked 3 ahead of green's start
    // (pos 3). The 6 brings a piece out onto pos 0 (no capture); the leftover 3 is
    // then counted, moving 0 -> 3 and capturing the opponent the fair way.
    const green: LudoPiece[] = [0, 1, 2, 3].map((id) => ({ id, zone: 'base', pos: id }))
    const yellow: LudoPiece[] = [{ id: 0, zone: 'track', pos: 3 }]
    const states = [state('green', green, 'p-green'), state('yellow', yellow, 'p-yellow')]

    const bringOut = getLegalMovesFromRemaining('green', green, [6, 3], states, 'p-green', 'traditional').find(
      (m) => m.from.zone === 'base' && m.diceValue === 6
    )!
    expect(bringOut.captures).toBe(false)
    const afterBringOut = applyMoveLocally(states, 'p-green', bringOut, 'green', 'traditional')
    const greenPieces = afterBringOut.find((s) => s.player_id === 'p-green')!.pieces

    // Opponent survived the emergence.
    expect(afterBringOut.find((s) => s.player_id === 'p-yellow')!.pieces[0]!.zone).toBe('track')

    // The leftover 3 counts the new piece 0 -> 3 onto the opponent, capturing it.
    const leftover = getLegalMovesFromRemaining(
      'green',
      greenPieces,
      [3],
      afterBringOut,
      'p-green',
      'traditional'
    ).find((m) => m.from.zone === 'track' && m.from.pos === 0 && m.to.pos === 3)!
    expect(leftover.captures).toBe(true)
    const afterCapture = applyMoveLocally(afterBringOut, 'p-green', leftover, 'green', 'traditional')
    expect(afterCapture.find((s) => s.player_id === 'p-yellow')!.pieces[0]!.zone).toBe('base')
  })
})
