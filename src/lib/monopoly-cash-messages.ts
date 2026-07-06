import { formatMonopolyMoney } from '@/lib/monopoly-board'
import { formatThemedText } from '@/components/monopoly/monopoly-themes'
import type { MonopolyLastCashEvent } from '@/types'

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

export function formatCashMessageForOthers(
  event: MonopolyLastCashEvent,
  playerName: string,
  themeId?: string | null
): string {
  const amount = formatMonopolyMoney(Math.abs(event.change))
  let msg: string
  if (event.bankrupt) {
    msg = `${playerName} went bankrupt — ${event.label}.`
  } else if (event.change < 0) {
    msg = `${playerName} paid ${amount} — ${event.label}.`
  } else if (event.change > 0) {
    msg = `${playerName} received ${amount} — ${event.label}.`
  } else {
    msg = `${playerName}: ${event.label}`
  }
  return formatThemedText(msg, themeId)
}
