import type {
  CrazyEightsCalledSuit,
  CrazyEightsCard,
  CrazyEightsPlayerHand,
  CrazyEightsSession,
  CrazyEightsSuit,
  Game,
} from './types'

function secondsUntilDeadline(sessionStartedAt: string, durationSeconds: number): number {
  return Math.max(0, Math.ceil((new Date(sessionStartedAt).getTime() + durationSeconds * 1000 - Date.now()) / 1000))
}

export const CRAZY8_MIN_PLAYERS = 2
export const CRAZY8_MAX_PLAYERS = 6
export const CRAZY8_DEFAULT_MAX_PLAYERS = 6

/** Whole-game session length (seconds). 0 = no limit. */
export const CRAZY8_GAME_DURATION_OPTIONS = [0, 600, 900, 1800, 2700, 3600, 5400] as const

/** The four playable suits (excludes the Joker pseudo-suit). */
export const CRAZY8_SUITS: CrazyEightsCalledSuit[] = ['spades', 'clubs', 'hearts', 'diamonds']

export const CRAZY8_SUIT_LABELS: Record<CrazyEightsSuit, string> = {
  spades: 'Spades',
  clubs: 'Clubs',
  hearts: 'Hearts',
  diamonds: 'Diamonds',
  joker: 'Joker',
}

export const CRAZY8_SUIT_SYMBOLS: Record<CrazyEightsSuit, string> = {
  spades: '♠',
  clubs: '♣',
  hearts: '♥',
  diamonds: '♦',
  joker: '🃏',
}

/** Cards a Joker forces the next player to draw (non-defendable). */
export const JOKER_DRAW = 5

export type CrazyEightsRules = {
  /** Enable 2/J/Q/A action cards. false = pure base game (only the 8 is wild). */
  actionCards: boolean
  /** Include 2 Jokers (wild + draw 5) in the deck. */
  jokers: boolean
  /** Whether a Pick 2 can be stacked/defended with another 2. false = must draw it. */
  pick2Stacking: boolean
}

export function parseCrazyEightsRules(
  game: Pick<Game, 'crazy8_action_cards' | 'crazy8_jokers' | 'crazy8_pick2_stacking'> | null | undefined
): CrazyEightsRules {
  return {
    actionCards: game?.crazy8_action_cards !== false,
    jokers: game?.crazy8_jokers === true,
    pick2Stacking: game?.crazy8_pick2_stacking !== false,
  }
}

export function clampCrazyEightsGameDuration(raw: unknown): number {
  const n = Number(raw ?? 0)
  return (CRAZY8_GAME_DURATION_OPTIONS as readonly number[]).includes(n) ? n : 0
}

export function formatCrazyEightsGameDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return 'No limit'
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 === 1 ? '' : 's'}`
  return `${Math.round(seconds / 60)} minutes`
}

const RANK_LABELS: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }

export function isJoker(card: CrazyEightsCard): boolean {
  return card.suit === 'joker'
}

/** Wild cards: the 8 (core) and Jokers. */
export function isWildCard(card: CrazyEightsCard): boolean {
  return isJoker(card) || card.rank === 8
}

export function cardLabel(card: CrazyEightsCard): string {
  if (isJoker(card)) return 'Joker'
  const rank = RANK_LABELS[card.rank] ?? String(card.rank)
  return `${rank}${CRAZY8_SUIT_SYMBOLS[card.suit]}`
}

/** Points a card is worth when tallying hands at game end (lowest wins). */
export function cardPoints(card: CrazyEightsCard): number {
  if (isJoker(card)) return 50
  if (card.rank === 8) return 50
  if (card.rank === 1) return 1
  if (card.rank >= 11) return 10
  return card.rank
}

export function crazyEightsHandSum(cards: CrazyEightsCard[]): number {
  return cards.reduce((sum, card) => sum + cardPoints(card), 0)
}

export type CrazyEightsStanding = {
  playerId: string
  name: string
  cardCount: number
  handSum: number
  rank: number
}

/** Minimal hand shape `crazyEightsPlacementOrder` needs — works for both
 *  `CrazyEightsPlayerHand` rows and the trimmed `{ player_id, cards }` rows the
 *  room-points query selects. */
// Nullable to match CrazyEightsPlayerHand (null == redacted). Ranking only runs where the real
// array is available; a missing one is treated as empty.
type CrazyEightsRankableHand = { player_id: string; cards: CrazyEightsCard[] | null }

/**
 * Final placement order (1st → last), the single source of truth for who placed where.
 *
 * Players who emptied their hand rank FIRST, in the exact order they finished
 * (`finishOrder`) — first to empty wins, and in a timed game the runners-up are credited
 * by when they went out. Everyone still holding cards follows, ordered by lowest hand
 * total then fewest cards. Without this, all finished players tie at 0 cards / hand-sum 0
 * and the sort ordered them arbitrarily.
 */
export function crazyEightsPlacementOrder(
  hands: CrazyEightsRankableHand[],
  turnOrder: string[],
  finishOrder: string[]
): string[] {
  const activeIds = new Set(turnOrder ?? [])
  const finished = (finishOrder ?? []).filter((id) => activeIds.has(id))
  const finishedSet = new Set(finished)
  const remaining = hands
    .filter((h) => activeIds.has(h.player_id) && !finishedSet.has(h.player_id))
    .map((h) => {
      const cards = (h.cards as CrazyEightsCard[]) ?? []
      return { playerId: h.player_id, handSum: crazyEightsHandSum(cards), cardCount: cards.length }
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

export function buildCrazyEightsStandings(
  hands: CrazyEightsPlayerHand[],
  players: { id: string; name: string }[],
  turnOrder: string[],
  finishOrder: string[] = []
): CrazyEightsStanding[] {
  const activeIds = new Set(turnOrder ?? [])
  const byId = new Map(hands.filter((h) => activeIds.has(h.player_id)).map((h) => [h.player_id, h]))
  return crazyEightsPlacementOrder(hands, turnOrder, finishOrder).map((playerId, index) => {
    const cards = (byId.get(playerId)?.cards as CrazyEightsCard[]) ?? []
    return {
      playerId,
      name: players.find((p) => p.id === playerId)?.name ?? 'Player',
      cardCount: cards.length,
      handSum: crazyEightsHandSum(cards),
      rank: index + 1,
    }
  })
}

export function crazyEightsGameSessionExpired(
  sessionStartedAt: string | null | undefined,
  durationSeconds: number | null | undefined
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  if (!sessionStartedAt) return false
  return secondsUntilDeadline(sessionStartedAt, durationSeconds) <= 0
}

/** Build the deck: 52 standard cards + 2 Jokers when enabled. */
export function buildCrazyEightsDeck(rules: CrazyEightsRules = parseCrazyEightsRules(null)): CrazyEightsCard[] {
  const deck: CrazyEightsCard[] = []
  for (const suit of CRAZY8_SUITS) {
    for (let rank = 1; rank <= 13; rank += 1) {
      deck.push({ id: `${suit}-${rank}`, suit, rank })
    }
  }
  if (rules.jokers) {
    deck.push({ id: 'joker-0', suit: 'joker', rank: 0 })
    deck.push({ id: 'joker-1', suit: 'joker', rank: 0 })
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

export function currentPlayerId(session: CrazyEightsSession): string | null {
  const order = session.turn_order ?? []
  if (order.length === 0) return null
  const len = order.length
  return order[((session.current_turn_index % len) + len) % len] ?? null
}

export function crazyEightsTurnDeadline(timerSeconds: number): string | null {
  if (!timerSeconds || timerSeconds <= 0) return null
  return new Date(Date.now() + timerSeconds * 1000).toISOString()
}

export function crazyEightsSecondsLeft(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

export function specialCardMessage(card: CrazyEightsCard, rules: CrazyEightsRules): string | null {
  if (isJoker(card)) return `Joker — next player draws ${JOKER_DRAW}, choose a suit`
  if (card.rank === 8) return 'Crazy 8 — choose a suit'
  if (!rules.actionCards) return null
  switch (card.rank) {
    case 2:
      return rules.pick2Stacking ? 'Pick 2 — next player draws 2 or stacks a 2' : 'Pick 2 — next player draws 2'
    case 1:
      return 'Skip — next player loses their turn'
    case 11:
      return 'Skip — next player loses their turn'
    case 12:
      return 'Reverse — direction of play flips'
    default:
      return null
  }
}

export function specialCardShortLabel(card: CrazyEightsCard, rules: CrazyEightsRules): string | null {
  if (isJoker(card)) return 'Joker'
  if (card.rank === 8) return 'Wild'
  if (!rules.actionCards) return null
  switch (card.rank) {
    case 2:
      return 'Pick 2'
    case 1:
    case 11:
      return 'Skip'
    case 12:
      return 'Reverse'
    default:
      return null
  }
}

export function hasActiveSuitCall(session: CrazyEightsSession): boolean {
  return session.required_suit != null
}

/** Pick Two and the Joker draw are mutually exclusive — only one may be active. */
export function normalizePenalties(pickTwo: number, jokerPenalty: number): { pickTwo: number; jokerPenalty: number } {
  const two = Math.max(0, Number(pickTwo) || 0)
  const joker = Math.max(0, Number(jokerPenalty) || 0)
  if (two > 0 && joker > 0) return { pickTwo: 0, jokerPenalty: joker }
  return { pickTwo: two, jokerPenalty: joker }
}

export function getNormalizedPenalties(session: CrazyEightsSession): { pickTwo: number; jokerPenalty: number } {
  return normalizePenalties(session.pick_two_stack ?? 0, session.joker_penalty ?? 0)
}

/** How many cards to draw — full penalty when one is active, otherwise 1. */
export function penaltyDrawCount(session: CrazyEightsSession): number {
  const { pickTwo, jokerPenalty } = getNormalizedPenalties(session)
  if (pickTwo > 0) return pickTwo
  if (jokerPenalty > 0) return jokerPenalty
  return 1
}

export function canPlayCard(
  card: CrazyEightsCard,
  session: CrazyEightsSession,
  rules: CrazyEightsRules = parseCrazyEightsRules(null)
): boolean {
  const { pickTwo, jokerPenalty } = getNormalizedPenalties(session)

  // A pending Joker draw can't be defended — the targeted player must draw.
  if (jokerPenalty > 0) return false
  // Pick 2: defend only with another 2 (and only when stacking is allowed).
  if (pickTwo > 0) return rules.actionCards && rules.pick2Stacking && card.rank === 2

  // Wild cards play on anything.
  if (isWildCard(card)) return true

  if (session.required_suit) {
    return card.suit === session.required_suit
  }

  const top = session.top_card
  if (!top) return true
  if (isWildCard(top)) return true
  return card.suit === top.suit || card.rank === top.rank
}

export function playPenaltyError(
  card: CrazyEightsCard,
  session: CrazyEightsSession,
  rules: CrazyEightsRules = parseCrazyEightsRules(null)
): string | null {
  const { pickTwo, jokerPenalty } = getNormalizedPenalties(session)
  if (jokerPenalty > 0) return `Joker — draw the ${jokerPenalty}-card penalty`
  if (pickTwo > 0) {
    const canStack = rules.actionCards && rules.pick2Stacking
    if (!canStack || card.rank !== 2) {
      return canStack ? 'Pick 2 active — play a 2 or draw the penalty' : 'Pick 2 active — draw the penalty'
    }
  }
  return null
}

export function hasPlayableCard(
  hand: CrazyEightsCard[],
  session: CrazyEightsSession,
  rules: CrazyEightsRules = parseCrazyEightsRules(null)
): boolean {
  return hand.some((c) => canPlayCard(c, session, rules))
}

export function isDrawPileDepleted(session: CrazyEightsSession): boolean {
  const drawLen = ((session.draw_pile as CrazyEightsCard[]) ?? []).length
  const discardLen = ((session.discard_pile as CrazyEightsCard[]) ?? []).length
  return drawLen === 0 && discardLen === 0
}

export function crazyEightsHandCount(hands: CrazyEightsPlayerHand[], playerId: string): number {
  return ((hands.find((h) => h.player_id === playerId)?.cards as CrazyEightsCard[]) ?? []).length
}
