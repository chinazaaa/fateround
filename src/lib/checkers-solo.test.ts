import { describe, it, expect } from 'vitest'
import {
  CHECKERS_SOLO_BOT_ID,
  CHECKERS_SOLO_HUMAN_ID,
  checkersSoloLegalSteps,
  checkersSoloMove,
  initCheckersSolo,
  isBotTurn,
  isHumanTurn,
} from '@/lib/checkers-solo'
import { pickCheckersBotMove } from '@/lib/checkers-bot'
import { CHECKERS_STARTING_BOARD } from '@/lib/checkers'

describe('initCheckersSolo', () => {
  it('starts from the standard 8x8 opening with Black to move (human)', () => {
    const s = initCheckersSolo()
    expect(s.session.board).toBe(CHECKERS_STARTING_BOARD)
    expect(s.session.current_turn).toBe('b')
    expect(s.session.player_black_id).toBe(CHECKERS_SOLO_HUMAN_ID)
    expect(s.session.player_red_id).toBe(CHECKERS_SOLO_BOT_ID)
    expect(s.outcome).toBeNull()
    expect(isHumanTurn(s)).toBe(true)
    expect(isBotTurn(s)).toBe(false)
  })

  it('honours the human-color option', () => {
    const s = initCheckersSolo({ human: 'r' })
    expect(s.session.player_red_id).toBe(CHECKERS_SOLO_HUMAN_ID)
    // Black opens; if human is Red, the first turn is the bot's.
    expect(isBotTurn(s)).toBe(true)
  })

  it('serialises + rehydrates without behaviour drift', () => {
    const s = initCheckersSolo()
    const rehydrated = JSON.parse(JSON.stringify(s))
    expect(rehydrated.session.board).toEqual(s.session.board)
    expect(rehydrated.session.current_turn).toEqual(s.session.current_turn)
  })
})

describe('checkersSoloMove', () => {
  it('rejects a move made out of turn', () => {
    const s = initCheckersSolo()
    // Human is Black; try to move Red first.
    const legalRed = checkersSoloLegalSteps(s, 'r')
    expect(legalRed.length).toBeGreaterThan(0)
    const step = legalRed[0]!
    expect(checkersSoloMove(s, 'r', step.from, step.to).error).toBe('Not your turn')
  })

  it('rejects an illegal target square', () => {
    const s = initCheckersSolo()
    expect(checkersSoloMove(s, 'b', '25', '00').error).toBe('Illegal move')
  })

  it('applies a legal opener and hands the turn to the opponent', () => {
    const s = initCheckersSolo()
    const legal = checkersSoloLegalSteps(s, 'b')
    expect(legal.length).toBeGreaterThan(0)
    const step = legal[0]!
    const r = checkersSoloMove(s, 'b', step.from, step.to)
    expect(r.error).toBeUndefined()
    expect(r.state.session.current_turn).toBe('r')
    expect(r.state.session.last_move_from).toBe(step.from)
    expect(r.state.session.last_move_to).toBe(step.to)
    expect(r.state.outcome).toBeNull()
  })
})

describe('pickCheckersBotMove', () => {
  it('returns null when it is not the bot turn', () => {
    const s = initCheckersSolo() // human=Black, bot=Red; Black opens
    expect(pickCheckersBotMove(s, 'normal')).toBeNull()
  })

  it('picks a legal opening reply for the bot after the human moves', () => {
    const s = initCheckersSolo()
    const legal = checkersSoloLegalSteps(s, 'b')
    const humanStep = legal[0]!
    const afterHuman = checkersSoloMove(s, 'b', humanStep.from, humanStep.to).state
    expect(afterHuman.session.current_turn).toBe('r')
    const botStep = pickCheckersBotMove(afterHuman, 'easy')
    expect(botStep).not.toBeNull()
    const play = checkersSoloMove(afterHuman, 'r', botStep!.from, botStep!.to)
    expect(play.error).toBeUndefined()
  })
})
