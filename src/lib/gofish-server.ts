import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { clearSessionTables } from '@/lib/session-clear'
import { markGameFinished } from '@/lib/game-finish'
import {
  buildGoFishDeck,
  currentPlayerId,
  dealGoFish,
  gofishGameSessionExpired,
  gofishTurnDeadline,
  pickAutoAsk,
  resolveGoFishAsk,
  resolveWinner,
  shuffleDeck,
  type GoFishAskResult,
} from '@/lib/gofish'
import type { GoFishCard, GoFishEvent, GoFishPlayerHand, GoFishRank, GoFishSession } from '@/types'

/**
 * Seed the game's tables with a fresh Go Fish round.
 *
 * Called from GAME_START_SPECS.gofish on POST /api/games/[code]/start. The turn
 * order is a randomised shuffle of the seated player ids; the deck is built and
 * shuffled once, then dealt per the standard rule (7 for 2 players, 5 for 3+).
 */
export async function initializeGoFishGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  if (playerIds.length < 2) return { error: 'Need at least 2 players' }
  const { data: gameRow } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
  const timerSeconds = (gameRow?.timer_seconds ?? 0) as number

  const turnOrder = shuffleDeck(playerIds)
  const deck = shuffleDeck(buildGoFishDeck())
  const { hands, initialBooks, ocean } = dealGoFish(turnOrder, deck)

  const now = new Date().toISOString()
  const sessionRow: Partial<GoFishSession> = {
    game_id: gameId,
    turn_order: turnOrder,
    current_turn_index: 0,
    phase: 'playing',
    ocean,
    ocean_count: ocean.length,
    event_log: [],
    status_message: null,
    winner_player_id: null,
    finish_order: [],
    turn_deadline_at: gofishTurnDeadline(timerSeconds),
    created_at: now,
    updated_at: now,
  }

  const { error: sessionError } = await supabase.from('gofish_sessions').insert(sessionRow)
  if (sessionError) return { error: internalErrorMessage('gofish', sessionError) }

  const handRows = turnOrder.map((playerId, index) => ({
    game_id: gameId,
    player_id: playerId,
    cards: hands[playerId],
    books: initialBooks[playerId],
    player_order: index,
  }))
  const { error: handsError } = await supabase.from('gofish_player_hands').insert(handRows)
  if (handsError) return { error: internalErrorMessage('gofish', handsError) }

  return {}
}

/** Wipe session + hand tables so play-again starts clean. */
export async function clearGoFishSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['gofish_sessions', 'gofish_player_hands'], {
    resetSpectators: true,
  })
}

type LoadedState = {
  session: GoFishSession | null
  hands: GoFishPlayerHand[]
}

/**
 * Server-side state load.
 *
 * A failed hands query is returned as `{ error }`, never silently mapped to an empty
 * array. Empty hands are a valid successful result ("this game has no players yet"),
 * but a transient DB error is not — we saw the Rummy pattern where a failed read let
 * the action handler build a fresh empty hand and overwrite the real one. Callers
 * must abort the action on error rather than persist anything.
 */
async function loadGameState(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string } & Partial<LoadedState>> {
  const [sessionRes, handsRes] = await Promise.all([
    supabase.from('gofish_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('gofish_player_hands').select('*').eq('game_id', gameId).order('player_order'),
  ])
  if (sessionRes.error) return { error: internalErrorMessage('gofish', sessionRes.error) }
  if (handsRes.error) return { error: internalErrorMessage('gofish', handsRes.error) }
  return {
    session: (sessionRes.data as GoFishSession | null) ?? null,
    hands: ((handsRes.data as GoFishPlayerHand[] | null) ?? []).map((h) => ({
      ...h,
      // Server load carries the real hand; clients should always go through /api/gofish/hands.
      cards: (h.cards as GoFishCard[] | null) ?? [],
      books: (h.books ?? []) as GoFishRank[],
    })),
  }
}

/**
 * Server-authoritative ask handler.
 *
 * Loads state, defers to the pure `resolveGoFishAsk` for all rules + mutations,
 * then persists the session and every changed hand. When the game ends here we
 * flip the game row to `finished` via markGameFinished so trophies + community
 * leaderboard hooks fire exactly once.
 */
export async function processGoFishAsk(
  supabase: SupabaseClient,
  gameId: string,
  fromPlayerId: string,
  targetPlayerId: string,
  rank: GoFishRank
): Promise<{ error?: string; result?: GoFishAskResult }> {
  const loaded = await loadGameState(supabase, gameId)
  if (loaded.error) return { error: loaded.error }
  const { session, hands } = loaded
  if (!session) return { error: 'Session not found' }

  // Whole-game clock takes precedence over the ask: if the session buzzer has sounded,
  // finalize by most-books-wins instead of accepting another turn's mutation.
  const finalized = await finalizeIfSessionExpired(supabase, gameId, session, hands ?? [])
  if (finalized.error) return { error: finalized.error }
  if (finalized.ok) return { error: "Time's up" }

  const now = new Date().toISOString()
  const result = resolveGoFishAsk({
    session,
    hands: hands ?? [],
    fromPlayerId,
    targetPlayerId,
    rank,
    now,
  })
  if (!result.ok) return { error: askErrorMessage(result.error) }

  const { session: nextSession, handUpdates } = result

  // Refresh the deadline on every write: whether the same player goes again or the turn passes,
  // the new active player gets a fresh clock. Cleared when the game finishes.
  const { data: gameRow } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
  const timerSeconds = (gameRow?.timer_seconds ?? 0) as number
  const nextDeadline = nextSession.phase === 'finished' ? null : gofishTurnDeadline(timerSeconds)

  // Optimistic concurrency: claim the session row on its loaded `updated_at`. Two concurrent
  // asks against the same snapshot would otherwise both pass the phase check and both write
  // stale hand mutations on top of each other. `.select('game_id')` forces the write to
  // return the affected row so we can detect the losing claim; the loser aborts before any
  // hand write, and the client re-fetches and retries with the fresh state.
  const { data: claimed, error: sessionError } = await supabase
    .from('gofish_sessions')
    .update({
      current_turn_index: nextSession.current_turn_index,
      phase: nextSession.phase,
      ocean: nextSession.ocean,
      ocean_count: nextSession.ocean_count,
      event_log: nextSession.event_log,
      status_message: nextSession.status_message,
      winner_player_id: nextSession.winner_player_id,
      finish_order: nextSession.finish_order,
      turn_deadline_at: nextDeadline,
      updated_at: nextSession.updated_at,
    })
    .eq('game_id', gameId)
    .eq('updated_at', session.updated_at)
    .select('game_id')
  if (sessionError) return { error: internalErrorMessage('gofish', sessionError) }
  if (!claimed || claimed.length === 0) {
    return { error: 'Session changed by another request — please retry' }
  }

  for (const update of handUpdates) {
    const { error: handError } = await supabase
      .from('gofish_player_hands')
      .update({ cards: update.cards, books: update.books })
      .eq('game_id', gameId)
      .eq('player_id', update.playerId)
    if (handError) return { error: internalErrorMessage('gofish', handError) }
  }

  if (nextSession.phase === 'finished') {
    const finishResult = await markGameFinished(supabase, gameId, nextSession.updated_at, { onlyIfActive: true })
    // markGameFinished's error carries the persistence failure — propagate it so the caller
    // doesn't report success while the games row is still `active`.
    if (finishResult?.error) return { error: internalErrorMessage('gofish', finishResult.error) }
  }

  return { result }
}

/**
 * Auto-play when the current player's turn timer runs out.
 *
 * Picks a random legal ask from the current player's hand + a random target with cards.
 * Idempotent: only acts if the deadline has genuinely passed AND the game is still active.
 * Passes the turn without side effects when the player has no cards (they'd refill on the
 * next legal turn) or no valid target exists.
 */
export async function processGoFishExpireTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; skipped?: boolean }> {
  const loaded = await loadGameState(supabase, gameId)
  if (loaded.error) return { error: loaded.error }
  const { session, hands = [] } = loaded
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { skipped: true }

  // Session buzzer beats the turn buzzer: check the whole-game clock first, so a room
  // that's timed out never auto-plays another turn on top of the finished state.
  const finalized = await finalizeIfSessionExpired(supabase, gameId, session, hands)
  if (finalized.error) return { error: finalized.error }
  if (finalized.ok) return {}

  if (!session.turn_deadline_at || new Date(session.turn_deadline_at) > new Date()) {
    return { skipped: true }
  }

  const activePlayerId = currentPlayerId(session)
  if (!activePlayerId) return { error: 'No current player' }
  const activeHand = hands.find((h) => h.player_id === activePlayerId)
  const activeCards = (activeHand?.cards ?? []) as unknown[] as import('@/types').GoFishCard[]

  const opponentCounts = new Map<string, number>()
  for (const hand of hands) {
    if (hand.player_id === activePlayerId) continue
    opponentCounts.set(hand.player_id, ((hand.cards ?? []) as unknown[]).length)
  }

  const pick = pickAutoAsk(activeCards, opponentCounts)
  if (!pick) {
    // No legal ask: advance the turn pointer without a state-changing action so the
    // room does not deadlock behind an empty-handed or targetless player.
    const nextIndex = nextActiveTurnIndexFromHands(session, hands)
    const { data: gameRow } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
    const timerSeconds = (gameRow?.timer_seconds ?? 0) as number
    await supabase
      .from('gofish_sessions')
      .update({
        current_turn_index: nextIndex,
        turn_deadline_at: gofishTurnDeadline(timerSeconds),
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)
    return {}
  }

  const { error } = await processGoFishAsk(supabase, gameId, activePlayerId, pick.targetPlayerId, pick.rank)
  return error ? { error } : {}
}

/**
 * End the game by most-books-wins when the session buzzer has sounded.
 *
 * Reads games.session_started_at + games.game_duration_seconds and, if the clock has
 * expired, flips the session to `finished`, appends a `game_over` event, and marks
 * the game finished with a CAS on status=active so trophies + community leaderboard
 * hooks fire exactly once even if two ticks race here.
 */
/**
 * Result signals: `{ ok: false }` = clock hasn't expired, keep going. `{ ok: true }` = we
 * finalized the game. `{ error }` = the finalization itself failed and the caller must
 * abort — a silent `false` here would let the caller carry on writing turn state on top
 * of a game that should be finished but isn't (the same bug CodeRabbit flagged on Rummy).
 */
async function finalizeIfSessionExpired(
  supabase: SupabaseClient,
  gameId: string,
  session: GoFishSession,
  hands: GoFishPlayerHand[]
): Promise<{ ok: boolean; error?: string }> {
  if (session.phase === 'finished') return { ok: false }
  const { data: gameRow, error: gameError } = await supabase
    .from('games')
    .select('session_started_at, game_duration_seconds')
    .eq('id', gameId)
    .maybeSingle()
  if (gameError) return { ok: false, error: internalErrorMessage('gofish', gameError) }
  if (!gameRow) return { ok: false }
  const expired = gofishGameSessionExpired(gameRow.session_started_at, gameRow.game_duration_seconds)
  if (!expired) return { ok: false }

  const now = new Date().toISOString()
  const winnerId = resolveWinner(hands)
  const { error } = await supabase
    .from('gofish_sessions')
    .update({
      phase: 'finished',
      winner_player_id: winnerId,
      turn_deadline_at: null,
      status_message: "Time's up!",
      event_log: [...(session.event_log ?? []), { kind: 'game_over', at: now }],
      updated_at: now,
    })
    .eq('game_id', gameId)
    .neq('phase', 'finished')
  if (error) return { ok: false, error: internalErrorMessage('gofish', error) }
  const finishResult = await markGameFinished(supabase, gameId, now, { onlyIfActive: true })
  if (finishResult?.error) return { ok: false, error: internalErrorMessage('gofish', finishResult.error) }
  return { ok: true }
}

function nextActiveTurnIndexFromHands(session: GoFishSession, hands: GoFishPlayerHand[]): number {
  const order = session.turn_order
  const cardCount = (id: string) => ((hands.find((h) => h.player_id === id)?.cards ?? []) as unknown[]).length
  for (let step = 1; step <= order.length; step += 1) {
    const idx = (session.current_turn_index + step) % order.length
    if (cardCount(order[idx]) > 0) return idx
  }
  return session.current_turn_index
}

function askErrorMessage(
  code: 'not_your_turn' | 'game_finished' | 'unknown_target' | 'ask_self' | 'target_no_cards' | 'must_hold_rank'
): string {
  switch (code) {
    case 'not_your_turn':
      return "It's not your turn"
    case 'game_finished':
      return 'The game is over'
    case 'unknown_target':
      return 'Unknown player'
    case 'ask_self':
      return 'You cannot ask yourself'
    case 'target_no_cards':
      return 'That player has no cards to ask for'
    case 'must_hold_rank':
      return 'You can only ask for a rank you already hold'
  }
}

/** Public snapshot for status polling / debugging. */
export function summariseEvents(events: GoFishEvent[]): string {
  return `${events.length} events`
}
