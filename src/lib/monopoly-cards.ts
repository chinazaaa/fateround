import {
  MONOPOLY_BOARD_SIZE,
  MONOPOLY_GO_SALARY,
  MONOPOLY_JAIL_POSITION,
  MONOPOLY_HOTEL_LEVEL,
  MONOPOLY_MAX_HOUSES_PER_PROPERTY,
  nearestSpaceFrom,
} from '@/lib/monopoly-board'

export type CardKind = 'chance' | 'community'

export type CardEffectType =
  | 'advance_go'
  | 'advance_to'
  | 'advance_nearest_station'
  | 'advance_nearest_utility'
  | 'move_back'
  | 'go_to_jail'
  | 'get_out_of_jail'
  | 'collect'
  | 'pay'
  | 'collect_from_each'
  | 'pay_each'
  | 'street_repairs'
  | 'general_repairs'

export interface MonopolyCardDef {
  id: number
  kind: CardKind
  message: string
  effect: CardEffectType
  amount?: number
  moveTo?: number
  moveBy?: number
  perHouse?: number
  perHotel?: number
}

/** UK edition — 16 Chance cards */
export const CHANCE_CARD_DEFS: MonopolyCardDef[] = [
  { id: 0, kind: 'chance', message: 'Advance to GO — collect £200', effect: 'advance_go' },
  { id: 1, kind: 'chance', message: 'Advance to Trafalgar Square', effect: 'advance_to', moveTo: 24 },
  { id: 2, kind: 'chance', message: 'Advance to Mayfair', effect: 'advance_to', moveTo: 39 },
  { id: 3, kind: 'chance', message: 'Advance to Pall Mall', effect: 'advance_to', moveTo: 11 },
  { id: 4, kind: 'chance', message: "Take a trip to King's Cross Station", effect: 'advance_to', moveTo: 5 },
  { id: 5, kind: 'chance', message: 'Bank pays you dividend of £50', effect: 'collect', amount: 50 },
  { id: 6, kind: 'chance', message: 'Go back three spaces', effect: 'move_back', moveBy: -3 },
  { id: 7, kind: 'chance', message: 'Go to Jail — do not pass GO, do not collect £200', effect: 'go_to_jail' },
  {
    id: 8,
    kind: 'chance',
    message: 'Make general repairs — pay £25 per house and £100 per hotel',
    effect: 'general_repairs',
    perHouse: 25,
    perHotel: 100,
  },
  { id: 9, kind: 'chance', message: 'Get Out of Jail Free', effect: 'get_out_of_jail' },
  { id: 10, kind: 'chance', message: 'Speeding fine — pay £15', effect: 'pay', amount: 15 },
  { id: 11, kind: 'chance', message: 'Take a trip to Marylebone Station', effect: 'advance_to', moveTo: 15 },
  {
    id: 12,
    kind: 'chance',
    message: 'You have been elected Chairman of the Board — pay each player £50',
    effect: 'pay_each',
    amount: 50,
  },
  { id: 13, kind: 'chance', message: 'Your building loan matures — collect £150', effect: 'collect', amount: 150 },
  { id: 14, kind: 'chance', message: 'Advance to the nearest Station', effect: 'advance_nearest_station' },
  { id: 15, kind: 'chance', message: 'Advance to the nearest Utility', effect: 'advance_nearest_utility' },
]

/** UK edition — 16 Community Chest cards */
export const COMMUNITY_CARD_DEFS: MonopolyCardDef[] = [
  { id: 0, kind: 'community', message: 'Advance to GO — collect £200', effect: 'advance_go' },
  { id: 1, kind: 'community', message: 'Bank error in your favour — collect £200', effect: 'collect', amount: 200 },
  { id: 2, kind: 'community', message: "Doctor's fee — pay £50", effect: 'pay', amount: 50 },
  { id: 3, kind: 'community', message: 'From sale of stock you get £50', effect: 'collect', amount: 50 },
  { id: 4, kind: 'community', message: 'Get Out of Jail Free', effect: 'get_out_of_jail' },
  { id: 5, kind: 'community', message: 'Go to Jail — do not pass GO, do not collect £200', effect: 'go_to_jail' },
  {
    id: 6,
    kind: 'community',
    message: 'Grand Opera Night — collect £50 from every player',
    effect: 'collect_from_each',
    amount: 50,
  },
  { id: 7, kind: 'community', message: 'Holiday fund matures — collect £100', effect: 'collect', amount: 100 },
  { id: 8, kind: 'community', message: 'Income tax refund — collect £20', effect: 'collect', amount: 20 },
  {
    id: 9,
    kind: 'community',
    message: "It's your birthday — collect £10 from every player",
    effect: 'collect_from_each',
    amount: 10,
  },
  { id: 10, kind: 'community', message: 'Life insurance matures — collect £100', effect: 'collect', amount: 100 },
  { id: 11, kind: 'community', message: 'Pay hospital fees of £100', effect: 'pay', amount: 100 },
  { id: 12, kind: 'community', message: 'Pay school fees of £50', effect: 'pay', amount: 50 },
  { id: 13, kind: 'community', message: 'Receive £25 consultancy fee', effect: 'collect', amount: 25 },
  {
    id: 14,
    kind: 'community',
    message: 'You are assessed for street repairs — £40 per house and £115 per hotel',
    effect: 'street_repairs',
    perHouse: 40,
    perHotel: 115,
  },
  { id: 15, kind: 'community', message: 'You inherit £100', effect: 'collect', amount: 100 },
]

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]!]
  }
  return next
}

export function createShuffledDeck(kind: CardKind): number[] {
  const defs = kind === 'chance' ? CHANCE_CARD_DEFS : COMMUNITY_CARD_DEFS
  return shuffle(defs.map((c) => c.id))
}

export function cardDef(kind: CardKind, id: number): MonopolyCardDef {
  const defs = kind === 'chance' ? CHANCE_CARD_DEFS : COMMUNITY_CARD_DEFS
  return defs.find((c) => c.id === id) ?? defs[0]!
}

export function drawCard(
  kind: CardKind,
  deck: number[],
  discard: number[]
): { card: MonopolyCardDef; deck: number[]; discard: number[] } {
  let nextDeck = [...deck]
  let nextDiscard = [...discard]
  if (nextDeck.length === 0) {
    nextDeck = shuffle(nextDiscard)
    nextDiscard = []
  }
  const cardId = nextDeck.shift()
  if (cardId === undefined) {
    const fallback = kind === 'chance' ? CHANCE_CARD_DEFS[0]! : COMMUNITY_CARD_DEFS[0]!
    return { card: fallback, deck: [], discard: nextDiscard }
  }
  const card = cardDef(kind, cardId)
  if (card.effect !== 'get_out_of_jail') {
    nextDiscard.push(cardId)
  }
  return { card, deck: nextDeck, discard: nextDiscard }
}

export function returnGetOutOfJailToDeck(
  kind: CardKind,
  deck: number[],
  discard: number[],
  cardId: number
): { deck: number[]; discard: number[] } {
  const nextDiscard = discard.filter((id) => id !== cardId)
  return { deck: shuffle([...deck, cardId]), discard: nextDiscard }
}

export type CardResolution = {
  message: string
  cashDelta: number
  playerCashDeltas: Record<string, number>
  moveTo?: number
  moveBy?: number
  goToJail?: boolean
  getOutOfJail?: boolean
  passedGo?: boolean
}

export function resolveCardMovement(
  card: MonopolyCardDef,
  position: number
): { moveTo?: number; moveBy?: number; passedGo: boolean } {
  if (card.effect === 'advance_go') {
    return { moveTo: 0, passedGo: true }
  }
  if (card.effect === 'advance_to' && card.moveTo !== undefined) {
    const passedGo = card.moveTo < position && card.moveTo !== MONOPOLY_JAIL_POSITION
    return { moveTo: card.moveTo, passedGo }
  }
  if (card.effect === 'advance_nearest_station') {
    const moveTo = nearestSpaceFrom(position, 'station')
    const passedGo = moveTo < position
    return { moveTo, passedGo }
  }
  if (card.effect === 'advance_nearest_utility') {
    const moveTo = nearestSpaceFrom(position, 'utility')
    const passedGo = moveTo < position
    return { moveTo, passedGo }
  }
  if (card.effect === 'move_back' && card.moveBy !== undefined) {
    const next = (((position + card.moveBy) % MONOPOLY_BOARD_SIZE) + MONOPOLY_BOARD_SIZE) % MONOPOLY_BOARD_SIZE
    return { moveBy: card.moveBy, moveTo: next, passedGo: false }
  }
  return { passedGo: false }
}

export function computeRepairCost(
  card: MonopolyCardDef,
  buildings: Record<string, number>,
  ownerId: string,
  owners: Record<string, string>
): number {
  if (card.effect !== 'street_repairs' && card.effect !== 'general_repairs') return 0
  const perHouse = card.perHouse ?? 0
  const perHotel = card.perHotel ?? 0
  let total = 0
  for (const [idx, level] of Object.entries(buildings)) {
    if (owners[idx] !== ownerId || level <= 0) continue
    if (level === MONOPOLY_HOTEL_LEVEL) total += perHotel
    else total += perHouse * Math.min(level, MONOPOLY_MAX_HOUSES_PER_PROPERTY)
  }
  return total
}

export function applyCardEffect(
  card: MonopolyCardDef,
  ctx: {
    playerId: string
    position: number
    activePlayerIds: string[]
    buildings: Record<string, number>
    owners: Record<string, string>
  }
): CardResolution {
  const playerCashDeltas: Record<string, number> = {}
  let cashDelta = 0

  if (card.effect === 'collect' && card.amount) {
    cashDelta = card.amount
  } else if (card.effect === 'pay' && card.amount) {
    cashDelta = -card.amount
  } else if (card.effect === 'collect_from_each' && card.amount) {
    const others = ctx.activePlayerIds.filter((id) => id !== ctx.playerId)
    for (const id of others) {
      playerCashDeltas[id] = (playerCashDeltas[id] ?? 0) - card.amount
      cashDelta += card.amount
    }
  } else if (card.effect === 'pay_each' && card.amount) {
    const others = ctx.activePlayerIds.filter((id) => id !== ctx.playerId)
    for (const id of others) {
      playerCashDeltas[id] = (playerCashDeltas[id] ?? 0) + card.amount
      cashDelta -= card.amount
    }
  } else if (card.effect === 'street_repairs' || card.effect === 'general_repairs') {
    cashDelta = -computeRepairCost(card, ctx.buildings, ctx.playerId, ctx.owners)
  } else if (card.effect === 'go_to_jail') {
    return { message: card.message, cashDelta: 0, playerCashDeltas, goToJail: true }
  } else if (card.effect === 'get_out_of_jail') {
    return { message: card.message, cashDelta: 0, playerCashDeltas, getOutOfJail: true }
  }

  const movement = resolveCardMovement(card, ctx.position)
  return {
    message: card.message,
    cashDelta,
    playerCashDeltas,
    moveTo: movement.moveTo,
    moveBy: movement.moveBy,
    passedGo: movement.passedGo || card.effect === 'advance_go',
  }
}

export function goSalaryForCard(card: MonopolyCardDef, passedGo: boolean): number {
  if (card.effect === 'advance_go') return MONOPOLY_GO_SALARY
  if (passedGo) return MONOPOLY_GO_SALARY
  return 0
}
