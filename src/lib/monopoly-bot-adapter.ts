/**
 * Adapter: DB Monopoly state → MonopolyBotView, a compact projection with
 * exactly the fields `pickBotAction` (in `monopoly-bot.ts`) needs.
 *
 * ── Why a projection instead of passing the raw board ────────────────────
 * MonopolyBoard + MonopolyPlayerState[] is ~30 fields, most of which the
 * heuristic doesn't touch (deck order, discard piles, last_card_event, UI
 * cursors). Reducing to a view keeps the heuristic testable with hand-built
 * fixtures — mock a small object, not a whole board row.
 *
 * Unlike Whot, there is no existing solo-Monopoly bot; the view is designed
 * for `pickBotAction` being written from scratch on Day 2, not for a
 * compatibility shim.
 *
 * ── Deliberately absent ──────────────────────────────────────────────────
 * - Bot-INITIATED trades (bots never propose; too easy to look silly). The
 *   plan originally said "no trading ever"; we now respond to human-proposed
 *   trades via `pendingTradeToMe` below. Bots-initiate is still a hard no.
 * - Other players' cash or property lists — the bot only reasons about its
 *   own position; it doesn't try to hurt specific opponents.
 * - Real "round" counter (board has none). We surface `ownedPropertyFraction`
 *   as an early/mid/late-game proxy: 0.0 with nothing bought, ~1.0 with the
 *   board sold out.
 */

import {
  countOwnedInGroup,
  monopolyBoardForSize,
  mortgageValue,
  spacesInGroup,
  type MonopolyColorGroup,
  type MonopolySpace,
} from '@/lib/monopoly-board'
import { currentPlayerId } from '@/lib/monopoly'
import { calculateMonopolyCreditLimit } from '@/lib/monopoly-loan'
import type { MonopolyBoard, MonopolyPhase, MonopolyPlayerState } from '@/types'

export interface MonopolyBotOwnedProperty {
  spaceIndex: number
  space: MonopolySpace
  /** 0 = site only, 1–4 = houses, 5 = hotel. */
  buildings: number
  mortgaged: boolean
}

export interface MonopolyBotColorSetProgress {
  group: MonopolyColorGroup
  /** How many properties in this group the bot owns. */
  ownedByMe: number
  /** How many properties exist in the group total. */
  totalInGroup: number
  /** True iff bot owns every property in the group (a monopoly, buildable-eligible). */
  iOwnAll: boolean
  /** True iff bot owns the whole group AND none of them are mortgaged. */
  iOwnAllUnmortgaged: boolean
  /**
   * Rough monetary value of holding a full monopoly in this group — approximated
   * as the sum of hotel rents across every property in the group. Used by the
   * trade heuristic to price break-monopoly / complete-set / extend-set
   * decisions in real rent terms rather than face-price multiples. Special-cased
   * for stations (4× station rent) and utilities (2× ×10-dice avg).
   */
  hotelRentSum: number
}

export interface MonopolyBotBuyContext {
  spaceIndex: number
  space: MonopolySpace
  /** For property: the printed price. For station/utility: the printed price. */
  price: number
  /** True when buying this would give me my first in this color group. */
  startsSet: boolean
  /** True when buying this would complete my monopoly on the group. */
  completesSet: boolean
}

export interface MonopolyBotDebtContext {
  amount: number
  /** Combined potential cash from mortgaging every unmortgaged property with no buildings. */
  potentialFromMortgages: number
  /** Combined potential cash from selling every house/hotel back to the bank (half building cost). */
  potentialFromBuildings: number
}

export interface MonopolyBotAuctionContext {
  spaceIndex: number
  /** Full space metadata — lets the heuristic reason about color group without a board lookup. */
  space: MonopolySpace
  faceValue: number
  highBid: number
  iAmHighBidder: boolean
  isMyBidTurn: boolean
  /**
   * True when I own no properties in this space's color group yet — winning
   * this would START a set for me. For stations/utilities: true iff I own
   * none in that group.
   */
  startsSet: boolean
  /**
   * True when winning this would COMPLETE my monopoly — I already own every
   * other property in the group. Includes stations (all-4 = 200% rent) and
   * utilities (both = 10× dice).
   */
  completesSet: boolean
  /**
   * True when I own some in this group but not almost-all — winning here
   * makes progress but doesn't yet monopolize.
   */
  extendsSet: boolean
}

/**
 * One property on either side of a trade. Space definition + live state
 * (mortgaged). Building state deliberately excluded — the engine rejects
 * any trade whose group has buildings on it, so bots never see a decision
 * involving a built-up property (see monopoly.ts:validateTradeAssets).
 */
export interface MonopolyBotTradeProperty {
  space: MonopolySpace
  mortgaged: boolean
}

/**
 * A trade proposal directed at the bot from a human player. Bots never
 * initiate trades — they only respond — so this is only set when
 * pending_trade.to_player_id === botPlayerId.
 *
 * Properties carry both the space def and mortgage state so the heuristic
 * can discount mortgaged cards on either side without a second board lookup.
 */
export interface MonopolyBotTradeContext {
  fromPlayerId: string
  /** Cash the human is offering me. */
  offerCash: number
  /** Properties (with mortgage state) the human is offering me. */
  offerProperties: MonopolyBotTradeProperty[]
  /** Get-out-of-jail-free cards the human is offering me. */
  offerGetOutCards: number
  /** Cash the human is asking me to hand over. */
  requestCash: number
  /** Properties (with mortgage state) the human is asking me to hand over. */
  requestProperties: MonopolyBotTradeProperty[]
  /** Get-out-of-jail-free cards the human is asking me to hand over. */
  requestGetOutCards: number
  /**
   * True iff accepting this trade would complete a monopoly for the human
   * proposer. Precomputed here (adapter knows the full board state) so the
   * bot can outright reject without walking property ownership itself.
   * This is the "opponent-aware" gate — never hand a monopoly to a live
   * opponent regardless of what they offer.
   */
  wouldGiveOpponentMonopoly: boolean
}

export interface MonopolyBotView {
  botPlayerId: string
  phase: MonopolyPhase
  /**
   * True when the bot holds the current turn AND the phase is one that the
   * turn holder must act on (roll/buy/jail/pay_rent/raise_funds). Auction is
   * separate — see `auction.isMyBidTurn` — because bids are taken outside the
   * main turn order.
   */
  isMyTurn: boolean
  me: {
    playerId: string
    cash: number
    position: number
    in_jail: boolean
    jail_turns: number
    get_out_of_jail_free: number
    bankrupt: boolean
  }
  /** Every property I own (site, station, or utility), building level and mortgage flag included. */
  myProperties: MonopolyBotOwnedProperty[]
  /** One entry per color group I hold at least one card in. Useful for buy/build decisions. */
  colorSetProgress: MonopolyBotColorSetProgress[]
  /** Set when `phase === 'buy'` and the pending property is mine to buy. Undefined otherwise. */
  pendingBuy?: MonopolyBotBuyContext
  /** Set when `phase === 'raise_funds'` and the debt is mine. Undefined otherwise. */
  pendingDebt?: MonopolyBotDebtContext
  /** Set when an auction is live and the bot is eligible to bid. Undefined otherwise. */
  auction?: MonopolyBotAuctionContext
  /**
   * Set when a human has a pending trade proposal directed at this bot.
   * Trades run outside turn_order (like auctions) — the bot must respond
   * regardless of whose turn it is.
   */
  pendingTradeToMe?: MonopolyBotTradeContext
  /** Active loan state if the bot currently holds a bank loan. */
  activeLoan?: {
    principal: number
    balanceRemaining: number
    roundsRemaining: number
    totalDue: number
  }
  /** Current maximum borrow limit based on cash + unencumbered mortgage collateral. */
  creditLimit?: number
  /**
   * 0.0 at game start, ~1.0 once the last unowned property has been claimed.
   * Proxy for "how deep into the game are we?" used to gate late-game moves
   * (e.g. pay to leave jail once mobility matters). See file header for why
   * this replaces a proper round counter — MonopolyBoard has none.
   */
  ownedPropertyFraction: number
}

/**
 * Estimated rent value of holding a full monopoly in a group. For property
 * colours this is the sum of hotel rents (rentTable[5]) across every space
 * in the group. Stations and utilities have no rentTable in the board module
 * — their monopoly rent scales differently and is special-cased here.
 */
function hotelRentSumForGroup(group: MonopolyColorGroup, groupSpaces: MonopolySpace[]): number {
  if (group === 'station') {
    // All 4 stations owned → £200 rent per station. Total per full-set hit ≈ 800.
    return 800
  }
  if (group === 'utility') {
    // Both utilities → rent = 10 × dice; average dice roll ≈ 7 → ≈ 70 per hit.
    // Two hits per opponent lap ≈ 140.
    return 140
  }
  return groupSpaces.reduce((acc, s) => acc + (s.rentTable?.[5] ?? 0), 0)
}

/**
 * Build a MonopolyBotView from a live DB snapshot.
 *
 * Returns `null` when the bot isn't in this game or the game is finished —
 * the caller (driver) should skip in that case, exactly the same contract
 * `adaptForBot` uses for Whot.
 */
export function adaptMonopolyForBot(
  board: MonopolyBoard,
  states: MonopolyPlayerState[],
  botPlayerId: string
): MonopolyBotView | null {
  if (board.phase === 'finished') return null

  const meState = states.find((s) => s.player_id === botPlayerId)
  if (!meState) return null
  if (meState.bankrupt) return null

  const turnHolderId = currentPlayerId(board)
  const isTurnPhase =
    board.phase === 'roll' ||
    board.phase === 'buy' ||
    board.phase === 'jail' ||
    board.phase === 'pay_rent' ||
    board.phase === 'raise_funds'
  const isMyTurn = isTurnPhase && turnHolderId === botPlayerId

  const owners = board.property_owners ?? {}
  const buildings = board.property_buildings ?? {}
  const mortgaged = board.mortgaged_properties ?? {}
  const boardSize = board.board_size ?? 40
  const boardSpaces = monopolyBoardForSize(boardSize)
  const buyableSpaces = boardSpaces.filter(
    (space) => space.type === 'property' || space.type === 'station' || space.type === 'utility'
  )
  const colorGroups = Array.from(
    new Set(buyableSpaces.map((space) => space.color).filter((color): color is MonopolyColorGroup => Boolean(color)))
  )

  // My properties: walk owner map, join to space defs. Building level 0
  // (site only) is still recorded — it's the default for a bare property.
  const myProperties: MonopolyBotOwnedProperty[] = []
  for (const space of buyableSpaces) {
    if (owners[String(space.index)] === botPlayerId) {
      myProperties.push({
        spaceIndex: space.index,
        space,
        buildings: Number(buildings[String(space.index)] ?? 0),
        mortgaged: Boolean(mortgaged[String(space.index)]),
      })
    }
  }

  // Color-set progress — only include groups where the bot owns at least one.
  // Two flavours of "I own the group" are exposed: raw (eligible to build in
  // principle) and unmortgaged (actually buildable-now). The build heuristic
  // needs the second; the buy heuristic ("would this complete my set?") uses
  // the first. `hotelRentSum` is the rent this monopoly would generate at max
  // build-out, used by the trade heuristic to price break/complete/extend
  // decisions in rent terms rather than face-price multiples.
  const colorSetProgress: MonopolyBotColorSetProgress[] = []
  for (const group of colorGroups) {
    const ownedByMe = countOwnedInGroup(owners, botPlayerId, group, boardSize)
    if (ownedByMe === 0) continue
    const groupSpaces = spacesInGroup(group, boardSize)
    const totalInGroup = groupSpaces.length
    const iOwnAll = ownedByMe === totalInGroup
    const iOwnAllUnmortgaged = iOwnAll && groupSpaces.every((s) => !mortgaged[String(s.index)])
    colorSetProgress.push({
      group,
      ownedByMe,
      totalInGroup,
      iOwnAll,
      iOwnAllUnmortgaged,
      hotelRentSum: hotelRentSumForGroup(group, groupSpaces),
    })
  }

  // pendingBuy — only when the phase is 'buy' AND the pending property is
  // one my turn is on. The engine only sets pending_space during buy for the
  // current-turn player, but we re-check as belt-and-braces.
  let pendingBuy: MonopolyBotBuyContext | undefined
  if (board.phase === 'buy' && isMyTurn && board.pending_space != null) {
    const space = boardSpaces[board.pending_space]
    if (space && space.price != null && space.color) {
      const ownedNow = countOwnedInGroup(owners, botPlayerId, space.color, boardSize)
      const totalInGroup = spacesInGroup(space.color, boardSize).length
      pendingBuy = {
        spaceIndex: space.index,
        space,
        price: space.price,
        startsSet: ownedNow === 0,
        completesSet: ownedNow === totalInGroup - 1,
      }
    } else if (space && space.price != null) {
      // Station or utility — no "color set" completion mechanic in the same
      // sense; leave the set flags false.
      pendingBuy = {
        spaceIndex: space.index,
        space,
        price: space.price,
        startsSet: false,
        completesSet: false,
      }
    }
  }

  // pendingDebt — only when raise_funds is active AND the debt is mine.
  let pendingDebt: MonopolyBotDebtContext | undefined
  if (board.phase === 'raise_funds' && board.pending_debt && board.pending_debt.player_id === botPlayerId) {
    let potentialFromMortgages = 0
    let potentialFromBuildings = 0
    for (const owned of myProperties) {
      if (!owned.mortgaged && owned.buildings === 0 && owned.space.price != null) {
        potentialFromMortgages += Math.floor(owned.space.price / 2)
      }
      // Building sale-back is half the house cost per house; a hotel is
      // 4 houses + 1 hotel-worth of cost — the engine handles conversion.
      // We approximate with "buildings * (houseCost / 2)" which matches the
      // engine's sell-back for both houses and the 5th-level hotel.
      if (owned.buildings > 0 && owned.space.houseCost != null) {
        potentialFromBuildings += owned.buildings * Math.floor(owned.space.houseCost / 2)
      }
    }
    pendingDebt = {
      amount: board.pending_debt.amount,
      potentialFromMortgages,
      potentialFromBuildings,
    }
  }

  // Auction — the current_bidder gate is independent of turn_order. A bot
  // that isn't the current bidder still gets the auction object surfaced
  // (isMyBidTurn=false) so the heuristic can log/inspect if it wants; the
  // driver only calls processMonopolyAuction when isMyBidTurn is true.
  let auction: MonopolyBotAuctionContext | undefined
  if (board.auction_state) {
    const a = board.auction_state
    const space = boardSpaces[a.space_index]
    if (space) {
      const faceValue = space.price ?? 0
      const eligibleAndNotPassed = (a.eligible ?? []).includes(botPlayerId) && !(a.passed ?? []).includes(botPlayerId)
      // Set-relevance drives the auction ceiling on the bot side. Uses the
      // same startsSet/completesSet mechanic pendingBuy has so bidding on a
      // set-completer scales up, while a random orphan tile stays at the
      // conservative default cap.
      let startsSet = false
      let completesSet = false
      let extendsSet = false
      if (space.color) {
        const ownedNow = countOwnedInGroup(owners, botPlayerId, space.color, boardSize)
        const totalInGroupCount = spacesInGroup(space.color, boardSize).length
        startsSet = ownedNow === 0
        completesSet = totalInGroupCount > 0 && ownedNow === totalInGroupCount - 1
        extendsSet = !startsSet && !completesSet
      }
      auction = {
        spaceIndex: a.space_index,
        space,
        faceValue,
        highBid: a.high_bid,
        iAmHighBidder: a.high_bidder_id === botPlayerId,
        isMyBidTurn: eligibleAndNotPassed && a.current_bidder_id === botPlayerId,
        startsSet,
        completesSet,
        extendsSet,
      }
    }
  }

  // Pending trade — only when a human has proposed one addressed at this bot.
  // The engine's `to_player_id` is the recipient; bots never initiate so we
  // never populate the from-side. Property indices are resolved to spaces so
  // the heuristic doesn't have to walk MONOPOLY_BOARD itself.
  let pendingTradeToMe: MonopolyBotTradeContext | undefined
  if (board.pending_trade && board.pending_trade.to_player_id === botPlayerId) {
    const t = board.pending_trade
    // Include per-property mortgage state so the heuristic can discount a
    // mortgaged card on either side. Building state is intentionally absent —
    // the engine rejects any trade whose group has buildings on it.
    const resolveProperties = (indices: number[] | null | undefined): MonopolyBotTradeProperty[] =>
      (indices ?? [])
        .map((spaceIndex) => boardSpaces[spaceIndex])
        .filter((space): space is MonopolySpace => Boolean(space))
        .map((space) => ({ space, mortgaged: Boolean(mortgaged[String(space.index)]) }))
    const requestProps = resolveProperties(t.request_properties as number[] | null | undefined)
    // Opponent-aware check: if handing over ANY of my request_properties would
    // put the recipient at total_in_group for that group, they complete a
    // monopoly. Bot outright rejects such trades — no cash offer can compensate
    // for the strategic loss of an active human suddenly having a rent engine.
    // Handles multi-card-in-same-group trades correctly (counts increment).
    const cardsBotWouldSendPerGroup = new Map<MonopolyColorGroup, number>()
    for (const { space } of requestProps) {
      if (space.color) {
        cardsBotWouldSendPerGroup.set(space.color, (cardsBotWouldSendPerGroup.get(space.color) ?? 0) + 1)
      }
    }
    let wouldGiveOpponentMonopoly = false
    for (const [group, sendingCount] of cardsBotWouldSendPerGroup) {
      const recipientOwnedBefore = countOwnedInGroup(owners, t.from_player_id, group, boardSize)
      const totalInGroupCount = spacesInGroup(group, boardSize).length
      if (recipientOwnedBefore + sendingCount >= totalInGroupCount && recipientOwnedBefore < totalInGroupCount) {
        wouldGiveOpponentMonopoly = true
        break
      }
    }
    pendingTradeToMe = {
      fromPlayerId: t.from_player_id,
      offerCash: Number(t.offer_cash ?? 0),
      offerProperties: resolveProperties(t.offer_properties as number[] | null | undefined),
      offerGetOutCards: Number(t.offer_get_out_cards ?? 0),
      requestCash: Number(t.request_cash ?? 0),
      requestProperties: requestProps,
      requestGetOutCards: Number(t.request_get_out_cards ?? 0),
      wouldGiveOpponentMonopoly,
    }
  }

  const loans = Array.isArray(board.loans) ? board.loans : []
  const rawLoan = loans.find((loan) => loan.player_id === botPlayerId && loan.status === 'active')
  const activeLoan = rawLoan
    ? {
        principal: rawLoan.principal,
        balanceRemaining: rawLoan.balance_remaining,
        roundsRemaining: rawLoan.rounds_remaining,
        totalDue: rawLoan.total_due,
      }
    : undefined

  const unencumberedMortgages: number[] = []
  for (const property of myProperties) {
    if (!property.mortgaged && property.space.price) {
      unencumberedMortgages.push(mortgageValue(property.space))
    }
  }
  const creditLimit = calculateMonopolyCreditLimit(meState.cash, unencumberedMortgages)

  const ownedCount = buyableSpaces.reduce(
    (ownedSpaceCount, space) => (owners[String(space.index)] ? ownedSpaceCount + 1 : ownedSpaceCount),
    0
  )
  const ownedPropertyFraction = ownedCount / buyableSpaces.length

  return {
    botPlayerId,
    phase: board.phase,
    isMyTurn,
    me: {
      playerId: meState.player_id,
      cash: meState.cash,
      position: meState.position,
      in_jail: meState.in_jail,
      jail_turns: meState.jail_turns,
      get_out_of_jail_free: meState.get_out_of_jail_free,
      bankrupt: meState.bankrupt,
    },
    myProperties,
    colorSetProgress,
    pendingBuy,
    pendingDebt,
    auction,
    pendingTradeToMe,
    activeLoan,
    creditLimit,
    ownedPropertyFraction,
  }
}
