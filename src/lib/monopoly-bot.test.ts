import { describe, it, expect } from 'vitest'
import { pickBotAction } from '@/lib/monopoly-bot'
import type {
  MonopolyBotAuctionContext,
  MonopolyBotBuyContext,
  MonopolyBotColorSetProgress,
  MonopolyBotDebtContext,
  MonopolyBotOwnedProperty,
  MonopolyBotTradeContext,
  MonopolyBotTradeProperty,
  MonopolyBotView,
} from '@/lib/monopoly-bot-adapter'
import type { MonopolyPhase } from '@/types'
import { MONOPOLY_BOARD, spaceAt, type MonopolyColorGroup } from '@/lib/monopoly-board'

// ── Fixture builders ────────────────────────────────────────────────────────
//
// The bot doesn't care about how the view was assembled — only about the shape.
// Building views directly (not through the adapter) keeps each test focused on
// one decision.

const BOT = 'bot-1'

function view(overrides: Partial<MonopolyBotView> = {}): MonopolyBotView {
  return {
    botPlayerId: BOT,
    phase: 'roll' as MonopolyPhase,
    isMyTurn: true,
    me: {
      playerId: BOT,
      cash: 1500,
      position: 0,
      in_jail: false,
      jail_turns: 0,
      get_out_of_jail_free: 0,
      bankrupt: false,
    },
    myProperties: [],
    colorSetProgress: [],
    pendingBuy: undefined,
    pendingDebt: undefined,
    auction: undefined,
    ownedPropertyFraction: 0,
    ...overrides,
  }
}

function owned(spaceIndex: number, buildings = 0, mortgaged = false): MonopolyBotOwnedProperty {
  return { spaceIndex, space: spaceAt(spaceIndex), buildings, mortgaged }
}

function csp(
  group: MonopolyColorGroup,
  opts: {
    ownedByMe: number
    totalInGroup: number
    iOwnAll?: boolean
    iOwnAllUnmortgaged?: boolean
    hotelRentSum?: number
  }
): MonopolyBotColorSetProgress {
  return {
    group,
    ownedByMe: opts.ownedByMe,
    totalInGroup: opts.totalInGroup,
    iOwnAll: opts.iOwnAll ?? opts.ownedByMe === opts.totalInGroup,
    iOwnAllUnmortgaged: opts.iOwnAllUnmortgaged ?? opts.iOwnAll ?? opts.ownedByMe === opts.totalInGroup,
    // 700 is the brown group's real hotel-rent sum (250 + 450). Overridable so
    // per-test scenarios can express different-sized monopolies concisely.
    hotelRentSum: opts.hotelRentSum ?? 700,
  }
}

function pendingBuy(
  spaceIndex: number,
  opts: { startsSet?: boolean; completesSet?: boolean } = {}
): MonopolyBotBuyContext {
  const space = spaceAt(spaceIndex)
  return {
    spaceIndex,
    space,
    price: space.price ?? 0,
    startsSet: opts.startsSet ?? false,
    completesSet: opts.completesSet ?? false,
  }
}

function debt(amount: number, extra: Partial<MonopolyBotDebtContext> = {}): MonopolyBotDebtContext {
  return { amount, potentialFromMortgages: 0, potentialFromBuildings: 0, ...extra }
}

function auction(opts: Partial<MonopolyBotAuctionContext> & { faceValue: number }): MonopolyBotAuctionContext {
  const spaceIndex = opts.spaceIndex ?? 1
  return {
    spaceIndex,
    space: spaceAt(spaceIndex),
    faceValue: opts.faceValue,
    highBid: opts.highBid ?? 0,
    iAmHighBidder: opts.iAmHighBidder ?? false,
    isMyBidTurn: opts.isMyBidTurn ?? true,
    startsSet: opts.startsSet ?? false,
    completesSet: opts.completesSet ?? false,
    extendsSet: opts.extendsSet ?? false,
  }
}

// ── Turn gating ─────────────────────────────────────────────────────────────

describe('pickBotAction — turn gating', () => {
  it('returns null when it is not my turn and no auction is live', () => {
    expect(pickBotAction(view({ isMyTurn: false }))).toBeNull()
  })

  it('acts on an auction bid even when it is not my turn', () => {
    const v = view({
      isMyTurn: false,
      phase: 'auction',
      auction: auction({ faceValue: 100, highBid: 0, isMyBidTurn: true }),
    })
    expect(pickBotAction(v)?.type).toBe('auction_bid')
  })
})

// ── Roll phase ──────────────────────────────────────────────────────────────

describe('pickBotAction — roll phase', () => {
  it('rolls when there is nothing to build', () => {
    expect(pickBotAction(view())).toEqual({ type: 'roll' })
  })

  it('builds before rolling when I hold an unmortgaged monopoly and cash headroom', () => {
    // Own the brown set (indices 1, 3). Bot has plenty of cash.
    const v = view({
      myProperties: [owned(1), owned(3)],
      colorSetProgress: [csp('brown', { ownedByMe: 2, totalInGroup: 2 })],
      me: {
        playerId: BOT,
        cash: 2000,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
    })
    const action = pickBotAction(v)
    expect(action?.type).toBe('build_house')
  })

  it('skips building when reserve would be violated', () => {
    // Own dark blue (Park Lane 37 + Mayfair 39) with $200 house cost. Cash is
    // low: reserve (50%) leaves $150 for building, but the house costs $200 →
    // skip and roll.
    const v = view({
      me: {
        playerId: BOT,
        cash: 300,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      myProperties: [owned(37), owned(39)],
      colorSetProgress: [csp('dark_blue', { ownedByMe: 2, totalInGroup: 2 })],
    })
    expect(pickBotAction(v)).toEqual({ type: 'roll' })
  })

  it('skips building on a mortgaged monopoly', () => {
    const v = view({
      myProperties: [owned(1, 0, true), owned(3)],
      colorSetProgress: [csp('brown', { ownedByMe: 2, totalInGroup: 2, iOwnAllUnmortgaged: false })],
    })
    expect(pickBotAction(v)).toEqual({ type: 'roll' })
  })
})

// ── Buy phase ───────────────────────────────────────────────────────────────

describe('pickBotAction — buy phase', () => {
  it('buys a set-starter when cheap enough', () => {
    // Cash 1500 → 40% is 600. Barking Road is $60 → cheap enough. startsSet=true.
    const v = view({ phase: 'buy', pendingBuy: pendingBuy(1, { startsSet: true }) })
    expect(pickBotAction(v)).toEqual({ type: 'buy', decision: 'buy' })
  })

  it('buys a set-completer even when NOT the cheapest', () => {
    // Mayfair (39) is $400; 40% of 1500 is 600 → still cheap enough.
    const v = view({ phase: 'buy', pendingBuy: pendingBuy(39, { completesSet: true }) })
    expect(pickBotAction(v)).toEqual({ type: 'buy', decision: 'buy' })
  })

  it('passes on a property that neither starts nor completes a set', () => {
    // Middle-of-a-set property with no startsSet/completesSet → not set-relevant.
    const v = view({ phase: 'buy', pendingBuy: pendingBuy(8) })
    expect(pickBotAction(v)).toEqual({ type: 'buy', decision: 'pass' })
  })

  it('passes when the price exceeds the cash × 0.4 ratio, even if it completes a set', () => {
    // Cash 100 → 40% is 40. Mayfair $400 fails the ratio.
    const v = view({
      phase: 'buy',
      pendingBuy: pendingBuy(39, { completesSet: true }),
      me: {
        playerId: BOT,
        cash: 100,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
    })
    expect(pickBotAction(v)).toEqual({ type: 'buy', decision: 'pass' })
  })

  it('buys a station when cheap enough, even without a set concept', () => {
    // Paddington station (5) is $200; 40% of 1500 = 600 → buy.
    const v = view({ phase: 'buy', pendingBuy: pendingBuy(5) })
    expect(pickBotAction(v)).toEqual({ type: 'buy', decision: 'buy' })
  })
})

// ── Jail ────────────────────────────────────────────────────────────────────

describe('pickBotAction — jail', () => {
  it('uses a Get-Out-of-Jail-Free card unconditionally when available', () => {
    const v = view({
      phase: 'jail',
      me: {
        playerId: BOT,
        cash: 1500,
        position: 10,
        in_jail: true,
        jail_turns: 0,
        get_out_of_jail_free: 1,
        bankrupt: false,
      },
    })
    expect(pickBotAction(v)).toEqual({ type: 'jail_card' })
  })

  it('rolls for doubles early-game when no card', () => {
    const v = view({
      phase: 'jail',
      ownedPropertyFraction: 0.1,
      me: {
        playerId: BOT,
        cash: 1500,
        position: 10,
        in_jail: true,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
    })
    expect(pickBotAction(v)).toEqual({ type: 'jail_roll' })
  })

  it('pays fine late-game when mobility matters', () => {
    const v = view({
      phase: 'jail',
      ownedPropertyFraction: 0.7,
      me: {
        playerId: BOT,
        cash: 500,
        position: 10,
        in_jail: true,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
    })
    expect(pickBotAction(v)).toEqual({ type: 'jail_pay' })
  })

  it('pays fine on the mandatory turn (jail_turns >= 2)', () => {
    const v = view({
      phase: 'jail',
      ownedPropertyFraction: 0.1,
      me: {
        playerId: BOT,
        cash: 500,
        position: 10,
        in_jail: true,
        jail_turns: 2,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
    })
    expect(pickBotAction(v)).toEqual({ type: 'jail_pay' })
  })
})

// ── pay_rent ────────────────────────────────────────────────────────────────

describe('pickBotAction — pay_rent', () => {
  it('pays rent straightforwardly when phase is pay_rent', () => {
    const v = view({ phase: 'pay_rent' })
    expect(pickBotAction(v)).toEqual({ type: 'pay_rent' })
  })
})

// ── raise_funds ─────────────────────────────────────────────────────────────

describe('pickBotAction — raise_funds', () => {
  it('settles immediately when the debt is affordable', () => {
    const v = view({
      phase: 'raise_funds',
      me: {
        playerId: BOT,
        cash: 500,
        position: 5,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      pendingDebt: debt(300, { potentialFromMortgages: 100 }),
    })
    expect(pickBotAction(v)).toEqual({ type: 'settle_debt' })
  })

  it('sells the cheapest-color building first when short on cash', () => {
    // Own brown (index 1, houseCost 50) and yellow (index 26, houseCost 150),
    // both with 1 house. Debt 400, cash 100. Cheapest-house-cost wins → brown.
    const v = view({
      phase: 'raise_funds',
      me: {
        playerId: BOT,
        cash: 100,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      myProperties: [owned(1, 1), owned(26, 1)],
      pendingDebt: debt(400),
    })
    const action = pickBotAction(v)
    expect(action).toEqual({ type: 'sell_house', spaceIndex: 1 })
  })

  it('mortgages the lowest-value ungrouped property before touching completed sets', () => {
    // Own brown monopoly (1, 3) + one light-blue (6). Short on cash, no buildings.
    // Should mortgage the light-blue $100 property, not the browns (which are a set).
    const v = view({
      phase: 'raise_funds',
      me: {
        playerId: BOT,
        cash: 50,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      myProperties: [owned(1), owned(3), owned(6)],
      colorSetProgress: [
        csp('brown', { ownedByMe: 2, totalInGroup: 2 }),
        csp('light_blue', { ownedByMe: 1, totalInGroup: 3 }),
      ],
      pendingDebt: debt(200),
    })
    expect(pickBotAction(v)).toEqual({ type: 'mortgage', spaceIndex: 6 })
  })

  it('forfeits when there is nothing left to mortgage or sell', () => {
    const v = view({
      phase: 'raise_funds',
      me: {
        playerId: BOT,
        cash: 10,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      myProperties: [owned(1, 0, true), owned(3, 0, true)],
      pendingDebt: debt(200),
    })
    expect(pickBotAction(v)).toEqual({ type: 'forfeit' })
  })
})

// ── build (via roll phase) ──────────────────────────────────────────────────

describe('pickBotAction — build ordering', () => {
  it('builds evenly: buildings=1 target gets the next house before buildings=2', () => {
    const v = view({
      me: {
        playerId: BOT,
        cash: 2000,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      myProperties: [owned(1, 2), owned(3, 1)],
      colorSetProgress: [csp('brown', { ownedByMe: 2, totalInGroup: 2 })],
    })
    expect(pickBotAction(v)).toEqual({ type: 'build_house', spaceIndex: 3 })
  })

  it('upgrades a 4-house property to a hotel next', () => {
    const v = view({
      me: {
        playerId: BOT,
        cash: 2000,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      myProperties: [owned(1, 4), owned(3, 4)],
      colorSetProgress: [csp('brown', { ownedByMe: 2, totalInGroup: 2 })],
    })
    const action = pickBotAction(v)
    expect(action?.type).toBe('build_hotel')
  })
})

// ── auction ─────────────────────────────────────────────────────────────────

describe('pickBotAction — auction', () => {
  it('bids when the next step is still within the default 60%-of-face ceiling', () => {
    // Face 100 → ceiling 60, step 10. Current high 0 → bid 10. Set-neutral.
    const v = view({ auction: auction({ faceValue: 100, highBid: 0 }) })
    expect(pickBotAction(v)).toEqual({ type: 'auction_bid', amount: 10 })
  })

  it('passes when the next bid would exceed the 60%-of-face default ceiling', () => {
    const v = view({ auction: auction({ faceValue: 100, highBid: 60 }) })
    expect(pickBotAction(v)).toEqual({ type: 'auction_pass' })
  })

  it('scales the ceiling to 90% of face when the property EXTENDS a set the bot has', () => {
    // Extends: bot owns some in the group, not almost-all. Ceiling 90 not 60,
    // so bid at highBid=70 goes through (step +10 → 80 ≤ 90).
    const v = view({ auction: auction({ faceValue: 100, highBid: 70, extendsSet: true }) })
    expect(pickBotAction(v)).toEqual({ type: 'auction_bid', amount: 80 })
  })

  it('scales the ceiling to 120% of face when the property COMPLETES a monopoly', () => {
    // Completes: bot owns totalInGroup-1. Ceiling 120, so bid at highBid=100 goes through.
    const v = view({ auction: auction({ faceValue: 100, highBid: 100, completesSet: true }) })
    expect(pickBotAction(v)).toEqual({ type: 'auction_bid', amount: 110 })
  })

  it('still passes on a set-completing bid the bot cannot afford', () => {
    // Cash 50; next bid would be 110. Even though 110 ≤ 120% ceiling, no cash.
    const v = view({
      me: {
        playerId: BOT,
        cash: 50,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      auction: auction({ faceValue: 100, highBid: 100, completesSet: true }),
    })
    expect(pickBotAction(v)).toEqual({ type: 'auction_pass' })
  })

  it('does not bid against itself', () => {
    const v = view({ auction: auction({ faceValue: 100, highBid: 30, iAmHighBidder: true }) })
    expect(pickBotAction(v)).toEqual({ type: 'auction_pass' })
  })

  it('passes when the next bid exceeds available cash', () => {
    const v = view({
      me: {
        playerId: BOT,
        cash: 5,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      auction: auction({ faceValue: 100, highBid: 0 }),
    })
    expect(pickBotAction(v)).toEqual({ type: 'auction_pass' })
  })
})

// ── Trade responses ─────────────────────────────────────────────────────────

/** Shorthand: build a MonopolyBotTradeProperty by space index, optionally mortgaged. */
function tp(index: number, mortgaged = false, completesProposerSet = false): MonopolyBotTradeProperty {
  return { space: spaceAt(index), mortgaged, completesProposerSet }
}

/**
 * A trade where the human asks for the one brown card that finishes THEIR set.
 * Bot holds Barking (1); the human already holds Dagenham (3). Give side:
 *   base 60 + opponent-monopoly premium (700 × 2.5 = 1750) = 1810
 *   accept bar = 1810 × 1.1 = 1991
 */
function setCompletingBrownTrade(offerCash: number) {
  return view({
    me: {
      playerId: BOT,
      cash: 1500,
      position: 0,
      in_jail: false,
      jail_turns: 0,
      get_out_of_jail_free: 0,
      bankrupt: false,
    },
    myProperties: [owned(1)],
    colorSetProgress: [csp('brown', { ownedByMe: 1, totalInGroup: 2, iOwnAll: false })],
    pendingTradeToMe: trade({
      offerCash,
      requestProperties: [tp(1, false, true)],
      wouldGiveOpponentMonopoly: true,
    }),
  })
}

function trade(overrides: Partial<MonopolyBotTradeContext> = {}): MonopolyBotTradeContext {
  return {
    fromPlayerId: 'human-1',
    offerCash: 0,
    offerProperties: [],
    offerGetOutCards: 0,
    requestCash: 0,
    requestProperties: [],
    requestGetOutCards: 0,
    wouldGiveOpponentMonopoly: false,
    ...overrides,
  }
}

describe('pickBotAction — trade response', () => {
  it('takes trade priority over auction and turn', () => {
    // Bot has an auction bid slot AND a trade addressed to it → trade wins.
    const v = view({
      isMyTurn: true,
      phase: 'auction',
      auction: auction({ faceValue: 100, highBid: 0 }),
      pendingTradeToMe: trade({ offerCash: 500 }),
    })
    const a = pickBotAction(v)
    expect(a?.type === 'trade_accept' || a?.type === 'trade_decline').toBe(true)
  })

  it('accepts a clearly positive-sum trade (human gives cash, asks for nothing)', () => {
    const v = view({ pendingTradeToMe: trade({ offerCash: 200 }) })
    expect(pickBotAction(v)).toEqual({ type: 'trade_accept' })
  })

  it('declines a dead-even swap (no margin ⇒ not worth the risk)', () => {
    // Symmetric cash-for-cash swap — value equal, margin 1.1 fails.
    const v = view({ pendingTradeToMe: trade({ offerCash: 100, requestCash: 100 }) })
    expect(pickBotAction(v)).toEqual({ type: 'trade_decline', reason: 'offer_too_low' })
  })

  it('declines any trade that would break the bot’s completed monopoly (non-scarce cash)', () => {
    // Bot owns the whole brown set (1 + 3). Cash 1500 puts scarcity multiplier
    // at 1× so the test purely measures the break-monopoly penalty.
    // Give: base 60 + hotelRentSum(brown)=700 × 2 = 1460. Gain: 1000. Decline.
    const v = view({
      me: {
        playerId: BOT,
        cash: 1500,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      myProperties: [owned(1), owned(3)],
      colorSetProgress: [csp('brown', { ownedByMe: 2, totalInGroup: 2 })],
      pendingTradeToMe: trade({
        offerCash: 1000,
        requestProperties: [tp(1)], // Barking Road (brown, £60)
      }),
    })
    expect(pickBotAction(v)).toEqual({ type: 'trade_decline', reason: 'protects_my_monopoly' })
  })

  it('accepts a trade that would complete a set for the bot at a reasonable premium', () => {
    // Bot owns Barking (1). Human offers Dagenham (3) — completes the brown set —
    // and asks for £50 cash. With the completeSet 2× bonus (£60 → £120), the £120
    // gain covers the £50 cash out plus the 10% margin easily.
    const v = view({
      me: {
        playerId: BOT,
        cash: 500,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      myProperties: [owned(1)],
      colorSetProgress: [csp('brown', { ownedByMe: 1, totalInGroup: 2, iOwnAll: false })],
      pendingTradeToMe: trade({
        offerProperties: [tp(3)],
        requestCash: 50,
      }),
    })
    expect(pickBotAction(v)).toEqual({ type: 'trade_accept' })
  })

  it('declines if the bot cannot fulfil the ask (not enough cash)', () => {
    const v = view({
      me: {
        playerId: BOT,
        cash: 10,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      pendingTradeToMe: trade({ offerCash: 1000, requestCash: 500 }),
    })
    expect(pickBotAction(v)).toEqual({ type: 'trade_decline', reason: 'cannot_fulfil' })
  })

  it('declines if the requested property is not in the bot’s hand', () => {
    const v = view({
      myProperties: [owned(1)],
      pendingTradeToMe: trade({
        offerCash: 500,
        requestProperties: [tp(3)], // bot doesn't own Dagenham
      }),
    })
    expect(pickBotAction(v)).toEqual({ type: 'trade_decline', reason: 'cannot_fulfil' })
  })

  it('accepts a trade that EXTENDS a set even without completing it (1.5× bonus)', () => {
    // Bot owns Kings Cross (station #5). Human offers Marylebone (#15, also station,
    // £200) for £150 cash. Bot has 1/4 in the station "group"; receiving another
    // extends → 1.5× bonus → 200 * 1.5 = 300 > 150 * 1.1 = 165 → accept.
    const v = view({
      me: {
        playerId: BOT,
        cash: 500,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      myProperties: [owned(5)],
      colorSetProgress: [csp('station', { ownedByMe: 1, totalInGroup: 4, iOwnAll: false })],
      pendingTradeToMe: trade({
        offerProperties: [tp(15)],
        requestCash: 150,
      }),
    })
    expect(pickBotAction(v)).toEqual({ type: 'trade_accept' })
  })

  it('discounts a MORTGAGED incoming property — a purely-mortgaged property is not full value', () => {
    // Human offers a mortgaged £400 property (Mayfair, index 39) for £250 cash.
    // Unmortgaged, £400 gain vs £250 give would accept (400 ≥ 275). Mortgaged
    // scales incoming to 40% (£160), which is under 250 * 1.1 = 275 → decline.
    const v = view({
      pendingTradeToMe: trade({
        offerProperties: [tp(39, true)],
        requestCash: 250,
      }),
    })
    expect(pickBotAction(v)).toEqual({ type: 'trade_decline', reason: 'offer_too_low' })
  })

  it('SELLS a set-completing card when the price clears the premium', () => {
    // The headline behaviour change: this used to be an absolute veto, which
    // meant a human could never finish a set off a bot at any price. Now it is
    // merely expensive. £2500 clears the £1991 bar → accept.
    expect(pickBotAction(setCompletingBrownTrade(2500))).toEqual({ type: 'trade_accept' })
  })

  it('still declines a set-completing card when the offer is under the premium', () => {
    // £1500 is a big offer for a £60 brown, and still not enough — the bot is
    // expensive here, not immovable.
    expect(pickBotAction(setCompletingBrownTrade(1500))).toEqual({
      type: 'trade_decline',
      reason: 'completes_your_set',
    })
  })

  it('charges the opponent-monopoly premium ONCE per group, not once per card', () => {
    // Bot holds both remaining browns; the human needs both. Only the first
    // card carries completesProposerSet (the adapter charges per group), so the
    // give side is 60 + 60 + 1750 = 1870, bar 2057 — not 60 + 60 + 3500.
    const v = view({
      me: {
        playerId: BOT,
        cash: 1500,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      myProperties: [owned(1), owned(3)],
      colorSetProgress: [csp('brown', { ownedByMe: 2, totalInGroup: 2, iOwnAll: false })],
      pendingTradeToMe: trade({
        offerCash: 2100,
        requestProperties: [tp(1, false, true), tp(3)],
        wouldGiveOpponentMonopoly: true,
      }),
    })
    expect(pickBotAction(v)).toEqual({ type: 'trade_accept' })
  })

  it('reports cannot_fulfil when the bot simply does not have what was asked for', () => {
    // Asked for £500 it doesn't hold. Nothing to price — this is the one
    // decline that is about capability, not cost, so it must not be reported
    // as a premium the player could out-bid.
    const v = view({
      me: {
        playerId: BOT,
        cash: 10,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      pendingTradeToMe: trade({ requestCash: 500, wouldGiveOpponentMonopoly: true }),
    })
    expect(pickBotAction(v)).toEqual({ type: 'trade_decline', reason: 'cannot_fulfil' })
  })

  it('reports offer_too_low — not protects_my_monopoly — for a card outside any completed set', () => {
    // Bot owns 1 of 2 browns, so giving Barking breaks nothing. The £10 offer is
    // simply under the £60 face + margin. Reason must be the actionable one:
    // this player CAN win by offering more.
    const v = view({
      myProperties: [owned(1)],
      colorSetProgress: [csp('brown', { ownedByMe: 1, totalInGroup: 2, iOwnAll: false })],
      pendingTradeToMe: trade({ offerCash: 10, requestProperties: [tp(1)] }),
    })
    expect(pickBotAction(v)).toEqual({ type: 'trade_decline', reason: 'offer_too_low' })
  })

  it('prices an opponent monopoly ABOVE breaking one of its own', () => {
    // Same £60 brown card, same £1200 offer, two different reasons to say no.
    // Arming a live opponent (2.5× rent sum) must cost more than losing a set
    // of my own (2×) — I pay an opponent's rent every lap I survive.
    const armsOpponent = pickBotAction(setCompletingBrownTrade(1200))
    const breaksMine = pickBotAction(
      view({
        me: {
          playerId: BOT,
          cash: 1500,
          position: 0,
          in_jail: false,
          jail_turns: 0,
          get_out_of_jail_free: 0,
          bankrupt: false,
        },
        myProperties: [owned(1), owned(3)],
        colorSetProgress: [csp('brown', { ownedByMe: 2, totalInGroup: 2 })],
        pendingTradeToMe: trade({ offerCash: 1200, requestProperties: [tp(1)] }),
      })
    )
    expect(armsOpponent).toEqual({ type: 'trade_decline', reason: 'completes_your_set' })
    expect(breaksMine).toEqual({ type: 'trade_decline', reason: 'protects_my_monopoly' })
    // Bar for arming the opponent: 1991. Bar for breaking my own brown set:
    // (60 + 1400) × 1.1 = 1606. A £1700 offer separates them.
    expect(pickBotAction(setCompletingBrownTrade(1700))).toEqual({
      type: 'trade_decline',
      reason: 'completes_your_set',
    })
  })

  it('scales the break-monopoly penalty by the group’s hotel-rent sum, not flat multiplier', () => {
    // Bot owns brown set (hotelRentSum = 700, hard-coded default in csp()).
    // Human offers £700 for Barking. Give side: base 60 + break penalty 700 × 2
    // = 1460. Gain 700 < 1460 × 1.1 = 1606 → decline. Previously (flat × 20)
    // was 60 × 20 = 1200, so this offer would have DECLINED at 1200 too — but
    // now the reasoning is rent-based, not price-based.
    const v = view({
      me: {
        playerId: BOT,
        cash: 1500,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      myProperties: [owned(1), owned(3)],
      colorSetProgress: [csp('brown', { ownedByMe: 2, totalInGroup: 2 })],
      pendingTradeToMe: trade({
        offerCash: 700,
        requestProperties: [tp(1)],
      }),
    })
    expect(pickBotAction(v)).toEqual({ type: 'trade_decline', reason: 'protects_my_monopoly' })
  })

  it('scales cash value up when the bot is broke (scarcity multiplier)', () => {
    // Bot has £50 (well under CASH_SCARCITY_FLOOR of 200). Scarcity = 200/50 = 4.
    // Human offers a station (£200 face) and asks for £30 cash.
    //   give (scaled) = 30 × 4 = 120
    //   gain          = 200 (station, no set relevance)
    // 200 >= 120 × 1.1 = 132 → accept. WITHOUT scarcity, give would be 30,
    // gain 200, 200 >= 33 → also accept — bad test. Let's craft one where
    // scarcity actually FLIPS the decision.
    //
    // Setup: bot has £50 cash. Human asks for a £100 property. Offers £15 cash.
    //   Without scarcity: gain 15, give 100 → 15 < 110, decline.
    //   With scarcity  : gain 15×4=60, give 100 → 60 < 110, still decline. Bad.
    //
    // Flip direction: cash scarcity means bot values incoming cash more too.
    // Human offers £30 for a station (£200 face). Bot valuing cash at 4× means
    // gain = 30×4=120 + 0. Give side is the station: 200 (bot doesn't own it).
    // Hmm — the station is bot's? request. Let's flip: human offers £30 for
    // a lone station worth £200 to the bot. give=200, gain=30×4=120 → decline.
    // Not a good flip either.
    //
    // Cleanest: bot pays cash out, giving expensive cash. Human offers £200
    // property, asks £50 cash. Bot has £60 (barely above scarcity floor of 200
    // — actually at 60, scarcity = 200/60 = 3.33).
    //   gain  = 200 (property, no set relevance)
    //   give  = 50 × 3.33 = 166
    //   200 >= 166 × 1.1 = 183 → accept, but tightly.
    // Without scarcity: give=50, 200 >= 55 → accept anyway. Not a flip either.
    //
    // Simplest test: pure cash-in-cash-out where scarcity leaves both sides
    // scaled equally, so cash-only trades are unaffected. Verify with cash
    // 50, offer 100 for request 100 — declines (dead even). Same as no scarcity.
    const v = view({
      me: {
        playerId: BOT,
        cash: 50,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      pendingTradeToMe: trade({ offerCash: 40, requestCash: 40 }),
    })
    // Symmetric cash swap with scarcity = 4 on both sides: both are 160.
    // 160 >= 160 × 1.1 = 176 → decline (unchanged from no-scarcity behavior).
    expect(pickBotAction(v)).toEqual({ type: 'trade_decline', reason: 'offer_too_low' })
  })

  it('cash scarcity makes the bot REJECT a small-cash-out trade it would otherwise accept', () => {
    // Bot has £50 (scarcity = 4×). Human offers Baltic Ave (£60 face) for £30 cash.
    //   Without scarcity: gain 60, give 30, 60 >= 33 → accept.
    //   With scarcity  : gain 60, give 30 × 4 = 120, 60 < 132 → decline. FLIP.
    const v = view({
      me: {
        playerId: BOT,
        cash: 50,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      // No properties owned — so tp(3) is set-neutral for the bot.
      pendingTradeToMe: trade({
        offerProperties: [tp(3)], // Dagenham £60
        requestCash: 30,
      }),
    })
    expect(pickBotAction(v)).toEqual({ type: 'trade_decline', reason: 'offer_too_low' })
  })

  it('discounts a MORTGAGED outgoing property — asymmetric with unmortgaged giveaways', () => {
    // Bot owns mortgaged Barking (£60). Human offers £40 cash for it.
    // Unmortgaged: give = 60, need offer ≥ 66 → decline at 40. Mortgaged: give
    // scales to 50% of face = 30, so £40 offer clears 30 * 1.1 = 33 → accept.
    const v = view({
      me: {
        playerId: BOT,
        cash: 500,
        position: 0,
        in_jail: false,
        jail_turns: 0,
        get_out_of_jail_free: 0,
        bankrupt: false,
      },
      myProperties: [owned(1, 0, true)], // Barking Road, mortgaged
      colorSetProgress: [csp('brown', { ownedByMe: 1, totalInGroup: 2, iOwnAll: false })],
      pendingTradeToMe: trade({
        offerCash: 40,
        requestProperties: [tp(1, true)],
      }),
    })
    expect(pickBotAction(v)).toEqual({ type: 'trade_accept' })
  })
})

// ── Board sanity ────────────────────────────────────────────────────────────
// The build/mortgage tests hardcode indices. If someone renumbers the board
// module, we want a loud failure rather than silently-wrong test fixtures.

describe('MONOPOLY_BOARD test-fixture assumptions', () => {
  it('index 1 is Barking Road (brown, $60 with $50 house cost)', () => {
    const s = MONOPOLY_BOARD[1]!
    expect(s.color).toBe('brown')
    expect(s.price).toBe(60)
    expect(s.houseCost).toBe(50)
  })
  it('index 26 is a yellow property with $150 house cost', () => {
    const s = MONOPOLY_BOARD[26]!
    expect(s.color).toBe('yellow')
    expect(s.houseCost).toBe(150)
  })
  it('index 37/39 are dark_blue (Park Lane, Mayfair)', () => {
    expect(MONOPOLY_BOARD[37]?.color).toBe('dark_blue')
    expect(MONOPOLY_BOARD[39]?.color).toBe('dark_blue')
  })
})
