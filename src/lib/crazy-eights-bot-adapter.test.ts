import { describe, it, expect } from 'vitest'
import { adaptForCrazy8Bot } from '@/lib/crazy-eights-bot-adapter'
import { pickBotAction } from '@/lib/crazy-eights-bot'
import { parseCrazyEightsRules } from '@/lib/crazy-eights'
import { CRAZY8_SOLO_BOT_ID, CRAZY8_SOLO_HUMAN_ID } from '@/lib/crazy-eights-solo'
import type { CrazyEightsCard, CrazyEightsPlayerHand, CrazyEightsSession } from '@/types'

// ── Fixture builders ────────────────────────────────────────────────────────

const c = (id: string, suit: CrazyEightsCard['suit'], rank: number): CrazyEightsCard => ({ id, suit, rank })

function session(overrides: Partial<CrazyEightsSession> = {}): CrazyEightsSession {
  return {
    id: 's',
    game_id: 'g',
    turn_order: [],
    current_turn_index: 0,
    direction: 1,
    phase: 'playing',
    draw_pile: [],
    discard_pile: [],
    top_card: c('top', 'hearts', 5),
    required_suit: null,
    pick_two_stack: 0,
    joker_penalty: 0,
    status_message: null,
    winner_player_id: null,
    finish_order: [],
    turn_deadline_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function hand(playerId: string, cards: CrazyEightsCard[], order = 0): CrazyEightsPlayerHand {
  return { id: `h-${playerId}`, game_id: 'g', player_id: playerId, cards, player_order: order, created_at: '' }
}

// ── Contract ────────────────────────────────────────────────────────────────

describe('adaptForCrazy8Bot — contract', () => {
  it('returns null when the game is finished', () => {
    const s = session({ phase: 'finished', turn_order: ['h', 'b'] })
    expect(adaptForCrazy8Bot(s, [hand('h', []), hand('b', [c('b1', 'hearts', 5)])], 'b')).toBeNull()
  })

  it('returns null when the bot is not seated', () => {
    const s = session({ turn_order: ['h1', 'h2'] })
    expect(adaptForCrazy8Bot(s, [hand('h1', []), hand('h2', [])], 'missing')).toBeNull()
  })

  it('returns null when the bot has no hand row', () => {
    const s = session({ turn_order: ['h', 'b'], current_turn_index: 1 })
    expect(adaptForCrazy8Bot(s, [hand('h', [])], 'b')).toBeNull()
  })

  it('flags isBotTurn=false when a human holds the turn', () => {
    const s = session({ turn_order: ['h', 'b'], current_turn_index: 0 })
    const r = adaptForCrazy8Bot(s, [hand('h', [c('h1', 'hearts', 3)]), hand('b', [c('b1', 'hearts', 5)])], 'b')
    expect(r).not.toBeNull()
    expect(r!.isBotTurn).toBe(false)
    // …and the heuristic must decline to act on that state.
    expect(pickBotAction(r!.soloState)).toBeNull()
  })

  it('maps the bot onto solo seat 1 and reports its real DB id', () => {
    const s = session({ turn_order: ['h', 'b'], current_turn_index: 1 })
    const r = adaptForCrazy8Bot(s, [hand('h', [c('h1', 'hearts', 3)]), hand('b', [c('b1', 'hearts', 5)])], 'b')!
    expect(r.isBotTurn).toBe(true)
    expect(r.botPlayerId).toBe('b')
    expect(r.soloState.session.turn_order).toEqual([CRAZY8_SOLO_HUMAN_ID, CRAZY8_SOLO_BOT_ID])
    expect(r.soloState.session.current_turn_index).toBe(1)
    expect(r.soloState.hands[1]!.map((card) => card.id)).toEqual(['b1'])
  })

  it('gives the opponent placeholders that match their hand SIZE only', () => {
    const s = session({ turn_order: ['h', 'b'], current_turn_index: 1 })
    const humanCards = [c('h1', 'hearts', 3), c('h2', 'spades', 9), c('h3', 'clubs', 4)]
    const r = adaptForCrazy8Bot(s, [hand('h', humanCards), hand('b', [c('b1', 'hearts', 5)])], 'b')!
    expect(r.soloState.hands[0]).toHaveLength(3)
    // The real cards must NOT leak into the bot's view — that would be cheating.
    const leaked = r.soloState.hands[0]!.filter((card) => humanCards.some((real) => real.id === card.id))
    expect(leaked, 'opponent hand leaked into the bot view').toEqual([])
  })

  it('uses a rank no real card carries for the placeholders', () => {
    const s = session({ turn_order: ['h', 'b'], current_turn_index: 1 })
    const r = adaptForCrazy8Bot(s, [hand('h', [c('h1', 'hearts', 3)]), hand('b', [c('b1', 'hearts', 5)])], 'b')!
    // Ace = 1 … King = 13, Joker = 0. -1 can never match the top card by accident.
    for (const card of r.soloState.hands[0]!) expect(card.rank).toBe(-1)
  })

  it('passes the room rules straight through', () => {
    const s = session({ turn_order: ['h', 'b'], current_turn_index: 1 })
    const rules = parseCrazyEightsRules({
      crazy8_action_cards: false,
      crazy8_jokers: true,
      crazy8_pick2_stacking: false,
    })
    const r = adaptForCrazy8Bot(s, [hand('h', []), hand('b', [c('b1', 'hearts', 5)])], 'b', rules)!
    expect(r.soloState.rules).toEqual({ actionCards: false, jokers: true, pick2Stacking: false })
  })
})

// ── Opponent selection ──────────────────────────────────────────────────────

describe('adaptForCrazy8Bot — who counts as "the opponent"', () => {
  it('picks the NEXT seat after the current one, not the bot itself', () => {
    // Seats: h1(0) bot(1) h2(2). Bot's turn → the player about to be hit is h2.
    const s = session({ turn_order: ['h1', 'b', 'h2'], current_turn_index: 1 })
    const hands = [
      hand('h1', [c('a', 'hearts', 2), c('b', 'hearts', 3), c('c', 'hearts', 4), c('d', 'hearts', 6)], 0),
      hand('b', [c('b1', 'hearts', 5)], 1),
      hand('h2', [c('e', 'spades', 7)], 2),
    ]
    const r = adaptForCrazy8Bot(s, hands, 'b')!
    expect(r.soloState.hands[0], 'should mirror h2 (1 card), not h1 (4 cards)').toHaveLength(1)
  })

  it('follows a reversed direction when picking the opponent', () => {
    // Same seats, but a Queen reversed play: from seat 1 the next player is h1, not h2.
    const s = session({ turn_order: ['h1', 'b', 'h2'], current_turn_index: 1, direction: -1 })
    const hands = [
      hand('h1', [c('a', 'hearts', 2)], 0),
      hand('b', [c('b1', 'hearts', 5)], 1),
      hand('h2', [c('e', 'spades', 7), c('f', 'spades', 8), c('g', 'spades', 9)], 2),
    ]
    const r = adaptForCrazy8Bot(s, hands, 'b')!
    expect(r.soloState.hands[0], 'reversed play should point at h1 (1 card), not h2 (3)').toHaveLength(1)
  })

  it('normalises the 2-seat view to forward direction', () => {
    // The bot's scoring reads cards, never `direction`; leaving -1 in place would make the
    // engine's next-index helper walk the 2-seat view backwards.
    const s = session({ turn_order: ['h1', 'b', 'h2'], current_turn_index: 1, direction: -1 })
    const hands = [hand('h1', [c('a', 'hearts', 2)], 0), hand('b', [c('b1', 'hearts', 5)], 1), hand('h2', [], 2)]
    expect(adaptForCrazy8Bot(s, hands, 'b')!.soloState.session.direction).toBe(1)
  })
})

// ── End-to-end with the real heuristic ──────────────────────────────────────

describe('adaptForCrazy8Bot — drives the real bot', () => {
  const rules = parseCrazyEightsRules(null)

  it('plays a legal card when one is in hand', () => {
    const s = session({ turn_order: ['h', 'b'], current_turn_index: 1, top_card: c('top', 'hearts', 5) })
    const hands = [hand('h', [c('h1', 'spades', 3)]), hand('b', [c('b1', 'hearts', 9), c('b2', 'clubs', 4)])]
    const action = pickBotAction(adaptForCrazy8Bot(s, hands, 'b', rules)!.soloState)
    expect(action).toEqual({ type: 'play', cardId: 'b1' })
  })

  it('draws when nothing is playable', () => {
    const s = session({ turn_order: ['h', 'b'], current_turn_index: 1, top_card: c('top', 'hearts', 5) })
    const hands = [hand('h', [c('h1', 'spades', 3)]), hand('b', [c('b1', 'clubs', 4), c('b2', 'spades', 9)])]
    const action = pickBotAction(adaptForCrazy8Bot(s, hands, 'b', rules)!.soloState)
    expect(action).toEqual({ type: 'draw' })
  })

  it('names a suit when the engine is waiting on its wild', () => {
    const s = session({
      turn_order: ['h', 'b'],
      current_turn_index: 1,
      phase: 'choose_suit',
      top_card: c('top', 'hearts', 8),
    })
    const hands = [hand('h', []), hand('b', [c('b1', 'clubs', 4), c('b2', 'clubs', 9)])]
    const action = pickBotAction(adaptForCrazy8Bot(s, hands, 'b', rules)!.soloState)
    expect(action?.type).toBe('choose_suit')
    // It should call the suit it actually holds, not an arbitrary one.
    expect(action).toEqual({ type: 'choose_suit', suit: 'clubs' })
  })

  it('honours a room that has action cards switched off', () => {
    // With actionCards off, a 2 is an ordinary card — not a Pick Two. The bot must still
    // treat it as a legal play on a matching suit rather than reasoning about a penalty.
    const noActions = parseCrazyEightsRules({
      crazy8_action_cards: false,
      crazy8_jokers: false,
      crazy8_pick2_stacking: false,
    })
    const s = session({ turn_order: ['h', 'b'], current_turn_index: 1, top_card: c('top', 'hearts', 5) })
    const hands = [hand('h', [c('h1', 'spades', 3)]), hand('b', [c('b1', 'hearts', 2)])]
    const action = pickBotAction(adaptForCrazy8Bot(s, hands, 'b', noActions)!.soloState)
    expect(action).toEqual({ type: 'play', cardId: 'b1' })
  })

  it('works in a 4-seat room, not just heads-up', () => {
    const s = session({
      turn_order: ['h1', 'h2', 'b', 'h3'],
      current_turn_index: 2,
      top_card: c('top', 'diamonds', 6),
    })
    const hands = [
      hand('h1', [c('a', 'hearts', 2)], 0),
      hand('h2', [c('b', 'hearts', 3)], 1),
      hand('b', [c('b1', 'diamonds', 10), c('b2', 'clubs', 4)], 2),
      hand('h3', [c('e', 'spades', 7)], 3),
    ]
    const r = adaptForCrazy8Bot(s, hands, 'b', rules)!
    expect(r.isBotTurn).toBe(true)
    expect(pickBotAction(r.soloState)).toEqual({ type: 'play', cardId: 'b1' })
  })
})
