import type { GoFishCard, GoFishEvent, GoFishPlayerHand, GoFishRank, GoFishSession, GoFishSuit } from '@/types'

export const GOFISH_MIN_PLAYERS = 2
export const GOFISH_MAX_PLAYERS = 6
export const GOFISH_DEFAULT_MAX_PLAYERS = 4

/** Standard deal per Go Fish rules: 7 cards for 2 players, 5 for 3+. */
export function gofishDealCount(playerCount: number): number {
  return playerCount <= 2 ? 7 : 5
}

/** Standard refill draw when a player empties their hand while the ocean still has cards. */
export const GOFISH_REFILL_TARGET = 5

/** Default per-turn seconds. Configurable per game via games.timer_seconds. */
export const GOFISH_DEFAULT_TIMER_SECONDS = 45
export const GOFISH_TIMER_OPTIONS = [0, 30, 45, 60, 90, 120] as const

/** Whole-game session length (seconds). 0 = no limit.
 *  Go Fish plays fast — a full round in a 4-6-player room usually lands in 10-20 min,
 *  so the option list caps at 30 min rather than the 1hr the earlier draft copied from
 *  Whot. Anything longer felt aspirational. */
export const GOFISH_GAME_DURATION_OPTIONS = [0, 300, 600, 900, 1200, 1800] as const

export function clampGofishGameDuration(raw: unknown): number {
  const n = Number(raw ?? 0)
  return (GOFISH_GAME_DURATION_OPTIONS as readonly number[]).includes(n) ? n : 0
}

export function formatGofishGameDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return 'No limit'
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 === 1 ? '' : 's'}`
  return `${Math.round(seconds / 60)} minutes`
}

/**
 * True when the session has been running longer than its configured duration. Used by the
 * ask + expire-turn handlers to end the game by most-books-wins when the clock runs out —
 * `resolveWinner` already tiebreaks by fewest cards, which is exactly the rule.
 */
export function gofishGameSessionExpired(
  sessionStartedAt: string | null | undefined,
  durationSeconds: number | null | undefined,
  now: Date = new Date()
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  if (!sessionStartedAt) return false
  const startMs = new Date(sessionStartedAt).getTime()
  if (Number.isNaN(startMs)) return false
  return now.getTime() >= startMs + durationSeconds * 1000
}

/** ISO deadline `seconds` from now, or null when no timer is configured. */
export function gofishTurnDeadline(timerSeconds: number, now: Date = new Date()): string | null {
  if (!timerSeconds || timerSeconds <= 0) return null
  return new Date(now.getTime() + timerSeconds * 1000).toISOString()
}

/**
 * On expiry, pick a legal auto-ask for the current player: any rank they hold, targeting
 * any opponent with cards. Returns null when the player has no cards (turn just passes),
 * no legal target (nobody else has cards), or no askable rank.
 */
export function pickAutoAsk(
  hand: GoFishCard[],
  opponentCardCounts: Map<string, number>,
  rng: () => number = Math.random
): { targetPlayerId: string; rank: GoFishRank } | null {
  const ranks = askableRanks(hand)
  if (ranks.length === 0) return null
  const targets = [...opponentCardCounts.entries()].filter(([, count]) => count > 0).map(([id]) => id)
  if (targets.length === 0) return null
  const rank = ranks[Math.floor(rng() * ranks.length)]
  const target = targets[Math.floor(rng() * targets.length)]
  return { targetPlayerId: target, rank }
}

export const GOFISH_SUITS: GoFishSuit[] = ['spades', 'hearts', 'diamonds', 'clubs']
export const GOFISH_RANKS: GoFishRank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

const RANK_LABELS: Record<GoFishRank, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
}

const RANK_PLURALS: Record<GoFishRank, string> = {
  1: 'Aces',
  2: '2s',
  3: '3s',
  4: '4s',
  5: '5s',
  6: '6s',
  7: '7s',
  8: '8s',
  9: '9s',
  10: '10s',
  11: 'Jacks',
  12: 'Queens',
  13: 'Kings',
}

export function gofishRankLabel(rank: GoFishRank): string {
  return RANK_LABELS[rank]
}

export function gofishRankPlural(rank: GoFishRank): string {
  return RANK_PLURALS[rank]
}

/** Build a full 52-card deck. Ids are deterministic so tests can diff snapshots. */
export function buildGoFishDeck(): GoFishCard[] {
  const cards: GoFishCard[] = []
  for (const suit of GOFISH_SUITS) {
    for (const rank of GOFISH_RANKS) {
      cards.push({ id: `${suit}-${rank}`, suit, rank })
    }
  }
  return cards
}

/** Fisher–Yates shuffle. `rng` defaults to Math.random; tests can pass a seeded generator. */
export function shuffleDeck<T>(cards: T[], rng: () => number = Math.random): T[] {
  const next = [...cards]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

/** Result of dealing an initial round. */
export type GoFishDealResult = {
  hands: Record<string, GoFishCard[]>
  /** Books auto-completed at deal time (rare but possible). */
  initialBooks: Record<string, GoFishRank[]>
  ocean: GoFishCard[]
}

/**
 * Deal a fresh round. Each player receives `gofishDealCount(playerCount)` cards; any
 * ranks they happen to already hold as a full set of 4 are removed and counted as
 * an initial book so the session begins in a consistent state.
 */
export function dealGoFish(playerIds: string[], deck: GoFishCard[]): GoFishDealResult {
  const perPlayer = gofishDealCount(playerIds.length)
  if (deck.length < perPlayer * playerIds.length) {
    throw new Error('Deck too small to deal Go Fish for this player count')
  }
  const ocean = [...deck]
  const hands: Record<string, GoFishCard[]> = {}
  const initialBooks: Record<string, GoFishRank[]> = {}
  for (const playerId of playerIds) {
    hands[playerId] = []
    initialBooks[playerId] = []
  }
  for (let i = 0; i < perPlayer; i += 1) {
    for (const playerId of playerIds) {
      const card = ocean.shift()
      if (!card) break
      hands[playerId].push(card)
    }
  }
  for (const playerId of playerIds) {
    const { hand, books } = extractBooks(hands[playerId])
    hands[playerId] = hand
    initialBooks[playerId] = books
  }
  return { hands, initialBooks, ocean }
}

/**
 * Any rank the player holds all four of is a completed book. Returns the trimmed hand
 * plus the newly-completed rank list.
 */
export function extractBooks(hand: GoFishCard[]): { hand: GoFishCard[]; books: GoFishRank[] } {
  const counts = countRanks(hand)
  const books: GoFishRank[] = []
  const kept: GoFishCard[] = []
  for (const card of hand) {
    if (counts.get(card.rank) === 4) continue
    kept.push(card)
  }
  for (const [rank, count] of counts) {
    if (count === 4) books.push(rank)
  }
  books.sort((a, b) => a - b)
  return { hand: kept, books }
}

export function countRanks(hand: GoFishCard[]): Map<GoFishRank, number> {
  const counts = new Map<GoFishRank, number>()
  for (const card of hand) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1)
  }
  return counts
}

export function playerHasRank(hand: GoFishCard[], rank: GoFishRank): boolean {
  return hand.some((card) => card.rank === rank)
}

/** Ranks the player is legally allowed to ask about — any rank they hold at least one of. */
export function askableRanks(hand: GoFishCard[]): GoFishRank[] {
  const set = new Set<GoFishRank>()
  for (const card of hand) set.add(card.rank)
  return [...set].sort((a, b) => a - b)
}

/**
 * Advance `current_turn_index` past any player who is fully out (no cards, no ocean to draw
 * from). Skips inactive slots and wraps around. Returns the same index if nobody is active.
 */
export function nextActiveTurnIndex(
  turnOrder: string[],
  fromIndex: number,
  isActive: (playerId: string) => boolean
): number {
  if (turnOrder.length === 0) return 0
  for (let step = 1; step <= turnOrder.length; step += 1) {
    const idx = (fromIndex + step) % turnOrder.length
    if (isActive(turnOrder[idx])) return idx
  }
  return fromIndex
}

export function currentPlayerId(session: Pick<GoFishSession, 'turn_order' | 'current_turn_index'>): string | null {
  return session.turn_order[session.current_turn_index] ?? null
}

/**
 * Result of resolving one ask. Pure — callers persist the mutations themselves.
 *
 * `mutations` holds the exact fields to overwrite for each affected hand and the session.
 * `events` are appended to the session log in order.
 */
export type GoFishAskInput = {
  session: GoFishSession
  hands: GoFishPlayerHand[]
  fromPlayerId: string
  targetPlayerId: string
  rank: GoFishRank
  now: string
}

export type GoFishAskResult =
  | {
      ok: false
      error: 'not_your_turn' | 'game_finished' | 'unknown_target' | 'ask_self' | 'target_no_cards' | 'must_hold_rank'
    }
  | {
      ok: true
      /** True if the target had at least one of the asked rank. */
      hit: boolean
      /** True if the asker draws again (hit, or lucky draw on a miss). */
      sameTurn: boolean
      /** Cards transferred asker ← target (hit) or drawn from ocean (miss). Empty if none. */
      transferred: GoFishCard[]
      /** Any books completed by the asker as a result of this action. */
      newBooks: GoFishRank[]
      /** Events to append to session.event_log, in order. */
      events: GoFishEvent[]
      /** New session state (turn pointer, ocean, event log, phase, finish order). */
      session: GoFishSession
      /** New hand + book state for every affected player. */
      handUpdates: Array<{ playerId: string; cards: GoFishCard[]; books: GoFishRank[] }>
    }

function isPlayerActive(hand: GoFishPlayerHand | undefined, oceanCount: number): boolean {
  if (!hand) return false
  const cards = hand.cards ?? []
  if (cards.length > 0) return true
  return oceanCount > 0
}

function toRecord(hands: GoFishPlayerHand[]): Map<string, GoFishPlayerHand> {
  return new Map(hands.map((h) => [h.player_id, h]))
}

/**
 * Refill result — used by the "draw a fresh hand" flow when the active player starts their
 * turn with 0 cards while the ocean still has cards. Same shape as an ask, minus target.
 */
export type GoFishRefillInput = {
  session: GoFishSession
  hands: GoFishPlayerHand[]
  playerId: string
  now: string
}

export type GoFishRefillResult =
  | { ok: false; error: 'game_finished' | 'not_your_turn' | 'unknown_player' | 'hand_not_empty' | 'ocean_empty' }
  | {
      ok: true
      drawn: GoFishCard[]
      newBooks: GoFishRank[]
      events: GoFishEvent[]
      session: GoFishSession
      handUpdate: { playerId: string; cards: GoFishCard[]; books: GoFishRank[] }
    }

/**
 * Draw up to REFILL_TARGET (5) from the ocean for a player who starts their turn with an
 * empty hand. This is the "you draw a fresh hand to stay in the game" rule — when a
 * physical game player runs out mid-turn and the ocean still has cards, they draw again.
 *
 * Idempotent: returns `hand_not_empty` if the player still has cards; `ocean_empty` if
 * nothing to draw. Does NOT advance the turn — the same player asks after the refill.
 */
export function resolveGoFishRefill(input: GoFishRefillInput): GoFishRefillResult {
  const { session, hands, playerId, now } = input
  if (session.phase === 'finished') return { ok: false, error: 'game_finished' }
  if (currentPlayerId(session) !== playerId) return { ok: false, error: 'not_your_turn' }
  const handRow = hands.find((h) => h.player_id === playerId)
  if (!handRow) return { ok: false, error: 'unknown_player' }
  const currentCards = (handRow.cards ?? []) as GoFishCard[]
  if (currentCards.length > 0) return { ok: false, error: 'hand_not_empty' }
  if (session.ocean.length === 0) return { ok: false, error: 'ocean_empty' }

  const ocean = [...session.ocean]
  const take = Math.min(GOFISH_REFILL_TARGET, ocean.length)
  const drawn = ocean.splice(0, take)
  const after = extractBooks(drawn)
  const events: GoFishEvent[] = []
  events.push({ kind: 'refill', player_id: playerId, count: drawn.length, at: now })
  for (const bookRank of after.books) {
    events.push({ kind: 'book', player_id: playerId, rank: bookRank, at: now })
  }
  const nextSession: GoFishSession = {
    ...session,
    ocean,
    ocean_count: ocean.length,
    event_log: [...session.event_log, ...events],
    updated_at: now,
  }
  return {
    ok: true,
    drawn,
    newBooks: after.books,
    events,
    session: nextSession,
    handUpdate: {
      playerId,
      cards: after.hand,
      books: [...(handRow.books ?? []), ...after.books].sort((a, b) => a - b) as GoFishRank[],
    },
  }
}

/**
 * Resolve one ask. Server-authoritative — validates turn, target, and "you must hold the
 * rank you ask for" (the standard house rule). Applies transfer or Go-Fish-draw, extracts
 * newly-completed books, refills the asker's hand if it empties while the ocean still has
 * cards, and advances the turn pointer if play passes.
 */
export function resolveGoFishAsk(input: GoFishAskInput): GoFishAskResult {
  const { session, hands, fromPlayerId, targetPlayerId, rank, now } = input
  if (session.phase === 'finished') return { ok: false, error: 'game_finished' }
  if (fromPlayerId === targetPlayerId) return { ok: false, error: 'ask_self' }
  if (currentPlayerId(session) !== fromPlayerId) return { ok: false, error: 'not_your_turn' }

  const handMap = toRecord(hands)
  const asker = handMap.get(fromPlayerId)
  const target = handMap.get(targetPlayerId)
  if (!asker || !target) return { ok: false, error: 'unknown_target' }

  const askerCards = [...(asker.cards ?? [])]
  const targetCards = [...(target.cards ?? [])]

  if (!playerHasRank(askerCards, rank)) return { ok: false, error: 'must_hold_rank' }
  if (targetCards.length === 0) return { ok: false, error: 'target_no_cards' }

  const events: GoFishEvent[] = []
  const handUpdates: Array<{ playerId: string; cards: GoFishCard[]; books: GoFishRank[] }> = []
  const ocean = [...session.ocean]
  let sameTurn = false
  let hit = false
  let transferred: GoFishCard[] = []

  const matching = targetCards.filter((c) => c.rank === rank)
  if (matching.length > 0) {
    hit = true
    sameTurn = true
    transferred = matching
    const remainingTarget = targetCards.filter((c) => c.rank !== rank)
    const nextAskerCards = [...askerCards, ...matching]
    events.push({
      kind: 'ask_hit',
      from_id: fromPlayerId,
      target_id: targetPlayerId,
      rank,
      count: matching.length,
      at: now,
    })

    const askerAfter = extractBooks(nextAskerCards)
    for (const bookRank of askerAfter.books) {
      events.push({ kind: 'book', player_id: fromPlayerId, rank: bookRank, at: now })
    }
    handUpdates.push({
      playerId: fromPlayerId,
      cards: askerAfter.hand,
      books: [...asker.books, ...askerAfter.books].sort((a, b) => a - b),
    })
    handUpdates.push({
      playerId: targetPlayerId,
      cards: remainingTarget,
      books: [...target.books],
    })
  } else {
    // Go Fish — draw the top card from the ocean, if any.
    const drawn = ocean.shift() ?? null
    events.push({
      kind: 'ask_miss',
      from_id: fromPlayerId,
      target_id: targetPlayerId,
      rank,
      lucky_draw: drawn !== null && drawn.rank === rank,
      drew: drawn !== null,
      at: now,
    })
    let nextAskerCards = askerCards
    if (drawn) {
      nextAskerCards = [...askerCards, drawn]
      transferred = [drawn]
      if (drawn.rank === rank) sameTurn = true
    }
    const askerAfter = extractBooks(nextAskerCards)
    for (const bookRank of askerAfter.books) {
      events.push({ kind: 'book', player_id: fromPlayerId, rank: bookRank, at: now })
    }
    handUpdates.push({
      playerId: fromPlayerId,
      cards: askerAfter.hand,
      books: [...asker.books, ...askerAfter.books].sort((a, b) => a - b),
    })
  }

  // Refill: any player whose hand empties while the ocean has cards draws up to REFILL_TARGET.
  const refillOrder = [fromPlayerId, targetPlayerId]
  for (const playerId of refillOrder) {
    const update = handUpdates.find((u) => u.playerId === playerId)
    const currentCards = update ? update.cards : (handMap.get(playerId)?.cards ?? [])
    if (currentCards.length > 0) continue
    if (ocean.length === 0) {
      events.push({ kind: 'out_of_cards', player_id: playerId, at: now })
      continue
    }
    const take = Math.min(GOFISH_REFILL_TARGET, ocean.length)
    const drawn = ocean.splice(0, take)
    const combined = [...currentCards, ...drawn]
    const after = extractBooks(combined)
    for (const bookRank of after.books) {
      events.push({ kind: 'book', player_id: playerId, rank: bookRank, at: now })
    }
    const existingBooks = update ? update.books : (handMap.get(playerId)?.books ?? [])
    const merged = { playerId, cards: after.hand, books: [...existingBooks, ...after.books].sort((a, b) => a - b) }
    if (update) {
      update.cards = merged.cards
      update.books = merged.books
    } else {
      handUpdates.push(merged)
    }
    events.push({ kind: 'refill', player_id: playerId, count: drawn.length, at: now })
  }

  // Build post-move hand snapshot for turn advancement + end detection.
  const postHands: GoFishPlayerHand[] = hands.map((h) => {
    const update = handUpdates.find((u) => u.playerId === h.player_id)
    if (!update) return h
    return { ...h, cards: update.cards, books: update.books }
  })

  // Track finish_order: any player that just went from having cards to having none with an
  // empty ocean is finished for this session.
  const finishOrder = [...session.finish_order]
  for (const playerId of refillOrder) {
    if (finishOrder.includes(playerId)) continue
    const post = postHands.find((h) => h.player_id === playerId)
    const cards = post?.cards ?? []
    if (cards.length === 0 && ocean.length === 0) {
      finishOrder.push(playerId)
    }
  }

  const finished = isGameOver({ hands: postHands, ocean })
  const nextTurnIndex = sameTurn
    ? session.current_turn_index
    : nextActiveTurnIndex(session.turn_order, session.current_turn_index, (pid) => {
        const h = postHands.find((r) => r.player_id === pid)
        return isPlayerActive(h, ocean.length)
      })

  if (finished) {
    events.push({ kind: 'game_over', at: now })
  }

  const newSession: GoFishSession = {
    ...session,
    ocean,
    ocean_count: ocean.length,
    current_turn_index: nextTurnIndex,
    event_log: [...session.event_log, ...events],
    phase: finished ? 'finished' : 'playing',
    finish_order: finishOrder,
    winner_player_id: finished ? resolveWinner(postHands) : session.winner_player_id,
    updated_at: now,
  }

  return {
    ok: true,
    hit,
    sameTurn,
    transferred,
    newBooks: handUpdates.find((u) => u.playerId === fromPlayerId)!.books.filter((r) => !asker.books.includes(r)),
    events,
    session: newSession,
    handUpdates,
  }
}

/** All 13 books claimed, OR nobody has any cards and the ocean is empty. */
export function isGameOver(state: { hands: GoFishPlayerHand[]; ocean: GoFishCard[] }): boolean {
  const totalBooks = state.hands.reduce((sum, h) => sum + h.books.length, 0)
  if (totalBooks >= GOFISH_RANKS.length) return true
  if (state.ocean.length > 0) return false
  return state.hands.every((h) => (h.cards ?? []).length === 0)
}

/**
 * Winner id — most books, ties broken by fewest remaining cards then player id (stable).
 * Returns null on an empty hand list.
 */
export function resolveWinner(hands: GoFishPlayerHand[]): string | null {
  if (hands.length === 0) return null
  // Nobody has completed a book: no winner. This catches the "start-and-immediately-end"
  // case (host ends game before any books are made) as well as any premature-finish
  // scenario — declaring the alphabetically-first player the winner in that state
  // reads as arbitrary and unearned.
  const anyBooks = hands.some((h) => h.books.length > 0)
  if (!anyBooks) return null
  const ranked = [...hands].sort((a, b) => {
    if (b.books.length !== a.books.length) return b.books.length - a.books.length
    const aCards = (a.cards ?? []).length
    const bCards = (b.cards ?? []).length
    if (aCards !== bCards) return aCards - bCards
    return a.player_id.localeCompare(b.player_id)
  })
  return ranked[0]?.player_id ?? null
}

export type GoFishStanding = {
  playerId: string
  name: string
  books: number
  cardCount: number
  rank: number
}

export function buildGoFishStandings(
  hands: GoFishPlayerHand[],
  players: { id: string; name: string }[]
): GoFishStanding[] {
  const byId = new Map(hands.map((h) => [h.player_id, h]))
  const rows = players
    .map((p) => {
      const hand = byId.get(p.id)
      return {
        playerId: p.id,
        name: p.name,
        books: hand?.books.length ?? 0,
        cardCount: (hand?.cards ?? []).length,
      }
    })
    .sort((a, b) => {
      if (b.books !== a.books) return b.books - a.books
      if (a.cardCount !== b.cardCount) return a.cardCount - b.cardCount
      return a.playerId.localeCompare(b.playerId)
    })
  return rows.map((r, i) => ({ ...r, rank: i + 1 }))
}

/** Simple label helper for the event log UI. Renders one line per event. */
export function describeGoFishEvent(event: GoFishEvent, nameOf: (playerId: string) => string): string {
  switch (event.kind) {
    case 'ask_hit':
      return `${nameOf(event.from_id)} asked ${nameOf(event.target_id)} for ${gofishRankPlural(
        event.rank
      )} — handed over ${event.count}.`
    case 'ask_miss':
      if (!event.drew) {
        return `${nameOf(event.from_id)} asked ${nameOf(event.target_id)} for ${gofishRankPlural(
          event.rank
        )} — Go Fish! (ocean empty)`
      }
      return event.lucky_draw
        ? `${nameOf(event.from_id)} asked ${nameOf(event.target_id)} for ${gofishRankPlural(
            event.rank
          )} — Go Fish! Drew a ${gofishRankLabel(event.rank)}, goes again.`
        : `${nameOf(event.from_id)} asked ${nameOf(event.target_id)} for ${gofishRankPlural(event.rank)} — Go Fish!`
    case 'book':
      return `${nameOf(event.player_id)} completed a book of ${gofishRankPlural(event.rank)}.`
    case 'refill':
      return `${nameOf(event.player_id)} refilled with ${event.count} card${event.count === 1 ? '' : 's'}.`
    case 'out_of_cards':
      return `${nameOf(event.player_id)} is out of cards.`
    case 'game_over':
      return 'Game over.'
  }
}
