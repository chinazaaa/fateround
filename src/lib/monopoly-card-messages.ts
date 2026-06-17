import { formatMonopolyMoney } from '@/lib/monopoly-board'
import type { MonopolyLastCardEvent } from '@/types'

export function formatCardAlertForPlayer(
  event: MonopolyLastCardEvent,
  myPlayerId: string | null | undefined,
  players: { id: string; name: string }[]
): { title: string; subtitle: string; body: string; emoji: string } {
  const drawer = players.find((p) => p.id === event.drawn_by_player_id)
  const drawerName = drawer?.name ?? 'A player'
  const isDrawer = myPlayerId === event.drawn_by_player_id
  const kindLabel = event.kind === 'chance' ? 'Chance' : 'Community Chest'
  const emoji = event.kind === 'chance' ? '❓' : '🎁'
  const money = event.amount != null ? formatMonopolyMoney(event.amount) : null
  const others = event.other_player_count ?? 0

  if (isDrawer) {
    let body = event.card_message
    if (event.effect === 'collect_from_each' && event.amount != null && others > 0) {
      body = `${event.card_message} You collected ${formatMonopolyMoney(event.amount * others)} from ${others} other player${others === 1 ? '' : 's'}.`
    } else if (event.effect === 'pay_each' && event.amount != null && others > 0) {
      body = `${event.card_message} You paid ${formatMonopolyMoney(event.amount * others)} to ${others} other player${others === 1 ? '' : 's'}.`
    }
    return { title: kindLabel, subtitle: 'You drew a card', body, emoji }
  }

  if (event.effect === 'collect_from_each' && money) {
    return {
      title: kindLabel,
      subtitle: `${drawerName} drew a card`,
      body: `${drawerName} drew ${kindLabel}. You paid them ${money}.`,
      emoji,
    }
  }

  if (event.effect === 'pay_each' && money) {
    return {
      title: kindLabel,
      subtitle: `${drawerName} drew a card`,
      body: `${drawerName} drew Chance. You received ${money} from them.`,
      emoji,
    }
  }

  return {
    title: kindLabel,
    subtitle: `${drawerName} drew a card`,
    body: `${drawerName}: ${event.card_message}`,
    emoji,
  }
}