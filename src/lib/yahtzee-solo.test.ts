import { describe, it, expect } from 'vitest'
import {
  YAHTZEE_SOLO_BOT_ID,
  YAHTZEE_SOLO_HUMAN_ID,
  initYahtzeeSolo,
  rollYahtzeeSolo,
  scoreYahtzeeSolo,
  setYahtzeeSoloHold,
  yahtzeeSoloTotal,
} from '@/lib/yahtzee-solo'
import { YAHTZEE_ALL_CATEGORIES } from '@/lib/yahtzee'

describe('initYahtzeeSolo', () => {
  it('creates a 2-player session with human first and empty score cards', () => {
    const s = initYahtzeeSolo({ humanGoesFirst: true })
    expect(s.session.turn_order).toEqual([YAHTZEE_SOLO_HUMAN_ID, YAHTZEE_SOLO_BOT_ID])
    expect(s.session.current_turn_index).toBe(0)
    expect(s.session.phase).toBe('rolling')
    expect(s.session.rolls_remaining).toBe(3)
    expect(s.session.rolls_this_turn).toBe(0)
    for (const id of [YAHTZEE_SOLO_HUMAN_ID, YAHTZEE_SOLO_BOT_ID]) {
      const card = s.scores[id]!
      for (const c of YAHTZEE_ALL_CATEGORIES) expect(card.categories[c]).toBeNull()
      expect(card.bonusYahtzees).toBe(0)
    }
  })
})

describe('rollYahtzeeSolo — turn gating', () => {
  it('rejects a roll from the wrong actor', () => {
    const s = initYahtzeeSolo({ humanGoesFirst: true })
    const r = rollYahtzeeSolo(s, YAHTZEE_SOLO_BOT_ID)
    expect(r.error).toMatch(/not your turn/i)
  })

  it('rejects a roll after 3 rolls this turn (rolls_remaining=0)', () => {
    let s = initYahtzeeSolo({ humanGoesFirst: true })
    s = rollYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, [1, 2, 3, 4, 5]).state
    s = rollYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, [1, 2, 3, 4, 5]).state
    s = rollYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, [1, 2, 3, 4, 5]).state
    const r = rollYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, [1, 2, 3, 4, 5])
    expect(r.error).toMatch(/no rolls remaining/i)
  })
})

describe('rollYahtzeeSolo — held bits behavior', () => {
  it('first roll ignores held (fresh turn — resets held to all-false)', () => {
    const s = initYahtzeeSolo({ humanGoesFirst: true })
    const rolled = rollYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, [3, 3, 3, 4, 5]).state
    expect(rolled.session.dice).toEqual([3, 3, 3, 4, 5])
    expect(rolled.session.held).toEqual([false, false, false, false, false])
    expect(rolled.session.rolls_remaining).toBe(2)
    expect(rolled.session.rolls_this_turn).toBe(1)
  })

  it('subsequent rolls only re-roll unheld dice', () => {
    let s = initYahtzeeSolo({ humanGoesFirst: true })
    s = rollYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, [3, 3, 3, 4, 5]).state
    s = setYahtzeeSoloHold(s, YAHTZEE_SOLO_HUMAN_ID, [true, true, true, false, false]).state
    s = rollYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, [3, 3, 3, 6, 6]).state
    // The held threes stayed; the two rerolled dice took the preset values.
    expect(s.session.dice).toEqual([3, 3, 3, 6, 6])
  })
})

describe('setYahtzeeSoloHold — gating', () => {
  it('rejects a hold before the first roll', () => {
    const s = initYahtzeeSolo({ humanGoesFirst: true })
    const r = setYahtzeeSoloHold(s, YAHTZEE_SOLO_HUMAN_ID, [true, true, true, false, false])
    expect(r.error).toMatch(/roll at least once/i)
  })
})

describe('scoreYahtzeeSolo — turn advance + score', () => {
  it('scores the picked category and advances to the next player', () => {
    let s = initYahtzeeSolo({ humanGoesFirst: true })
    s = rollYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, [3, 3, 3, 6, 6]).state
    s = scoreYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, 'full_house').state
    expect(s.scores[YAHTZEE_SOLO_HUMAN_ID]!.categories.full_house).toBe(25)
    expect(s.session.current_turn_index).toBe(1)
    expect(s.session.rolls_remaining).toBe(3)
    expect(s.session.rolls_this_turn).toBe(0)
  })

  it('rejects scoring a category that is already used', () => {
    let s = initYahtzeeSolo({ humanGoesFirst: true })
    s = rollYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, [3, 3, 3, 6, 6]).state
    s = scoreYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, 'full_house').state
    // Now bot rolls + scores; then human rolls again and tries full_house.
    s = rollYahtzeeSolo(s, YAHTZEE_SOLO_BOT_ID, [1, 1, 1, 1, 1]).state
    s = scoreYahtzeeSolo(s, YAHTZEE_SOLO_BOT_ID, 'yahtzee').state
    s = rollYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, [2, 2, 2, 5, 5]).state
    const r = scoreYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, 'full_house')
    expect(r.error).toMatch(/already used/i)
  })

  it('detects a Yahtzee bonus (+100) on a subsequent Yahtzee after the Yahtzee box is already scored', () => {
    let s = initYahtzeeSolo({ humanGoesFirst: true })
    // First Yahtzee → score into the yahtzee box (50 points).
    s = rollYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, [5, 5, 5, 5, 5]).state
    s = scoreYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, 'yahtzee').state
    expect(s.scores[YAHTZEE_SOLO_HUMAN_ID]!.categories.yahtzee).toBe(50)
    // Bot's turn — score anything to advance.
    s = rollYahtzeeSolo(s, YAHTZEE_SOLO_BOT_ID, [1, 1, 1, 1, 1]).state
    s = scoreYahtzeeSolo(s, YAHTZEE_SOLO_BOT_ID, 'chance').state
    // Human's next Yahtzee → bonus fires when scored elsewhere.
    s = rollYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, [6, 6, 6, 6, 6]).state
    s = scoreYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, 'sixes').state
    expect(s.scores[YAHTZEE_SOLO_HUMAN_ID]!.categories.sixes).toBe(30)
    expect(s.scores[YAHTZEE_SOLO_HUMAN_ID]!.bonusYahtzees).toBe(1)
    // Total includes the +100 bonus.
    expect(yahtzeeSoloTotal(s, YAHTZEE_SOLO_HUMAN_ID)).toBeGreaterThanOrEqual(50 + 30 + 100)
  })
})

describe('scoreYahtzeeSolo — game end', () => {
  it('flips outcome to human when human total > bot total on final category', () => {
    // Fast-fill everything by injecting scores category-by-category.
    let s = initYahtzeeSolo({ humanGoesFirst: true })
    for (const c of YAHTZEE_ALL_CATEGORIES) {
      // Give the human a Yahtzee-favouring roll (50 or category-specific max).
      const humanDice = c === 'yahtzee' ? [6, 6, 6, 6, 6] : [6, 6, 6, 6, 6]
      s = rollYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, humanDice).state
      s = scoreYahtzeeSolo(s, YAHTZEE_SOLO_HUMAN_ID, c).state
      // Bot rolls a dud and takes the same slot on their card.
      const botDice = [1, 1, 1, 1, 1]
      s = rollYahtzeeSolo(s, YAHTZEE_SOLO_BOT_ID, botDice).state
      s = scoreYahtzeeSolo(s, YAHTZEE_SOLO_BOT_ID, c).state
    }
    expect(s.session.phase).toBe('finished')
    expect(s.outcome).toBe('human')
    expect(s.session.winner_player_id).toBe(YAHTZEE_SOLO_HUMAN_ID)
  })
})
