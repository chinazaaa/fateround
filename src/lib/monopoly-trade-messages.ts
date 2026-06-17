import { formatMonopolyMoney, spaceAt } from '@/lib/monopoly-board'
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
  }
}

export function buildTradeSideItems(
  cash: number,
  propertyIndexes: unknown,
  jailCards = 0
): TradeSideItem[] {
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
export function formatTradeSideText(cash: number, propertyIndexes: unknown, jailCards = 0): string {
  const items = buildTradeSideItems(cash, propertyIndexes, jailCards)
  if (items.length === 0) return 'Nothing'

  return items
    .map((item) => {
      if (item.kind === 'cash') return formatMonopolyMoney(item.amount)
      if (item.kind === 'property') return item.name
      return `${item.count} jail card${item.count === 1 ? '' : 's'}`
    })
    .join(' · ')
}

function sideItemCount(cash: number, propertyIndexes: unknown, jailCards = 0): number {
  return buildTradeSideItems(cash, propertyIndexes, jailCards).length
}

export function formatIncomingTradeAlert(trade: MonopolyPendingTrade, fromName: string): string {
  const normalized = normalizePendingTrade(trade)
  const receiveCount = sideItemCount(
    normalized.offer_cash,
    normalized.offer_properties,
    normalized.offer_get_out_cards
  )
  const payCount = sideItemCount(normalized.request_cash, normalized.request_properties)

  const receiveSummary = formatTradeSideText(
    normalized.offer_cash,
    normalized.offer_properties,
    normalized.offer_get_out_cards
  )
  const paySummary =
    payCount > 0 ? formatTradeSideText(normalized.request_cash, normalized.request_properties) : null

  let message = `${fromName} offers ${receiveSummary}`
  if (paySummary && paySummary !== 'Nothing') {
    message += ` in exchange for ${paySummary}`
  }
  if (receiveCount > 1 || payCount > 1) {
    message += ` (${receiveCount} item${receiveCount === 1 ? '' : 's'} offered${
      payCount > 0 ? `, ${payCount} requested from you` : ''
    })`
  }
  return message
}

export function formatTradeMessageForPlayer(
  event: MonopolyLastTradeEvent,
  myPlayerId: string | null | undefined,
  players: { id: string; name: string }[]
): string {
  const from = players.find((p) => p.id === event.from_player_id)?.name ?? 'A player'
  const to = players.find((p) => p.id === event.to_player_id)?.name ?? 'A player'

  if (event.outcome === 'declined') {
    if (myPlayerId === event.from_player_id) {
      return `${to} declined your trade offer.`
    }
    if (myPlayerId === event.to_player_id) {
      return `You declined ${from}'s trade offer.`
    }
    return `${to} declined ${from}'s trade offer.`
  }

  if (event.outcome === 'accepted') {
    if (myPlayerId === event.from_player_id) {
      return `${to} accepted your trade offer.`
    }
    if (myPlayerId === event.to_player_id) {
      return `You accepted ${from}'s trade offer.`
    }
    return `${from} and ${to} completed a trade.`
  }

  if (event.outcome === 'proposed') {
    if (myPlayerId === event.from_player_id) {
      return `Trade offer sent to ${to} — waiting for a response.`
    }
    if (myPlayerId === event.to_player_id) {
      return `${from} sent you a trade offer — open the popup to review every item before accepting.`
    }
    return `${from} sent a trade offer to ${to}.`
  }

  return `${from} sent a trade offer to ${to}.`
}
