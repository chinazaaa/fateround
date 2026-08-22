import {
  goSalaryForSize,
  MONOPOLY_GO_SALARY,
  MONOPOLY_HOTEL_LEVEL,
  MONOPOLY_MAX_HOUSES_PER_PROPERTY,
  nearestSpaceFrom,
  type MonopolyBoardSize,
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

/**
 * London Edition — 16 Fate cards (was "Chance"). Original wording; mechanics preserved
 * so effect enums, indices, and money amounts still round-trip with saved boards.
 */
export const CHANCE_CARD_DEFS: MonopolyCardDef[] = [
  {
    id: 0,
    kind: 'chance',
    message: "You're headed straight to PAYDAY. Collect £200.",
    effect: 'advance_go',
  },
  {
    id: 1,
    kind: 'chance',
    message: 'Roadworks everywhere. Advance to Winnington Road.',
    effect: 'advance_to',
    moveTo: 39,
  },
  {
    id: 2,
    kind: 'chance',
    message: 'Tube strike. Everyone stays put — advance to Marylebone Lane.',
    effect: 'advance_to',
    moveTo: 31,
  },
  {
    id: 3,
    kind: 'chance',
    message: 'Cab driver knows a shortcut. Advance to Victoria. If you pass PAYDAY, collect £200.',
    effect: 'advance_to',
    moveTo: 25,
  },
  {
    id: 4,
    kind: 'chance',
    message: 'Bank pays you a dividend. Collect £50.',
    effect: 'collect',
    amount: 50,
  },
  {
    id: 5,
    kind: 'chance',
    message: 'Night bus takes you the long way round. Go back 3 spaces.',
    effect: 'move_back',
    moveBy: -3,
  },
  {
    id: 6,
    kind: 'chance',
    message: 'Off to NICKED. Do not pass PAYDAY, do not collect £200.',
    effect: 'go_to_jail',
  },
  {
    id: 7,
    kind: 'chance',
    message: 'Landlord repairs: pay £25 per house and £100 per hotel you own.',
    effect: 'general_repairs',
    perHouse: 25,
    perHotel: 100,
  },
  {
    id: 8,
    kind: 'chance',
    message: 'Skip the queue at NICKED — keep this card.',
    effect: 'get_out_of_jail',
  },
  {
    id: 9,
    kind: 'chance',
    message: 'Speeding ticket on the North Circular. Pay £15.',
    effect: 'pay',
    amount: 15,
  },
  {
    id: 10,
    kind: 'chance',
    message: 'Overpriced flat white habit catches up with you. Pay £20.',
    effect: 'pay',
    amount: 20,
  },
  {
    id: 11,
    kind: 'chance',
    message: 'Your street festival raises money. Collect £100.',
    effect: 'collect',
    amount: 100,
  },
  {
    id: 12,
    kind: 'chance',
    message: 'A dodgy investment pays off. Collect £150.',
    effect: 'collect',
    amount: 150,
  },
  {
    id: 13,
    kind: 'chance',
    message: 'Oyster card auto-tops-up in your favour. Collect £50.',
    effect: 'collect',
    amount: 50,
  },
  {
    id: 14,
    kind: 'chance',
    message: 'You win second prize in a Camden pub quiz. Collect £10.',
    effect: 'collect',
    amount: 10,
  },
  {
    id: 15,
    kind: 'chance',
    message: 'Congestion charge caught you out. Pay £30.',
    effect: 'pay',
    amount: 30,
  },
]

/**
 * London Edition — 16 Kitty cards (was "Community Chest"). Original wording;
 * mechanics preserved as above.
 */
export const COMMUNITY_CARD_DEFS: MonopolyCardDef[] = [
  {
    id: 0,
    kind: 'community',
    message: 'Head back to PAYDAY. Collect £200.',
    effect: 'advance_go',
  },
  {
    id: 1,
    kind: 'community',
    message: 'Tax rebate from the TAX OFFICE. Collect £100.',
    effect: 'collect',
    amount: 100,
  },
  {
    id: 2,
    kind: 'community',
    message: 'Boiler breaks in your Brixton Hill flat. Pay £40.',
    effect: 'pay',
    amount: 40,
  },
  {
    id: 3,
    kind: 'community',
    message: 'You sell an old sofa on Gumtree. Collect £45.',
    effect: 'collect',
    amount: 45,
  },
  {
    id: 4,
    kind: 'community',
    message: 'Skip the queue at NICKED — keep this card.',
    effect: 'get_out_of_jail',
  },
  {
    id: 5,
    kind: 'community',
    message: 'Off to NICKED. Do not pass PAYDAY, do not collect £200.',
    effect: 'go_to_jail',
  },
  {
    id: 6,
    kind: 'community',
    message: 'Birthday round the corner — collect £10 from every player.',
    effect: 'collect_from_each',
    amount: 10,
  },
  {
    id: 7,
    kind: 'community',
    message: 'Premium Bond wins. Collect £100.',
    effect: 'collect',
    amount: 100,
  },
  {
    id: 8,
    kind: 'community',
    message: 'Council rebate for the whole street. Collect £20.',
    effect: 'collect',
    amount: 20,
  },
  {
    id: 9,
    kind: 'community',
    message: 'You inherit a little from a distant aunt. Collect £100.',
    effect: 'collect',
    amount: 100,
  },
  {
    id: 10,
    kind: 'community',
    message: 'Refund from an online order. Collect £25.',
    effect: 'collect',
    amount: 25,
  },
  {
    id: 11,
    kind: 'community',
    message: 'Dentist bill. Pay £50.',
    effect: 'pay',
    amount: 50,
  },
  {
    id: 12,
    kind: 'community',
    message: 'Vet bill for the cat. Pay £30.',
    effect: 'pay',
    amount: 30,
  },
  {
    id: 13,
    kind: 'community',
    message: 'You found a tenner in an old coat. Collect £10.',
    effect: 'collect',
    amount: 10,
  },
  {
    id: 14,
    kind: 'community',
    message: 'Building works assessed: pay £40 per house and £115 per hotel.',
    effect: 'street_repairs',
    perHouse: 40,
    perHotel: 115,
  },
  {
    id: 15,
    kind: 'community',
    message: 'Water Board overcharged you and pays it back. Collect £75.',
    effect: 'collect',
    amount: 75,
  },
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
  position: number,
  boardSize: 40 | 48 = 40
): { moveTo?: number; moveBy?: number; passedGo: boolean } {
  if (card.effect === 'advance_go') {
    return { moveTo: 0, passedGo: true }
  }
  if (card.effect === 'advance_to' && card.moveTo !== undefined) {
    const moveTo = boardSize === 48 ? card.moveTo + Math.floor(card.moveTo / 10) * 2 : card.moveTo
    const jailPosition = boardSize / 4
    const passedGo = moveTo < position && moveTo !== jailPosition
    return { moveTo, passedGo }
  }
  if (card.effect === 'advance_nearest_station') {
    const moveTo = nearestSpaceFrom(position, 'station', true, boardSize)
    const passedGo = moveTo < position
    return { moveTo, passedGo }
  }
  if (card.effect === 'advance_nearest_utility') {
    const moveTo = nearestSpaceFrom(position, 'utility', true, boardSize)
    const passedGo = moveTo < position
    return { moveTo, passedGo }
  }
  if (card.effect === 'move_back' && card.moveBy !== undefined) {
    const next = (((position + card.moveBy) % boardSize) + boardSize) % boardSize
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
    boardSize?: 40 | 48
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

  const movement = resolveCardMovement(card, ctx.position, ctx.boardSize ?? 40)
  return {
    message: card.message,
    cashDelta,
    playerCashDeltas,
    moveTo: movement.moveTo,
    moveBy: movement.moveBy,
    passedGo: movement.passedGo || card.effect === 'advance_go',
  }
}

export function goSalaryForCard(card: MonopolyCardDef, passedGo: boolean, boardSize: MonopolyBoardSize = 40): number {
  const salary = goSalaryForSize(boardSize)
  if (card.effect === 'advance_go') return salary
  if (passedGo) return salary
  return 0
}

/**
 * Card copy quotes the PAYDAY salary inline ("Collect £200"). The 48-space board pays a larger
 * salary, so the quoted figure is rewritten to whatever the engine actually credits there.
 */
export function cardMessageForSize(message: string, boardSize: MonopolyBoardSize = 40): string {
  const salary = goSalaryForSize(boardSize)
  if (salary === MONOPOLY_GO_SALARY) return message
  return message.replace(new RegExp(`£${MONOPOLY_GO_SALARY}\\b`, 'g'), `£${salary}`)
}
