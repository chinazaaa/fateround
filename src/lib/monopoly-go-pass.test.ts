import { describe, expect, it } from 'vitest'
import { applyGoPass, movePosition, planMultiPlayerCashDeltas } from './monopoly'
import type { MonopolyPlayerState } from '@/types'

describe('monopoly GO pass & cash accumulation', () => {
  it('awards GO salary when wrapping around the board', () => {
    const move = movePosition(38, 4) // moves 4 steps from 38 to 2 (Kitty / Esusu Fund)
    expect(move.to).toBe(2)
    expect(move.passedGo).toBe(true)

    const goPass = applyGoPass(1500, false)
    expect(goPass.cash).toBe(1700)
    expect(goPass.passedGoOnce).toBe(true)
    expect(goPass.collected).toBe(200)
  })

  it('does not award GO salary when moving away from space 0 without wrapping', () => {
    const move = movePosition(0, 2) // rolls 2 from PAYDAY to Kitty
    expect(move.to).toBe(2)
    expect(move.passedGo).toBe(false)
  })

  it('integration: preserves GO salary when landing on Kitty / Esusu Fund space actions', () => {
    const states = [
      {
        game_id: 'game-1',
        player_id: 'player-1',
        cash: 1500,
        position: 38,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        passed_go_once: false,
        bankrupt: false,
      } as unknown as MonopolyPlayerState,
    ]

    // Wrapping movement: 38 -> 2 (Kitty / Esusu Fund)
    const wrapMove = movePosition(38, 4)
    expect(wrapMove.passedGo).toBe(true)
    const wrapGoPass = applyGoPass(states[0]!.cash, states[0]!.passed_go_once)
    expect(wrapGoPass.cash).toBe(1700)

    // Card effect e.g. doctor's fee (-50) applied against currentDrawerCash (after GO pass)
    const wrapPlan = planMultiPlayerCashDeltas(states, 'player-1', -50, {}, wrapGoPass.cash)
    expect(wrapPlan.drawerCash).toBe(1650) // 1500 + 200 (GO) - 50 (card)

    // Non-wrapping movement: 0 -> 2 (Kitty / Esusu Fund)
    const nonWrapMove = movePosition(0, 2)
    expect(nonWrapMove.passedGo).toBe(false)
    const nonWrapPlan = planMultiPlayerCashDeltas(states, 'player-1', -50, {}, states[0]!.cash)
    expect(nonWrapPlan.drawerCash).toBe(1450) // 1500 - 50 (card, no GO salary)
  })
})
