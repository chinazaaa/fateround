import { formatMonopolyMoney, spaceAt, type MonopolyBoardSize } from '@/lib/monopoly-board'
import { formatThemedMoney, formatThemedText, themedSpaceName } from '@/components/monopoly/monopoly-themes'
import type { MonopolyLastTradeEvent, MonopolyPendingTrade, MonopolyTradeDeclineReason } from '@/types'

export type TradeSideItem =
  | { kind: 'cash'; amount: number }
  | { kind: 'property'; name: string; index: number }
  | { kind: 'jail_cards'; count: number }

/** Coerce JSONB / client payloads into a deduped list of board indexes. */
export function normalizeTradePropertyList(raw: unknown, maxIndex = 48): number[] {
  const values: unknown[] = []

  if (raw == null) {
    return []
  }

  if (Array.isArray(raw)) {
    values.push(...raw)
  } else if (typeof raw === 'number') {
    values.push(raw)
  } else if (typeof raw === 'string') {
    values.push(...raw.split(/[,;\s]+/).filter(Boolean))
  } else if (typeof raw === 'object') {
    values.push(...Object.values(raw as Record<string, unknown>))
  }

  const seen = new Set<number>()
  const normalized: number[] = []

  for (const value of values) {
    const index = Number(value)
    if (!Number.isInteger(index) || index < 0 || index >= maxIndex || seen.has(index)) continue
    seen.add(index)
    normalized.push(index)
  }

  return normalized
}

/**
 * True when a pending trade's response window has passed. Trades stored before
 * `expires_at` existed have no deadline and never expire — matching the old
 * behaviour rather than lapsing every in-flight offer on deploy.
 */
export function isMonopolyTradeExpired(trade: Pick<MonopolyPendingTrade, 'expires_at'>, now = Date.now()): boolean {
  if (!trade.expires_at) return false
  const deadline = Date.parse(trade.expires_at)
  return Number.isFinite(deadline) && deadline <= now
}

export function normalizePendingTrade(trade: MonopolyPendingTrade, maxIndex = 48): MonopolyPendingTrade {
  return {
    ...trade,
    offer_properties: normalizeTradePropertyList(trade.offer_properties, maxIndex),
    request_properties: normalizeTradePropertyList(trade.request_properties, maxIndex),
    offer_get_out_cards: trade.offer_get_out_cards ?? 0,
    request_get_out_cards: trade.request_get_out_cards ?? 0,
  }
}

export function buildTradeSideItems(
  cash: number,
  propertyIndexes: unknown,
  jailCards = 0,
  boardSize: MonopolyBoardSize = 40
): TradeSideItem[] {
  const items: TradeSideItem[] = []
  if (cash > 0) items.push({ kind: 'cash', amount: cash })
  for (const index of normalizeTradePropertyList(propertyIndexes, boardSize)) {
    items.push({ kind: 'property', name: spaceAt(index, boardSize).name, index })
  }
  if (jailCards > 0) items.push({ kind: 'jail_cards', count: jailCards })
  return items
}

export function tradeSideHasValue(
  cash: number,
  propertyIndexes: unknown,
  jailCards = 0,
  boardSize: MonopolyBoardSize = 40
): boolean {
  return cash > 0 || normalizeTradePropertyList(propertyIndexes, boardSize).length > 0 || jailCards > 0
}

/** Human-readable trade side — omits £0 when there is no cash. */
export function formatTradeSideText(
  cash: number,
  propertyIndexes: unknown,
  jailCards = 0,
  themeId?: string | null,
  boardSize: MonopolyBoardSize = 40
): string {
  const items = buildTradeSideItems(cash, propertyIndexes, jailCards, boardSize)
  if (items.length === 0) return 'Nothing'

  const formatted = items
    .map((item) => {
      if (item.kind === 'cash') return formatThemedMoney(item.amount, themeId)
      if (item.kind === 'property') return themedSpaceName(item.name, item.index, themeId, boardSize)
      return `${item.count} skip-the-queue card${item.count === 1 ? '' : 's'}`
    })
    .join(' · ')
  return formatted
}

function sideItemCount(
  cash: number,
  propertyIndexes: unknown,
  jailCards = 0,
  boardSize: MonopolyBoardSize = 40
): number {
  return buildTradeSideItems(cash, propertyIndexes, jailCards, boardSize).length
}

export function formatIncomingTradeAlert(
  trade: MonopolyPendingTrade,
  fromName: string,
  themeId?: string | null,
  boardSize: MonopolyBoardSize = 40
): string {
  const normalized = normalizePendingTrade(trade)
  const receiveCount = sideItemCount(
    normalized.offer_cash,
    normalized.offer_properties,
    normalized.offer_get_out_cards,
    boardSize
  )
  const payCount = sideItemCount(
    normalized.request_cash,
    normalized.request_properties,
    normalized.request_get_out_cards,
    boardSize
  )

  const receiveSummary = formatTradeSideText(
    normalized.offer_cash,
    normalized.offer_properties,
    normalized.offer_get_out_cards,
    themeId,
    boardSize
  )
  const paySummary =
    payCount > 0
      ? formatTradeSideText(
          normalized.request_cash,
          normalized.request_properties,
          normalized.request_get_out_cards,
          themeId,
          boardSize
        )
      : null

  let message = `${fromName} offers ${receiveSummary}`
  if (paySummary && paySummary !== 'Nothing') {
    message += ` in exchange for ${paySummary}`
  }
  if (receiveCount > 1 || payCount > 1) {
    message += ` (${receiveCount} item${receiveCount === 1 ? '' : 's'} offered${
      payCount > 0 ? `, ${payCount} requested from you` : ''
    })`
  }
  return formatThemedText(message, themeId, boardSize)
}

/**
 * The bot's explanation for a decline, as a sentence that reads naturally
 * after "… declined your trade offer."
 *
 * Written in the SECOND person because the only reader who needs it is the
 * proposer. Every reason now points at something the player can act on — the
 * bot prices set-completing cards rather than vetoing them, so the two
 * expensive cases say "steep", not "never".
 */
export function monopolyDeclineReasonClause(reason: MonopolyTradeDeclineReason): string {
  switch (reason) {
    case 'completes_your_set':
      return 'That card would complete a set for you, so it carries a steep premium — it takes a much bigger offer.'
    case 'protects_my_monopoly':
      return 'That card is part of a completed monopoly, so it carries a steep premium — it takes a much bigger offer.'
    case 'cannot_fulfil':
      return "The bot doesn't have everything the offer asked for."
    case 'offer_too_low':
      return 'The offer was worth less than what it asked for — try offering more.'
  }
}

export function formatTradeMessageForPlayer(
  event: MonopolyLastTradeEvent,
  myPlayerId: string | null | undefined,
  players: { id: string; name: string }[],
  themeId?: string | null
): string {
  const from = players.find((p) => p.id === event.from_player_id)?.name ?? 'A player'
  const to = players.find((p) => p.id === event.to_player_id)?.name ?? 'A player'

  let msg: string
  if (event.outcome === 'declined') {
    if (myPlayerId === event.from_player_id) {
      msg = `${to} declined your trade offer.`
    } else if (myPlayerId === event.to_player_id) {
      msg = `You declined ${from}'s trade offer.`
    } else {
      msg = `${to} declined ${from}'s trade offer.`
    }
    // Only the proposer needs the reason — everyone else is just watching, and
    // the decliner (a bot) obviously knows why. Absent for human declines.
    if (event.decline_reason && myPlayerId === event.from_player_id) {
      msg += ` ${monopolyDeclineReasonClause(event.decline_reason)}`
    }
  } else if (event.outcome === 'expired') {
    if (myPlayerId === event.from_player_id) {
      msg = `Your trade offer to ${to} expired — no response in time.`
    } else if (myPlayerId === event.to_player_id) {
      msg = `${from}'s trade offer expired before you responded.`
    } else {
      msg = `${from}'s trade offer to ${to} expired.`
    }
  } else if (event.outcome === 'cancelled') {
    if (myPlayerId === event.from_player_id) {
      msg = `You cancelled your trade offer to ${to}.`
    } else if (myPlayerId === event.to_player_id) {
      msg = `${from} cancelled their trade offer.`
    } else {
      msg = `${from} cancelled their trade offer to ${to}.`
    }
  } else if (event.outcome === 'accepted') {
    if (myPlayerId === event.from_player_id) {
      msg = `${to} accepted your trade offer.`
    } else if (myPlayerId === event.to_player_id) {
      msg = `You accepted ${from}'s trade offer.`
    } else {
      msg = `${from} and ${to} completed a trade.`
    }
  } else if (event.outcome === 'proposed') {
    if (myPlayerId === event.from_player_id) {
      msg = `Trade offer sent to ${to} — waiting for a response.`
    } else if (myPlayerId === event.to_player_id) {
      msg = `${from} sent you a trade offer — open the popup to review every item before accepting.`
    } else {
      msg = `${from} sent a trade offer to ${to}.`
    }
  } else {
    msg = `${from} sent a trade offer to ${to}.`
  }

  return formatThemedText(msg, themeId)
}
