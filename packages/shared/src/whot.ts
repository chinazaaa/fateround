import type { Game, WhotCard, WhotPlayerHand, WhotSession, WhotShape } from './types'

function secondsUntilDeadline(sessionStartedAt: string, durationSeconds: number): number {
  return Math.max(0, Math.ceil((new Date(sessionStartedAt).getTime() + durationSeconds * 1000 - Date.now()) / 1000))
}

export const WHOT_MIN_PLAYERS = 2
export const WHOT_MAX_PLAYERS = 6
export const WHOT_DEFAULT_MAX_PLAYERS = 6

/** Whole-game session length (seconds). 0 = no limit. */
export const WHOT_GAME_DURATION_OPTIONS = [0, 600, 900, 1800, 2700, 3600, 5400] as const

export type WhotRules = {
  pick3Enabled: boolean
  whotCardsEnabled: boolean
  numberCallsEnabled: boolean
  /** Whether a Pick 2 can be stacked/defended with another 2. false = must draw it. */
  pick2Stacking: boolean
}

export function parseWhotRules(
  game:
    | Pick<Game, 'whot_pick3_enabled' | 'whot_cards_enabled' | 'whot_number_calls_enabled' | 'whot_pick2_stacking'>
    | null
    | undefined
): WhotRules {
  return {
    pick3Enabled: game?.whot_pick3_enabled !== false,
    whotCardsEnabled: game?.whot_cards_enabled !== false,
    numberCallsEnabled: game?.whot_number_calls_enabled !== false,
    pick2Stacking: game?.whot_pick2_stacking !== false,
  }
}

export function clampWhotGameDuration(raw: unknown): number {
  const n = Number(raw ?? 0)
  return (WHOT_GAME_DURATION_OPTIONS as readonly number[]).includes(n) ? n : 0
}

export function formatWhotGameDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return 'No limit'
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 === 1 ? '' : 's'}`
  return `${Math.round(seconds / 60)} minutes`
}

export function whotHandSum(cards: WhotCard[]): number {
  return cards.reduce((sum, card) => sum + card.number, 0)
}

export type WhotStanding = {
  playerId: string
  name: string
  cardCount: number
  handSum: number
  rank: number
}

/** Minimal hand shape `whotPlacementOrder` needs — works for both `WhotPlayerHand`
 *  rows and the trimmed `{ player_id, cards }` rows the room-points query selects. */
// Nullable to match WhotPlayerHand (null == redacted). Ranking only runs where the real
// array is available; a missing one is treated as empty.
type WhotRankableHand = { player_id: string; cards: WhotCard[] | null }

/**
 * Final placement order (1st → last), the single source of truth for who placed where.
 *
 * Players who emptied their hand rank FIRST, in the exact order they finished
 * (`finishOrder`) — in Whot, first to empty wins, and in a timed game the runners-up
 * are credited by when they went out. Everyone still holding cards follows, ordered by
 * lowest hand total then fewest cards. Without this, all finished players tie at
 * 0 cards / hand-sum 0 and the sort ordered them arbitrarily.
 */
export function whotPlacementOrder(hands: WhotRankableHand[], turnOrder: string[], finishOrder: string[]): string[] {
  const activeIds = new Set(turnOrder ?? [])
  const finished = (finishOrder ?? []).filter((id) => activeIds.has(id))
  const finishedSet = new Set(finished)
  const remaining = hands
    .filter((h) => activeIds.has(h.player_id) && !finishedSet.has(h.player_id))
    .map((h) => {
      const cards = (h.cards as WhotCard[]) ?? []
      return { playerId: h.player_id, handSum: whotHandSum(cards), cardCount: cards.length }
    })
    .sort((a, b) => {
      if (a.handSum !== b.handSum) return a.handSum - b.handSum
      if (a.cardCount !== b.cardCount) return a.cardCount - b.cardCount
      // Stable final tiebreak on a unique field so the finisher and the room-points call
      // sites — which read hands from separate queries — always agree on tied boards.
      return a.playerId.localeCompare(b.playerId)
    })
    .map((r) => r.playerId)
  return [...finished, ...remaining]
}

export function buildWhotStandings(
  hands: WhotPlayerHand[],
  players: { id: string; name: string }[],
  turnOrder: string[],
  finishOrder: string[] = []
): WhotStanding[] {
  const activeIds = new Set(turnOrder ?? [])
  const byId = new Map(hands.filter((h) => activeIds.has(h.player_id)).map((h) => [h.player_id, h]))
  return whotPlacementOrder(hands, turnOrder, finishOrder).map((playerId, index) => {
    const cards = (byId.get(playerId)?.cards as WhotCard[]) ?? []
    return {
      playerId,
      name: players.find((p) => p.id === playerId)?.name ?? 'Player',
      cardCount: cards.length,
      handSum: whotHandSum(cards),
      rank: index + 1,
    }
  })
}

export function whotGameSessionExpired(
  sessionStartedAt: string | null | undefined,
  durationSeconds: number | null | undefined
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  if (!sessionStartedAt) return false
  return secondsUntilDeadline(sessionStartedAt, durationSeconds) <= 0
}

export const WHOT_SHAPES: WhotShape[] = ['circle', 'cross', 'triangle', 'square', 'star', 'whot']

export const WHOT_SHAPE_LABELS: Record<WhotShape, string> = {
  circle: 'Circle',
  cross: 'Cross',
  triangle: 'Triangle',
  square: 'Square',
  star: 'Star',
  whot: 'WHOT',
}

/** Standard 54-card Nigerian Whot deck composition. */
const DECK_COMPOSITION: Record<Exclude<WhotShape, 'whot'>, number[]> = {
  circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  cross: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  square: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  star: [1, 2, 3, 4, 5, 7, 8],
}

const WHOT_COUNT = 5
const BASE_STARTER_SPECIALS = new Set([1, 2, 8, 14])

function starterSpecials(rules: WhotRules): Set<number> {
  const specials = new Set(BASE_STARTER_SPECIALS)
  if (rules.pick3Enabled) specials.add(5)
  if (rules.whotCardsEnabled) specials.add(20)
  return specials
}

export function buildWhotDeck(rules: WhotRules = parseWhotRules(null)): WhotCard[] {
  const deck: WhotCard[] = []
  for (const [shape, numbers] of Object.entries(DECK_COMPOSITION) as [Exclude<WhotShape, 'whot'>, number[]][]) {
    for (const number of numbers) {
      // 5 cards always stay in the deck; disabling Pick 3 only turns off the
      // draw-penalty action (handled in canPlayCard/applyPickStacksAfterPlay).
      deck.push({ id: `${shape}-${number}`, shape, number })
    }
  }
  if (rules.whotCardsEnabled) {
    for (let i = 0; i < WHOT_COUNT; i += 1) {
      deck.push({ id: `whot-20-${i}`, shape: 'whot', number: 20 })
    }
  }
  return deck
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function currentPlayerId(session: WhotSession): string | null {
  const order = session.turn_order ?? []
  if (order.length === 0) return null
  return order[session.current_turn_index % order.length] ?? null
}

export function whotTurnDeadline(timerSeconds: number): string | null {
  if (!timerSeconds || timerSeconds <= 0) return null
  return new Date(Date.now() + timerSeconds * 1000).toISOString()
}

export function whotSecondsLeft(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

export function cardLabel(card: WhotCard): string {
  if (card.number === 20) return 'WHOT'
  return `${WHOT_SHAPE_LABELS[card.shape]} ${card.number}`
}

export function specialCardMessage(number: number): string | null {
  switch (number) {
    case 1:
      return 'Hold On — take another turn'
    case 2:
      return 'Pick 2 — next player must play a 2 or draw'
    case 5:
      return 'Pick 3 — next player must play a 5 or draw'
    case 8:
      return 'Suspension — skip the next player'
    case 14:
      return 'General Market — all other players drew 1 card'
    case 20:
      return 'WHOT — choose a shape or number to match'
    default:
      return null
  }
}

export function specialCardShortLabel(number: number): string | null {
  switch (number) {
    case 1:
      return 'Hold'
    case 2:
      return 'Pick 2'
    case 5:
      return 'Pick 3'
    case 8:
      return 'Skip'
    case 14:
      return 'Market'
    default:
      return null
  }
}

export function hasActiveWhotCall(session: WhotSession): boolean {
  return session.required_shape != null || session.required_number != null
}

export function canPlayCard(card: WhotCard, session: WhotSession, rules: WhotRules = parseWhotRules(null)): boolean {
  const cardNumber = Number(card.number)
  const { pickTwo, pickFive } = getNormalizedPickStacks(session)

  // When Pick 2 stacking is off, the targeted player can't defend with a 2 — they must draw.
  if (pickTwo > 0) return rules.pick2Stacking && cardNumber === 2
  if (rules.pick3Enabled && pickFive > 0) return cardNumber === 5

  if (!rules.whotCardsEnabled && cardNumber === 20) return false

  // WHOT beats an opponent's WHOT call (required shape/number) or any normal match rule.
  if (cardNumber === 20) return true

  if (session.required_shape) {
    return card.shape === session.required_shape
  }
  if (session.required_number != null) {
    return card.number === session.required_number
  }

  const top = session.top_card
  if (!top) return true
  if (top.number === 20) return true
  return card.shape === top.shape || card.number === top.number
}

/** Pick 2 and Pick 3 stacks are mutually exclusive — only one may be active. */
export function normalizePickStacks(pickTwo: number, pickFive: number): { pickTwo: number; pickFive: number } {
  const two = Math.max(0, Number(pickTwo) || 0)
  const five = Math.max(0, Number(pickFive) || 0)
  if (two > 0 && five > 0) return { pickTwo: 0, pickFive: five }
  return { pickTwo: two, pickFive: five }
}

export function getNormalizedPickStacks(session: WhotSession): { pickTwo: number; pickFive: number } {
  return normalizePickStacks(session.pick_two_stack ?? 0, session.pick_five_stack ?? 0)
}

export type WhotPickPenalty = 'pick2' | 'pick3'

export function getActivePickPenalty(session: WhotSession): {
  type: WhotPickPenalty | null
  count: number
} {
  const { pickTwo, pickFive } = getNormalizedPickStacks(session)
  if (pickTwo > 0) return { type: 'pick2', count: pickTwo }
  if (pickFive > 0) return { type: 'pick3', count: pickFive }
  return { type: null, count: 0 }
}

/** How many cards to draw — full penalty when Pick 2 / Pick 3 is active, otherwise 1. */
export function pickPenaltyDrawCount(session: WhotSession): number {
  const { pickTwo, pickFive } = getNormalizedPickStacks(session)
  if (pickTwo > 0) return pickTwo
  if (pickFive > 0) return pickFive
  return 1
}

/**
 * Pick stacks after playing a card.
 * - 2 stacks/adds Pick 2 and clears any Pick 3
 * - 5 stacks/adds Pick 3 and clears any Pick 2
 * - Other cards never change an active penalty (only draw clears it)
 */
export function applyPickStacksAfterPlay(
  cardNumberRaw: number,
  pickTwo: number,
  pickFive: number,
  rules: WhotRules = parseWhotRules(null)
): { pickTwo: number; pickFive: number } {
  const cardNumber = Number(cardNumberRaw)
  const current = normalizePickStacks(pickTwo, pickFive)

  if (cardNumber === 2) {
    return { pickTwo: current.pickTwo > 0 ? current.pickTwo + 2 : 2, pickFive: 0 }
  }
  if (cardNumber === 5 && rules.pick3Enabled) {
    return { pickTwo: 0, pickFive: current.pickFive > 0 ? current.pickFive + 3 : 3 }
  }
  return current
}

export function pickStackPlayError(
  card: WhotCard,
  session: WhotSession,
  rules: WhotRules = parseWhotRules(null)
): string | null {
  const cardNumber = Number(card.number)
  const { pickTwo, pickFive } = getNormalizedPickStacks(session)
  if (pickTwo > 0 && (!rules.pick2Stacking || cardNumber !== 2)) {
    return rules.pick2Stacking ? 'Pick 2 active — play a 2 or draw the penalty' : 'Pick 2 active — draw the penalty'
  }
  if (rules.pick3Enabled && pickFive > 0 && cardNumber !== 5) {
    return 'Pick 3 active — play a 5 or draw the penalty'
  }
  return null
}

export function hasPlayableCard(
  hand: WhotCard[],
  session: WhotSession,
  rules: WhotRules = parseWhotRules(null)
): boolean {
  return hand.some((c) => canPlayCard(c, session, rules))
}

export function isDrawPileDepleted(session: WhotSession): boolean {
  const drawLen = ((session.draw_pile as WhotCard[]) ?? []).length
  const discardLen = ((session.discard_pile as WhotCard[]) ?? []).length
  return drawLen === 0 && discardLen === 0
}
