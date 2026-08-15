/**
 * Monopoly bot — decisions.
 *
 * `pickBotAction(view)` reads a MonopolyBotView from the adapter and returns
 * exactly one action to apply, or `null` if there's nothing sensible to do.
 * One action per call is deliberate: the driver applies it, the game-tick
 * fires again, the bot re-evaluates from fresh state. That keeps every
 * decision independent and testable in isolation.
 *
 * ── Design ideas ─────────────────────────────────────────────────────────
 * - **Ratios, not dollars.** The Naija edition multiplies all money by 1000;
 *   the bot must survive that without re-tuning. Every threshold below is a
 *   ratio (`price ≤ cash × 0.4`, `highBid ≤ faceValue × 0.6`), never a
 *   literal dollar figure. The one exception is the jail fine, which is
 *   documented per-edition on the space's own definition — but the *decision*
 *   about whether to pay it is a fraction-based check, not a dollar check.
 * - **Pre-roll builds.** Building is a stand-alone action. The bot builds
 *   before rolling — that's when phase='roll' and the property isn't a
 *   pending-payer. This runs down excess cash into houses before the dice
 *   can send it into someone else's rent.
 * - **Fund-raising is greedy but ordered.** raise_funds sells houses first
 *   (cheap, doesn't burn a whole property), then mortgages the lowest-value
 *   ungrouped property, then forfeits. Each tick returns ONE step.
 * - **Trade responses only.** Bot NEVER initiates a trade. It only accepts
 *   or declines proposals humans push to it, and rejects anything that isn't
 *   clearly positive-sum (net-gain, with a big penalty for breaking one of
 *   its own monopolies).
 */

import type { MonopolyBotView, MonopolyBotTradeContext, MonopolyBotTradeProperty } from '@/lib/monopoly-bot-adapter'
import { MONOPOLY_JAIL_FINE, spacesInGroup } from '@/lib/monopoly-board'

export type MonopolyBotAction =
  | { type: 'roll' }
  | { type: 'buy'; decision: 'buy' | 'pass' }
  | { type: 'jail_pay' }
  | { type: 'jail_card' }
  | { type: 'jail_roll' }
  | { type: 'pay_rent' }
  | { type: 'settle_debt' }
  | { type: 'sell_house'; spaceIndex: number }
  | { type: 'sell_hotel'; spaceIndex: number }
  | { type: 'mortgage'; spaceIndex: number }
  | { type: 'forfeit' }
  | { type: 'build_house'; spaceIndex: number }
  | { type: 'build_hotel'; spaceIndex: number }
  | { type: 'auction_bid'; amount: number }
  | { type: 'auction_pass' }
  | { type: 'trade_accept' }
  | { type: 'trade_decline' }

// ── Tunables (all ratios / small integers, no absolute-dollar figures) ────

/** Buy iff price ≤ cash × BUY_CASH_RATIO AND (starts or completes a set). */
const BUY_CASH_RATIO = 0.4

/**
 * After building, keep at least this fraction of the CURRENT cash as reserve
 * to survive one rent hit. So the bot stops building when the next house would
 * drop it below (current_cash × BUILD_RESERVE_RATIO).
 */
const BUILD_RESERVE_RATIO = 0.5

/** Late-game threshold: once this fraction of properties are owned, pay to leave jail. */
const LATE_GAME_FRACTION = 0.5

/**
 * Auctions: the DEFAULT ceiling — never pay above 60% of face for a random
 * orphan tile. Applied when the auctioned property is set-neutral (won't
 * start / extend / complete anything for the bot).
 */
const AUCTION_MAX_FACE_FRACTION_DEFAULT = 0.6

/**
 * Auctions: ceiling when winning would EXTEND a set the bot already has a
 * foothold in (owns some, not almost-all). Willing to reach further than
 * the default but not into premium territory.
 */
const AUCTION_MAX_FACE_FRACTION_EXTENDS = 0.9

/**
 * Auctions: ceiling when winning would COMPLETE a monopoly for the bot.
 * Above face because a completed set is where rent revenue lives; a small
 * premium against face is well spent. Never higher than what solvency allows.
 */
const AUCTION_MAX_FACE_FRACTION_COMPLETES = 1.2

/** Auctions: raise the current high bid by this fraction of face value per bid. */
const AUCTION_BID_STEP_FACE_FRACTION = 0.1

/**
 * Trades: accept only when net-gain × this margin ≥ 1. A 10% margin means the
 * bot needs the trade to be at least 10% positive from its perspective — a
 * dead-even swap is declined. Keeps humans from wringing marginal value out
 * with slightly-in-their-favour "fair" trades.
 */
const TRADE_ACCEPT_MARGIN = 1.1

/**
 * Break-monopoly penalty as a MULTIPLE of the group's hotel-rent sum (from the
 * adapter's colorSetProgress.hotelRentSum). Rent-based scaling replaces the
 * old flat `price × 20` — a bare 2-property brown monopoly and a rent-heavy
 * dark_blue monopoly now scale correctly by the actual value at stake. The 2×
 * headroom on the sum is deliberate: over-declining is safe, under-declining
 * loses monopolies; keep the aggressive side.
 */
const TRADE_BREAK_MONOPOLY_RENT_FACTOR = 2

/**
 * Complete-set bonus as a MULTIPLE of the group's hotel-rent sum. Completing
 * unlocks the entire rent stream — full face value is a reasonable estimate
 * of future revenue, unscaled.
 */
const TRADE_COMPLETE_SET_RENT_FACTOR = 1

/**
 * Extend-set bonus as a MULTIPLE of the group's hotel-rent sum. Not the full
 * value (still not a monopoly), but real progress toward it. Empirically ≈40%
 * of monopoly value per marginal card in a 3-property group.
 */
const TRADE_EXTEND_SET_RENT_FACTOR = 0.4

/**
 * Mortgaged property valuation on the GIVE side: what I lose by handing it
 * away is the mortgage value (half the price) — that's what I could reclaim
 * from the bank by unmortgaging + selling. Face price would over-value it.
 */
const TRADE_GIVE_MORTGAGED_FRACTION = 0.5

/**
 * Mortgaged property valuation on the RECEIVE side: I gain the option to
 * unmortgage it, but that costs 55% of face — so net-usable value is close
 * to break-even. Round down modestly for the friction of paying to activate.
 */
const TRADE_RECEIVE_MORTGAGED_FRACTION = 0.4

/**
 * Below this cash floor, the bot treats every £ of cash as more valuable than
 * face — scarcity multiplier scales linearly (200 / current_cash). At cash
 * 100 → 2× value, at cash 50 → 4×. Symmetric: applies to BOTH cash offer and
 * cash request so a broke bot wants more cash to sell and hoards what it has.
 * Above the floor the multiplier is 1 (cash-rich bot values cash at face).
 */
const CASH_SCARCITY_FLOOR = 200

/**
 * Pick the bot's next move. Returns null when the bot has nothing to do — the
 * caller (driver) should skip in that case; the next tick re-evaluates.
 */
export function pickBotAction(view: MonopolyBotView): MonopolyBotAction | null {
  // Trade proposal directed at me — highest priority. Runs outside turn order
  // (like auctions); the human who proposed it is blocked until the bot
  // responds, so we act on the very next tick. Bots never INITIATE trades —
  // only respond — so there's no proactive branch.
  if (view.pendingTradeToMe) {
    return pickTradeResponse(view)
  }

  // Auction runs outside the turn order — check it before the turn gate so a
  // bot that is eligible to bid on a human-triggered auction actually acts,
  // regardless of whose turn it is.
  if (view.auction?.isMyBidTurn) {
    return pickAuctionAction(view)
  }

  if (!view.isMyTurn) return null

  switch (view.phase) {
    case 'roll':
      return pickRollPhaseAction(view)
    case 'buy':
      return pickBuyDecision(view)
    case 'jail':
      return pickJailAction(view)
    case 'pay_rent':
      return { type: 'pay_rent' }
    case 'raise_funds':
      return pickRaiseFundsAction(view)
    default:
      return null
  }
}

// ── Roll phase: build first if it makes sense, otherwise roll ─────────────

function pickRollPhaseAction(view: MonopolyBotView): MonopolyBotAction {
  const build = pickBuildAction(view)
  return build ?? { type: 'roll' }
}

// ── Buy: buy if cheap AND set-relevant; otherwise pass ────────────────────

function pickBuyDecision(view: MonopolyBotView): MonopolyBotAction {
  const buy = view.pendingBuy
  if (!buy) return { type: 'buy', decision: 'pass' }
  if (view.me.cash < buy.price) return { type: 'buy', decision: 'pass' }

  const cheapEnough = buy.price <= view.me.cash * BUY_CASH_RATIO
  const setRelevant = buy.startsSet || buy.completesSet
  // Stations and utilities have startsSet=false/completesSet=false in the
  // adapter (they have no monopoly mechanic); the cheap-enough gate alone
  // decides them, which matches "buy if it's a bargain, skip otherwise".
  const isStationOrUtility = buy.space.type === 'station' || buy.space.type === 'utility'

  const shouldBuy = cheapEnough && (setRelevant || isStationOrUtility)
  return { type: 'buy', decision: shouldBuy ? 'buy' : 'pass' }
}

// ── Jail: card > roll-for-doubles > pay, gated by game phase ──────────────

function pickJailAction(view: MonopolyBotView): MonopolyBotAction {
  // Free Get-Out card: always use it if I have one. Costs nothing.
  if (view.me.get_out_of_jail_free > 0) return { type: 'jail_card' }

  const lateGame = view.ownedPropertyFraction >= LATE_GAME_FRACTION
  // Mandatory-fine round: if we've been in jail 3 turns the engine forces a
  // pay-or-forfeit path on the next attempt; save the risk and pay early.
  const mustPay = view.me.jail_turns >= 2

  if (lateGame || mustPay) {
    // Only pay if we can afford it AND paying doesn't leave us broke enough
    // to owe rent on the very next square. Use a small floor: 10% of cash
    // reserved (a rough hedge against the average rent hit early after leaving jail).
    // The exact $50 fine is applied by the engine.
    if (view.me.cash >= 100) return { type: 'jail_pay' }
  }

  // Otherwise gamble for doubles.
  return { type: 'jail_roll' }
}

// ── raise_funds: sell buildings → mortgage → forfeit ──────────────────────

function pickRaiseFundsAction(view: MonopolyBotView): MonopolyBotAction {
  const debt = view.pendingDebt
  if (!debt) return { type: 'forfeit' }

  // Enough cash on hand to pay outright — do it.
  if (view.me.cash >= debt.amount) return { type: 'settle_debt' }

  // Sell one building. Prefer the cheapest color group first so we degrade
  // the least valuable rent-earner first. Skip the pending-rent property
  // (the engine rejects modifying it, and we'd waste a tick on the error).
  const sellable = view.myProperties
    .filter((p) => p.buildings > 0)
    .sort((a, b) => (a.space.houseCost ?? 0) - (b.space.houseCost ?? 0))
  if (sellable.length > 0) {
    const target = sellable[0]!
    return target.buildings === 5
      ? { type: 'sell_hotel', spaceIndex: target.spaceIndex }
      : { type: 'sell_house', spaceIndex: target.spaceIndex }
  }

  // Mortgage one property. Pick the lowest-value property not part of any
  // color group I've completed — completed groups are still my rent engine
  // so I mortgage them last.
  const completedGroups = new Set(view.colorSetProgress.filter((c) => c.iOwnAll).map((c) => c.group))
  const mortgageable = view.myProperties
    .filter((p) => !p.mortgaged && p.buildings === 0)
    .sort((a, b) => {
      const aInCompleted = a.space.color ? completedGroups.has(a.space.color) : false
      const bInCompleted = b.space.color ? completedGroups.has(b.space.color) : false
      if (aInCompleted !== bInCompleted) return aInCompleted ? 1 : -1
      return (a.space.price ?? 0) - (b.space.price ?? 0)
    })
  if (mortgageable.length > 0) {
    return { type: 'mortgage', spaceIndex: mortgageable[0]!.spaceIndex }
  }

  // Nothing left to raise. Forfeit — the engine handles the bankruptcy tree.
  return { type: 'forfeit' }
}

// ── Pre-roll builds: most-completed color set, respect even-build ─────────

function pickBuildAction(view: MonopolyBotView): MonopolyBotAction | null {
  const reserve = view.me.cash * BUILD_RESERVE_RATIO
  const availableForBuild = view.me.cash - reserve
  if (availableForBuild <= 0) return null

  // Only build inside completed, un-mortgaged monopolies. Order by the group's
  // house-cost ascending so we build breadth-first (cheap sets get houses
  // before we pour money into pricey ones — matches the classic strategy).
  const buildableGroups = view.colorSetProgress.filter((c) => c.iOwnAllUnmortgaged).map((c) => c.group)
  if (buildableGroups.length === 0) return null

  for (const group of buildableGroups) {
    const propsInGroup = view.myProperties.filter((p) => p.space.color === group)
    if (propsInGroup.length === 0) continue
    // Even-build: pick the property with the FEWEST buildings; must be ≤ min+1.
    // Sort ascending by building level; skip properties already at hotel.
    const sortedByLevel = [...propsInGroup].sort((a, b) => a.buildings - b.buildings)
    const target = sortedByLevel.find((p) => p.buildings < 5)
    if (!target) continue
    const houseCost = target.space.houseCost ?? 0
    if (houseCost === 0) continue
    if (houseCost > availableForBuild) continue

    // buildings=4 → next step is a hotel (level 5); else it's another house.
    return target.buildings === 4
      ? { type: 'build_hotel', spaceIndex: target.spaceIndex }
      : { type: 'build_house', spaceIndex: target.spaceIndex }
  }

  return null
}

// ── Trade response: accept only clearly-positive-sum, never-break-my-set ─

/**
 * Value the bot places on one side of a trade. Cash is face × scarcity
 * multiplier, properties are priced by set-relevance in rent terms × mortgage
 * state, get-out cards are priced at the jail fine.
 *
 * Set-relevance now uses per-group hotel-rent sums (from the adapter's
 * colorSetProgress) rather than flat face-price multipliers. That makes
 * brown, dark_blue, and station monopolies scale by actual rent potential
 * instead of a one-size-fits-all constant.
 */
function tradeValue(
  properties: MonopolyBotTradeProperty[],
  cash: number,
  jailCards: number,
  cashScarcity: number,
  ctx: {
    isReceiving: boolean
    iOwnGroup: (color: string | undefined) => boolean
    ownedByMeInGroup: (color: string | undefined) => number
    totalInGroup: (color: string | undefined) => number
    hotelRentSumForGroup: (color: string | undefined) => number
  }
): number {
  let total = cash * cashScarcity + jailCards * MONOPOLY_JAIL_FINE
  for (const { space, mortgaged } of properties) {
    const price = space.price ?? 0
    // Mortgage discount applies FIRST — a mortgaged property is worth less
    // on either side than its face price implies, before we layer set-relevance
    // bonuses on top.
    const base = mortgaged
      ? price * (ctx.isReceiving ? TRADE_RECEIVE_MORTGAGED_FRACTION : TRADE_GIVE_MORTGAGED_FRACTION)
      : price
    const color = space.color
    const hotelRentSum = ctx.hotelRentSumForGroup(color)
    if (ctx.isReceiving) {
      // Receiving a property in a group I already have a foothold in?
      //   completes (own totalInGroup - 1) → base + hotelRentSum × 1.0
      //   extends   (own some, not almost) → base + hotelRentSum × 0.4
      //   starts    (own 0)                → base only
      const owned = ctx.ownedByMeInGroup(color)
      const totalC = ctx.totalInGroup(color)
      const completes = totalC > 0 && owned === totalC - 1
      const extends_ = owned > 0 && !completes
      const setBonus = completes
        ? hotelRentSum * TRADE_COMPLETE_SET_RENT_FACTOR
        : extends_
          ? hotelRentSum * TRADE_EXTEND_SET_RENT_FACTOR
          : 0
      total += base + setBonus
    } else {
      // Giving up a property I own in a completed monopoly costs the full
      // group's rent stream — penalty = hotelRentSum × 2 (aggressive on
      // purpose; over-declining is safe, under-declining loses monopolies).
      const breaksMonopoly = ctx.iOwnGroup(color)
      const breakPenalty = breaksMonopoly ? hotelRentSum * TRADE_BREAK_MONOPOLY_RENT_FACTOR : 0
      total += base + breakPenalty
    }
  }
  return total
}

/**
 * Cash scarcity multiplier — cash becomes disproportionately valuable when
 * the bot is broke. Symmetric across incoming/outgoing so a broke bot wants
 * more cash to sell AND hoards what it has. Above CASH_SCARCITY_FLOOR the
 * multiplier is 1 (cash-rich bots value cash at face).
 */
function cashScarcityMultiplier(cash: number): number {
  if (cash >= CASH_SCARCITY_FLOOR) return 1
  return CASH_SCARCITY_FLOOR / Math.max(cash, 1)
}

function pickTradeResponse(view: MonopolyBotView): MonopolyBotAction {
  const trade = view.pendingTradeToMe as MonopolyBotTradeContext

  // Opponent-aware early reject: never hand a live opponent a completed
  // monopoly, regardless of what they offer. Precomputed by the adapter.
  if (trade.wouldGiveOpponentMonopoly) return { type: 'trade_decline' }

  // Belt-and-braces: reject a trade we couldn't fulfil. The engine already
  // checks this on Respond but declining early spares the human a confusing
  // "you don't have that" bounce back from the engine.
  if (trade.requestCash > view.me.cash) return { type: 'trade_decline' }
  if (trade.requestGetOutCards > view.me.get_out_of_jail_free) return { type: 'trade_decline' }
  const myPropertyIndexes = new Set(view.myProperties.map((p) => p.spaceIndex))
  for (const p of trade.requestProperties) {
    if (!myPropertyIndexes.has(p.space.index)) return { type: 'trade_decline' }
  }

  // Look up color-set state for the multiplier ctx.
  const ownedByMeIn = new Map<string, number>()
  const completedGroups = new Set<string>()
  const hotelRentByGroup = new Map<string, number>()
  for (const csp of view.colorSetProgress) {
    ownedByMeIn.set(csp.group, csp.ownedByMe)
    hotelRentByGroup.set(csp.group, csp.hotelRentSum)
    if (csp.iOwnAll) completedGroups.add(csp.group)
  }
  const ctxBase = {
    iOwnGroup: (c: string | undefined) => Boolean(c && completedGroups.has(c)),
    ownedByMeInGroup: (c: string | undefined) => (c ? (ownedByMeIn.get(c) ?? 0) : 0),
    totalInGroup: (c: string | undefined) => (c ? spacesInGroup(c as never).length : 0),
    // hotelRentSum is only tracked in colorSetProgress for groups where I own
    // at least one — that's fine here: it's only ever read when the property
    // is set-relevant to me (completes / extends / breaks-mine), which means
    // I own something in the group.
    hotelRentSumForGroup: (c: string | undefined) => (c ? (hotelRentByGroup.get(c) ?? 0) : 0),
  }

  const scarcity = cashScarcityMultiplier(view.me.cash)

  const gainValue = tradeValue(trade.offerProperties, trade.offerCash, trade.offerGetOutCards, scarcity, {
    ...ctxBase,
    isReceiving: true,
  })
  const giveValue = tradeValue(trade.requestProperties, trade.requestCash, trade.requestGetOutCards, scarcity, {
    ...ctxBase,
    isReceiving: false,
  })

  return gainValue >= giveValue * TRADE_ACCEPT_MARGIN ? { type: 'trade_accept' } : { type: 'trade_decline' }
}

// ── Auction: bid up to 60% of face, in ~10%-of-face steps ─────────────────

function pickAuctionAction(view: MonopolyBotView): MonopolyBotAction {
  const auction = view.auction!
  // Ceiling scales with set-relevance. Complete > extend > default (starts /
  // set-neutral). A property that completes a monopoly is worth paying a
  // premium against face; a random orphan tile is capped hard.
  const ceilingFraction = auction.completesSet
    ? AUCTION_MAX_FACE_FRACTION_COMPLETES
    : auction.extendsSet
      ? AUCTION_MAX_FACE_FRACTION_EXTENDS
      : AUCTION_MAX_FACE_FRACTION_DEFAULT
  const ceiling = Math.floor(auction.faceValue * ceilingFraction)
  const step = Math.max(1, Math.floor(auction.faceValue * AUCTION_BID_STEP_FACE_FRACTION))
  const nextBid = auction.highBid + step

  if (nextBid > ceiling) return { type: 'auction_pass' }
  if (nextBid > view.me.cash) return { type: 'auction_pass' }
  if (auction.iAmHighBidder) return { type: 'auction_pass' } // don't bid against myself

  return { type: 'auction_bid', amount: nextBid }
}
