import { describe, it, expect } from 'vitest'
import { pickBotAction } from '@/lib/monopoly-bot'
import type {
  MonopolyBotAuctionContext,
  MonopolyBotBuyContext,
  MonopolyBotColorSetProgress,
  MonopolyBotDebtContext,
  MonopolyBotOwnedProperty,
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
  }
): MonopolyBotColorSetProgress {
  return {
    group,
    ownedByMe: opts.ownedByMe,
    totalInGroup: opts.totalInGroup,
    iOwnAll: opts.iOwnAll ?? opts.ownedByMe === opts.totalInGroup,
    iOwnAllUnmortgaged: opts.iOwnAllUnmortgaged ?? opts.iOwnAll ?? opts.ownedByMe === opts.totalInGroup,
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
  return {
    spaceIndex: 1,
    faceValue: opts.faceValue,
    highBid: opts.highBid ?? 0,
    iAmHighBidder: opts.iAmHighBidder ?? false,
    isMyBidTurn: opts.isMyBidTurn ?? true,
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
  it('bids when the next step is still within the 60%-of-face ceiling', () => {
    // Face 100 → ceiling 60, step 10. Current high 0 → bid 10.
    const v = view({ auction: auction({ faceValue: 100, highBid: 0 }) })
    expect(pickBotAction(v)).toEqual({ type: 'auction_bid', amount: 10 })
  })

  it('passes when the next bid would exceed the 60%-of-face ceiling', () => {
    const v = view({ auction: auction({ faceValue: 100, highBid: 60 }) })
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
