import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { clearSessionTables } from '@/lib/session-clear'
import { markGameFinished } from '@/lib/game-finish'
import {
  buildGoFishDeck,
  currentPlayerId,
  dealGoFish,
  resolveGoFishAsk,
  shuffleDeck,
  type GoFishAskResult,
} from '@/lib/gofish'
import type {
  GoFishCard,
  GoFishEvent,
  GoFishPlayerHand,
  GoFishRank,
  GoFishSession,
} from '@/types'

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

async function loadGameState(supabase: SupabaseClient, gameId: string): Promise<LoadedState> {
  const [sessionRes, handsRes] = await Promise.all([
    supabase.from('gofish_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('gofish_player_hands').select('*').eq('game_id', gameId).order('player_order'),
  ])
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
  const { session, hands } = await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }

  const now = new Date().toISOString()
  const result = resolveGoFishAsk({
    session,
    hands,
    fromPlayerId,
    targetPlayerId,
    rank,
    now,
  })
  if (!result.ok) return { error: askErrorMessage(result.error) }

  const { session: nextSession, handUpdates } = result

  // Persist. Do the session write first so a failed hand update doesn't leave stale
  // ocean/log state — every mutation here is idempotent by session state + player id.
  const { error: sessionError } = await supabase
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
      updated_at: nextSession.updated_at,
    })
    .eq('game_id', gameId)
  if (sessionError) return { error: internalErrorMessage('gofish', sessionError) }

  for (const update of handUpdates) {
    const { error: handError } = await supabase
      .from('gofish_player_hands')
      .update({ cards: update.cards, books: update.books })
      .eq('game_id', gameId)
      .eq('player_id', update.playerId)
    if (handError) return { error: internalErrorMessage('gofish', handError) }
  }

  if (nextSession.phase === 'finished') {
    await markGameFinished(supabase, gameId, nextSession.updated_at, { onlyIfActive: true })
  }

  return { result }
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
