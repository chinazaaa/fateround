import { formatMonopolyMoney } from '@fateround/shared/monopoly-board'
import { formatThemedText } from '@/components/games/monopoly/monopoly-theme'

/**
 * Personalized status-banner messages — the mobile mirror of web's
 * monopoly-cash-messages / monopoly-rent-messages / monopoly-trade-messages.
 * The board stores these events as opaque JSONB (typed `unknown` in shared), so
 * we define the shapes locally and coerce defensively.
 */

export interface MonopolyLastRentEvent {
  seq: number
  payer_player_id: string
  owner_player_id: string
  amount: number
  space_name: string
}

export interface MonopolyLastCashEvent {
  seq: number
  player_id: string
  change: number
  balance_after: number
  label: string
  bankrupt?: boolean
}

export interface MonopolyLastTradeEvent {
  seq: number
  from_player_id: string
  to_player_id: string
  outcome: 'proposed' | 'declined' | 'accepted'
}

type NamedPlayer = { id: string; name: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export function parseCashEvent(value: unknown): MonopolyLastCashEvent | null {
  const rec = asRecord(value)
  if (!rec || typeof rec.player_id !== 'string') return null
  return {
    seq: Number(rec.seq ?? 0),
    player_id: rec.player_id,
    change: Number(rec.change ?? 0),
    balance_after: Number(rec.balance_after ?? 0),
    label: typeof rec.label === 'string' ? rec.label : '',
    bankrupt: !!rec.bankrupt,
  }
}

export function parseRentEvent(value: unknown): MonopolyLastRentEvent | null {
  const rec = asRecord(value)
  if (!rec || typeof rec.payer_player_id !== 'string' || typeof rec.owner_player_id !== 'string') return null
  return {
    seq: Number(rec.seq ?? 0),
    payer_player_id: rec.payer_player_id,
    owner_player_id: rec.owner_player_id,
    amount: Number(rec.amount ?? 0),
    space_name: typeof rec.space_name === 'string' ? rec.space_name : '',
  }
}

export function parseTradeEvent(value: unknown): MonopolyLastTradeEvent | null {
  const rec = asRecord(value)
  if (!rec || typeof rec.from_player_id !== 'string' || typeof rec.to_player_id !== 'string') return null
  const outcome = rec.outcome
  if (outcome !== 'proposed' && outcome !== 'declined' && outcome !== 'accepted') return null
  return {
    seq: Number(rec.seq ?? 0),
    from_player_id: rec.from_player_id,
    to_player_id: rec.to_player_id,
    outcome,
  }
}

export function formatCashMessageForPlayer(event: MonopolyLastCashEvent, themeId?: string | null): string {
  const amount = formatMonopolyMoney(Math.abs(event.change))
  const balance = formatMonopolyMoney(event.balance_after)

  let msg: string
  if (event.bankrupt) {
    msg = `${event.label} — you are out of the game.`
  } else if (event.change < 0) {
    msg = `${event.label} — you paid ${amount}. Balance now ${balance}.`
  } else if (event.change > 0) {
    msg = `${event.label} — you received ${amount}. Balance now ${balance}.`
  } else {
    msg = `${event.label} Balance now ${balance}.`
  }
  return formatThemedText(msg, themeId)
}

export function formatRentMessageForPlayer(
  event: MonopolyLastRentEvent,
  myPlayerId: string | null | undefined,
  players: NamedPlayer[],
  themeId?: string | null
): string {
  const payer = players.find((p) => p.id === event.payer_player_id)?.name ?? 'A player'
  const owner = players.find((p) => p.id === event.owner_player_id)?.name ?? 'A player'
  const money = formatMonopolyMoney(event.amount)

  let msg = `${payer} paid ${money} rent to ${owner} on ${event.space_name}.`
  if (myPlayerId === event.owner_player_id) {
    msg = `${payer} paid you ${money} rent on ${event.space_name}.`
  } else if (myPlayerId === event.payer_player_id) {
    msg = `You paid ${money} rent on ${event.space_name} to ${owner}.`
  }
  return formatThemedText(msg, themeId)
}

export function formatTradeMessageForPlayer(
  event: MonopolyLastTradeEvent,
  myPlayerId: string | null | undefined,
  players: NamedPlayer[],
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
  } else {
    if (myPlayerId === event.from_player_id) {
      msg = `Trade offer sent to ${to} — waiting for a response.`
    } else if (myPlayerId === event.to_player_id) {
      msg = `${from} sent you a trade offer — review every item before accepting.`
    } else {
      msg = `${from} sent a trade offer to ${to}.`
    }
  }

  return formatThemedText(msg, themeId)
}

/**
 * Resolve the single best banner message for the local player, mirroring web's
 * MonopolyActiveLayout precedence: personal cash event, then a resolved personal
 * trade event, then rent event, then the raw board status message. Returns null
 * when a phase-specific action panel already owns the messaging (buy / pay_rent /
 * auction / raise_funds) or a card event is showing.
 */
export function resolveMonopolyBanner(args: {
  statusMessage: string | null | undefined
  phase: string
  lastCashEvent: unknown
  lastRentEvent: unknown
  lastTradeEvent: unknown
  hasCardEvent: boolean
  myPlayerId: string | null | undefined
  players: NamedPlayer[]
  themeId?: string | null
}): { message: string; personal: boolean } | null {
  const { statusMessage, phase, hasCardEvent, myPlayerId, players, themeId } = args

  const cashEvent = parseCashEvent(args.lastCashEvent)
  const personalCash =
    cashEvent && cashEvent.player_id === myPlayerId ? formatCashMessageForPlayer(cashEvent, themeId) : null

  const tradeEvent = parseTradeEvent(args.lastTradeEvent)
  const personalTrade =
    tradeEvent &&
    (tradeEvent.outcome === 'declined' || tradeEvent.outcome === 'accepted') &&
    (tradeEvent.from_player_id === myPlayerId || tradeEvent.to_player_id === myPlayerId)
      ? formatTradeMessageForPlayer(tradeEvent, myPlayerId, players, themeId)
      : null

  const rentEvent = parseRentEvent(args.lastRentEvent)

  const rawMessage = personalCash
    ? personalCash
    : personalTrade
      ? personalTrade
      : rentEvent
        ? formatRentMessageForPlayer(rentEvent, myPlayerId, players, themeId)
        : statusMessage
          ? formatThemedText(statusMessage, themeId)
          : ''

  if (!rawMessage) return null

  const phaseOwnsMessaging =
    phase === 'buy' || phase === 'pay_rent' || phase === 'auction' || phase === 'raise_funds'

  const show = !!personalCash || !!personalTrade || (!phaseOwnsMessaging && !hasCardEvent)
  if (!show) return null

  return { message: rawMessage, personal: !!(personalCash || personalTrade) }
}
