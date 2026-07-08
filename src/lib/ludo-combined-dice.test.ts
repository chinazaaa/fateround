import { describe, expect, it } from 'vitest'
import { applyMoveLocally, getLegalMovesFromRemaining, resolveLudoMovesForTurn } from './ludo'
import type { LudoColor, LudoPiece, LudoPlayerState } from '@/types'

function state(color: LudoColor, pieces: LudoPiece[], id = `p-${color}`): LudoPlayerState {
  return { id: `s-${color}`, game_id: 'g', player_id: id, color, pieces, player_order: 0, created_at: '' }
}

describe('resolveLudoMovesForTurn', () => {
  it('combines dice when only one piece is outside and no bring-out is possible', () => {
    const green: LudoPiece[] = [
      { id: 0, zone: 'track', pos: 5 },
      { id: 1, zone: 'base', pos: 1 },
      { id: 2, zone: 'base', pos: 2 },
      { id: 3, zone: 'base', pos: 3 },
    ]
    const states = [state('green', green)]

    const perDie = getLegalMovesFromRemaining('green', green, [5, 1], states, 'p-green')
    expect(perDie).toHaveLength(2)

    const combined = resolveLudoMovesForTurn('green', green, [5, 1], states, 'p-green')
    expect(combined).toHaveLength(1)
    expect(combined[0]!.usesAllDice).toBe(true)
    expect(combined[0]!.diceValue).toBe(6)
    expect(combined[0]!.pieceId).toBe(0)
  })

  it('keeps per-die moves when a 6 could bring a piece out instead', () => {
    const green: LudoPiece[] = [
      { id: 0, zone: 'track', pos: 5 },
      { id: 1, zone: 'base', pos: 1 },
      { id: 2, zone: 'base', pos: 2 },
      { id: 3, zone: 'base', pos: 3 },
    ]
    const states = [state('green', green)]

    const moves = resolveLudoMovesForTurn('green', green, [6, 3], states, 'p-green')
    expect(moves.some((m) => m.usesAllDice)).toBe(false)
    expect(moves.some((m) => m.from.zone === 'base')).toBe(true)
  })

  it('keeps per-die moves when multiple pieces are outside', () => {
    const green: LudoPiece[] = [
      { id: 0, zone: 'track', pos: 5 },
      { id: 1, zone: 'track', pos: 10 },
      { id: 2, zone: 'base', pos: 2 },
      { id: 3, zone: 'base', pos: 3 },
    ]
    const states = [state('green', green)]

    const moves = resolveLudoMovesForTurn('green', green, [5, 1], states, 'p-green')
    expect(moves.some((m) => m.usesAllDice)).toBe(false)
    expect(moves.length).toBeGreaterThan(1)
  })

  it('applyMoveLocally with usesAllDice matches moving the combined total', () => {
    const green: LudoPiece[] = [
      { id: 0, zone: 'track', pos: 5 },
      { id: 1, zone: 'base', pos: 1 },
      { id: 2, zone: 'base', pos: 2 },
      { id: 3, zone: 'base', pos: 3 },
    ]
    const states = [state('green', green)]

    const combined = resolveLudoMovesForTurn('green', green, [5, 1], states, 'p-green')[0]!
    const afterCombined = applyMoveLocally(states, 'p-green', combined, 'green', 'modern')

    let stepped = states
    for (const move of getLegalMovesFromRemaining('green', green, [5, 1], states, 'p-green')) {
      if (move.diceIndex === 0) {
        stepped = applyMoveLocally(stepped, 'p-green', move, 'green', 'modern')
        break
      }
    }
    const greenAfterFirst = stepped.find((s) => s.player_id === 'p-green')!.pieces
    const afterSequential = applyMoveLocally(
      stepped,
      'p-green',
      getLegalMovesFromRemaining('green', greenAfterFirst, [1], stepped, 'p-green')[0]!,
      'green',
      'modern'
    )

    expect(afterCombined).toEqual(afterSequential)
  })
})
