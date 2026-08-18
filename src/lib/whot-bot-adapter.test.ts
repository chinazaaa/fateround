import { describe, it, expect } from 'vitest'
import { adaptForBot } from '@/lib/whot-bot-adapter'
import { pickBotAction } from '@/lib/whot-bot'
import { parseWhotRules } from '@/lib/whot'
import type { WhotCard, WhotPlayerHand, WhotSession } from '@/types'

// ── Fixture builders ────────────────────────────────────────────────────────

const c = (id: string, shape: WhotCard['shape'], number: number): WhotCard => ({ id, shape, number })

function session(overrides: Partial<WhotSession> = {}): WhotSession {
  return {
    id: 's',
    game_id: 'g',
    turn_order: [],
    current_turn_index: 0,
    phase: 'playing',
    draw_pile: [],
    discard_pile: [],
    top_card: c('top', 'circle', 5),
    required_shape: null,
    required_number: null,
    pick_two_stack: 0,
    pick_five_stack: 0,
    status_message: null,
    winner_player_id: null,
    finish_order: [],
    reshuffle_count: 0,
    turn_deadline_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function hand(playerId: string, cards: WhotCard[], order = 0): WhotPlayerHand {
  return { id: `h-${playerId}`, game_id: 'g', player_id: playerId, cards, player_order: order, created_at: '' }
}

// ── Contract tests ──────────────────────────────────────────────────────────

describe('adaptForBot — contract', () => {
  it('returns null when the game is finished', () => {
    const s = session({ phase: 'finished', turn_order: ['h', 'b'] })
    const h = [hand('h', []), hand('b', [c('b1', 'circle', 5)])]
    expect(adaptForBot(s, h, 'b')).toBeNull()
  })

  it('returns null when the bot is not in the turn order', () => {
    const s = session({ turn_order: ['h1', 'h2'] })
    const h = [hand('h1', []), hand('h2', [])]
    expect(adaptForBot(s, h, 'missing')).toBeNull()
  })

  it('flags isBotTurn=false when a human has the turn', () => {
    const s = session({ turn_order: ['h', 'b'], current_turn_index: 0 })
    const h = [hand('h', [c('h1', 'circle', 3)]), hand('b', [c('b1', 'circle', 5)])]
    const r = adaptForBot(s, h, 'b')
    expect(r).not.toBeNull()
    expect(r!.isBotTurn).toBe(false)
    // The bot's own pickBotAction must NOT propose a move in this case.
    expect(pickBotAction(r!.soloState)).toBeNull()
  })

  it('flags isBotTurn=true when the bot has the turn AND yields a valid action', () => {
    const s = session({ turn_order: ['h', 'b'], current_turn_index: 1 })
    const h = [
      hand('h', [c('h1', 'star', 3)]),
      hand('b', [c('b1', 'circle', 5)]), // matches top by shape
    ]
    const r = adaptForBot(s, h, 'b')
    expect(r).not.toBeNull()
    expect(r!.isBotTurn).toBe(true)
    const action = pickBotAction(r!.soloState)
    expect(action).toEqual({ type: 'play', cardId: 'b1' })
  })
})

// ── Multi-player awareness ──────────────────────────────────────────────────

describe('adaptForBot — 3+ player rooms', () => {
  it('picks the NEXT player in turn_order as the "opponent" for hand-size sensing', () => {
    // Setup: 3 players — human1 (short), human2 (long), bot. Turn: bot.
    // The next player after the bot is human1 (short, 1 card). Bot holds a
    // Pick 2 and a plain card — with a short next player the Pick 2 should
    // score higher and be the pick.
    const s = session({ turn_order: ['h1', 'h2', 'b'], current_turn_index: 2 })
    const h = [
      hand('h1', [c('h1-1', 'circle', 8)], 0), // 1 card — the "opponent" the bot sees
      hand('h2', [c('h2-1', 'star', 3), c('h2-2', 'star', 4), c('h2-3', 'star', 5)], 1),
      hand('b', [c('b-p2', 'circle', 2), c('b-plain', 'circle', 3)], 2),
    ]
    const r = adaptForBot(s, h, 'b')
    expect(r).not.toBeNull()
    expect(r!.isBotTurn).toBe(true)
    // Bot sees opponent as 1-card, should attack with Pick 2.
    expect(pickBotAction(r!.soloState)).toEqual({ type: 'play', cardId: 'b-p2' })
  })

  it('bot hand contents (real cards) are used; opponent contents are hidden by design', () => {
    // The bot's own hand needs to be REAL for the heuristic; only the opponent
    // is opaque. Verify the returned soloState's bot-seat hand is exactly the
    // bot's cards from the DB.
    const s = session({ turn_order: ['h', 'b'], current_turn_index: 1 })
    const botCards = [c('b1', 'circle', 5), c('b2', 'triangle', 8), c('b3', 'whot', 20)]
    const h = [hand('h', [c('h1', 'star', 3)]), hand('b', botCards)]
    const r = adaptForBot(s, h, 'b')
    // Seat 1 is the bot in the solo view.
    expect(r!.soloState.hands[1]).toEqual(botCards)
    // Seat 0's cards are placeholders — never expose real opponent cards, and
    // they must match the opponent's real card COUNT so the "attack short
    // hand" heuristic reads correct sizes.
    expect(r!.soloState.hands[0]).toHaveLength(1)
  })
})

// ── Rules pass-through ──────────────────────────────────────────────────────

describe('adaptForBot — rules', () => {
  it('passes the rules object through to the returned soloState', () => {
    // Contract check for the adapter: whatever rules the caller supplies must
    // land on soloState.rules unchanged, so downstream heuristics reflect the
    // host's game settings. NOT a test of solo-bot behaviour under those rules
    // — that's whot-bot's own concern.
    const rules = parseWhotRules({ whot_pick3_enabled: false } as unknown as null)
    const s = session({ turn_order: ['h', 'b'], current_turn_index: 1 })
    const h = [hand('h', [c('h1', 'circle', 3)]), hand('b', [c('b1', 'circle', 5)])]
    const r = adaptForBot(s, h, 'b', rules)
    expect(r!.soloState.rules).toBe(rules)
  })

  it('defaults to parseWhotRules(null) when no rules argument is given', () => {
    const s = session({ turn_order: ['h', 'b'], current_turn_index: 1 })
    const h = [hand('h', [c('h1', 'circle', 3)]), hand('b', [c('b1', 'circle', 5)])]
    const r = adaptForBot(s, h, 'b')
    expect(r!.soloState.rules).toEqual(parseWhotRules(null))
  })
})
