import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { clearSessionTables } from './session-clear'
import { markGameFinished } from '@/lib/game-finish'
import { secondsUntilDeadline } from '@/lib/round-timing'
import type { Game, RummyCard, RummyMeld, RummyPlayerHand, RummySession, RummySuit } from '@/types'

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

/** Per-turn deadline. `timerSeconds` = the host's per-player clock from `games.timer_seconds`. */
export function rummyTurnDeadline(timerSeconds: number): string | null {
  if (!timerSeconds || timerSeconds <= 0) return null
  return new Date(Date.now() + timerSeconds * 1000).toISOString()
}

export function rummySecondsLeft(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
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

/**
 * Placement order (1st → last).
 *
 * The declared winner (someone who went out) always ranks first. Everyone else is ordered
 * by "closest to going out" — the largest number of cards in their hand that could form
 * valid melds — so the timeout ending rewards a Rummy-ready hand rather than just holding
 * cheap cards. Ties are broken by fewest leftover deadwood, then fewer cards, then id
 * (stable).
 */
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
      return {
        playerId: h.player_id,
        meldable: maxMeldableCount(cards),
        handSum: rummyHandSum(cards),
        cardCount: cards.length,
      }
    })
    .sort((a, b) => {
      // More meldable cards = closer to going out = higher placement.
      if (a.meldable !== b.meldable) return b.meldable - a.meldable
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
// "Closest to going out" — timeout scoring
// ---------------------------------------------------------------------------

/**
 * Enumerate every valid meld that can be formed from `hand`. Small — a full hand of 11
 * cards yields at most a few dozen candidates because sets/runs are tightly constrained
 * (same rank, or consecutive same-suit).
 */
function candidateMelds(hand: RummyCard[]): RummyCard[][] {
  const out: RummyCard[][] = []
  // Sets (3 or 4 of a rank) — one per rank the hand actually holds.
  const byRank = new Map<number, RummyCard[]>()
  for (const c of hand) {
    const arr = byRank.get(c.rank) ?? []
    arr.push(c)
    byRank.set(c.rank, arr)
  }
  for (const [, cards] of byRank) {
    if (cards.length >= 3) {
      // Every 3-subset and, if we have four suits, the 4-set itself.
      for (let i = 0; i < cards.length; i += 1) {
        for (let j = i + 1; j < cards.length; j += 1) {
          for (let k = j + 1; k < cards.length; k += 1) {
            out.push([cards[i], cards[j], cards[k]])
          }
        }
      }
      if (cards.length === 4) out.push(cards.slice())
    }
  }
  // Runs (3+ consecutive same-suit) — for each suit, sort by rank and pull every
  // contiguous window of size 3..len that's actually consecutive.
  const bySuit = new Map<RummySuit, RummyCard[]>()
  for (const c of hand) {
    const arr = bySuit.get(c.suit) ?? []
    arr.push(c)
    bySuit.set(c.suit, arr)
  }
  for (const [, cards] of bySuit) {
    const sorted = [...cards].sort((a, b) => a.rank - b.rank)
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 2; j < sorted.length; j += 1) {
        // Window [i..j]: contiguous ranks only.
        let ok = true
        for (let k = i + 1; k <= j; k += 1) {
          if (sorted[k].rank !== sorted[k - 1].rank + 1) {
            ok = false
            break
          }
        }
        if (ok) out.push(sorted.slice(i, j + 1))
      }
    }
  }
  return out
}

/**
 * The maximum number of cards from `hand` that can be simultaneously assigned to a set
 * of non-overlapping valid melds. This is "how close is this player to going out": if it
 * equals `hand.length` they could have gone Rummy this turn; less means that many cards
 * are deadwood. Used for the timeout ranking.
 *
 * Correctness: exhaustive DFS over candidate melds; each meld uses a bitmask over hand
 * indices, and we only descend into melds disjoint from the running mask. Prunes on the
 * best-so-far bound so it's fast for realistic 6-11 card hands.
 */
export function maxMeldableCount(hand: RummyCard[]): number {
  if (hand.length < 3) return 0
  const idOf = new Map(hand.map((c, i) => [c.id, i]))
  const cands = candidateMelds(hand)
    .map((cards) => {
      let mask = 0
      for (const c of cards) mask |= 1 << (idOf.get(c.id) ?? 0)
      return { mask, size: cards.length }
    })
    // Bigger melds first so DFS finds strong baselines fast.
    .sort((a, b) => b.size - a.size)

  let best = 0
  const visited = new Set<number>()
  const dfs = (used: number, covered: number, start: number) => {
    if (covered > best) best = covered
    // Upper bound: even if every card not yet used could join a meld, would `covered`
    // plus those unused cards beat `best`? If not, prune this branch.
    if (covered + (hand.length - popcount(used)) <= best) return
    if (visited.has(used)) return
    visited.add(used)
    for (let i = start; i < cands.length; i += 1) {
      const { mask, size } = cands[i]
      if (mask & used) continue
      dfs(used | mask, covered + size, i + 1)
    }
  }
  dfs(0, 0, 0)
  return best
}

function popcount(x: number): number {
  let n = 0
  while (x) {
    n += x & 1
    x >>>= 1
  }
  return n
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

/** Deal a fresh game, seed session + hand rows, and post the opening status message.
 *  `shuffleArray(playerIds)` gives a random turn order every deal, so the first mover
 *  rotates naturally between games (checklist item #8 — no player is always first). */
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

  const [{ data: playerRows }, { data: gameRow }] = await Promise.all([
    supabase.from('players').select('id, name').eq('game_id', gameId),
    supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle(),
  ])
  const names = new Map<string, string>()
  for (const p of playerRows ?? []) names.set(p.id, p.name)
  const timerSeconds = gameRow?.timer_seconds ?? 0

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
    turn_deadline_at: rummyTurnDeadline(timerSeconds),
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

/**
 * Drop a leaver from an active Rummy round: remove them from turn_order, fix
 * current_turn_index, delete their hand, and — if fewer than 2 players remain —
 * finalize the round with the lone survivor as the winner. Modelled on
 * removeCrazyEightsPlayer. Rummy has no finish_order (the round ends the moment
 * someone goes out), so any leaver who wasn't already the declared winner is
 * simply dropped.
 */
export async function removeRummyPlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerName?: string
): Promise<{ error: string | null }> {
  const { data: sessionRaw } = await supabase.from(RUMMY_SESSIONS).select('*').eq('game_id', gameId).maybeSingle()
  const session = sessionRaw as RummySession | null

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
      update.turn_deadline_at = rummyTurnDeadline(timerSeconds)
    }

    const { error: sessionError } = await supabase.from(RUMMY_SESSIONS).update(update).eq('game_id', gameId)
    if (sessionError) return { error: internalErrorMessage('rummy', sessionError) }

    await supabase.from(RUMMY_HANDS).delete().eq('game_id', gameId).eq('player_id', playerId)
    if (finishing) await markGameFinished(supabase, gameId)
    const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
    return { error: error?.message ?? null }
  }

  await supabase.from(RUMMY_HANDS).delete().eq('game_id', gameId).eq('player_id', playerId)
  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  return { error: error?.message ?? null }
}

// Reads the session, hands, player names, and game-clock fields together. If any of the three
// required reads fails (session / hands / games row) we surface an `error` — treating a failed
// hands read as `[]` in a draw handler would let the session-claim + hand write overwrite the
// player's persisted hand with only the freshly drawn card. Player names are display-only, so
// pRes failures fall through with an empty map.
async function loadRummyState(
  supabase: SupabaseClient,
  gameId: string
): Promise<{
  session: RummySession | null
  hands: RummyPlayerHand[]
  names: Map<string, string>
  timerSeconds: number
  gameDurationSeconds: number
  sessionStartedAt: string | null
  error?: string
}> {
  const [sRes, hRes, pRes, gRes] = await Promise.all([
    supabase.from(RUMMY_SESSIONS).select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from(RUMMY_HANDS).select('*').eq('game_id', gameId).order('player_order'),
    supabase.from('players').select('id, name').eq('game_id', gameId),
    supabase
      .from('games')
      .select('timer_seconds, game_duration_seconds, session_started_at')
      .eq('id', gameId)
      .maybeSingle(),
  ])
  const names = new Map<string, string>()
  for (const p of pRes.data ?? []) names.set(p.id, p.name)
  const readError = sRes.error ?? hRes.error ?? gRes.error
  return {
    session: (sRes.data as RummySession | null) ?? null,
    hands: (hRes.data as RummyPlayerHand[]) ?? [],
    names,
    timerSeconds: gRes.data?.timer_seconds ?? 0,
    gameDurationSeconds: gRes.data?.game_duration_seconds ?? 0,
    sessionStartedAt: gRes.data?.session_started_at ?? null,
    ...(readError ? { error: internalErrorMessage('rummy', readError) } : {}),
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
  const state = await loadRummyState(supabase, gameId)
  if (state.error) return { error: state.error }
  const { session, hands, names, gameDurationSeconds, sessionStartedAt } = state
  if (!session) return { error: 'Rummy session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }
  const clockRes = await maybeFinalizeGameClock(
    supabase,
    gameId,
    session,
    hands,
    names,
    sessionStartedAt,
    gameDurationSeconds
  )
  if (clockRes.error) return { error: clockRes.error }
  if (clockRes.finalized) return {}
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
  const top = discardPile[discardPile.length - 1] ?? null

  // Claim the session row with an optimistic-concurrency check on `updated_at` BEFORE
  // touching the hand. Without this a stale request could win the hand write even when
  // a concurrent action already advanced the turn — the pattern the other card engines
  // (Crazy Eights / Whot) use.
  const { data: claim, error: sErr } = await supabase
    .from(RUMMY_SESSIONS)
    .update({
      draw_pile: drawPile,
      discard_pile: discardPile,
      top_discard: top,
      turn_step: 'discard',
      reshuffle_count: newReshuffle,
      status_message:
        source === 'discard'
          ? `${playerNameFrom(names, playerId)} took ${rummyCardLabel(card)} from the discard — now discarding`
          : `${playerNameFrom(names, playerId)} drew from the pile — now discarding`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('updated_at', session.updated_at)
    .select('game_id')
  if (sErr) return { error: internalErrorMessage('rummy', sErr) }
  if ((claim?.length ?? 0) === 0) return { error: 'Another action already updated this turn — try again' }

  const { error: hErr } = await supabase
    .from(RUMMY_HANDS)
    .update({ cards: newHand })
    .eq('game_id', gameId)
    .eq('player_id', playerId)
  if (hErr) return { error: internalErrorMessage('rummy', hErr) }
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
  const state = await loadRummyState(supabase, gameId)
  if (state.error) return { error: state.error }
  const { session, hands, names, timerSeconds, gameDurationSeconds, sessionStartedAt } = state
  if (!session) return { error: 'Rummy session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }
  const clockRes = await maybeFinalizeGameClock(
    supabase,
    gameId,
    session,
    hands,
    names,
    sessionStartedAt,
    gameDurationSeconds
  )
  if (clockRes.error) return { error: clockRes.error }
  if (clockRes.finalized) return {}
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
      status_message: `${playerNameFrom(names, playerId)} discarded ${rummyCardLabel(card)} · ${playerNameFrom(names, nextId)}'s turn`,
      turn_deadline_at: rummyTurnDeadline(timerSeconds),
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
  const state = await loadRummyState(supabase, gameId)
  if (state.error) return { error: state.error }
  const { session, hands, names, gameDurationSeconds, sessionStartedAt } = state
  if (!session) return { error: 'Rummy session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }
  const clockRes = await maybeFinalizeGameClock(
    supabase,
    gameId,
    session,
    hands,
    names,
    sessionStartedAt,
    gameDurationSeconds
  )
  if (clockRes.error) return { error: clockRes.error }
  if (clockRes.finalized) return {}
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

/** If the whole-game clock ran out, finalize by lowest hand total and return true so the
 *  caller stops. Runs before every action processor — server clock is the source of truth
 *  so a stale/skewed client can't extend the game past the buzzer. */
// `finalized: true` means the game clock ran out and the row flipped to finished.
// `finalized: false, error: undefined` means the clock has not expired yet — normal case,
// carry on with the caller's action. `error` means expired but the finalizing write failed —
// caller must NOT continue as if the round were still in progress, and must NOT report the
// action as done. Distinguishing these three cases stops a downstream draw/discard from
// racing a stale (should-be-finished) session, and stops the expire route from lying to the
// client about a finalize that never persisted.
async function maybeFinalizeGameClock(
  supabase: SupabaseClient,
  gameId: string,
  session: RummySession,
  hands: RummyPlayerHand[],
  names: Map<string, string>,
  sessionStartedAt: string | null,
  gameDurationSeconds: number
): Promise<{ finalized: boolean; error?: string }> {
  if (!rummyGameSessionExpired(sessionStartedAt, gameDurationSeconds)) return { finalized: false }
  const res = await finalizeByLowestHand(supabase, gameId, session, hands, names, "Time's up!")
  if (res.error) return { finalized: false, error: res.error }
  return { finalized: true }
}

/**
 * Auto-play the current player's turn when their clock hit zero.
 *   - draw step: draw one card from the pile (or discard if the pile is empty), then
 *     auto-discard the first card in the resulting hand
 *   - discard step: auto-discard the first card in the hand
 * Then the discard processor advances the turn to the next player with a fresh deadline.
 * Only acts once the deadline has genuinely passed (server clock) — any client may poke.
 */
export async function processRummyExpireTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; skipped?: boolean }> {
  const state = await loadRummyState(supabase, gameId)
  if (state.error) return { error: state.error }
  const { session, hands, names, gameDurationSeconds, sessionStartedAt } = state
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { skipped: true }
  const clockRes = await maybeFinalizeGameClock(
    supabase,
    gameId,
    session,
    hands,
    names,
    sessionStartedAt,
    gameDurationSeconds
  )
  if (clockRes.error) return { error: clockRes.error }
  if (clockRes.finalized) return {}
  if (!session.turn_deadline_at || new Date(session.turn_deadline_at) > new Date()) {
    return { skipped: true }
  }
  const currentId = currentPlayerId(session)
  if (!currentId) return { error: 'No current player' }

  if (session.turn_step === 'draw') {
    const dr = await processRummyDraw(supabase, gameId, currentId, 'pile')
    if (dr.error) return { error: dr.error }
    // The auto-draw can legitimately end the round (empty deck + reshuffle cap hit) —
    // calling processRummyDiscard against a finished session would return "Game is
    // finished" as an error and misreport the successful finalization.
    const after = await loadRummyState(supabase, gameId)
    if (after.error) return { error: after.error }
    if (!after.session || after.session.phase === 'finished') return {}
  }
  // After the draw the turn_step is 'discard' — auto-discard the first hand card.
  const after2 = await loadRummyState(supabase, gameId)
  if (after2.error) return { error: after2.error }
  const hands2 = after2.hands
  const hand = handForPlayer(hands2, currentId)
  const first = hand[0]
  if (!first) return { skipped: true }
  const dc = await processRummyDiscard(supabase, gameId, currentId, first.id)
  if (dc.error) return { error: dc.error }
  return {}
}

/** Called by the /api/games/[code]/expire-rummy route — server clock has passed the
 *  whole-game deadline; end the round by lowest hand total. Idempotent. */
export async function finishExpiredRummyGame(
  supabase: SupabaseClient,
  game: Pick<Game, 'id' | 'status' | 'session_started_at' | 'game_duration_seconds'>
): Promise<boolean> {
  if (game.status !== 'active') return false
  if (!rummyGameSessionExpired(game.session_started_at, game.game_duration_seconds)) return false
  const state = await loadRummyState(supabase, game.id)
  // A required-read failure is NOT "finished" — return false so the route retries next tick
  // instead of telling the client the game ended.
  if (state.error) return false
  const { session, hands, names } = state
  if (!session) return false
  const res = await finalizeByLowestHand(supabase, game.id, session, hands, names, "Time's up!")
  // Propagate a finalize failure — the route caller reads this to decide whether the
  // expired game actually flipped to finished. Returning true on failure would tell
  // the client the game finished while the row is still active.
  return !res.error
}

/** End the round without a "Rummy" declaration — ranks everyone by closest-to-going-out
 *  (see rummyPlacementOrder) so the winner is the player with the most meld-able cards,
 *  not just the one holding the cheapest junk. */
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
  const winnerHand = winnerId ? handForPlayer(hands, winnerId) : []
  const meldable = maxMeldableCount(winnerHand)
  const detail =
    winnerHand.length === 0 ? 'empty hand' : `closest to going out (${meldable}/${winnerHand.length} cards would meld)`
  const { error } = await supabase
    .from(RUMMY_SESSIONS)
    .update({
      phase: 'finished',
      winner_player_id: winnerId,
      status_message: `${reason} ${winnerName} wins — ${detail}.`,
      turn_deadline_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
  if (error) return { error: internalErrorMessage('rummy', error) }
  // markGameFinished flips games.status from 'active' → 'finished'. If THAT write fails the
  // rummy_sessions row is already finished but games.status is still active — game-tick would
  // keep poking the expire route while the client sees a finished session. Propagate so the
  // caller returns false and the route retries next tick instead of misreporting success.
  const finish = await markGameFinished(supabase, gameId)
  if (finish.error) return { error: internalErrorMessage('rummy', finish.error) }
  return {}
}
