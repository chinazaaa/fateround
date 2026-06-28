import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'
import { markGameFinished } from '@/lib/game-finish'
import { secondsUntilDeadline } from '@/lib/round-timing'
import type {
  CrazyEightsCalledSuit,
  CrazyEightsCard,
  CrazyEightsPlayerHand,
  CrazyEightsSession,
  CrazyEightsSuit,
  Game,
} from '@/types'

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

export function buildCrazyEightsStandings(
  hands: CrazyEightsPlayerHand[],
  players: { id: string; name: string }[],
  turnOrder: string[]
): CrazyEightsStanding[] {
  const activeIds = new Set(turnOrder ?? [])
  const rows = hands
    .filter((h) => activeIds.has(h.player_id))
    .map((h) => {
      const cards = (h.cards as CrazyEightsCard[]) ?? []
      return {
        playerId: h.player_id,
        name: players.find((p) => p.id === h.player_id)?.name ?? 'Player',
        cardCount: cards.length,
        handSum: crazyEightsHandSum(cards),
      }
    })
    .sort((a, b) => {
      if (a.handSum !== b.handSum) return a.handSum - b.handSum
      return a.cardCount - b.cardCount
    })

  return rows.map((row, index) => ({ ...row, rank: index + 1 }))
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

/** True when the player has no cards left and is watching the rest of the game. */
export function isCrazyEightsPlayerOut(handCount: number, spectator?: boolean | null): boolean {
  return handCount === 0 || spectator === true
}

/**
 * Advance `steps` active players from `fromIndex` in `direction` (1 forward,
 * -1 reversed), skipping players who are out of cards.
 */
export function crazyEightsNextTurnIndex(
  session: CrazyEightsSession,
  hands: CrazyEightsPlayerHand[],
  fromIndex: number,
  steps: number,
  direction: number
): number {
  const order = session.turn_order ?? []
  const len = order.length
  if (len === 0) return 0
  const dir = direction < 0 ? -1 : 1

  let idx = fromIndex
  for (let s = 0; s < steps; s += 1) {
    let advanced = false
    for (let attempt = 0; attempt < len; attempt += 1) {
      idx = (((idx + dir) % len) + len) % len
      if (crazyEightsHandCount(hands, order[idx]!) > 0) {
        advanced = true
        break
      }
    }
    if (!advanced) return fromIndex
  }
  return idx
}

export function anyPlayerCanPlay(
  hands: CrazyEightsPlayerHand[],
  session: CrazyEightsSession,
  rules: CrazyEightsRules = parseCrazyEightsRules(null)
): boolean {
  for (const row of hands) {
    const cards = (row.cards as CrazyEightsCard[]) ?? []
    if (cards.length === 0) continue
    if (hasPlayableCard(cards, session, rules)) return true
  }
  return false
}

function pickAutoPlayCard(playable: CrazyEightsCard[]): CrazyEightsCard {
  // Prefer non-wild cards, lowest points, so the auto-play doesn't waste an 8/Joker.
  const nonWild = playable.filter((c) => !isWildCard(c))
  const pool = nonWild.length > 0 ? nonWild : playable
  return [...pool].sort((a, b) => cardPoints(a) - cardPoints(b))[0]!
}

/** Suit the player holds the most of — used to auto-name a suit on timeout. */
function dominantSuit(hand: CrazyEightsCard[]): CrazyEightsCalledSuit {
  const counts: Record<CrazyEightsCalledSuit, number> = { spades: 0, clubs: 0, hearts: 0, diamonds: 0 }
  for (const c of hand) {
    if (c.suit !== 'joker') counts[c.suit] += 1
  }
  return CRAZY8_SUITS.reduce((best, suit) => (counts[suit] > counts[best] ? suit : best), 'spades')
}

function dealCount(playerCount: number): number {
  return playerCount === 2 ? 7 : 5
}

function isStarterSpecial(card: CrazyEightsCard, rules: CrazyEightsRules): boolean {
  if (isJoker(card)) return true
  if (card.rank === 8) return true
  if (rules.actionCards && (card.rank === 1 || card.rank === 2 || card.rank === 11 || card.rank === 12)) return true
  return false
}

function drawStarter(
  deck: CrazyEightsCard[],
  rules: CrazyEightsRules
): { top: CrazyEightsCard; rest: CrazyEightsCard[] } {
  const pile = [...deck]
  // Prefer a non-special starter. findIndex is bounded — a pop()/unshift() rotation
  // would spin forever if every remaining card is special.
  const idx = pile.findIndex((c) => !isStarterSpecial(c, rules))
  if (idx === -1) {
    // Everything left is special — just take the top card as the starter.
    const top = pile.pop()!
    return { top, rest: pile }
  }
  const [top] = pile.splice(idx, 1)
  return { top: top!, rest: pile }
}

export async function initializeCrazyEightsGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  const { data: gameRow } = await supabase
    .from('games')
    .select('timer_seconds, crazy8_action_cards, crazy8_jokers, crazy8_pick2_stacking')
    .eq('id', gameId)
    .maybeSingle()
  const rules = parseCrazyEightsRules(gameRow)
  const timerSeconds = gameRow?.timer_seconds ?? 0

  const turnOrder = shuffle(playerIds)
  const deck = shuffle(buildCrazyEightsDeck(rules))
  const cardsEach = dealCount(turnOrder.length)

  const hands: CrazyEightsCard[][] = turnOrder.map(() => [])
  let drawPile = [...deck]

  for (let c = 0; c < cardsEach; c += 1) {
    for (let p = 0; p < turnOrder.length; p += 1) {
      const card = drawPile.pop()
      if (card) hands[p].push(card)
    }
  }

  const { top, rest } = drawStarter(drawPile, rules)
  drawPile = rest

  const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
  const initNames = new Map<string, string>()
  for (const p of playerRows ?? []) {
    initNames.set(p.id, p.name)
  }

  const firstPlayerId = turnOrder[0]
  const firstName = firstPlayerId ? (initNames.get(firstPlayerId) ?? 'Player') : 'Player'
  const sessionRow: Partial<CrazyEightsSession> = {
    game_id: gameId,
    turn_order: turnOrder,
    current_turn_index: 0,
    direction: 1,
    phase: 'playing',
    draw_pile: drawPile,
    discard_pile: [],
    top_card: top,
    required_suit: null,
    pick_two_stack: 0,
    joker_penalty: 0,
    status_message: `${firstName}'s turn — match ${cardLabel(top)}`,
    winner_player_id: null,
    turn_deadline_at: crazyEightsTurnDeadline(timerSeconds),
  }

  const { error: sessionError } = await supabase.from('crazy_eights_sessions').insert(sessionRow)
  if (sessionError) return { error: sessionError.message }

  const handRows = turnOrder.map((playerId, index) => ({
    game_id: gameId,
    player_id: playerId,
    cards: hands[index],
    player_order: index,
  }))

  const { error: handsError } = await supabase.from('crazy_eights_player_hands').insert(handRows)
  if (handsError) {
    // Roll back the session row so a failed deal doesn't strand a half-initialized game.
    await supabase.from('crazy_eights_sessions').delete().eq('game_id', gameId)
    return { error: handsError.message }
  }

  return {}
}

export async function clearCrazyEightsSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['crazy_eights_sessions', 'crazy_eights_player_hands'], {
    resetSpectators: true,
  })
}

async function loadGameState(
  supabase: SupabaseClient,
  gameId: string
): Promise<{
  session: CrazyEightsSession | null
  hands: CrazyEightsPlayerHand[]
  timerSeconds: number
  gameDurationSeconds: number
  rules: CrazyEightsRules
  playerNames: Map<string, string>
}> {
  const [sessionRes, handsRes, gameRes, playersRes] = await Promise.all([
    supabase.from('crazy_eights_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('crazy_eights_player_hands').select('*').eq('game_id', gameId).order('player_order'),
    supabase
      .from('games')
      .select('timer_seconds, game_duration_seconds, crazy8_action_cards, crazy8_jokers, crazy8_pick2_stacking')
      .eq('id', gameId)
      .maybeSingle(),
    supabase.from('players').select('id, name').eq('game_id', gameId),
  ])

  const playerNames = new Map<string, string>()
  for (const p of playersRes.data ?? []) {
    playerNames.set(p.id, p.name)
  }

  return {
    session: sessionRes.data as CrazyEightsSession | null,
    hands: (handsRes.data as CrazyEightsPlayerHand[]) ?? [],
    timerSeconds: gameRes.data?.timer_seconds ?? 0,
    gameDurationSeconds: gameRes.data?.game_duration_seconds ?? 0,
    rules: parseCrazyEightsRules(gameRes.data),
    playerNames,
  }
}

function handForPlayer(hands: CrazyEightsPlayerHand[], playerId: string): CrazyEightsCard[] {
  const row = hands.find((h) => h.player_id === playerId)
  return (row?.cards as CrazyEightsCard[]) ?? []
}

function updateHand(
  hands: CrazyEightsPlayerHand[],
  playerId: string,
  cards: CrazyEightsCard[]
): CrazyEightsPlayerHand[] {
  return hands.map((h) => (h.player_id === playerId ? { ...h, cards } : h))
}

function discardPlayedTop(session: CrazyEightsSession): CrazyEightsCard[] {
  const discard = [...((session.discard_pile as CrazyEightsCard[]) ?? [])]
  if (session.top_card) discard.push(session.top_card)
  return discard
}

function refillDrawPile(
  drawPile: CrazyEightsCard[],
  discardPile: CrazyEightsCard[]
): { drawPile: CrazyEightsCard[]; discardPile: CrazyEightsCard[]; reshuffled: boolean } {
  if (drawPile.length > 0) return { drawPile, discardPile, reshuffled: false }
  if (discardPile.length === 0) return { drawPile, discardPile, reshuffled: false }
  return { drawPile: shuffle(discardPile), discardPile: [], reshuffled: true }
}

function drawCardsWithRefill(
  drawPile: CrazyEightsCard[],
  discardPile: CrazyEightsCard[],
  count: number
): {
  drawn: CrazyEightsCard[]
  drawPile: CrazyEightsCard[]
  discardPile: CrazyEightsCard[]
  reshuffled: boolean
} {
  let pile = [...drawPile]
  let discard = [...discardPile]
  let reshuffled = false
  const drawn: CrazyEightsCard[] = []

  for (let i = 0; i < count; i += 1) {
    if (pile.length === 0) {
      const refilled = refillDrawPile(pile, discard)
      pile = refilled.drawPile
      discard = refilled.discardPile
      if (refilled.reshuffled) reshuffled = true
    }
    if (pile.length === 0) break
    const card = pile.pop()
    if (card) drawn.push(card)
  }

  return { drawn, drawPile: pile, discardPile: discard, reshuffled }
}

function playerName(playerNames: Map<string, string>, playerId: string): string {
  return playerNames.get(playerId) ?? 'Player'
}

async function finishByLowestHand(
  supabase: SupabaseClient,
  gameId: string,
  session: CrazyEightsSession,
  hands: CrazyEightsPlayerHand[],
  playerNames: Map<string, string>,
  reasonPrefix: string
): Promise<boolean> {
  const activeIds = new Set(session.turn_order ?? [])
  let winnerId: string | null = null
  let winnerSum = Infinity
  let winnerCount = Infinity

  for (const hand of hands) {
    if (!activeIds.has(hand.player_id)) continue
    const cards = (hand.cards as CrazyEightsCard[]) ?? []
    const sum = crazyEightsHandSum(cards)
    const count = cards.length
    if (sum < winnerSum || (sum === winnerSum && count < winnerCount)) {
      winnerSum = sum
      winnerCount = count
      winnerId = hand.player_id
    }
  }

  const winnerName = winnerId ? playerName(playerNames, winnerId) : 'Nobody'

  const { data } = await supabase
    .from('crazy_eights_sessions')
    .update({
      phase: 'finished',
      winner_player_id: winnerId,
      status_message: `${reasonPrefix} ${winnerName} wins — lowest hand total (${winnerSum}).`,
      turn_deadline_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('updated_at', session.updated_at)
    .select('game_id')

  if ((data?.length ?? 0) === 0) return false // lost the race — another request already moved the game
  await markGameFinished(supabase, gameId)
  return true
}

/**
 * Pure: the session patch for when `playerId` empties their hand on this turn.
 * Folded into the play handler's single session write (see Whot for rationale).
 * `board` carries the board changes from the card just played.
 */
function playerOutPatch(
  session: CrazyEightsSession,
  hands: CrazyEightsPlayerHand[],
  gameDurationSeconds: number,
  playerId: string,
  name: string,
  playerNames: Map<string, string>,
  board: Partial<CrazyEightsSession>,
  nextDirection: number
): Partial<CrazyEightsSession> {
  const remaining = (session.turn_order ?? []).filter((id) => id !== playerId && crazyEightsHandCount(hands, id) > 0)

  if (gameDurationSeconds <= 0 || remaining.length < 2) {
    return {
      ...board,
      phase: 'finished',
      winner_player_id: playerId,
      status_message: `${name} wins!`,
    }
  }

  const nextIndex = crazyEightsNextTurnIndex(session, hands, session.current_turn_index, 1, nextDirection)
  const nextId = session.turn_order[nextIndex]
  const top = board.top_card ?? session.top_card
  const matchHint = top ? ` — match ${cardLabel(top)}` : ''
  return {
    ...board,
    current_turn_index: nextIndex,
    direction: nextDirection,
    phase: 'playing',
    status_message: `${playerName(playerNames, nextId)}'s turn${matchHint} — ${name} is out (${remaining.length} left)`,
  }
}

type TurnAdvance = {
  nextIndex: number
  direction: number
  skip: boolean
  reverse: boolean
}

/** Resolve where the turn goes after a NON-wild card is played. */
function resolveNextTurn(
  session: CrazyEightsSession,
  hands: CrazyEightsPlayerHand[],
  card: CrazyEightsCard,
  rules: CrazyEightsRules
): TurnAdvance {
  let direction = session.direction < 0 ? -1 : 1
  let steps = 1
  let skip = false
  let reverse = false

  if (rules.actionCards) {
    if (card.rank === 12) {
      // Queen reverses. With 2 players that hands the turn back to the mover (a skip).
      direction = -direction
      reverse = true
    } else if (card.rank === 11 || card.rank === 1) {
      steps = 2
      skip = true
    }
  }

  const nextIndex = crazyEightsNextTurnIndex(session, hands, session.current_turn_index, steps, direction)
  return { nextIndex, direction, skip, reverse }
}

/** Pick Two after playing a card: a 2 stacks/adds, other cards leave it untouched. */
function applyPickTwoAfterPlay(card: CrazyEightsCard, pickTwo: number, rules: CrazyEightsRules): number {
  if (rules.actionCards && card.rank === 2) {
    return pickTwo > 0 ? pickTwo + 2 : 2
  }
  return Math.max(0, pickTwo)
}

/**
 * Optimistic-concurrency session write (CAS on `updated_at`). See Whot's
 * persistSession for the full rationale on why this matters for timer races.
 */
async function persistSession(
  supabase: SupabaseClient,
  gameId: string,
  patch: Partial<CrazyEightsSession>,
  timerSeconds: number,
  expectedUpdatedAt: string
): Promise<boolean> {
  const { data } = await supabase
    .from('crazy_eights_sessions')
    .update({
      ...patch,
      turn_deadline_at: patch.phase === 'finished' ? null : crazyEightsTurnDeadline(timerSeconds),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('updated_at', expectedUpdatedAt)
    .select('game_id')
  return (data?.length ?? 0) > 0
}

export async function processCrazyEightsPlay(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  cardId: string
): Promise<{ error?: string }> {
  const { session, hands, timerSeconds, gameDurationSeconds, rules, playerNames } = await loadGameState(
    supabase,
    gameId
  )
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }
  if (session.phase === 'choose_suit') return { error: 'Choose a suit first' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (crazyEightsHandCount(hands, playerId) === 0) return { error: 'You are out of the game' }

  const hand = handForPlayer(hands, playerId)
  const cardIndex = hand.findIndex((c) => c.id === cardId)
  if (cardIndex < 0) return { error: 'Card not in hand' }

  const card = hand[cardIndex]
  const penaltyError = playPenaltyError(card, session, rules)
  if (penaltyError) return { error: penaltyError }
  if (!canPlayCard(card, session, rules)) return { error: 'Cannot play that card' }

  const newHand = hand.filter((_, i) => i !== cardIndex)
  const wentOut = newHand.length === 0
  const name = playerName(playerNames, playerId)

  const newPickTwo = applyPickTwoAfterPlay(card, session.pick_two_stack ?? 0, rules)
  let patch: Partial<CrazyEightsSession>

  if (isWildCard(card) && !wentOut) {
    // 8 or Joker with cards left: pause for the suit choice. A Joker also leaves a
    // draw-5 penalty that lands on the next player once a suit is named.
    const jokerPenalty = isJoker(card) ? JOKER_DRAW : 0
    const status = isJoker(card)
      ? `${name} played a Joker — choose a suit (next player draws ${JOKER_DRAW})`
      : `${name} played a Crazy 8 — choose a suit`
    patch = {
      top_card: card,
      discard_pile: discardPlayedTop(session),
      required_suit: null,
      pick_two_stack: 0,
      joker_penalty: jokerPenalty,
      phase: 'choose_suit',
      status_message: status,
    }
  } else {
    // Normal play, plus a wild played as the last card (wins immediately).
    const board: Partial<CrazyEightsSession> = {
      top_card: card,
      required_suit: null,
      pick_two_stack: newPickTwo,
      joker_penalty: 0,
      discard_pile: discardPlayedTop(session),
    }

    if (wentOut) {
      patch = playerOutPatch(session, hands, gameDurationSeconds, playerId, name, playerNames, board, session.direction)
    } else {
      const advance = resolveNextTurn(session, hands, card, rules)
      const nextPlayerId = session.turn_order[advance.nextIndex]
      const special = specialCardMessage(card, rules)
      let status = `${playerName(playerNames, nextPlayerId)}'s turn — match ${cardLabel(card)}`
      if (special) status = `${status} · ${special}`
      if (newPickTwo > 0) status = `${status} · Pick 2 active (${newPickTwo} cards to draw)`
      patch = {
        ...board,
        current_turn_index: advance.nextIndex,
        direction: advance.direction,
        phase: 'playing',
        status_message: status,
      }
    }
  }

  // Claim the turn. If another request already moved the game from this exact
  // state we lose the CAS and bail — no hands touched.
  const won = await persistSession(supabase, gameId, patch, timerSeconds, session.updated_at)
  if (!won) return {}

  await supabase
    .from('crazy_eights_player_hands')
    .update({ cards: newHand })
    .eq('game_id', gameId)
    .eq('player_id', playerId)

  if (wentOut) {
    await supabase.from('players').update({ spectator: true }).eq('id', playerId).eq('game_id', gameId)
    if (patch.phase === 'finished') await markGameFinished(supabase, gameId)
  }

  return {}
}

export async function processCrazyEightsDraw(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { session, hands, timerSeconds, rules, playerNames } = await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }
  if (session.phase === 'choose_suit') return { error: 'Choose a suit first' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (crazyEightsHandCount(hands, playerId) === 0) return { error: 'You are out of the game' }

  let drawPile = (session.draw_pile as CrazyEightsCard[]) ?? []
  let discardPile = (session.discard_pile as CrazyEightsCard[]) ?? []
  const { pickTwo, jokerPenalty } = getNormalizedPenalties(session)
  const drawCount = penaltyDrawCount(session)

  const {
    drawn,
    drawPile: nextDrawPile,
    discardPile: nextDiscardPile,
    reshuffled,
  } = drawCardsWithRefill(drawPile, discardPile, drawCount)
  drawPile = nextDrawPile
  discardPile = nextDiscardPile

  const direction = session.direction < 0 ? -1 : 1
  const hand = handForPlayer(hands, playerId)

  if (drawn.length === 0) {
    if (hasPlayableCard(hand, session, rules)) {
      return { error: 'Draw pile is empty — play a card from your hand' }
    }
    if (!anyPlayerCanPlay(hands, session, rules)) {
      await finishByLowestHand(supabase, gameId, session, hands, playerNames, 'Nobody can play —')
      return {}
    }

    const nextIndex = crazyEightsNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
    const nextPlayerId = session.turn_order[nextIndex]
    const top = session.top_card
    const matchHint = top ? ` — match ${cardLabel(top)}` : ''

    await persistSession(
      supabase,
      gameId,
      {
        draw_pile: drawPile,
        discard_pile: discardPile,
        pick_two_stack: pickTwo,
        joker_penalty: jokerPenalty,
        current_turn_index: nextIndex,
        status_message: `${playerName(playerNames, nextPlayerId)}'s turn${matchHint} (draw pile empty)`,
      },
      timerSeconds,
      session.updated_at
    )
    return {}
  }

  const newHand = [...hand, ...drawn]
  const handsAfterDraw = updateHand(hands, playerId, newHand)

  const nextIndex = crazyEightsNextTurnIndex(session, handsAfterDraw, session.current_turn_index, 1, direction)
  const nextPlayerId = session.turn_order[nextIndex]

  const penaltyMsg =
    pickTwo > 0
      ? `${playerName(playerNames, playerId)} drew ${drawn.length} (Pick 2)`
      : jokerPenalty > 0
        ? `${playerName(playerNames, playerId)} drew ${drawn.length} (Joker)`
        : `${playerName(playerNames, playerId)} drew 1 card`

  // Claim the turn before crediting the cards, so a lost race never grows a hand.
  const won = await persistSession(
    supabase,
    gameId,
    {
      draw_pile: drawPile,
      discard_pile: discardPile,
      pick_two_stack: 0,
      joker_penalty: 0,
      current_turn_index: nextIndex,
      status_message: `${playerName(playerNames, nextPlayerId)}'s turn — ${penaltyMsg}${reshuffled ? ' · deck reshuffled' : ''}`,
    },
    timerSeconds,
    session.updated_at
  )
  if (!won) return {}

  await supabase
    .from('crazy_eights_player_hands')
    .update({ cards: newHand })
    .eq('game_id', gameId)
    .eq('player_id', playerId)

  return {}
}

export async function processCrazyEightsChoose(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  suit: CrazyEightsCalledSuit
): Promise<{ error?: string }> {
  const { session, hands, timerSeconds, playerNames } = await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase !== 'choose_suit') return { error: 'Not choosing a suit' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (crazyEightsHandCount(hands, playerId) === 0) return { error: 'You are out of the game' }

  if (!CRAZY8_SUITS.includes(suit)) return { error: 'Choose a suit' }

  const direction = session.direction < 0 ? -1 : 1
  const nextIndex = crazyEightsNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
  const nextPlayerId = session.turn_order[nextIndex]

  const jokerPenalty = session.joker_penalty ?? 0
  let status = `${playerName(playerNames, nextPlayerId)}'s turn — match ${CRAZY8_SUIT_LABELS[suit]} ${CRAZY8_SUIT_SYMBOLS[suit]}`
  if (jokerPenalty > 0) status = `${status} · draw ${jokerPenalty} (Joker)`

  await persistSession(
    supabase,
    gameId,
    {
      required_suit: suit,
      pick_two_stack: 0,
      joker_penalty: jokerPenalty,
      current_turn_index: nextIndex,
      phase: 'playing',
      status_message: status,
    },
    timerSeconds,
    session.updated_at
  )

  return {}
}

export async function processCrazyEightsExpireTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; skipped?: boolean }> {
  const { session, hands, rules, timerSeconds, playerNames } = await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { skipped: true }

  if (!session.turn_deadline_at || new Date(session.turn_deadline_at as string) > new Date()) {
    return { skipped: true }
  }

  const currentId = currentPlayerId(session)
  if (!currentId) return { error: 'No current player' }

  const hand = handForPlayer(hands, currentId)
  if (hand.length === 0) {
    const direction = session.direction < 0 ? -1 : 1
    const nextIndex = crazyEightsNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
    const nextId = session.turn_order[nextIndex]
    if (!nextId || crazyEightsHandCount(hands, nextId) === 0) {
      await finishByLowestHand(supabase, gameId, session, hands, playerNames, 'Nobody left —')
      return {}
    }
    const top = session.top_card
    const matchHint = top ? ` — match ${cardLabel(top)}` : ''
    await persistSession(
      supabase,
      gameId,
      {
        current_turn_index: nextIndex,
        phase: 'playing',
        status_message: `${playerName(playerNames, nextId)}'s turn${matchHint}`,
      },
      timerSeconds,
      session.updated_at
    )
    return {}
  }

  if (session.phase === 'choose_suit') {
    return processCrazyEightsChoose(supabase, gameId, currentId, dominantSuit(hand))
  }

  if (hasPlayableCard(hand, session, rules)) {
    const playable = hand.filter((c) => canPlayCard(c, session, rules))
    const card = pickAutoPlayCard(playable)
    return processCrazyEightsPlay(supabase, gameId, currentId, card.id)
  }

  return processCrazyEightsDraw(supabase, gameId, currentId)
}

export async function finishExpiredCrazyEightsGame(
  supabase: SupabaseClient,
  game: Pick<Game, 'id' | 'status' | 'session_started_at' | 'game_duration_seconds'>
): Promise<boolean> {
  if (game.status !== 'active') return false
  if (!crazyEightsGameSessionExpired(game.session_started_at, game.game_duration_seconds)) return false

  const gameId = game.id

  const [sessionRes, handsRes, playersRes] = await Promise.all([
    supabase.from('crazy_eights_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('crazy_eights_player_hands').select('player_id, cards, player_order').eq('game_id', gameId),
    supabase.from('players').select('id, name').eq('game_id', gameId),
  ])

  const session = sessionRes.data as CrazyEightsSession | null
  if (!session) return false

  const playerNames = new Map<string, string>()
  for (const p of playersRes.data ?? []) {
    playerNames.set(p.id, p.name)
  }

  const hands = (handsRes.data as CrazyEightsPlayerHand[]) ?? []

  await finishByLowestHand(supabase, gameId, session, hands, playerNames, "Time's up!")

  return true
}

export type CrazyEightsHostMode = 'spectator' | 'player'

const CRAZY8_HOST_MODE_KEY = 'crazy_eights_host_mode'

export function getCrazyEightsHostMode(gameCode: string): CrazyEightsHostMode {
  if (typeof window === 'undefined') return 'spectator'
  return (localStorage.getItem(`${CRAZY8_HOST_MODE_KEY}_${gameCode}`) as CrazyEightsHostMode) ?? 'spectator'
}

export function setCrazyEightsHostMode(gameCode: string, mode: CrazyEightsHostMode): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${CRAZY8_HOST_MODE_KEY}_${gameCode}`, mode)
}

/**
 * Remove a player from a Crazy Eights game (they left or were kicked). Mirrors
 * Whot's removeWhotPlayer: drop them from turn_order (fixing current_turn_index),
 * delete their hand, end the game if fewer than two players remain, then delete
 * their player row. Plain (non-CAS) session write — a removal must always land.
 */
export async function removeCrazyEightsPlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerName?: string
): Promise<{ error: string | null }> {
  const { data: sessionRaw } = await supabase
    .from('crazy_eights_sessions')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle()
  const session = sessionRaw as CrazyEightsSession | null
  const order = session ? [...(session.turn_order ?? [])] : []
  const removedIndex = order.indexOf(playerId)

  if (session && removedIndex >= 0 && session.phase !== 'finished') {
    const turnOrder = order.filter((id) => id !== playerId)
    let currentTurnIndex = session.current_turn_index
    if (removedIndex < currentTurnIndex) currentTurnIndex -= 1
    else if (removedIndex === currentTurnIndex && turnOrder.length > 0) currentTurnIndex %= turnOrder.length
    if (turnOrder.length === 0) currentTurnIndex = 0

    const removedName = playerName ?? 'A player'
    const { data: gameRow } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
    const timerSeconds = gameRow?.timer_seconds ?? 0
    const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
    const names = new Map<string, string>()
    for (const p of playerRows ?? []) names.set(p.id, p.name)

    const update: Record<string, unknown> = {
      turn_order: turnOrder,
      current_turn_index: currentTurnIndex,
      updated_at: new Date().toISOString(),
    }

    const finishing = turnOrder.length < 2
    if (finishing) {
      const winnerPlayerId = turnOrder[0] ?? null
      const winnerName = winnerPlayerId ? (names.get(winnerPlayerId) ?? 'Winner') : null
      update.phase = 'finished'
      update.winner_player_id = winnerPlayerId
      update.status_message = winnerName
        ? `${removedName} left — ${winnerName} wins!`
        : `${removedName} left — game over.`
      update.turn_deadline_at = null
    } else {
      const nextPlayerId = turnOrder[currentTurnIndex]
      update.status_message = `${removedName} left. ${names.get(nextPlayerId) ?? 'Next player'}'s turn`
      update.turn_deadline_at = crazyEightsTurnDeadline(timerSeconds)
    }

    const { error: sessionError } = await supabase.from('crazy_eights_sessions').update(update).eq('game_id', gameId)
    if (sessionError) return { error: sessionError.message }

    await supabase.from('crazy_eights_player_hands').delete().eq('game_id', gameId).eq('player_id', playerId)
    if (finishing) await markGameFinished(supabase, gameId)
    const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
    return { error: error?.message ?? null }
  }

  await supabase.from('crazy_eights_player_hands').delete().eq('game_id', gameId).eq('player_id', playerId)
  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  return { error: error?.message ?? null }
}
