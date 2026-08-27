import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
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
  /** null = the hand is hidden from this viewer and no count came back. NEVER 0 for a hidden hand. */
  cardCount: number | null
  /** null = the hand is hidden from this viewer, so its points are unknowable. NEVER 0. */
  handSum: number | null
  rank: number
}

/** Minimal hand shape `crazyEightsPlacementOrder` needs — works for both
 *  `CrazyEightsPlayerHand` rows and the trimmed `{ player_id, cards }` rows the
 *  room-points query selects. */
// `cards` is null on any row the hand-redaction route hid from the caller (lib/hand-redaction.ts);
// `card_count` is the one fact that survives redaction. Server-side callers pass full rows.
type CrazyEightsRankableHand = { player_id: string; cards: CrazyEightsCard[] | null; card_count?: number | null }

/**
 * What we actually KNOW about a hand.
 *
 * A redacted row (`cards: null`) is not an empty hand. Coercing it to `[]` — which this used to
 * do — scores every hidden player at 0 cards / 0 points, i.e. exactly the "out of cards, ranked
 * first" reading that the redaction is supposed to prevent. Only a visible array is real state;
 * a `card_count` of 0 is real too (an empty hand has nothing to hide, so its sum is 0). Anything
 * else is unknown, and unknown is reported as null all the way to the UI.
 */
function crazyEightsHandFacts(hand: CrazyEightsRankableHand): { cardCount: number | null; handSum: number | null } {
  if (Array.isArray(hand.cards)) {
    return { cardCount: hand.cards.length, handSum: crazyEightsHandSum(hand.cards) }
  }
  const count = hand.card_count ?? null
  return { cardCount: count, handSum: count === 0 ? 0 : null }
}

/**
 * Final placement order (1st → last), the single source of truth for who placed where.
 *
 * Players who emptied their hand rank FIRST, in the exact order they finished
 * (`finishOrder`) — first to empty wins, and in a timed game the runners-up are credited
 * by when they went out. Everyone still holding cards follows, ordered by lowest hand
 * total then fewest cards. Without this, all finished players tie at 0 cards / hand-sum 0
 * and the sort ordered them arbitrarily.
 *
 * Hands we cannot see (redacted, sum unknown) cannot be scored against the ones we can, so they
 * trail every scored player instead of tying at zero and taking the podium.
 */
export function crazyEightsPlacementOrder(
  hands: CrazyEightsRankableHand[],
  turnOrder: string[],
  finishOrder: string[]
): string[] {
  const activeIds = new Set(turnOrder ?? [])
  const finished = (finishOrder ?? []).filter((id) => activeIds.has(id))
  const finishedSet = new Set(finished)
  const rows = hands
    .filter((h) => activeIds.has(h.player_id) && !finishedSet.has(h.player_id))
    .map((h) => ({ playerId: h.player_id, ...crazyEightsHandFacts(h) }))
  const scored = rows
    .filter((r): r is { playerId: string; cardCount: number; handSum: number } => r.handSum !== null)
    .sort((a, b) => {
      if (a.handSum !== b.handSum) return a.handSum - b.handSum
      if (a.cardCount !== b.cardCount) return a.cardCount - b.cardCount
      // Stable final tiebreak on a unique field so the finisher and the room-points call
      // sites — which read hands from separate queries — always agree on tied boards.
      return a.playerId.localeCompare(b.playerId)
    })
  const hidden = rows
    .filter((r) => r.handSum === null)
    .sort((a, b) => {
      const ac = a.cardCount ?? Number.MAX_SAFE_INTEGER
      const bc = b.cardCount ?? Number.MAX_SAFE_INTEGER
      if (ac !== bc) return ac - bc
      return a.playerId.localeCompare(b.playerId)
    })
  return [...finished, ...scored.map((r) => r.playerId), ...hidden.map((r) => r.playerId)]
}

export function buildCrazyEightsStandings(
  hands: CrazyEightsPlayerHand[],
  players: { id: string; name: string }[],
  turnOrder: string[],
  finishOrder: string[] = []
): CrazyEightsStanding[] {
  const activeIds = new Set(turnOrder ?? [])
  const byId = new Map(hands.filter((h) => activeIds.has(h.player_id)).map((h) => [h.player_id, h]))
  // `finish_order` is public session state: being on it means the player emptied their hand, so
  // 0 cards / 0 points is a fact here even when the row itself is redacted.
  const finishedSet = new Set((finishOrder ?? []).filter((id) => activeIds.has(id)))
  return crazyEightsPlacementOrder(hands, turnOrder, finishOrder).map((playerId, index) => {
    const row = byId.get(playerId)
    const facts = finishedSet.has(playerId)
      ? { cardCount: 0, handSum: 0 }
      : row
        ? crazyEightsHandFacts(row)
        : { cardCount: null, handSum: null }
    return {
      playerId,
      name: players.find((p) => p.id === playerId)?.name ?? 'Player',
      cardCount: facts.cardCount,
      handSum: facts.handSum,
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

/**
 * Shared by the server (full row, service role) and the client (redacted row: `draw_pile` and
 * `discard_pile` are revoked from anon/authenticated, only the generated counts come back).
 *
 * Prefer the counts; fall back to the array lengths for service-role rows and fixtures written
 * before the counts existed. Where NEITHER is readable, return `false` — "I cannot see the pile"
 * must never be reported as "the pile is empty", which would flip the UI into pass-turn/reshuffle
 * states on a redacted field read as meaningful state.
 */
export function isDrawPileDepleted(session: CrazyEightsSession): boolean {
  const drawLen = session.draw_count ?? (Array.isArray(session.draw_pile) ? session.draw_pile.length : null)
  const discardLen = session.discard_count ?? (Array.isArray(session.discard_pile) ? session.discard_pile.length : null)
  if (drawLen == null || discardLen == null) return false
  return drawLen === 0 && discardLen === 0
}

/**
 * How many cards a player holds. Server callers pass full rows; the `card_count` fallback keeps
 * a redacted row (`cards: null`, see lib/hand-redaction.ts) from reading as an empty hand — which
 * every caller here treats as "this player is out".
 */
export function crazyEightsHandCount(hands: CrazyEightsPlayerHand[], playerId: string): number {
  const row = hands.find((h) => h.player_id === playerId)
  if (!row) return 0
  if (Array.isArray(row.cards)) return (row.cards as CrazyEightsCard[]).length
  return row.card_count ?? 0
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
  if (sessionError) return { error: internalErrorMessage('crazy-eights', sessionError) }

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
    return { error: internalErrorMessage('crazy-eights', handsError) }
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
  sessionStartedAt: string | null
  rules: CrazyEightsRules
  playerNames: Map<string, string>
}> {
  const [sessionRes, handsRes, gameRes, playersRes] = await Promise.all([
    supabase.from('crazy_eights_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('crazy_eights_player_hands').select('*').eq('game_id', gameId).order('player_order'),
    supabase
      .from('games')
      .select(
        'timer_seconds, game_duration_seconds, session_started_at, crazy8_action_cards, crazy8_jokers, crazy8_pick2_stacking'
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
    session: sessionRes.data as CrazyEightsSession | null,
    hands: (handsRes.data as CrazyEightsPlayerHand[]) ?? [],
    timerSeconds: gameRes.data?.timer_seconds ?? 0,
    gameDurationSeconds: gameRes.data?.game_duration_seconds ?? 0,
    sessionStartedAt: gameRes.data?.session_started_at ?? null,
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
  // Placement: whoever emptied their hand first wins (finish_order), then everyone still
  // holding cards by lowest hand total. Keeps the timer/no-moves endings consistent with
  // the in-game results — the first to go out is never demoted below a player who merely
  // had a small hand when the clock ran out.
  const finishOrder = session.finish_order ?? []
  const winnerId = crazyEightsPlacementOrder(hands, session.turn_order ?? [], finishOrder)[0] ?? null
  const winnerName = winnerId ? playerName(playerNames, winnerId) : 'Nobody'

  let detail = 'lowest hand total'
  if (winnerId && finishOrder.includes(winnerId)) {
    detail = 'emptied their hand first'
  } else if (winnerId) {
    const winnerHand = hands.find((h) => h.player_id === winnerId)
    detail = `lowest hand total (${crazyEightsHandSum((winnerHand?.cards as CrazyEightsCard[]) ?? [])})`
  }

  const { data } = await supabase
    .from('crazy_eights_sessions')
    .update({
      phase: 'finished',
      winner_player_id: winnerId,
      status_message: `${reasonPrefix} ${winnerName} wins — ${detail}.`,
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
 * Server-authoritative game-clock guard. The game-duration deadline must never depend
 * on a client firing the dedicated /expire-crazy-eights route: that fires off the client's
 * clock, so a fast/skewed/throttled tab (or a dropped request) lets turns keep advancing
 * past time while the display reads 0:00. Every turn-processing path runs this first, using
 * the server clock — so the next turn poke or move after the buzzer finalizes the game by
 * lowest hand. Returns true only when it actually ended the game (caller should stop).
 */
async function finalizeIfGameExpired(
  supabase: SupabaseClient,
  gameId: string,
  session: CrazyEightsSession,
  hands: CrazyEightsPlayerHand[],
  playerNames: Map<string, string>,
  sessionStartedAt: string | null,
  gameDurationSeconds: number
): Promise<boolean> {
  if (session.phase === 'finished') return false
  if (!crazyEightsGameSessionExpired(sessionStartedAt, gameDurationSeconds)) return false
  // Return the CAS result, not an unconditional true: a lost claim means a concurrent
  // in-flight write won, so we did NOT finalize and the caller must not report "time's up".
  // The next turn poke re-evaluates from fresh state and finalizes then.
  return finishByLowestHand(supabase, gameId, session, hands, playerNames, "Time's up!")
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
  // Append this player to the finish order the moment they empty their hand, so a timed
  // game can rank everyone by WHEN they went out (not just by hand size at the buzzer).
  const finishOrder = [...(session.finish_order ?? []), playerId]
  // First to empty wins — even when a later finisher triggers the end condition below.
  const winnerId = finishOrder[0]

  if (gameDurationSeconds <= 0 || remaining.length < 2) {
    return {
      ...board,
      phase: 'finished',
      finish_order: finishOrder,
      winner_player_id: winnerId,
      status_message: `${playerName(playerNames, winnerId)} wins!`,
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
    finish_order: finishOrder,
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

// ── Per-game trophy accumulator (counting only — never touches game state) ─────────────────
//
// Crazy Eights keeps no history: a finished hand is empty and the session holds no move list, so
// per-game trophy facts ("played three 8s", "drew ten cards", "changed the suit three times")
// cannot be reconstructed after the fact. Instead each acting player's counters are folded
// forward on their own turn, INSIDE the same atomic hand write the handler already does once it
// has WON the session CAS (see processCrazyEightsPlay/Draw/Choose). A lost CAS writes nothing, so
// nothing double-counts. These functions are pure and additive; they change no card, turn, or
// score — they only accumulate integers the finish-time facts builder reads back.
// See src/lib/trophies/game-facts/crazy-eights.ts for how each key becomes a trophy.

/** Opaque bag of integer counters stored on `crazy_eights_player_hands.stats`. */
type CrazyEightsRoundStats = Record<string, number>

/** Suit → bit, for the "played every suit" bitmask. The Joker (no suit) sets no bit. */
const CRAZY8_SUIT_BIT: Record<CrazyEightsCalledSuit, number> = { spades: 1, clubs: 2, hearts: 4, diamonds: 8 }

/** This player's current accumulator, copied so the fold never mutates the loaded row. */
function currentRoundStats(hands: CrazyEightsPlayerHand[], playerId: string): CrazyEightsRoundStats {
  const row = hands.find((h) => h.player_id === playerId) as
    | (CrazyEightsPlayerHand & { stats?: CrazyEightsRoundStats })
    | undefined
  return { ...(row?.stats ?? {}) }
}

function inc(stats: CrazyEightsRoundStats, key: string, by = 1): void {
  stats[key] = (stats[key] ?? 0) + by
}

function bumpMax(stats: CrazyEightsRoundStats, key: string, value: number): void {
  if (value > (stats[key] ?? 0)) stats[key] = value
}

/** A play or a draw ends the same-suit / same-rank "in a row" streak of the OTHER kind. */
function resetPlayRuns(stats: CrazyEightsRoundStats): void {
  stats.c8_run_suit_bit = 0
  stats.c8_run_suit_len = 0
  stats.c8_run_rank_len = 0
}

/**
 * Fold the counters for a card `playerId` just played. `handBefore` is their hand as it was when
 * the turn began (its length is the peak candidate); `wentOut` is whether this play emptied it.
 * `session` is pre-write, so `session.pick_two_stack` reads the stack this 2 landed on.
 */
function foldPlayStats(
  prev: CrazyEightsRoundStats,
  card: CrazyEightsCard,
  handBefore: CrazyEightsCard[],
  wentOut: boolean,
  session: CrazyEightsSession,
  rules: CrazyEightsRules
): CrazyEightsRoundStats {
  const stats = { ...prev }
  inc(stats, 'c8_turns_taken')
  bumpMax(stats, 'c8_peak_hand_size', handBefore.length)

  if (isJoker(card)) {
    inc(stats, 'c8_jokers_played')
  } else {
    stats.c8_suits_mask = (stats.c8_suits_mask ?? 0) | CRAZY8_SUIT_BIT[card.suit as CrazyEightsCalledSuit]
    if (card.rank === 8) inc(stats, 'c8_eights_played')
    if (rules.actionCards) {
      if (card.rank === 2) {
        inc(stats, 'c8_pick_twos_played')
        if ((session.pick_two_stack ?? 0) > 0) inc(stats, 'c8_pick_twos_stacked')
      }
      if (card.rank === 1 || card.rank === 11) inc(stats, 'c8_skips_played')
      if (card.rank === 12) inc(stats, 'c8_reverses_played')
    }
  }

  // Same-suit "in a row" among this player's own plays. A Joker (no suit) breaks the run.
  if (isJoker(card)) {
    stats.c8_run_suit_bit = 0
    stats.c8_run_suit_len = 0
  } else {
    const bit = CRAZY8_SUIT_BIT[card.suit as CrazyEightsCalledSuit]
    const len =
      bit === (stats.c8_run_suit_bit ?? 0) && (stats.c8_run_suit_len ?? 0) > 0 ? stats.c8_run_suit_len! + 1 : 1
    stats.c8_run_suit_bit = bit
    stats.c8_run_suit_len = len
    bumpMax(stats, 'c8_max_suit_run', len)
  }

  // Same-rank "in a row" among this player's own plays.
  const rankLen = (stats.c8_run_rank_len ?? 0) > 0 && card.rank === stats.c8_run_rank ? stats.c8_run_rank_len! + 1 : 1
  stats.c8_run_rank = card.rank
  stats.c8_run_rank_len = rankLen
  bumpMax(stats, 'c8_max_rank_run', rankLen)

  if (wentOut) {
    stats.c8_out_rank = card.rank
    stats.c8_out_joker = isJoker(card) ? 1 : 0
  }

  return stats
}

/** Fold the counters for a draw. `pickTwoActive` marks a Pick-2 penalty draw ("took a Pick Two"). */
function foldDrawStats(
  prev: CrazyEightsRoundStats,
  drawnCount: number,
  newHandLen: number,
  pickTwoActive: boolean
): CrazyEightsRoundStats {
  const stats = { ...prev }
  inc(stats, 'c8_turns_taken')
  inc(stats, 'c8_cards_drawn', drawnCount)
  bumpMax(stats, 'c8_peak_hand_size', newHandLen)
  if (pickTwoActive) inc(stats, 'c8_pick_twos_received')
  resetPlayRuns(stats)
  return stats
}

/** Fold the counter for naming a suit (an 8/Joker follow-up, or a timeout auto-choice). */
function foldChooseStats(prev: CrazyEightsRoundStats): CrazyEightsRoundStats {
  const stats = { ...prev }
  inc(stats, 'c8_suit_changes')
  return stats
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
  const { session, hands, timerSeconds, gameDurationSeconds, sessionStartedAt, rules, playerNames } =
    await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }

  // The buzzer wins ties with a player's move: once the game clock is spent, no further
  // card may be played — finalize by lowest hand instead. Run before the phase check so an
  // expired game still ends even if the request arrives in the "wrong" phase.
  if (
    await finalizeIfGameExpired(supabase, gameId, session, hands, playerNames, sessionStartedAt, gameDurationSeconds)
  ) {
    return { error: "Time's up — the game has ended" }
  }

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

  // CAS won: fold this player's trophy counters into the same hand write that persists their
  // new cards. Counting only — the card, turn and scoring above are already decided.
  const nextStats = foldPlayStats(currentRoundStats(hands, playerId), card, hand, wentOut, session, rules)

  await supabase
    .from('crazy_eights_player_hands')
    .update({ cards: newHand, stats: nextStats })
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
  const { session, hands, timerSeconds, gameDurationSeconds, sessionStartedAt, rules, playerNames } =
    await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }

  // The buzzer wins ties with a player's move: once the game clock is spent, no further
  // draw may happen — finalize by lowest hand instead. Run before the phase check so an
  // expired game still ends even if the request arrives in the "wrong" phase.
  if (
    await finalizeIfGameExpired(supabase, gameId, session, hands, playerNames, sessionStartedAt, gameDurationSeconds)
  ) {
    return { error: "Time's up — the game has ended" }
  }

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

  // CAS won: fold the draw counters into the same hand write that credits the drawn cards.
  const nextStats = foldDrawStats(currentRoundStats(hands, playerId), drawn.length, newHand.length, pickTwo > 0)

  await supabase
    .from('crazy_eights_player_hands')
    .update({ cards: newHand, stats: nextStats })
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
  const { session, hands, timerSeconds, gameDurationSeconds, sessionStartedAt, playerNames } = await loadGameState(
    supabase,
    gameId
  )
  if (!session) return { error: 'Session not found' }

  // The buzzer wins ties with a player's move: once the game clock is spent, finalize by
  // lowest hand instead of resolving the suit call. Run before the phase check so an
  // expired game still ends even if the request arrives in the "wrong" phase.
  if (
    await finalizeIfGameExpired(supabase, gameId, session, hands, playerNames, sessionStartedAt, gameDurationSeconds)
  ) {
    return { error: "Time's up — the game has ended" }
  }

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

  const won = await persistSession(
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

  // CAS won: naming a suit is a suit change. Gated on the win so a lost race never double-counts;
  // this writes only the accumulator (choose changes no cards). Nothing else here is altered.
  if (won) {
    const nextStats = foldChooseStats(currentRoundStats(hands, playerId))
    await supabase
      .from('crazy_eights_player_hands')
      .update({ stats: nextStats })
      .eq('game_id', gameId)
      .eq('player_id', playerId)
  }

  return {}
}

export async function processCrazyEightsExpireTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; skipped?: boolean }> {
  const { session, hands, rules, timerSeconds, gameDurationSeconds, sessionStartedAt, playerNames } =
    await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { skipped: true }

  // Game clock takes precedence over the turn clock: if the session ran out of time,
  // end it now by lowest hand rather than auto-playing another turn.
  if (
    await finalizeIfGameExpired(supabase, gameId, session, hands, playerNames, sessionStartedAt, gameDurationSeconds)
  ) {
    return {}
  }

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
  if (typeof window === 'undefined') return 'player'
  return (localStorage.getItem(`${CRAZY8_HOST_MODE_KEY}_${gameCode}`) as CrazyEightsHostMode) ?? 'player'
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

  // A player who already emptied their hand has a locked placement (they're in
  // finish_order). Leaving must NOT erase that — otherwise the winner who leaves is
  // dropped from the leaderboard: removing them from turn_order filters them out of
  // the finishers, and deleting their hand/player row breaks name + tournament-point
  // mapping. So preserve their session slot, hand, and row; the client clears only its
  // own local session.
  if (session?.finish_order?.includes(playerId)) {
    return { error: null }
  }

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

    // Players who already emptied their hand stay in turn_order (they're skipped on
    // their turn) but are tracked in finish_order — they are NOT still in play. The
    // game can only continue while at least two players still hold cards, so count
    // active (non-finished) seats, not raw turn_order length. Otherwise a finished
    // winner left sitting in turn_order masks a lone survivor, and the game keeps
    // dealing turns to a player playing alone until they run out of cards.
    const finishOrder = session.finish_order ?? []
    const finishedSet = new Set(finishOrder)
    const activeRemaining = turnOrder.filter((id) => !finishedSet.has(id))

    const finishing = activeRemaining.length < 2
    if (finishing) {
      // First to empty wins (finish_order[0]); if nobody finished, the lone survivor wins.
      const winnerPlayerId = finishOrder[0] ?? activeRemaining[0] ?? turnOrder[0] ?? null
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
    if (sessionError) return { error: internalErrorMessage('crazy-eights', sessionError) }

    await supabase.from('crazy_eights_player_hands').delete().eq('game_id', gameId).eq('player_id', playerId)
    if (finishing) await markGameFinished(supabase, gameId)
    const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
    return { error: error?.message ?? null }
  }

  await supabase.from('crazy_eights_player_hands').delete().eq('game_id', gameId).eq('player_id', playerId)
  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  return { error: error?.message ?? null }
}

/**
 * Admit a spectator into an ACTIVE Crazy Eights game — the inverse of removeCrazyEightsPlayer,
 * and the direct counterpart of admitWhotPlayer.
 *
 * Seats them at the END of turn_order (append is index-safe: current_turn_index is a
 * normalized, sign-safe modulo index — so appending never disturbs the current player's turn,
 * and `direction` is left untouched) and deals a fresh hand drawn from the deck.
 *
 * Ordering mirrors processCrazyEightsPlay: draw purely, then CAS-claim the session so the dealt
 * cards leave draw_pile atomically with the turn_order growth (never racing a concurrent
 * play/draw into duplicate physical cards), then — only AFTER winning the claim — insert the
 * hand row and flip players.spectator. A bespoke CAS update (NOT persistSession) is used so the
 * current player's turn_deadline_at / clock is preserved.
 *
 * `maxPlayers` is the caller-resolved seat cap (the host's configured lobby max, <= 6).
 */
export async function admitCrazyEightsPlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  maxPlayers: number
): Promise<{ error: string | null; status: number }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [{ data: sessionRaw }, { data: playerRow }] = await Promise.all([
      supabase.from('crazy_eights_sessions').select('*').eq('game_id', gameId).maybeSingle(),
      supabase
        .from('players')
        .select('id, name, spectator, is_eliminated')
        .eq('id', playerId)
        .eq('game_id', gameId)
        .maybeSingle(),
    ])

    const session = sessionRaw as CrazyEightsSession | null
    if (!session) return { error: 'Session not found', status: 404 }
    if (session.phase !== 'playing') {
      return { error: 'Wait for the current player to finish their turn', status: 409 }
    }
    if (!playerRow) return { error: 'Player not found', status: 404 }
    if (playerRow.is_eliminated) return { error: 'That player was eliminated and can’t be dealt in', status: 400 }
    if (playerRow.spectator !== true) return { error: 'That player is already in the game', status: 400 }

    const turnOrder = [...(session.turn_order ?? [])]
    // A player who went out is ALSO spectator=true but sits in turn_order + finish_order —
    // these two guards stop the host from "re-dealing in" someone who already lost.
    if (turnOrder.includes(playerId)) return { error: 'That player is already seated', status: 400 }
    if ((session.finish_order ?? []).includes(playerId)) {
      return { error: 'That player already finished this game', status: 400 }
    }
    if (turnOrder.length >= maxPlayers) {
      return { error: `The game is full (${turnOrder.length}/${maxPlayers})`, status: 409 }
    }

    const need = dealCount(turnOrder.length + 1)
    const { drawn, drawPile, discardPile, reshuffled } = drawCardsWithRefill(
      (session.draw_pile as CrazyEightsCard[]) ?? [],
      (session.discard_pile as CrazyEightsCard[]) ?? [],
      need
    )
    if (drawn.length < need) {
      return { error: 'Not enough cards left in the deck to deal a new hand right now.', status: 409 }
    }

    const newIndex = turnOrder.length
    const admittedName = playerRow.name ?? 'A player'
    // Bespoke CAS update — omits turn_deadline_at / current_turn_index / direction so the
    // current player's turn, countdown, and play direction are untouched (persistSession
    // would reset the deadline).
    const claimedAt = new Date().toISOString()
    const { data: claimed } = await supabase
      .from('crazy_eights_sessions')
      .update({
        turn_order: [...turnOrder, playerId],
        draw_pile: drawPile,
        discard_pile: discardPile,
        status_message: `${admittedName} was dealt in${reshuffled ? ' · deck reshuffled' : ''}`,
        updated_at: claimedAt,
      })
      .eq('game_id', gameId)
      .eq('updated_at', session.updated_at)
      .select('game_id')

    if ((claimed?.length ?? 0) === 0) continue // lost the race — reload and retry

    // supabase-js can't span these three writes in one transaction, so if a follow-up write
    // fails we compensate: undo the seat + returned cards so the game isn't stranded (seated
    // in turn_order, cards gone from the deck, but no hand / still a spectator). The rollback
    // CAS-guards on claimedAt: if a concurrent turn already moved the session on, we leave it
    // rather than clobber that write (the dangling hand row, if any, is still removed).
    const rollbackClaim = async () => {
      await supabase.from('crazy_eights_player_hands').delete().eq('game_id', gameId).eq('player_id', playerId)
      const { data: restored } = await supabase
        .from('crazy_eights_sessions')
        .update({
          turn_order: turnOrder,
          draw_pile: (session.draw_pile as CrazyEightsCard[]) ?? [],
          discard_pile: (session.discard_pile as CrazyEightsCard[]) ?? [],
          status_message: session.status_message ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('game_id', gameId)
        .eq('updated_at', claimedAt)
        .select('game_id')
      if ((restored?.length ?? 0) === 0) {
        // A concurrent play/draw moved the session past our claim, so the compensating restore
        // matched no rows. The player may be left seated in turn_order with no hand — harmless
        // in rotation (a 0-card player is skipped as "out"), but the dealt cards stay out of the
        // deck. Rare (needs the hand/flip write to fail AND a concurrent write in the same
        // window); log it so the orphaned seat is detectable rather than silent.
        console.error(
          `admitCrazyEightsPlayer: rollback CAS lost for game ${gameId}, player ${playerId} — possible orphaned seat`
        )
      }
    }

    // Won: the dealt cards are now out of draw_pile. Materialize the hand BEFORE flipping
    // spectator so the client sees a hand the moment it observes spectator=false.
    const { error: handError } = await supabase.from('crazy_eights_player_hands').insert({
      game_id: gameId,
      player_id: playerId,
      cards: drawn,
      player_order: newIndex,
    })
    if (handError) {
      await rollbackClaim()
      return { error: internalErrorMessage('crazy-eights', handError), status: 500 }
    }

    const { error: flipError } = await supabase
      .from('players')
      .update({ spectator: false })
      .eq('id', playerId)
      .eq('game_id', gameId)
    if (flipError) {
      await rollbackClaim()
      return { error: internalErrorMessage('crazy-eights', flipError), status: 500 }
    }

    return { error: null, status: 200 }
  }

  return { error: 'The game changed while dealing in — try again.', status: 409 }
}
