import { formatMonopolyMoney } from '@/lib/monopoly-board'
import { formatThemedText } from '@/components/monopoly/monopoly-themes'
import type { MonopolyLastRentEvent } from '@/types'

export function formatRentMessageForPlayer(
  event: MonopolyLastRentEvent,
  myPlayerId: string | null | undefined,
  players: { id: string; name: string }[],
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
