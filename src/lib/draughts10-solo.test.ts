import { describe, it, expect } from 'vitest'
import {
  DRAUGHTS10_SOLO_BOT_ID,
  DRAUGHTS10_SOLO_HUMAN_ID,
  draughts10SoloLegalSteps,
  draughts10SoloMove,
  initDraughts10Solo,
  isBotTurn,
  isHumanTurn,
} from '@/lib/draughts10-solo'
import { pickDraughts10BotMove } from '@/lib/draughts10-bot'
import { DRAUGHTS10_STARTING_BOARD } from '@/lib/draughts10'

describe.each(['international', 'nigeria'] as const)('initDraughts10Solo (%s)', (variant) => {
  it('starts from the standard 10x10 opening with Black to move (human)', () => {
    const s = initDraughts10Solo({ variant })
    expect(s.session.variant).toBe(variant)
    expect(s.session.board).toBe(DRAUGHTS10_STARTING_BOARD)
    expect(s.session.current_turn).toBe('b')
    expect(s.session.player_black_id).toBe(DRAUGHTS10_SOLO_HUMAN_ID)
    expect(s.session.player_red_id).toBe(DRAUGHTS10_SOLO_BOT_ID)
    expect(s.session.huffing_enabled).toBe(false)
    expect(s.outcome).toBeNull()
    expect(isHumanTurn(s)).toBe(true)
    expect(isBotTurn(s)).toBe(false)
  })
})

describe('draughts10SoloMove', () => {
  it('rejects a move made out of turn', () => {
    const s = initDraughts10Solo({ variant: 'international' })
    const legalRed = draughts10SoloLegalSteps(s, 'r')
    const step = legalRed[0]!
    expect(draughts10SoloMove(s, 'r', step.from, step.to).error).toBe('Not your turn')
  })

  it('applies a legal opener and hands the turn to the opponent', () => {
    const s = initDraughts10Solo({ variant: 'international' })
    const legal = draughts10SoloLegalSteps(s, 'b')
    expect(legal.length).toBeGreaterThan(0)
    const step = legal[0]!
    const r = draughts10SoloMove(s, 'b', step.from, step.to)
    expect(r.error).toBeUndefined()
    expect(r.state.session.current_turn).toBe('r')
  })
})

describe('pickDraughts10BotMove', () => {
  it('picks a legal opening reply after the human moves', () => {
    const s = initDraughts10Solo({ variant: 'nigeria' })
    const legal = draughts10SoloLegalSteps(s, 'b')
    const humanStep = legal[0]!
    const afterHuman = draughts10SoloMove(s, 'b', humanStep.from, humanStep.to).state
    const botStep = pickDraughts10BotMove(afterHuman, 'easy')
    expect(botStep).not.toBeNull()
    const play = draughts10SoloMove(afterHuman, 'r', botStep!.from, botStep!.to)
    expect(play.error).toBeUndefined()
  })
})
