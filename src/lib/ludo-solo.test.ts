import { describe, it, expect } from 'vitest'
import {
  LUDO_SOLO_BOT_ID,
  LUDO_SOLO_HUMAN_ID,
  applyLudoSoloMove,
  initLudoSolo,
  legalMovesForCurrentPlayer,
  rollLudoSolo,
} from '@/lib/ludo-solo'
import type { LudoDiceRoll } from '@/types'
import { START_POS } from '@/lib/ludo'

// A rolled 6 grants an extra roll AND lets a piece leave base.
const SIX_ROLL: LudoDiceRoll = { d1: 6, d2: 6, total: 12, doubles: true }
const MIXED_ROLL: LudoDiceRoll = { d1: 3, d2: 4, total: 7, doubles: false }
// A pair the initial state can't act on — no 6 to bring out, all pieces in base.
const DUD_ROLL: LudoDiceRoll = { d1: 3, d2: 4, total: 7, doubles: false }

describe('initLudoSolo', () => {
  it('creates a 2-player session with all pieces in base, using the pinned opts', () => {
    const s = initLudoSolo(undefined, { humanColor: 'red', humanGoesFirst: true })
    expect(s.session.turn_order).toEqual([LUDO_SOLO_HUMAN_ID, LUDO_SOLO_BOT_ID])
    expect(s.session.current_turn_index).toBe(0)
    expect(s.session.phase).toBe('roll')
    expect(s.states).toHaveLength(2)
    expect(s.states.find((x) => x.player_id === LUDO_SOLO_HUMAN_ID)!.color).toBe('red')
    // Bot gets the OTHER 2-player colour (yellow, opposite corner of red).
    expect(s.states.find((x) => x.player_id === LUDO_SOLO_BOT_ID)!.color).toBe('yellow')
    for (const st of s.states) {
      for (const p of st.pieces) expect(p.zone).toBe('base')
    }
    expect(s.outcome).toBeNull()
  })

  it('honours the humanGoesFirst pin — turn order flipped', () => {
    const s = initLudoSolo(undefined, { humanColor: 'red', humanGoesFirst: false })
    expect(s.session.turn_order).toEqual([LUDO_SOLO_BOT_ID, LUDO_SOLO_HUMAN_ID])
    expect(s.session.status_message).toMatch(/bot/i)
  })

  it('honours the humanColor pin — human gets yellow, bot gets red', () => {
    const s = initLudoSolo(undefined, { humanColor: 'yellow', humanGoesFirst: true })
    expect(s.states.find((x) => x.player_id === LUDO_SOLO_HUMAN_ID)!.color).toBe('yellow')
    expect(s.states.find((x) => x.player_id === LUDO_SOLO_BOT_ID)!.color).toBe('red')
  })
})

describe('rollLudoSolo — turn gating', () => {
  it('rejects a roll when it is not the actor’s turn', () => {
    const s = initLudoSolo(undefined, { humanGoesFirst: true })
    const r = rollLudoSolo(s, LUDO_SOLO_BOT_ID)
    expect(r.error).toMatch(/not your turn/i)
  })

  it('rejects a roll when the phase is move (dice already spent)', () => {
    const s = initLudoSolo(undefined, { humanGoesFirst: true })
    const rolled = rollLudoSolo(s, LUDO_SOLO_HUMAN_ID, SIX_ROLL).state
    expect(rolled.session.phase).toBe('move')
    const r = rollLudoSolo(rolled, LUDO_SOLO_HUMAN_ID, SIX_ROLL)
    expect(r.error).toMatch(/not in roll phase/i)
  })
})

describe('rollLudoSolo — legal-move handling', () => {
  it('enters move phase when the roll produces at least one legal move', () => {
    // All pieces in base; a 6 lets one out.
    const s = rollLudoSolo(initLudoSolo(undefined, { humanGoesFirst: true }), LUDO_SOLO_HUMAN_ID, SIX_ROLL).state
    expect(s.session.phase).toBe('move')
    expect(s.session.remaining_dice).toEqual([6, 6])
    const moves = legalMovesForCurrentPlayer(s)
    expect(moves.length).toBeGreaterThan(0)
  })

  it('auto-advances the turn when the roll produces NO legal move', () => {
    // All in base + no 6 → nothing to do; turn passes.
    const s = rollLudoSolo(initLudoSolo(undefined, { humanGoesFirst: true }), LUDO_SOLO_HUMAN_ID, DUD_ROLL).state
    expect(s.session.phase).toBe('roll')
    expect(s.session.current_turn_index).toBe(1) // now bot's turn
    expect(s.session.remaining_dice).toBeNull()
    expect(s.session.status_message).toMatch(/no legal move/i)
  })
})

describe('applyLudoSoloMove — turn advancement', () => {
  it('after a non-6 roll and a full move, passes the turn to the opponent', () => {
    // Bring one out with 6+6, spend one 6 to leave base (still in move phase
    // with the other 6). Instead: use MIXED_ROLL after seeding a piece.
    let s = initLudoSolo(undefined, { humanGoesFirst: true })
    // First: give the human a 6+6, use both dice to bring out and move.
    s = rollLudoSolo(s, LUDO_SOLO_HUMAN_ID, SIX_ROLL).state
    let moves = legalMovesForCurrentPlayer(s)
    const bringOut = moves.find((m) => m.from.zone === 'base')!
    s = applyLudoSoloMove(s, LUDO_SOLO_HUMAN_ID, bringOut).state
    // After spending one 6, the second 6 remains — still move phase.
    expect(s.session.phase).toBe('move')
    expect(s.session.remaining_dice).toEqual([6])
    // Spend the second 6 advancing the just-emerged piece further.
    moves = legalMovesForCurrentPlayer(s)
    const secondMove = moves[0]!
    s = applyLudoSoloMove(s, LUDO_SOLO_HUMAN_ID, secondMove).state
    // Double-six rolled → extra roll bonus, back to roll phase, still human's turn.
    expect(s.session.phase).toBe('roll')
    expect(s.session.current_turn_index).toBe(0)
    expect(s.session.consecutive_sixes).toBe(1)
    expect(s.session.status_message).toMatch(/roll again/i)
  })

  it('passes the turn after a non-six roll is fully spent', () => {
    // Seed a piece on the track first (via a 6+6), then roll 3+4 and spend both.
    let s = initLudoSolo(undefined, { humanGoesFirst: true })
    s = rollLudoSolo(s, LUDO_SOLO_HUMAN_ID, SIX_ROLL).state
    const bringOut = legalMovesForCurrentPlayer(s).find((m) => m.from.zone === 'base')!
    s = applyLudoSoloMove(s, LUDO_SOLO_HUMAN_ID, bringOut).state
    // Spend the second 6 on the same piece.
    s = applyLudoSoloMove(s, LUDO_SOLO_HUMAN_ID, legalMovesForCurrentPlayer(s)[0]!).state
    // Bonus roll came due to double sixes; roll 3+4 now.
    s = rollLudoSolo(s, LUDO_SOLO_HUMAN_ID, MIXED_ROLL).state
    // Spend both dice.
    while (s.session.phase === 'move') {
      const moves = legalMovesForCurrentPlayer(s)
      if (moves.length === 0) break
      s = applyLudoSoloMove(s, LUDO_SOLO_HUMAN_ID, moves[0]!).state
    }
    // Non-six roll fully consumed → turn passes to bot.
    expect(s.session.phase).toBe('roll')
    expect(s.session.current_turn_index).toBe(1)
    expect(s.session.consecutive_sixes).toBe(0)
  })
})

describe('applyLudoSoloMove — turn gating', () => {
  it('rejects a move from the wrong actor', () => {
    let s = initLudoSolo(undefined, { humanGoesFirst: true })
    s = rollLudoSolo(s, LUDO_SOLO_HUMAN_ID, SIX_ROLL).state
    const moves = legalMovesForCurrentPlayer(s)
    const r = applyLudoSoloMove(s, LUDO_SOLO_BOT_ID, moves[0]!)
    expect(r.error).toMatch(/not your turn/i)
  })

  it('rejects a move when phase is roll (nothing rolled yet)', () => {
    const s = initLudoSolo(undefined, { humanGoesFirst: true })
    const r = applyLudoSoloMove(s, LUDO_SOLO_HUMAN_ID, {
      pieceId: 0,
      from: { id: 0, zone: 'base', pos: 0 },
      to: { id: 0, zone: 'track', pos: START_POS.red },
      captures: false,
      diceIndex: 0,
      diceValue: 6,
    })
    expect(r.error).toMatch(/not in move phase/i)
  })
})
