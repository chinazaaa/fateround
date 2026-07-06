import { formatMonopolyMoney, spaceAt } from '@/lib/monopoly-board'
import { formatThemedText } from '@/components/monopoly/monopoly-themes'
import type { MonopolyLastTradeEvent, MonopolyPendingTrade } from '@/types'

export type TradeSideItem =
  | { kind: 'cash'; amount: number }
  | { kind: 'property'; name: string; index: number }
  | { kind: 'jail_cards'; count: number }

/** Coerce JSONB / client payloads into a deduped list of board indexes. */
export function normalizeTradePropertyList(raw: unknown): number[] {
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
    if (!Number.isInteger(index) || index < 0 || index > 39 || seen.has(index)) continue
    seen.add(index)
    normalized.push(index)
  }

  return normalized
}

export function normalizePendingTrade(trade: MonopolyPendingTrade): MonopolyPendingTrade {
  return {
    ...trade,
    offer_properties: normalizeTradePropertyList(trade.offer_properties),
    request_properties: normalizeTradePropertyList(trade.request_properties),
    offer_get_out_cards: trade.offer_get_out_cards ?? 0,
    request_get_out_cards: trade.request_get_out_cards ?? 0,
  }
}

export function buildTradeSideItems(cash: number, propertyIndexes: unknown, jailCards = 0): TradeSideItem[] {
  const items: TradeSideItem[] = []
  if (cash > 0) items.push({ kind: 'cash', amount: cash })
  for (const index of normalizeTradePropertyList(propertyIndexes)) {
    items.push({ kind: 'property', name: spaceAt(index).name, index })
  }
  if (jailCards > 0) items.push({ kind: 'jail_cards', count: jailCards })
  return items
}

export function tradeSideHasValue(cash: number, propertyIndexes: unknown, jailCards = 0): boolean {
  return cash > 0 || normalizeTradePropertyList(propertyIndexes).length > 0 || jailCards > 0
}

/** Human-readable trade side — omits £0 when there is no cash. */
export function formatTradeSideText(
  cash: number,
  propertyIndexes: unknown,
  jailCards = 0,
  themeId?: string | null
): string {
  const items = buildTradeSideItems(cash, propertyIndexes, jailCards)
  if (items.length === 0) return 'Nothing'

  const raw = items
    .map((item) => {
      if (item.kind === 'cash') return formatMonopolyMoney(item.amount)
      if (item.kind === 'property') return item.name
      return `${item.count} jail card${item.count === 1 ? '' : 's'}`
    })
    .join(' · ')
  return formatThemedText(raw, themeId)
}

function sideItemCount(cash: number, propertyIndexes: unknown, jailCards = 0): number {
  return buildTradeSideItems(cash, propertyIndexes, jailCards).length
}

export function formatIncomingTradeAlert(
  trade: MonopolyPendingTrade,
  fromName: string,
  themeId?: string | null
): string {
  const normalized = normalizePendingTrade(trade)
  const receiveCount = sideItemCount(normalized.offer_cash, normalized.offer_properties, normalized.offer_get_out_cards)
  const payCount = sideItemCount(
    normalized.request_cash,
    normalized.request_properties,
    normalized.request_get_out_cards
  )

  const receiveSummary = formatTradeSideText(
    normalized.offer_cash,
    normalized.offer_properties,
    normalized.offer_get_out_cards,
    themeId
  )
  const paySummary =
    payCount > 0
      ? formatTradeSideText(
          normalized.request_cash,
          normalized.request_properties,
          normalized.request_get_out_cards,
          themeId
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
  return formatThemedText(message, themeId)
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
