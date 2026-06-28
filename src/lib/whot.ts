import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'
import { markGameFinished } from '@/lib/game-finish'
import { secondsUntilDeadline } from '@/lib/round-timing'
import type { Game, WhotCard, WhotPlayerHand, WhotSession, WhotShape } from '@/types'

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

export function buildWhotStandings(
  hands: WhotPlayerHand[],
  players: { id: string; name: string }[],
  turnOrder: string[]
): WhotStanding[] {
  const activeIds = new Set(turnOrder ?? [])
  const rows = hands
    .filter((h) => activeIds.has(h.player_id))
    .map((h) => {
      const cards = (h.cards as WhotCard[]) ?? []
      return {
        playerId: h.player_id,
        name: players.find((p) => p.id === h.player_id)?.name ?? 'Player',
        cardCount: cards.length,
        handSum: whotHandSum(cards),
      }
    })
    .sort((a, b) => {
      if (a.handSum !== b.handSum) return a.handSum - b.handSum
      return a.cardCount - b.cardCount
    })

  return rows.map((row, index) => ({ ...row, rank: index + 1 }))
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
  square: [1, 2, 3, 4, 5, 7, 8],
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
      if (!rules.pick3Enabled && number === 5) continue
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

export function whotHandCount(hands: WhotPlayerHand[], playerId: string): number {
  return ((hands.find((h) => h.player_id === playerId)?.cards as WhotCard[]) ?? []).length
}

/** True when the player has no cards left and is watching the rest of the game. */
export function isWhotPlayerOut(handCount: number, spectator?: boolean | null): boolean {
  return handCount === 0 || spectator === true
}

export function whotNextTurnIndex(session: WhotSession, hands: WhotPlayerHand[], fromIndex: number, steps = 1): number {
  const order = session.turn_order ?? []
  const len = order.length
  if (len === 0) return 0

  let idx = fromIndex
  for (let s = 0; s < steps; s += 1) {
    let advanced = false
    for (let attempt = 0; attempt < len; attempt += 1) {
      idx = (idx + 1) % len
      if (whotHandCount(hands, order[idx]!) > 0) {
        advanced = true
        break
      }
    }
    if (!advanced) return fromIndex
  }
  return idx
}

export function anyPlayerCanPlay(
  hands: WhotPlayerHand[],
  session: WhotSession,
  rules: WhotRules = parseWhotRules(null)
): boolean {
  for (const row of hands) {
    const cards = (row.cards as WhotCard[]) ?? []
    if (cards.length === 0) continue
    if (hasPlayableCard(cards, session, rules)) return true
  }
  return false
}

function pickAutoPlayCard(playable: WhotCard[]): WhotCard {
  const nonWhot = playable.filter((c) => c.number !== 20)
  const pool = nonWhot.length > 0 ? nonWhot : playable
  return [...pool].sort((a, b) => a.number - b.number)[0]!
}

function dealCount(playerCount: number): number {
  return playerCount === 2 ? 6 : 5
}

function drawStarter(deck: WhotCard[], rules: WhotRules): { top: WhotCard; rest: WhotCard[] } {
  const specials = starterSpecials(rules)
  const pile = [...deck]
  while (pile.length > 0) {
    const top = pile.pop()!
    if (!specials.has(top.number)) {
      return { top, rest: pile }
    }
    pile.unshift(top)
  }
  const top = pile.pop()!
  return { top, rest: pile }
}

export async function initializeWhotGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  const { data: gameRow } = await supabase
    .from('games')
    .select('timer_seconds, whot_pick3_enabled, whot_cards_enabled, whot_number_calls_enabled, whot_pick2_stacking')
    .eq('id', gameId)
    .maybeSingle()
  const rules = parseWhotRules(gameRow)
  const timerSeconds = gameRow?.timer_seconds ?? 0

  const turnOrder = shuffle(playerIds)
  const deck = shuffle(buildWhotDeck(rules))
  const cardsEach = dealCount(turnOrder.length)

  const hands: WhotCard[][] = turnOrder.map(() => [])
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
  const sessionRow: Partial<WhotSession> = {
    game_id: gameId,
    turn_order: turnOrder,
    current_turn_index: 0,
    phase: 'playing',
    draw_pile: drawPile,
    discard_pile: [],
    top_card: top,
    required_shape: null,
    required_number: null,
    pick_two_stack: 0,
    pick_five_stack: 0,
    status_message: `${firstName}'s turn — match ${cardLabel(top)}`,
    winner_player_id: null,
    turn_deadline_at: whotTurnDeadline(timerSeconds),
  }

  const { error: sessionError } = await supabase.from('whot_sessions').insert(sessionRow)
  if (sessionError) return { error: sessionError.message }

  const handRows = turnOrder.map((playerId, index) => ({
    game_id: gameId,
    player_id: playerId,
    cards: hands[index],
    player_order: index,
  }))

  const { error: handsError } = await supabase.from('whot_player_hands').insert(handRows)
  if (handsError) return { error: handsError.message }

  return {}
}

export async function clearWhotSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['whot_sessions', 'whot_player_hands'], { resetSpectators: true })
}

async function loadGameState(
  supabase: SupabaseClient,
  gameId: string
): Promise<{
  session: WhotSession | null
  hands: WhotPlayerHand[]
  timerSeconds: number
  gameDurationSeconds: number
  rules: WhotRules
  playerNames: Map<string, string>
}> {
  const [sessionRes, handsRes, gameRes, playersRes] = await Promise.all([
    supabase.from('whot_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('whot_player_hands').select('*').eq('game_id', gameId).order('player_order'),
    supabase
      .from('games')
      .select(
        'timer_seconds, game_duration_seconds, whot_pick3_enabled, whot_cards_enabled, whot_number_calls_enabled, whot_pick2_stacking'
      )
      .eq('id', gameId)
      .maybeSingle(),
    supabase.from('players').select('id, name').eq('game_id', gameId),
  ])

  const playerNames = new Map<string, string>()
  for (const p of playersRes.data ?? []) {
    playerNames.set(p.id, p.name)
  }

  return {
    session: sessionRes.data as WhotSession | null,
    hands: (handsRes.data as WhotPlayerHand[]) ?? [],
    timerSeconds: gameRes.data?.timer_seconds ?? 0,
    gameDurationSeconds: gameRes.data?.game_duration_seconds ?? 0,
    rules: parseWhotRules(gameRes.data),
    playerNames,
  }
}

function handForPlayer(hands: WhotPlayerHand[], playerId: string): WhotCard[] {
  const row = hands.find((h) => h.player_id === playerId)
  return (row?.cards as WhotCard[]) ?? []
}

function updateHand(hands: WhotPlayerHand[], playerId: string, cards: WhotCard[]): WhotPlayerHand[] {
  return hands.map((h) => (h.player_id === playerId ? { ...h, cards } : h))
}

function discardPlayedTop(session: WhotSession): WhotCard[] {
  const discard = [...((session.discard_pile as WhotCard[]) ?? [])]
  if (session.top_card) discard.push(session.top_card)
  return discard
}

function refillDrawPile(
  drawPile: WhotCard[],
  discardPile: WhotCard[]
): { drawPile: WhotCard[]; discardPile: WhotCard[]; reshuffled: boolean } {
  if (drawPile.length > 0) return { drawPile, discardPile, reshuffled: false }
  if (discardPile.length === 0) return { drawPile, discardPile, reshuffled: false }
  return { drawPile: shuffle(discardPile), discardPile: [], reshuffled: true }
}

function drawCardsWithRefill(
  drawPile: WhotCard[],
  discardPile: WhotCard[],
  count: number
): {
  drawn: WhotCard[]
  drawPile: WhotCard[]
  discardPile: WhotCard[]
  reshuffled: boolean
} {
  let pile = [...drawPile]
  let discard = [...discardPile]
  let reshuffled = false
  const drawn: WhotCard[] = []

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

async function finishWhotByLowestHand(
  supabase: SupabaseClient,
  gameId: string,
  session: WhotSession,
  hands: WhotPlayerHand[],
  playerNames: Map<string, string>,
  reasonPrefix: string
): Promise<boolean> {
  const activeIds = new Set(session.turn_order ?? [])
  let winnerId: string | null = null
  let winnerSum = Infinity
  let winnerCount = Infinity

  for (const hand of hands) {
    if (!activeIds.has(hand.player_id)) continue
    const cards = (hand.cards as WhotCard[]) ?? []
    const sum = whotHandSum(cards)
    const count = cards.length
    if (sum < winnerSum || (sum === winnerSum && count < winnerCount)) {
      winnerSum = sum
      winnerCount = count
      winnerId = hand.player_id
    }
  }

  const winnerName = winnerId ? playerName(playerNames, winnerId) : 'Nobody'

  const { data } = await supabase
    .from('whot_sessions')
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
 * Folded into the play handler's single session write so the game goes straight
 * to "finished"/"next player" instead of writing a transient "playing" state
 * that a concurrent timer could act on between the two writes.
 * `board` carries the board changes from the card just played.
 */
function playerOutPatch(
  session: WhotSession,
  hands: WhotPlayerHand[],
  gameDurationSeconds: number,
  playerId: string,
  name: string,
  playerNames: Map<string, string>,
  board: Partial<WhotSession>
): Partial<WhotSession> {
  const remaining = (session.turn_order ?? []).filter((id) => id !== playerId && whotHandCount(hands, id) > 0)

  // The game ends — and the player who just emptied their hand wins — when it can't
  // meaningfully continue: an untimed game finishes the moment someone goes out, and
  // ANY game finishes once fewer than 2 players still hold cards (heads-up: the last
  // remaining player can't play on alone, so don't strand them waiting for the timer).
  if (gameDurationSeconds <= 0 || remaining.length < 2) {
    return {
      ...board,
      phase: 'finished',
      winner_player_id: playerId,
      status_message: `${name} wins!`,
    }
  }

  const nextIndex = whotNextTurnIndex(session, hands, session.current_turn_index, 1)
  const nextId = session.turn_order[nextIndex]
  const top = session.top_card
  const matchHint = top ? ` — match ${cardLabel(top)}` : ''
  return {
    ...board,
    current_turn_index: nextIndex,
    phase: 'playing',
    status_message: `${playerName(playerNames, nextId)}'s turn${matchHint} — ${name} is out (${remaining.length} left)`,
  }
}

type TurnAdvance = {
  nextIndex: number
  holdOn: boolean
  skipNext: boolean
}

function resolveNextTurnIndex(session: WhotSession, hands: WhotPlayerHand[], cardNumber: number): TurnAdvance {
  // Hold On (1) and General Market (14) both keep the turn with the player who
  // played them — after everyone else draws for a 14, that player goes again.
  if (cardNumber === 1 || cardNumber === 14) {
    const currentId = session.turn_order[session.current_turn_index]
    if (currentId && whotHandCount(hands, currentId) > 0) {
      return { nextIndex: session.current_turn_index, holdOn: true, skipNext: false }
    }
  }
  if (cardNumber === 8) {
    return {
      nextIndex: whotNextTurnIndex(session, hands, session.current_turn_index, 2),
      holdOn: false,
      skipNext: true,
    }
  }
  return {
    nextIndex: whotNextTurnIndex(session, hands, session.current_turn_index, 1),
    holdOn: false,
    skipNext: false,
  }
}

/**
 * Pure: compute the result of a General Market (every other player draws 1).
 * Returns the new pile/discard/hands and the per-opponent hand writes to apply
 * — the caller performs those writes only after winning the session claim, so a
 * request that lost the turn race never hands out cards.
 */
function computeGeneralMarket(
  currentPlayerId: string,
  drawPile: WhotCard[],
  discardPile: WhotCard[],
  hands: WhotPlayerHand[]
): {
  drawPile: WhotCard[]
  discardPile: WhotCard[]
  hands: WhotPlayerHand[]
  marketWrites: { player_id: string; cards: WhotCard[] }[]
} {
  let pile = [...drawPile]
  let discard = [...discardPile]
  let nextHands = [...hands]
  const marketWrites: { player_id: string; cards: WhotCard[] }[] = []

  for (const row of nextHands) {
    if (row.player_id === currentPlayerId) continue
    const existing = (row.cards as WhotCard[]) ?? []
    if (existing.length === 0) continue
    const result = drawCardsWithRefill(pile, discard, 1)
    pile = result.drawPile
    discard = result.discardPile
    if (result.drawn.length > 0) {
      const cards = [...existing, ...result.drawn]
      nextHands = updateHand(nextHands, row.player_id, cards)
      marketWrites.push({ player_id: row.player_id, cards })
    }
  }

  return { drawPile: pile, discardPile: discard, hands: nextHands, marketWrites }
}

/**
 * Optimistic-concurrency session write. The update only lands if the row still
 * carries the `expectedUpdatedAt` we read, so when two requests race (e.g. every
 * client driving the turn timer) only the first wins — the loser gets 0 rows and
 * the caller aborts before mutating hands. Returns true if this write won.
 */
async function persistSession(
  supabase: SupabaseClient,
  gameId: string,
  patch: Partial<WhotSession>,
  timerSeconds: number,
  expectedUpdatedAt: string
): Promise<boolean> {
  const { data } = await supabase
    .from('whot_sessions')
    .update({
      ...patch,
      turn_deadline_at: patch.phase === 'finished' ? null : whotTurnDeadline(timerSeconds),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('updated_at', expectedUpdatedAt)
    .select('game_id')
  return (data?.length ?? 0) > 0
}

export async function processWhotPlay(
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
  if (session.phase === 'choose_whot') return { error: 'Choose WHOT shape or number first' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (whotHandCount(hands, playerId) === 0) return { error: 'You are out of the game' }

  const hand = handForPlayer(hands, playerId)
  const cardIndex = hand.findIndex((c) => c.id === cardId)
  if (cardIndex < 0) return { error: 'Card not in hand' }

  const card = hand[cardIndex]
  const pickStackError = pickStackPlayError(card, session, rules)
  if (pickStackError) return { error: pickStackError }
  if (!canPlayCard(card, session, rules)) return { error: 'Cannot play that card' }

  const newHand = hand.filter((_, i) => i !== cardIndex)
  let nextHands = updateHand(hands, playerId, newHand)
  const wentOut = newHand.length === 0
  const name = playerName(playerNames, playerId)

  const stacks = applyPickStacksAfterPlay(card.number, session.pick_two_stack ?? 0, session.pick_five_stack ?? 0, rules)
  const pickTwo = stacks.pickTwo
  const pickFive = stacks.pickFive

  // Compute the SINGLE session patch this play produces (board + turn/terminal),
  // plus any General Market draws — all pure, no writes yet. Hand writes are
  // deferred until we win the turn claim, so a request that lost the race never
  // mutates a hand or hands out cards.
  let marketWrites: { player_id: string; cards: WhotCard[] }[] = []
  let patch: Partial<WhotSession>

  if (card.number === 20 && !wentOut) {
    // WHOT played with cards left: pause for the shape/number choice.
    const whotStatus = rules.numberCallsEnabled
      ? `${name} played WHOT — choose shape or number`
      : `${name} played WHOT — choose a shape`
    patch = {
      top_card: card,
      discard_pile: discardPlayedTop(session),
      required_shape: null,
      required_number: null,
      pick_two_stack: pickTwo,
      pick_five_stack: pickFive,
      phase: 'choose_whot',
      status_message: whotStatus,
    }
  } else {
    // Normal play — and a WHOT played as the last card, which wins immediately.
    let drawPile = (session.draw_pile as WhotCard[]) ?? []
    let discardPile = discardPlayedTop(session)

    if (card.number === 14) {
      const market = computeGeneralMarket(playerId, drawPile, discardPile, nextHands)
      drawPile = market.drawPile
      discardPile = market.discardPile
      nextHands = market.hands
      marketWrites = market.marketWrites
    }

    const board: Partial<WhotSession> = {
      top_card: card,
      required_shape: null,
      required_number: null,
      pick_two_stack: pickTwo,
      pick_five_stack: pickFive,
      draw_pile: drawPile,
      discard_pile: discardPile,
    }

    if (wentOut) {
      patch = playerOutPatch(session, nextHands, gameDurationSeconds, playerId, name, playerNames, board)
    } else {
      const advance = resolveNextTurnIndex(session, nextHands, card.number)
      const nextPlayerId = session.turn_order[advance.nextIndex]
      const special = specialCardMessage(card.number)
      let status = advance.holdOn
        ? `${name} — ${card.number === 14 ? 'General Market! Everyone drew — go again' : 'Hold On, go again'}!`
        : `${playerName(playerNames, nextPlayerId)}'s turn — match ${cardLabel(card)}`
      if (special && !advance.holdOn) status = `${status} · ${special}`
      if (pickTwo > 0) status = `${status} · Pick 2 active (${pickTwo} cards to draw)`
      else if (pickFive > 0) status = `${status} · Pick 3 active (${pickFive} cards to draw)`
      patch = { ...board, current_turn_index: advance.nextIndex, phase: 'playing', status_message: status }
    }
  }

  // Claim the turn. If another request already moved the game from this exact
  // state we lose the CAS and bail — no hands touched.
  const won = await persistSession(supabase, gameId, patch, timerSeconds, session.updated_at)
  if (!won) return {}

  // We hold the claim — now safe to write hands and finalize.
  await supabase.from('whot_player_hands').update({ cards: newHand }).eq('game_id', gameId).eq('player_id', playerId)
  for (const w of marketWrites) {
    await supabase
      .from('whot_player_hands')
      .update({ cards: w.cards })
      .eq('game_id', gameId)
      .eq('player_id', w.player_id)
  }
  if (wentOut) {
    await supabase.from('players').update({ spectator: true }).eq('id', playerId).eq('game_id', gameId)
    // Mark the game over whenever this play actually ended it (untimed win, or a
    // timed game that ran out of players) — keyed off the patch we just committed.
    if (patch.phase === 'finished') await markGameFinished(supabase, gameId)
  }

  return {}
}

export async function processWhotDraw(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { session, hands, timerSeconds, rules, playerNames } = await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }
  if (session.phase === 'choose_whot') return { error: 'Choose WHOT shape or number first' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (whotHandCount(hands, playerId) === 0) return { error: 'You are out of the game' }

  let drawPile = (session.draw_pile as WhotCard[]) ?? []
  let discardPile = (session.discard_pile as WhotCard[]) ?? []
  const { pickTwo, pickFive } = getNormalizedPickStacks(session)
  const drawCount = pickPenaltyDrawCount(session)

  const {
    drawn,
    drawPile: nextDrawPile,
    discardPile: nextDiscardPile,
    reshuffled,
  } = drawCardsWithRefill(drawPile, discardPile, drawCount)
  drawPile = nextDrawPile
  discardPile = nextDiscardPile

  const nextIndex = whotNextTurnIndex(session, hands, session.current_turn_index, 1)
  const nextPlayerId = session.turn_order[nextIndex]

  const hand = handForPlayer(hands, playerId)

  if (drawn.length === 0) {
    if (hasPlayableCard(hand, session, rules)) {
      return { error: 'Draw pile is empty — play a card from your hand' }
    }

    if (!anyPlayerCanPlay(hands, session, rules)) {
      await finishWhotByLowestHand(supabase, gameId, session, hands, playerNames, 'Nobody can play —')
      return {}
    }

    const top = session.top_card
    const matchHint = top ? ` — match ${cardLabel(top)}` : ''

    await persistSession(
      supabase,
      gameId,
      {
        draw_pile: drawPile,
        discard_pile: discardPile,
        pick_two_stack: pickTwo,
        pick_five_stack: pickFive,
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

  const nextIndexAfterDraw = whotNextTurnIndex(session, handsAfterDraw, session.current_turn_index, 1)
  const nextPlayerIdAfterDraw = session.turn_order[nextIndexAfterDraw]

  const penaltyMsg =
    pickTwo > 0
      ? `${playerName(playerNames, playerId)} drew ${drawn.length} (Pick 2)`
      : pickFive > 0
        ? `${playerName(playerNames, playerId)} drew ${drawn.length} (Pick 3)`
        : `${playerName(playerNames, playerId)} drew 1 card`

  // Claim the turn before crediting the cards, so a lost race never grows a hand.
  const won = await persistSession(
    supabase,
    gameId,
    {
      draw_pile: drawPile,
      discard_pile: discardPile,
      pick_two_stack: 0,
      pick_five_stack: 0,
      current_turn_index: nextIndexAfterDraw,
      status_message: `${playerName(playerNames, nextPlayerIdAfterDraw)}'s turn — ${penaltyMsg}${reshuffled ? ' · deck reshuffled' : ''}`,
    },
    timerSeconds,
    session.updated_at
  )
  if (!won) return {}

  await supabase.from('whot_player_hands').update({ cards: newHand }).eq('game_id', gameId).eq('player_id', playerId)

  return {}
}

export async function processWhotChoose(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  choice: { shape?: WhotShape; number?: number }
): Promise<{ error?: string }> {
  const { session, hands, timerSeconds, rules, playerNames } = await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase !== 'choose_whot') return { error: 'Not choosing WHOT' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (whotHandCount(hands, playerId) === 0) return { error: 'You are out of the game' }

  const hasShape = choice.shape != null && choice.shape !== 'whot'
  const hasNumber = choice.number != null && choice.number >= 1 && choice.number <= 14
  if (!hasShape && !hasNumber) return { error: 'Choose a shape or number' }
  if (hasShape && hasNumber) return { error: 'Choose shape or number, not both' }
  if (hasNumber && !rules.numberCallsEnabled) return { error: 'Number calls are disabled in this game' }

  const nextIndex = whotNextTurnIndex(session, hands, session.current_turn_index, 1)
  const nextPlayerId = session.turn_order[nextIndex]

  const requirement = hasShape ? `match ${WHOT_SHAPE_LABELS[choice.shape!]}` : `match number ${choice.number}`

  const pickTwo = session.pick_two_stack ?? 0
  const pickFive = session.pick_five_stack ?? 0
  const stacks = normalizePickStacks(pickTwo, pickFive)
  let status = `${playerName(playerNames, nextPlayerId)}'s turn — ${requirement}`
  if (stacks.pickTwo > 0) status = `${status} · Pick 2 active (${stacks.pickTwo} cards to draw)`
  else if (stacks.pickFive > 0) status = `${status} · Pick 3 active (${stacks.pickFive} cards to draw)`

  await persistSession(
    supabase,
    gameId,
    {
      required_shape: hasShape ? choice.shape! : null,
      required_number: hasNumber ? choice.number! : null,
      pick_two_stack: stacks.pickTwo,
      pick_five_stack: stacks.pickFive,
      current_turn_index: nextIndex,
      phase: 'playing',
      status_message: status,
    },
    timerSeconds,
    session.updated_at
  )

  return {}
}

export async function processWhotExpireTurn(
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

  // If the current player has no cards (e.g., went out but session wasn't advanced due to a
  // race condition or DB inconsistency), skip them and advance to the next active player.
  const hand = handForPlayer(hands, currentId)
  if (hand.length === 0) {
    const nextIndex = whotNextTurnIndex(session, hands, session.current_turn_index, 1)
    const nextId = session.turn_order[nextIndex]
    if (!nextId || whotHandCount(hands, nextId) === 0) {
      await finishWhotByLowestHand(supabase, gameId, session, hands, playerNames, 'Nobody left —')
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

  if (session.phase === 'choose_whot') {
    return processWhotChoose(supabase, gameId, currentId, { shape: 'circle' })
  }

  if (hasPlayableCard(hand, session, rules)) {
    const playable = hand.filter((c) => canPlayCard(c, session, rules))
    const card = pickAutoPlayCard(playable)
    return processWhotPlay(supabase, gameId, currentId, card.id)
  }

  return processWhotDraw(supabase, gameId, currentId)
}

export async function finishExpiredWhotGame(
  supabase: SupabaseClient,
  game: Pick<Game, 'id' | 'status' | 'session_started_at' | 'game_duration_seconds'>
): Promise<boolean> {
  if (game.status !== 'active') return false
  if (!whotGameSessionExpired(game.session_started_at, game.game_duration_seconds)) return false

  const gameId = game.id

  const [sessionRes, handsRes, playersRes] = await Promise.all([
    supabase.from('whot_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('whot_player_hands').select('player_id, cards, player_order').eq('game_id', gameId),
    supabase.from('players').select('id, name').eq('game_id', gameId),
  ])

  const session = sessionRes.data as WhotSession | null
  if (!session) return false

  const playerNames = new Map<string, string>()
  for (const p of playersRes.data ?? []) {
    playerNames.set(p.id, p.name)
  }

  const hands = (handsRes.data as WhotPlayerHand[]) ?? []

  await finishWhotByLowestHand(supabase, gameId, session, hands, playerNames, "Time's up!")

  return true
}

export type WhotHostMode = 'spectator' | 'player'

const WHOT_HOST_MODE_KEY = 'whot_host_mode'

export function getWhotHostMode(gameCode: string): WhotHostMode {
  if (typeof window === 'undefined') return 'spectator'
  return (localStorage.getItem(`${WHOT_HOST_MODE_KEY}_${gameCode}`) as WhotHostMode) ?? 'spectator'
}

export function setWhotHostMode(gameCode: string, mode: WhotHostMode): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${WHOT_HOST_MODE_KEY}_${gameCode}`, mode)
}

/**
 * Remove a player from a Whot game (they left or were kicked). Without this the
 * player's id stayed in `turn_order`, so the game kept handing them turns — a ghost
 * with no name, and a timer counting down on a player who was gone. Drop them from
 * the turn order (fixing current_turn_index), delete their hand, end the game if
 * fewer than two players remain (lone survivor wins), then delete their player row.
 *
 * The session write is a plain (non-CAS) update on purpose: a removal must always
 * land — a lost optimistic-concurrency race would otherwise leave the ghost behind.
 */
export async function removeWhotPlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerName?: string
): Promise<{ error: string | null }> {
  const { data: sessionRaw } = await supabase.from('whot_sessions').select('*').eq('game_id', gameId).maybeSingle()
  const session = sessionRaw as WhotSession | null
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
      // Not enough players to keep going — the lone remaining player wins.
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
      update.turn_deadline_at = whotTurnDeadline(timerSeconds)
    }

    const { error: sessionError } = await supabase.from('whot_sessions').update(update).eq('game_id', gameId)
    if (sessionError) return { error: sessionError.message }

    await supabase.from('whot_player_hands').delete().eq('game_id', gameId).eq('player_id', playerId)
    if (finishing) await markGameFinished(supabase, gameId)
    const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
    return { error: error?.message ?? null }
  }

  // Lobby, spectator, already-finished, or not in the turn order — just drop their hand + row.
  await supabase.from('whot_player_hands').delete().eq('game_id', gameId).eq('player_id', playerId)
  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  return { error: error?.message ?? null }
}
