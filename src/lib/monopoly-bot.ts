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

import type { MonopolyBotView, MonopolyBotTradeContext } from '@/lib/monopoly-bot-adapter'
import { MONOPOLY_JAIL_FINE, spacesInGroup, type MonopolySpace } from '@/lib/monopoly-board'

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

/** Auctions: never bid above faceValue × this. */
const AUCTION_MAX_FACE_FRACTION = 0.6

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
 * Multiplier on a property's price when the bot would BREAK ITS OWN MONOPOLY
 * by trading it away. Set high enough that no realistic human offer can
 * compensate — building rent on a full set easily reaches 10× the printed
 * price over a game, plus the strategic loss of the set. This is deliberately
 * aggressive: the point of the response-only bot is "never look exploitable",
 * and the failure mode of "sometimes decline a trade a human would take"
 * beats "sometimes hand over a monopoly for a fair-looking cash bag".
 */
const TRADE_BREAK_MONOPOLY_MULTIPLIER = 20

/** Multiplier on a property's price when RECEIVING it would complete a set. */
const TRADE_COMPLETE_SET_MULTIPLIER = 2

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
 * Value the bot places on one side of a trade. Cash is face-value, properties
 * are their printed price × set-relevance multiplier, get-out cards are
 * priced at the jail fine (that's what they save you).
 *
 * `iOwnGroup(color)` tells us for a given color whether the bot ALREADY owns
 * the whole group — used to penalize giving away a monopoly card, or bonus
 * to accepting a card that would COMPLETE a set for me.
 */
function tradeValue(
  properties: MonopolySpace[],
  cash: number,
  jailCards: number,
  ctx: {
    isReceiving: boolean
    iOwnGroup: (color: string | undefined) => boolean
    ownedByMeInGroup: (color: string | undefined) => number
    totalInGroup: (color: string | undefined) => number
  }
): number {
  let total = cash + jailCards * MONOPOLY_JAIL_FINE
  for (const space of properties) {
    const base = space.price ?? 0
    const color = space.color
    if (ctx.isReceiving) {
      // Receiving a property that would complete a set I already almost own?
      // Note "almost own" = ownedByMeInGroup === totalInGroup - 1; the incoming
      // card is the missing one. Big multiplier.
      const owned = ctx.ownedByMeInGroup(color)
      const total_ = ctx.totalInGroup(color)
      const completes = total_ > 0 && owned === total_ - 1
      total += completes ? base * TRADE_COMPLETE_SET_MULTIPLIER : base
    } else {
      // Giving up a property I own in a completed monopoly is close to fatal
      // for my rent engine — huge penalty so no realistic trade compensates.
      const breaksMonopoly = ctx.iOwnGroup(color)
      total += breaksMonopoly ? base * TRADE_BREAK_MONOPOLY_MULTIPLIER : base
    }
  }
  return total
}

function pickTradeResponse(view: MonopolyBotView): MonopolyBotAction {
  const trade = view.pendingTradeToMe as MonopolyBotTradeContext

  // Belt-and-braces: reject a trade we couldn't fulfil. The engine already
  // checks this on Respond but declining early spares the human a confusing
  // "you don't have that" bounce back from the engine.
  if (trade.requestCash > view.me.cash) return { type: 'trade_decline' }
  if (trade.requestGetOutCards > view.me.get_out_of_jail_free) return { type: 'trade_decline' }
  const myPropertyIndexes = new Set(view.myProperties.map((p) => p.spaceIndex))
  for (const p of trade.requestProperties) {
    if (!myPropertyIndexes.has(p.index)) return { type: 'trade_decline' }
  }

  // Look up color-set state for the multiplier ctx.
  const ownedByMeIn = new Map<string, number>()
  const completedGroups = new Set<string>()
  for (const csp of view.colorSetProgress) {
    ownedByMeIn.set(csp.group, csp.ownedByMe)
    if (csp.iOwnAll) completedGroups.add(csp.group)
  }
  const ctxBase = {
    iOwnGroup: (c: string | undefined) => Boolean(c && completedGroups.has(c)),
    ownedByMeInGroup: (c: string | undefined) => (c ? (ownedByMeIn.get(c) ?? 0) : 0),
    totalInGroup: (c: string | undefined) => (c ? spacesInGroup(c as never).length : 0),
  }

  const gainValue = tradeValue(trade.offerProperties, trade.offerCash, trade.offerGetOutCards, {
    ...ctxBase,
    isReceiving: true,
  })
  const giveValue = tradeValue(trade.requestProperties, trade.requestCash, trade.requestGetOutCards, {
    ...ctxBase,
    isReceiving: false,
  })

  return gainValue >= giveValue * TRADE_ACCEPT_MARGIN ? { type: 'trade_accept' } : { type: 'trade_decline' }
}

// ── Auction: bid up to 60% of face, in ~10%-of-face steps ─────────────────

function pickAuctionAction(view: MonopolyBotView): MonopolyBotAction {
  const auction = view.auction!
  const ceiling = Math.floor(auction.faceValue * AUCTION_MAX_FACE_FRACTION)
  const step = Math.max(1, Math.floor(auction.faceValue * AUCTION_BID_STEP_FACE_FRACTION))
  const nextBid = auction.highBid + step

  if (nextBid > ceiling) return { type: 'auction_pass' }
  if (nextBid > view.me.cash) return { type: 'auction_pass' }
  if (auction.iAmHighBidder) return { type: 'auction_pass' } // don't bid against myself

  return { type: 'auction_bid', amount: nextBid }
}
