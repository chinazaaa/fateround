import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { clearSessionTables } from './session-clear'
import { markGameFinished } from '@/lib/game-finish'
import { secondsUntilDeadline } from '@/lib/round-timing'
import type { RummyCard, RummyMeld, RummyPlayerHand, RummySession, RummySuit } from '@/types'

export const RUMMY_MIN_PLAYERS = 2
export const RUMMY_MAX_PLAYERS = 6
export const RUMMY_DEFAULT_MAX_PLAYERS = 4

/** Whole-game session length (seconds). 0 = no limit. */
export const RUMMY_GAME_DURATION_OPTIONS = [0, 600, 900, 1800, 2700, 3600, 5400] as const

/** How many cards each player starts with, keyed on player count. Values chosen so a
 *  single 52-card deck comfortably supports a draw + discard pile at every seat count. */
const HAND_SIZE_BY_PLAYERS: Record<number, number> = {
  2: 10,
  3: 7,
  4: 7,
  5: 6,
  6: 6,
}

export function rummyHandSize(playerCount: number): number {
  return HAND_SIZE_BY_PLAYERS[playerCount] ?? 7
}

/** Beyond this many draw-pile rebuilds the game ends by lowest hand total so the deck
 *  can't cycle forever when nobody can go out. */
export const RUMMY_RESHUFFLE_LIMIT = 3

export const RUMMY_SUITS: RummySuit[] = ['spades', 'clubs', 'hearts', 'diamonds']

export const RUMMY_SUIT_LABELS: Record<RummySuit, string> = {
  spades: 'Spades',
  clubs: 'Clubs',
  hearts: 'Hearts',
  diamonds: 'Diamonds',
}

export const RUMMY_SUIT_SYMBOLS: Record<RummySuit, string> = {
  spades: '♠',
  clubs: '♣',
  hearts: '♥',
  diamonds: '♦',
}

const RANK_LABELS: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }

export function rummyCardLabel(card: RummyCard): string {
  const rank = RANK_LABELS[card.rank] ?? String(card.rank)
  return `${rank}${RUMMY_SUIT_SYMBOLS[card.suit]}`
}

/** Deadwood points a card carries in a losing hand at showdown. Face cards 10, ace 1,
 *  numerics face value — the classic scoring most Rummy variants use. */
export function rummyCardPoints(card: RummyCard): number {
  if (card.rank === 1) return 1
  if (card.rank >= 11) return 10
  return card.rank
}

export function rummyHandSum(cards: RummyCard[]): number {
  return cards.reduce((sum, card) => sum + rummyCardPoints(card), 0)
}

export function clampRummyGameDuration(raw: unknown): number {
  const n = Number(raw ?? 0)
  return (RUMMY_GAME_DURATION_OPTIONS as readonly number[]).includes(n) ? n : 0
}

export function formatRummyGameDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return 'No limit'
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 === 1 ? '' : 's'}`
  return `${Math.round(seconds / 60)} minutes`
}

export function rummyGameSessionExpired(
  sessionStartedAt: string | null | undefined,
  durationSeconds: number | null | undefined
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  if (!sessionStartedAt) return false
  return secondsUntilDeadline(sessionStartedAt, durationSeconds) <= 0
}

/** Standard 52-card deck. Card ids are stable strings so client re-renders stay keyed. */
export function buildRummyDeck(): RummyCard[] {
  const deck: RummyCard[] = []
  for (const suit of RUMMY_SUITS) {
    for (let rank = 1; rank <= 13; rank += 1) {
      deck.push({ id: `${suit}-${rank}`, suit, rank })
    }
  }
  return deck
}

export function shuffleArray<T>(items: T[]): T[] {
  return shuffle(items)
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function shuffleRummyDeck(deck: RummyCard[] = buildRummyDeck()): RummyCard[] {
  return shuffle(deck)
}

/**
 * Deal a fresh round. Returns each player's hand in `turnOrder` order plus the remaining
 * draw pile and the first discard (flipped from the top of the draw pile, as in the
 * traditional deal).
 */
export function dealRummy(turnOrder: string[]): {
  hands: Record<string, RummyCard[]>
  drawPile: RummyCard[]
  discardPile: RummyCard[]
} {
  const deck = shuffleRummyDeck()
  const handSize = rummyHandSize(turnOrder.length)
  const hands: Record<string, RummyCard[]> = {}
  let cursor = 0
  for (const playerId of turnOrder) {
    hands[playerId] = deck.slice(cursor, cursor + handSize)
    cursor += handSize
  }
  const firstDiscard = deck[cursor]
  const drawPile = deck.slice(cursor + 1)
  const discardPile = firstDiscard ? [firstDiscard] : []
  return { hands, drawPile, discardPile }
}

// ---------------------------------------------------------------------------
// Meld validation
// ---------------------------------------------------------------------------

/**
 * A SET is 3 or 4 cards of the same rank. Duplicate cards (same suit + rank appearing
 * twice) are rejected because a single-deck game can't produce them — catches a bug
 * where a client submits the same card twice.
 */
export function isValidSet(cards: RummyCard[]): boolean {
  if (cards.length < 3 || cards.length > 4) return false
  const rank = cards[0].rank
  const seen = new Set<RummySuit>()
  for (const card of cards) {
    if (card.rank !== rank) return false
    if (seen.has(card.suit)) return false
    seen.add(card.suit)
  }
  return true
}

/**
 * A RUN is 3+ consecutive cards of the same suit. Aces are LOW (A-2-3 is legal;
 * Q-K-A is NOT). Duplicate ranks in the same suit are rejected.
 */
export function isValidRun(cards: RummyCard[]): boolean {
  if (cards.length < 3) return false
  const suit = cards[0].suit
  const sorted = [...cards].sort((a, b) => a.rank - b.rank)
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i].suit !== suit) return false
    if (i > 0 && sorted[i].rank !== sorted[i - 1].rank + 1) return false
  }
  return true
}

export function classifyMeld(cards: RummyCard[]): 'set' | 'run' | null {
  if (isValidSet(cards)) return 'set'
  if (isValidRun(cards)) return 'run'
  return null
}

/** Validate a whole "going out" lay-down: every meld valid, every card unique, and the
 *  full set of melded cards accounts for the player's entire hand minus (optionally)
 *  one card they will discard to finish the turn. */
export function canGoOut(hand: RummyCard[], melds: RummyCard[][], opts: { discard?: RummyCard | null } = {}): boolean {
  const melded = melds.flat()
  const expectedCount = hand.length - (opts.discard ? 1 : 0)
  if (melded.length !== expectedCount) return false
  for (const meld of melds) {
    if (!classifyMeld(meld)) return false
  }
  const usable = new Set(hand.map((c) => c.id))
  if (opts.discard) usable.delete(opts.discard.id)
  const seen = new Set<string>()
  for (const card of melded) {
    if (!usable.has(card.id)) return false
    if (seen.has(card.id)) return false
    seen.add(card.id)
  }
  return true
}

/**
 * Public form of a validated lay-down. Caller passes the raw arrays; we return typed
 * `RummyMeld`s ready for storage, or null if any meld fails or the hand doesn't fully
 * clear. Never trust client-side classification — always re-check server-side.
 */
export function buildRummyMelds(
  hand: RummyCard[],
  melds: RummyCard[][],
  opts: { discard?: RummyCard | null } = {}
): RummyMeld[] | null {
  if (!canGoOut(hand, melds, opts)) return null
  return melds.map((cards) => {
    const kind = classifyMeld(cards)!
    return { kind, cards: [...cards] }
  })
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export type RummyStanding = {
  playerId: string
  name: string
  cardCount: number
  handSum: number
  rank: number
}

type RummyRankableHand = { player_id: string; cards: RummyCard[] | null }

/** First to empty their hand wins; everyone else is ordered by lowest deadwood total. */
export function rummyPlacementOrder(
  hands: RummyRankableHand[],
  turnOrder: string[],
  winnerId: string | null
): string[] {
  const activeIds = new Set(turnOrder ?? [])
  const rest = hands
    .filter((h) => activeIds.has(h.player_id) && h.player_id !== winnerId)
    .map((h) => {
      const cards = h.cards ?? []
      return { playerId: h.player_id, handSum: rummyHandSum(cards), cardCount: cards.length }
    })
    .sort((a, b) => {
      if (a.handSum !== b.handSum) return a.handSum - b.handSum
      if (a.cardCount !== b.cardCount) return a.cardCount - b.cardCount
      return a.playerId.localeCompare(b.playerId)
    })
    .map((r) => r.playerId)
  return winnerId && activeIds.has(winnerId) ? [winnerId, ...rest] : rest
}

export function buildRummyStandings(
  hands: RummyPlayerHand[],
  players: { id: string; name: string }[],
  turnOrder: string[],
  winnerId: string | null
): RummyStanding[] {
  const activeIds = new Set(turnOrder ?? [])
  const byId = new Map(hands.filter((h) => activeIds.has(h.player_id)).map((h) => [h.player_id, h]))
  return rummyPlacementOrder(hands, turnOrder, winnerId).map((playerId, index) => {
    const cards = (byId.get(playerId)?.cards as RummyCard[] | null) ?? []
    return {
      playerId,
      name: players.find((p) => p.id === playerId)?.name ?? 'Player',
      cardCount: cards.length,
      handSum: rummyHandSum(cards),
      rank: index + 1,
    }
  })
}

// ---------------------------------------------------------------------------
// Deck / discard helpers
// ---------------------------------------------------------------------------

/** Draw the top card from the pile. If empty, rebuild from the discard (all but the
 *  top card, which stays face-up), reshuffle, and count a reshuffle for the caller to
 *  enforce RUMMY_RESHUFFLE_LIMIT. */
export function drawFromPile(
  drawPile: RummyCard[],
  discardPile: RummyCard[]
): { card: RummyCard | null; drawPile: RummyCard[]; discardPile: RummyCard[]; reshuffled: boolean } {
  if (drawPile.length > 0) {
    const [card, ...rest] = drawPile
    return { card, drawPile: rest, discardPile, reshuffled: false }
  }
  if (discardPile.length <= 1) {
    // Nothing to rebuild — the round is unwinnable this turn; caller must decide.
    return { card: null, drawPile, discardPile, reshuffled: false }
  }
  const top = discardPile[discardPile.length - 1]
  const rebuilt = shuffle(discardPile.slice(0, -1))
  const [card, ...rest] = rebuilt
  return { card, drawPile: rest, discardPile: [top], reshuffled: true }
}

export function drawFromDiscard(discardPile: RummyCard[]): { card: RummyCard | null; discardPile: RummyCard[] } {
  if (discardPile.length === 0) return { card: null, discardPile }
  const card = discardPile[discardPile.length - 1]
  return { card, discardPile: discardPile.slice(0, -1) }
}

export function pushDiscard(discardPile: RummyCard[], card: RummyCard): RummyCard[] {
  return [...discardPile, card]
}

// ---------------------------------------------------------------------------
// Server engine
// ---------------------------------------------------------------------------

const RUMMY_SESSIONS = 'rummy_sessions'
const RUMMY_HANDS = 'rummy_player_hands'

export function currentPlayerId(session: RummySession): string | null {
  return session.turn_order?.[session.current_turn_index] ?? null
}

function playerNameFrom(map: Map<string, string>, id: string): string {
  return map.get(id) ?? 'Player'
}

function handForPlayer(hands: RummyPlayerHand[], playerId: string): RummyCard[] {
  const row = hands.find((h) => h.player_id === playerId)
  return (row?.cards as RummyCard[] | null) ?? []
}

/** Deal a fresh game, seed session + hand rows, and post the opening status message. */
export async function initializeRummyGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  if (playerIds.length < RUMMY_MIN_PLAYERS) {
    return { error: `Need at least ${RUMMY_MIN_PLAYERS} players to start Rummy` }
  }

  const turnOrder = shuffleArray(playerIds)

  const { hands, drawPile, discardPile } = dealRummy(turnOrder)

  const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
  const names = new Map<string, string>()
  for (const p of playerRows ?? []) names.set(p.id, p.name)

  const firstId = turnOrder[0]
  const topDiscard = discardPile[discardPile.length - 1] ?? null

  const sessionRow: Partial<RummySession> = {
    game_id: gameId,
    turn_order: turnOrder,
    current_turn_index: 0,
    phase: 'playing',
    draw_pile: drawPile,
    discard_pile: discardPile,
    top_discard: topDiscard,
    turn_step: 'draw',
    status_message: `${playerNameFrom(names, firstId)}'s turn — draw a card`,
    winner_player_id: null,
    winning_melds: null,
    reshuffle_count: 0,
    turn_deadline_at: null,
  }

  const { error: sErr } = await supabase.from(RUMMY_SESSIONS).insert(sessionRow)
  if (sErr) return { error: internalErrorMessage('rummy', sErr) }

  const handRows = turnOrder.map((playerId, index) => ({
    game_id: gameId,
    player_id: playerId,
    cards: hands[playerId] ?? [],
    player_order: index,
  }))
  const { error: hErr } = await supabase.from(RUMMY_HANDS).insert(handRows)
  if (hErr) {
    await supabase.from(RUMMY_SESSIONS).delete().eq('game_id', gameId)
    return { error: internalErrorMessage('rummy', hErr) }
  }
  return {}
}

export async function clearRummySessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, [RUMMY_SESSIONS, RUMMY_HANDS], { resetSpectators: true })
}

async function loadRummyState(
  supabase: SupabaseClient,
  gameId: string
): Promise<{
  session: RummySession | null
  hands: RummyPlayerHand[]
  names: Map<string, string>
}> {
  const [sRes, hRes, pRes] = await Promise.all([
    supabase.from(RUMMY_SESSIONS).select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from(RUMMY_HANDS).select('*').eq('game_id', gameId).order('player_order'),
    supabase.from('players').select('id, name').eq('game_id', gameId),
  ])
  const names = new Map<string, string>()
  for (const p of pRes.data ?? []) names.set(p.id, p.name)
  return {
    session: (sRes.data as RummySession | null) ?? null,
    hands: (hRes.data as RummyPlayerHand[]) ?? [],
    names,
  }
}

function advanceTurnIndex(session: RummySession): number {
  const n = session.turn_order.length
  return n === 0 ? 0 : (session.current_turn_index + 1) % n
}

/** Process the DRAW half of a player's turn. `source` = 'pile' (top of draw) or 'discard'
 *  (top of discard). Rejects out-of-turn and wrong-step actions. */
export async function processRummyDraw(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  source: 'pile' | 'discard'
): Promise<{ error?: string }> {
  const { session, hands, names } = await loadRummyState(supabase, gameId)
  if (!session) return { error: 'Rummy session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }
  if (currentPlayerId(session) !== playerId) return { error: "It's not your turn" }
  if (session.turn_step !== 'draw') return { error: 'You already drew — discard to end your turn' }

  const hand = handForPlayer(hands, playerId)
  let drawPile = [...(session.draw_pile ?? [])]
  let discardPile = [...(session.discard_pile ?? [])]
  let reshuffled = false
  let card: RummyCard | null

  if (source === 'discard') {
    if (discardPile.length === 0) return { error: 'Discard pile is empty' }
    const r = drawFromDiscard(discardPile)
    card = r.card
    discardPile = r.discardPile
  } else {
    const r = drawFromPile(drawPile, discardPile)
    card = r.card
    drawPile = r.drawPile
    discardPile = r.discardPile
    reshuffled = r.reshuffled
  }

  if (!card) {
    // Deck is dry AND discard has nothing to rebuild from — end by lowest hand total.
    return finalizeByLowestHand(supabase, gameId, session, hands, names, 'No cards left.')
  }

  const newReshuffle = (session.reshuffle_count ?? 0) + (reshuffled ? 1 : 0)
  if (newReshuffle > RUMMY_RESHUFFLE_LIMIT) {
    return finalizeByLowestHand(supabase, gameId, session, hands, names, 'Deck cycled too many times.')
  }

  const newHand = [...hand, card]

  const { error: hErr } = await supabase
    .from(RUMMY_HANDS)
    .update({ cards: newHand })
    .eq('game_id', gameId)
    .eq('player_id', playerId)
  if (hErr) return { error: internalErrorMessage('rummy', hErr) }

  const top = discardPile[discardPile.length - 1] ?? null
  const { error: sErr } = await supabase
    .from(RUMMY_SESSIONS)
    .update({
      draw_pile: drawPile,
      discard_pile: discardPile,
      top_discard: top,
      turn_step: 'discard',
      reshuffle_count: newReshuffle,
      status_message: `${playerNameFrom(names, playerId)} drew — now discard a card`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
  if (sErr) return { error: internalErrorMessage('rummy', sErr) }
  return {}
}

/** Process the DISCARD half — moves the chosen card from the player's hand to the top
 *  of the discard pile and passes turn to the next player. */
export async function processRummyDiscard(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  cardId: string
): Promise<{ error?: string }> {
  const { session, hands, names } = await loadRummyState(supabase, gameId)
  if (!session) return { error: 'Rummy session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }
  if (currentPlayerId(session) !== playerId) return { error: "It's not your turn" }
  if (session.turn_step !== 'discard') return { error: 'You must draw before discarding' }

  const hand = handForPlayer(hands, playerId)
  const idx = hand.findIndex((c) => c.id === cardId)
  if (idx < 0) return { error: 'That card is not in your hand' }
  const card = hand[idx]
  const newHand = [...hand.slice(0, idx), ...hand.slice(idx + 1)]
  const newDiscard = pushDiscard(session.discard_pile ?? [], card)

  const { error: hErr } = await supabase
    .from(RUMMY_HANDS)
    .update({ cards: newHand })
    .eq('game_id', gameId)
    .eq('player_id', playerId)
  if (hErr) return { error: internalErrorMessage('rummy', hErr) }

  const nextIndex = advanceTurnIndex(session)
  const nextId = session.turn_order[nextIndex]
  const { error: sErr } = await supabase
    .from(RUMMY_SESSIONS)
    .update({
      discard_pile: newDiscard,
      top_discard: card,
      current_turn_index: nextIndex,
      turn_step: 'draw',
      status_message: `${playerNameFrom(names, nextId)}'s turn — draw a card`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
  if (sErr) return { error: internalErrorMessage('rummy', sErr) }
  return {}
}

/** Player declares "going out" — lay down the whole hand as valid melds. Optionally
 *  discards one card in the same action (the classic "meld + discard to end round"). */
export async function processRummyGoOut(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  meldCardIds: string[][],
  discardCardId: string | null
): Promise<{ error?: string }> {
  const { session, hands, names } = await loadRummyState(supabase, gameId)
  if (!session) return { error: 'Rummy session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }
  if (currentPlayerId(session) !== playerId) return { error: "It's not your turn" }
  // Going out requires you to have drawn this turn (the classic sequence: draw → meld → discard).
  if (session.turn_step !== 'discard') return { error: 'Draw a card before going out' }

  const hand = handForPlayer(hands, playerId)
  const byId = new Map(hand.map((c) => [c.id, c]))
  const meldCards: RummyCard[][] = []
  for (const meld of meldCardIds) {
    const cards: RummyCard[] = []
    for (const cid of meld) {
      const c = byId.get(cid)
      if (!c) return { error: 'A meld references a card not in your hand' }
      cards.push(c)
    }
    meldCards.push(cards)
  }
  const discard = discardCardId ? (byId.get(discardCardId) ?? null) : null
  if (discardCardId && !discard) return { error: 'Discard card is not in your hand' }

  const melds = buildRummyMelds(hand, meldCards, { discard })
  if (!melds) return { error: 'That is not a valid lay-down — every card must belong to a set or run' }

  // Empty the player's hand.
  const { error: hErr } = await supabase
    .from(RUMMY_HANDS)
    .update({ cards: [] })
    .eq('game_id', gameId)
    .eq('player_id', playerId)
  if (hErr) return { error: internalErrorMessage('rummy', hErr) }

  const discardPile = discard ? pushDiscard(session.discard_pile ?? [], discard) : (session.discard_pile ?? [])
  const topDiscard = discardPile[discardPile.length - 1] ?? null

  const { error: sErr } = await supabase
    .from(RUMMY_SESSIONS)
    .update({
      phase: 'finished',
      winner_player_id: playerId,
      winning_melds: melds,
      discard_pile: discardPile,
      top_discard: topDiscard,
      status_message: `${playerNameFrom(names, playerId)} went out and wins the round!`,
      turn_deadline_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
  if (sErr) return { error: internalErrorMessage('rummy', sErr) }

  await markGameFinished(supabase, gameId)
  return {}
}

async function finalizeByLowestHand(
  supabase: SupabaseClient,
  gameId: string,
  session: RummySession,
  hands: RummyPlayerHand[],
  names: Map<string, string>,
  reason: string
): Promise<{ error?: string }> {
  const winnerId = rummyPlacementOrder(hands, session.turn_order ?? [], null)[0] ?? null
  const winnerName = winnerId ? playerNameFrom(names, winnerId) : 'Nobody'
  const total = winnerId ? rummyHandSum(handForPlayer(hands, winnerId)) : 0
  const { error } = await supabase
    .from(RUMMY_SESSIONS)
    .update({
      phase: 'finished',
      winner_player_id: winnerId,
      status_message: `${reason} ${winnerName} wins on lowest hand total (${total}).`,
      turn_deadline_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
  if (error) return { error: internalErrorMessage('rummy', error) }
  await markGameFinished(supabase, gameId)
  return {}
}
