import { describe, it, expect } from 'vitest'
import { adaptMonopolyForBot } from '@/lib/monopoly-bot-adapter'
import type {
  MonopolyBoard,
  MonopolyPhase,
  MonopolyPlayerState,
  MonopolyPendingDebt,
  MonopolyAuctionState,
} from '@/types'

// ── Fixture builders ────────────────────────────────────────────────────────

const BOT = 'bot-1'
const HUMAN = 'human-1'

function board(overrides: Partial<MonopolyBoard> = {}): MonopolyBoard {
  return {
    id: 'b',
    game_id: 'G1',
    turn_order: [HUMAN, BOT],
    current_turn_index: 1, // bot's turn by default in these fixtures
    phase: 'roll' as MonopolyPhase,
    last_dice: null,
    consecutive_doubles: 0,
    property_owners: {},
    property_buildings: {},
    mortgaged_properties: {},
    houses_in_bank: 32,
    hotels_in_bank: 12,
    chance_deck: [],
    community_deck: [],
    chance_discard: [],
    community_discard: [],
    auction_state: null,
    pending_trade: null,
    pending_debt: null,
    pending_space: null,
    status_message: null,
    last_card_event: null,
    last_rent_event: null,
    last_cash_event: null,
    last_trade_event: null,
    turn_deadline_at: null,
    winner_player_id: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function pState(playerId: string, overrides: Partial<MonopolyPlayerState> = {}): MonopolyPlayerState {
  return {
    id: `ps-${playerId}`,
    game_id: 'G1',
    player_id: playerId,
    position: 0,
    cash: 1500,
    in_jail: false,
    jail_turns: 0,
    get_out_of_jail_free: 0,
    bankrupt: false,
    passed_go_once: false,
    player_order: playerId === HUMAN ? 0 : 1,
    created_at: '',
    ...overrides,
  }
}

// ── Contract tests ──────────────────────────────────────────────────────────

describe('adaptMonopolyForBot — contract', () => {
  it('returns null when the game is finished', () => {
    const v = adaptMonopolyForBot(board({ phase: 'finished' }), [pState(HUMAN), pState(BOT)], BOT)
    expect(v).toBeNull()
  })

  it('returns null when the bot has no player_state row', () => {
    const v = adaptMonopolyForBot(board(), [pState(HUMAN)], BOT)
    expect(v).toBeNull()
  })

  it('returns null when the bot is bankrupt', () => {
    const v = adaptMonopolyForBot(board(), [pState(HUMAN), pState(BOT, { bankrupt: true })], BOT)
    expect(v).toBeNull()
  })
})

// ── isMyTurn gating ─────────────────────────────────────────────────────────

describe('adaptMonopolyForBot — isMyTurn', () => {
  it('is true when phase is roll and the bot holds the turn', () => {
    const v = adaptMonopolyForBot(board(), [pState(HUMAN), pState(BOT)], BOT)!
    expect(v.isMyTurn).toBe(true)
  })

  it('is false when a human holds the turn', () => {
    const v = adaptMonopolyForBot(board({ current_turn_index: 0 }), [pState(HUMAN), pState(BOT)], BOT)!
    expect(v.isMyTurn).toBe(false)
  })

  it('is false during an auction phase — auctions use their own gate', () => {
    // auction is not one of the turn-phases; even if it were the bot's turn
    // by index, isMyTurn stays false because the bidding sequence is separate.
    const v = adaptMonopolyForBot(board({ phase: 'auction' }), [pState(HUMAN), pState(BOT)], BOT)!
    expect(v.isMyTurn).toBe(false)
  })
})

// ── myProperties + colorSetProgress ─────────────────────────────────────────

describe('adaptMonopolyForBot — properties + color sets', () => {
  it('lists only the bot’s own properties, with building level and mortgage flag', () => {
    const v = adaptMonopolyForBot(
      board({
        property_owners: { '1': BOT, '3': HUMAN, '6': BOT },
        property_buildings: { '1': 2 },
        mortgaged_properties: { '6': true },
      }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    const ids = v.myProperties.map((p) => p.spaceIndex).sort((a, b) => a - b)
    expect(ids).toEqual([1, 6])
    const barking = v.myProperties.find((p) => p.spaceIndex === 1)!
    expect(barking.buildings).toBe(2)
    expect(barking.mortgaged).toBe(false)
    const angel = v.myProperties.find((p) => p.spaceIndex === 6)!
    expect(angel.mortgaged).toBe(true)
  })

  it('marks iOwnAll only when every property in the group is mine, and iOwnAllUnmortgaged when none are mortgaged', () => {
    // Brown group is indices 1 + 3 → owning both is a monopoly.
    const v = adaptMonopolyForBot(
      board({
        property_owners: { '1': BOT, '3': BOT },
        mortgaged_properties: { '3': true },
      }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    const brown = v.colorSetProgress.find((c) => c.group === 'brown')!
    expect(brown.ownedByMe).toBe(2)
    expect(brown.totalInGroup).toBe(2)
    expect(brown.iOwnAll).toBe(true)
    expect(brown.iOwnAllUnmortgaged).toBe(false)
  })

  it('omits color groups the bot has none of', () => {
    const v = adaptMonopolyForBot(board({ property_owners: { '1': BOT } }), [pState(HUMAN), pState(BOT)], BOT)!
    const groups = v.colorSetProgress.map((c) => c.group)
    expect(groups).toEqual(['brown'])
  })
})

// ── pendingBuy ──────────────────────────────────────────────────────────────

describe('adaptMonopolyForBot — pendingBuy', () => {
  it('surfaces startsSet when I own none in the group yet', () => {
    const v = adaptMonopolyForBot(board({ phase: 'buy', pending_space: 1 }), [pState(HUMAN), pState(BOT)], BOT)!
    expect(v.pendingBuy).toBeDefined()
    expect(v.pendingBuy!.spaceIndex).toBe(1)
    expect(v.pendingBuy!.price).toBe(60)
    expect(v.pendingBuy!.startsSet).toBe(true)
    expect(v.pendingBuy!.completesSet).toBe(false)
  })

  it('surfaces completesSet when I already own the other property in the group', () => {
    // Brown is a 2-property group; owning index 3 makes buying index 1 complete the set.
    const v = adaptMonopolyForBot(
      board({ phase: 'buy', pending_space: 1, property_owners: { '3': BOT } }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    expect(v.pendingBuy!.completesSet).toBe(true)
    expect(v.pendingBuy!.startsSet).toBe(false)
  })

  it('is undefined outside the buy phase even if pending_space is set', () => {
    const v = adaptMonopolyForBot(board({ phase: 'roll', pending_space: 1 }), [pState(HUMAN), pState(BOT)], BOT)!
    expect(v.pendingBuy).toBeUndefined()
  })

  it('is undefined when buy phase is another player’s decision', () => {
    const v = adaptMonopolyForBot(
      board({ phase: 'buy', pending_space: 1, current_turn_index: 0 }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    expect(v.pendingBuy).toBeUndefined()
  })
})

// ── pendingDebt ─────────────────────────────────────────────────────────────

describe('adaptMonopolyForBot — pendingDebt', () => {
  const debt: MonopolyPendingDebt = {
    player_id: BOT,
    creditor_player_id: HUMAN,
    amount: 400,
    reason: 'rent',
    debt_type: 'rent',
  }

  it('sums mortgage potential from every unmortgaged, unbuilt property I own', () => {
    // Barking (1) $60/2 = 30, Angel (6) $100/2 = 50, but Angel has a house → excluded.
    const v = adaptMonopolyForBot(
      board({
        phase: 'raise_funds',
        pending_debt: debt,
        property_owners: { '1': BOT, '6': BOT },
        property_buildings: { '6': 1 },
      }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    expect(v.pendingDebt).toBeDefined()
    expect(v.pendingDebt!.amount).toBe(400)
    expect(v.pendingDebt!.potentialFromMortgages).toBe(30)
  })

  it('sums building sale-back at half the house cost per building', () => {
    // Angel (6) has 2 houses × ($50 / 2) = $50 recovered.
    const v = adaptMonopolyForBot(
      board({
        phase: 'raise_funds',
        pending_debt: debt,
        property_owners: { '6': BOT },
        property_buildings: { '6': 2 },
      }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    expect(v.pendingDebt!.potentialFromBuildings).toBe(50)
  })

  it('is undefined when the pending debt belongs to a different player', () => {
    const v = adaptMonopolyForBot(
      board({
        phase: 'raise_funds',
        pending_debt: { ...debt, player_id: HUMAN },
      }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    expect(v.pendingDebt).toBeUndefined()
  })
})

// ── auction ─────────────────────────────────────────────────────────────────

describe('adaptMonopolyForBot — auction', () => {
  const baseAuction: MonopolyAuctionState = {
    space_index: 1, // Barking Road, face $60
    high_bid: 20,
    high_bidder_id: HUMAN,
    current_bidder_id: BOT,
    passed: [],
    eligible: [HUMAN, BOT],
    initiator_id: HUMAN,
  }

  it('marks isMyBidTurn when the bot is the current bidder and eligible', () => {
    const v = adaptMonopolyForBot(
      board({ phase: 'auction', auction_state: baseAuction }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    expect(v.auction).toBeDefined()
    expect(v.auction!.faceValue).toBe(60)
    expect(v.auction!.highBid).toBe(20)
    expect(v.auction!.iAmHighBidder).toBe(false)
    expect(v.auction!.isMyBidTurn).toBe(true)
    // Bot owns nothing in brown → startsSet=true, not extends, not completes.
    expect(v.auction!.startsSet).toBe(true)
    expect(v.auction!.extendsSet).toBe(false)
    expect(v.auction!.completesSet).toBe(false)
  })

  it('surfaces completesSet when winning the auction would monopolize the group', () => {
    // Brown group is 1 + 3; auction is for index 1 and bot already owns 3.
    const v = adaptMonopolyForBot(
      board({
        phase: 'auction',
        auction_state: baseAuction,
        property_owners: { '3': BOT },
      }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    expect(v.auction!.completesSet).toBe(true)
    expect(v.auction!.startsSet).toBe(false)
  })

  it('surfaces the auction but isMyBidTurn=false when someone else is bidding', () => {
    const v = adaptMonopolyForBot(
      board({
        phase: 'auction',
        auction_state: { ...baseAuction, current_bidder_id: HUMAN },
      }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    expect(v.auction!.isMyBidTurn).toBe(false)
  })

  it('marks isMyBidTurn=false once the bot has already passed', () => {
    const v = adaptMonopolyForBot(
      board({
        phase: 'auction',
        auction_state: { ...baseAuction, passed: [BOT] },
      }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    expect(v.auction!.isMyBidTurn).toBe(false)
  })
})

// ── pendingTradeToMe ────────────────────────────────────────────────────────

describe('adaptMonopolyForBot — pendingTradeToMe', () => {
  it('flags wouldGiveOpponentMonopoly when handing over a card would complete the human’s set', () => {
    // Brown group is index 1 + 3. Human already owns index 3. Trade asks bot
    // to hand over index 1 → recipient becomes the sole brown owner → monopoly.
    const v = adaptMonopolyForBot(
      board({
        property_owners: { '1': BOT, '3': HUMAN },
        pending_trade: {
          from_player_id: HUMAN,
          to_player_id: BOT,
          offer_cash: 500,
          offer_properties: [],
          offer_get_out_cards: 0,
          request_cash: 0,
          request_properties: [1],
          request_get_out_cards: 0,
        },
      }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    expect(v.pendingTradeToMe).toBeDefined()
    expect(v.pendingTradeToMe!.wouldGiveOpponentMonopoly).toBe(true)
    // The per-card flag is what actually drives the price premium.
    expect(v.pendingTradeToMe!.requestProperties.map((p) => p.completesProposerSet)).toEqual([true])
  })

  it('flags completesProposerSet on only ONE card per completed group', () => {
    // Bot holds both browns (1 and 3); the human needs both to monopolize.
    // Charging the premium per card would double-bill a single monopoly.
    const v = adaptMonopolyForBot(
      board({
        property_owners: { '1': BOT, '3': BOT },
        pending_trade: {
          from_player_id: HUMAN,
          to_player_id: BOT,
          offer_cash: 0,
          offer_properties: [],
          offer_get_out_cards: 0,
          request_cash: 0,
          request_properties: [1, 3],
          request_get_out_cards: 0,
        },
      }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    const flags = v.pendingTradeToMe!.requestProperties.map((p) => Boolean(p.completesProposerSet))
    expect(flags.filter(Boolean)).toHaveLength(1)
  })

  it('does NOT flag wouldGiveOpponentMonopoly when the recipient still needs more cards', () => {
    // Light blue group is 3 cards; recipient owns 0. Handing over one → still 1/3.
    const v = adaptMonopolyForBot(
      board({
        property_owners: { '6': BOT },
        pending_trade: {
          from_player_id: HUMAN,
          to_player_id: BOT,
          offer_cash: 100,
          offer_properties: [],
          offer_get_out_cards: 0,
          request_cash: 0,
          request_properties: [6],
          request_get_out_cards: 0,
        },
      }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    expect(v.pendingTradeToMe!.wouldGiveOpponentMonopoly).toBe(false)
    expect(v.pendingTradeToMe!.requestProperties.every((p) => !p.completesProposerSet)).toBe(true)
  })

  it('surfaces hotelRentSum on colorSetProgress — 700 for brown', () => {
    const v = adaptMonopolyForBot(board({ property_owners: { '1': BOT } }), [pState(HUMAN), pState(BOT)], BOT)!
    const brown = v.colorSetProgress.find((c) => c.group === 'brown')!
    // Brown hotel rents: 250 (Barking) + 450 (Dagenham) = 700.
    expect(brown.hotelRentSum).toBe(700)
  })

  it('surfaces the station special-case for hotelRentSum (800 for the 4-station "monopoly")', () => {
    const v = adaptMonopolyForBot(board({ property_owners: { '5': BOT } }), [pState(HUMAN), pState(BOT)], BOT)!
    const station = v.colorSetProgress.find((c) => c.group === 'station')!
    expect(station.hotelRentSum).toBe(800)
  })

  it('surfaces a trade with resolved property spaces + mortgage state when it is addressed to the bot', () => {
    const v = adaptMonopolyForBot(
      board({
        pending_trade: {
          from_player_id: HUMAN,
          to_player_id: BOT,
          offer_cash: 200,
          offer_properties: [3],
          offer_get_out_cards: 1,
          request_cash: 50,
          request_properties: [1],
          request_get_out_cards: 0,
        },
        mortgaged_properties: { '3': true },
      }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    expect(v.pendingTradeToMe).toBeDefined()
    expect(v.pendingTradeToMe!.offerCash).toBe(200)
    expect(v.pendingTradeToMe!.offerGetOutCards).toBe(1)
    expect(v.pendingTradeToMe!.offerProperties.map((p) => p.space.index)).toEqual([3])
    expect(v.pendingTradeToMe!.offerProperties.map((p) => p.mortgaged)).toEqual([true])
    expect(v.pendingTradeToMe!.requestProperties.map((p) => p.space.index)).toEqual([1])
    expect(v.pendingTradeToMe!.requestProperties.map((p) => p.mortgaged)).toEqual([false])
  })

  it('is undefined when the trade is addressed to another player', () => {
    const v = adaptMonopolyForBot(
      board({
        pending_trade: {
          from_player_id: BOT,
          to_player_id: HUMAN, // not to bot
          offer_cash: 100,
          offer_properties: [],
          offer_get_out_cards: 0,
          request_cash: 0,
          request_properties: [],
          request_get_out_cards: 0,
        },
      }),
      [pState(HUMAN), pState(BOT)],
      BOT
    )!
    expect(v.pendingTradeToMe).toBeUndefined()
  })
})

// ── ownedPropertyFraction ───────────────────────────────────────────────────

describe('adaptMonopolyForBot — ownedPropertyFraction', () => {
  it('is 0 with an untouched board', () => {
    const v = adaptMonopolyForBot(board(), [pState(HUMAN), pState(BOT)], BOT)!
    expect(v.ownedPropertyFraction).toBe(0)
  })

  it('rises as ownership fills in — regardless of who owns them', () => {
    const owners: Record<string, string> = {}
    // Mark 14 properties owned (mixed bot + human) — total buyable ≈ 28.
    for (const i of [1, 3, 6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24]) owners[String(i)] = HUMAN
    const v = adaptMonopolyForBot(board({ property_owners: owners }), [pState(HUMAN), pState(BOT)], BOT)!
    expect(v.ownedPropertyFraction).toBeGreaterThan(0.3)
    expect(v.ownedPropertyFraction).toBeLessThan(0.7)
  })
})
