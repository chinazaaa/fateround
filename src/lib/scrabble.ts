import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { SCRABBLE_RACK_SIZE, SCRABBLE_TILE_DISTRIBUTION } from '@/lib/scrabble-constants'
import {
  currentTurnPlayerId,
  emptyScrabbleBoard,
  isScrabbleResultsPhase,
  scorePlacement,
  tileScore,
  withPlacedTiles,
} from '@/lib/scrabble-board'
import { SCRABBLE_WORDS_RAW } from '@/lib/data/scrabble-words'
import type { ScrabblePlacedTile, ScrabblePlayerState, ScrabbleSession } from '@/types'

export const SCRABBLE_MIN_PLAYERS = 2
export const SCRABBLE_MAX_PLAYERS = 4

/** Allowed per-turn timer values in seconds (0 = no timer). */
export const SCRABBLE_TIMER_OPTIONS = [0, 60, 180, 300] as const

/** Clamp a requested per-turn timer to an allowed value; defaults to off. */
export function clampScrabbleTimer(value: unknown): number {
  const n = Number(value)
  return (SCRABBLE_TIMER_OPTIONS as readonly number[]).includes(n) ? n : 0
}

// Re-export the client-safe turn helpers so callers can grab everything from one place.
export { currentTurnPlayerId, isScrabbleResultsPhase }

// ---------------------------------------------------------------------------
// Dictionary
// ---------------------------------------------------------------------------

let wordSet: Set<string> | null = null

function dictionary(): Set<string> {
  if (!wordSet) {
    wordSet = new Set(
      SCRABBLE_WORDS_RAW.split('\n')
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length >= 2)
    )
  }
  return wordSet
}

/** Standard-dictionary check. Words are length ≥ 2. */
export function isValidScrabbleWord(word: string): boolean {
  return dictionary().has(word.toLowerCase())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

/** A fresh, shuffled 100-tile bag. '?' represents a blank tile. */
function freshBag(): string[] {
  const bag: string[] = []
  for (const [letter, count] of Object.entries(SCRABBLE_TILE_DISTRIBUTION)) {
    for (let i = 0; i < count; i += 1) bag.push(letter)
  }
  return shuffle(bag)
}

/** Total point value of the tiles left on a rack ('?' blanks score 0). */
function rackValue(rack: string[]): number {
  return rack.reduce((sum, t) => sum + tileScore(t, t === '?'), 0)
}

function computeDeadline(timerSeconds: number, now: number): string | null {
  return timerSeconds > 0 ? new Date(now + timerSeconds * 1000).toISOString() : null
}

async function loadTimerSeconds(supabase: SupabaseClient, gameId: string): Promise<number> {
  const { data } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
  return data?.timer_seconds ?? 0
}

async function loadPlayerNames(supabase: SupabaseClient, gameId: string): Promise<Map<string, string>> {
  const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
  const names = new Map<string, string>()
  for (const p of playerRows ?? []) names.set(p.id, p.name)
  return names
}

async function loadSession(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ session: ScrabbleSession | null; error?: string }> {
  const { data, error } = await supabase.from('scrabble_sessions').select('*').eq('game_id', gameId).maybeSingle()
  if (error) return { session: null, error: error.message }
  return { session: data as ScrabbleSession | null }
}

async function loadPlayerStates(supabase: SupabaseClient, gameId: string): Promise<ScrabblePlayerState[]> {
  const { data } = await supabase
    .from('scrabble_player_state')
    .select('*')
    .eq('game_id', gameId)
    .order('player_order', { ascending: true })
  return (data ?? []) as ScrabblePlayerState[]
}

function turnMessage(names: Map<string, string>, playerId: string): string {
  return `${names.get(playerId) ?? 'Player'}'s turn`
}

// ---------------------------------------------------------------------------
// Endgame scoring
// ---------------------------------------------------------------------------

interface EndgameResult {
  finalScores: Map<string, number>
  winnerPlayerId: string | null
  isTie: boolean
  statusMessage: string
}

/**
 * Standard end-of-game adjustment: every player loses the value of the tiles left
 * on their rack. When a player went out (emptied their rack), they also gain the
 * sum of everyone else's remaining rack values.
 */
function finalizeScores(
  states: ScrabblePlayerState[],
  names: Map<string, string>,
  wentOutPlayerId: string | null
): EndgameResult {
  const finalScores = new Map<string, number>()
  let totalRacks = 0
  for (const s of states) {
    const value = rackValue(s.rack)
    totalRacks += value
    finalScores.set(s.player_id, s.score - value)
  }

  if (wentOutPlayerId) {
    const outState = states.find((s) => s.player_id === wentOutPlayerId)
    const bonus = totalRacks - (outState ? rackValue(outState.rack) : 0)
    finalScores.set(wentOutPlayerId, (finalScores.get(wentOutPlayerId) ?? 0) + bonus)
  }

  let best = -Infinity
  for (const score of finalScores.values()) if (score > best) best = score
  const leaders = states.filter((s) => (finalScores.get(s.player_id) ?? 0) === best)
  const isTie = leaders.length > 1
  const winnerPlayerId = isTie ? null : (leaders[0]?.player_id ?? null)

  const statusMessage = isTie
    ? `It's a tie at ${best} points!`
    : `${names.get(winnerPlayerId ?? '') ?? 'Winner'} wins with ${best} points!`

  return { finalScores, winnerPlayerId, isTie, statusMessage }
}

/** Persist the final per-player scores. Racks are left as-is for the results screen. */
async function persistFinalScores(
  supabase: SupabaseClient,
  states: ScrabblePlayerState[],
  finalScores: Map<string, number>
): Promise<void> {
  for (const s of states) {
    await supabase
      .from('scrabble_player_state')
      .update({ score: finalScores.get(s.player_id) ?? s.score })
      .eq('id', s.id)
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export async function initializeScrabbleGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  if (playerIds.length < SCRABBLE_MIN_PLAYERS || playerIds.length > SCRABBLE_MAX_PLAYERS) {
    return { error: `Need ${SCRABBLE_MIN_PLAYERS}-${SCRABBLE_MAX_PLAYERS} players to start` }
  }

  const { data: existing } = await supabase.from('scrabble_sessions').select('id').eq('game_id', gameId).maybeSingle()

  const timerSeconds = await loadTimerSeconds(supabase, gameId)
  const names = await loadPlayerNames(supabase, gameId)

  const turnOrder = shuffle(playerIds)
  const bag = freshBag()

  // Deal 7 tiles to each player up front, shrinking the bag as we go.
  const racks = new Map<string, string[]>()
  for (const pid of turnOrder) racks.set(pid, bag.splice(0, SCRABBLE_RACK_SIZE))

  const now = Date.now()
  const sessionRow = {
    turn_order: turnOrder,
    current_turn_index: 0,
    board: emptyScrabbleBoard(),
    bag,
    phase: 'playing' as const,
    consecutive_passes: 0,
    last_move: null,
    winner_player_id: null,
    is_tie: false,
    status_message: turnMessage(names, turnOrder[0]),
    turn_deadline_at: computeDeadline(timerSeconds, now),
    updated_at: new Date().toISOString(),
  }

  const { error: sessionError } = existing
    ? await supabase.from('scrabble_sessions').update(sessionRow).eq('game_id', gameId)
    : await supabase.from('scrabble_sessions').insert({ ...sessionRow, game_id: gameId })
  if (sessionError) return { error: sessionError.message }

  // Re-deal player racks from scratch (handles rematch by clearing prior rows).
  await supabase.from('scrabble_player_state').delete().eq('game_id', gameId)
  const stateRows = turnOrder.map((pid, idx) => ({
    game_id: gameId,
    player_id: pid,
    rack: racks.get(pid) ?? [],
    score: 0,
    player_order: idx,
  }))
  const { error: stateError } = await supabase.from('scrabble_player_state').insert(stateRows)
  if (stateError) return { error: stateError.message }

  return {}
}

// ---------------------------------------------------------------------------
// Play a word
// ---------------------------------------------------------------------------

export async function processScrabblePlay(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  tiles: ScrabblePlacedTile[]
): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.phase === 'finished') return { error: 'Game already finished' }
  if (currentTurnPlayerId(session) !== playerId) return { error: "It's not your turn" }

  const states = await loadPlayerStates(supabase, gameId)
  const state = states.find((s) => s.player_id === playerId)
  if (!state) return { error: 'You are not in this game' }

  // Verify the player actually holds the tiles being placed. A blank consumes a
  // '?' from the rack regardless of the chosen letter.
  const remaining = [...state.rack]
  for (const t of tiles) {
    const needed = t.isBlank ? '?' : t.letter.toUpperCase()
    const idx = remaining.indexOf(needed)
    if (idx === -1) return { error: "You don't have the tiles to play that" }
    remaining.splice(idx, 1)
  }

  const placement = scorePlacement(session.board, tiles)
  if (!placement.valid) return { error: placement.error ?? 'Invalid placement' }

  for (const word of placement.words) {
    if (!isValidScrabbleWord(word)) return { error: `"${word.toUpperCase()}" is not a valid word` }
  }

  const names = await loadPlayerNames(supabase, gameId)
  const timerSeconds = await loadTimerSeconds(supabase, gameId)
  const now = Date.now()

  // Apply the move: place tiles, refill the rack from the bag, award the score.
  const board = withPlacedTiles(session.board, tiles)
  const bag = [...session.bag]
  const drawCount = SCRABBLE_RACK_SIZE - remaining.length
  const drawn = bag.splice(0, drawCount)
  const newRack = [...remaining, ...drawn]
  const newScore = state.score + placement.score

  const lastMove = {
    player_id: playerId,
    kind: 'play' as const,
    words: placement.words,
    score: placement.score,
    tiles: tiles.map((t) => ({ row: t.row, col: t.col })),
  }

  const nextIndex = (session.current_turn_index + 1) % session.turn_order.length
  const wentOut = bag.length === 0 && newRack.length === 0

  // Persist the mover's updated rack/score before any endgame adjustment.
  state.rack = newRack
  state.score = newScore
  const { error: stateError } = await supabase
    .from('scrabble_player_state')
    .update({ rack: newRack, score: newScore })
    .eq('id', state.id)
  if (stateError) return { error: stateError.message }

  if (wentOut) {
    const result = finalizeScores(states, names, playerId)
    await persistFinalScores(supabase, states, result.finalScores)

    const { error: finishError } = await supabase
      .from('scrabble_sessions')
      .update({
        board,
        bag,
        current_turn_index: nextIndex,
        consecutive_passes: 0,
        last_move: lastMove,
        phase: 'finished',
        winner_player_id: result.winnerPlayerId,
        is_tie: result.isTie,
        status_message: result.statusMessage,
        turn_deadline_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)
    if (finishError) return { error: finishError.message }

    await markGameFinished(supabase, gameId)
    return {}
  }

  const nextPlayerId = session.turn_order[nextIndex]
  const { error: updateError } = await supabase
    .from('scrabble_sessions')
    .update({
      board,
      bag,
      current_turn_index: nextIndex,
      consecutive_passes: 0,
      last_move: lastMove,
      status_message: turnMessage(names, nextPlayerId),
      turn_deadline_at: computeDeadline(timerSeconds, now),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
  if (updateError) return { error: updateError.message }

  return {}
}

// ---------------------------------------------------------------------------
// Scoreless turns: exchange / pass / timeout
// ---------------------------------------------------------------------------

/** Shared persistence for a scoreless turn (pass, exchange, or timeout). */
async function advanceScorelessTurn(
  supabase: SupabaseClient,
  gameId: string,
  session: ScrabbleSession,
  states: ScrabblePlayerState[],
  names: Map<string, string>,
  kind: 'exchange' | 'pass',
  movingPlayerId: string,
  bag: string[]
): Promise<{ error?: string }> {
  const timerSeconds = await loadTimerSeconds(supabase, gameId)
  const now = Date.now()

  const nextIndex = (session.current_turn_index + 1) % session.turn_order.length
  const consecutivePasses = session.consecutive_passes + 1
  const lastMove = { player_id: movingPlayerId, kind, words: [], score: 0, tiles: [] }
  const endGame = consecutivePasses >= session.turn_order.length * 2

  if (endGame) {
    const result = finalizeScores(states, names, null)
    await persistFinalScores(supabase, states, result.finalScores)

    const { error } = await supabase
      .from('scrabble_sessions')
      .update({
        bag,
        current_turn_index: nextIndex,
        consecutive_passes: consecutivePasses,
        last_move: lastMove,
        phase: 'finished',
        winner_player_id: result.winnerPlayerId,
        is_tie: result.isTie,
        status_message: result.statusMessage,
        turn_deadline_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)
    if (error) return { error: error.message }

    await markGameFinished(supabase, gameId)
    return {}
  }

  const nextPlayerId = session.turn_order[nextIndex]
  const { error } = await supabase
    .from('scrabble_sessions')
    .update({
      bag,
      current_turn_index: nextIndex,
      consecutive_passes: consecutivePasses,
      last_move: lastMove,
      status_message: turnMessage(names, nextPlayerId),
      turn_deadline_at: computeDeadline(timerSeconds, now),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
  if (error) return { error: error.message }

  return {}
}

export async function processScrabbleExchange(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  tileIndices: number[]
): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.phase === 'finished') return { error: 'Game already finished' }
  if (currentTurnPlayerId(session) !== playerId) return { error: "It's not your turn" }
  if (session.bag.length < 1) return { error: 'Not enough tiles in the bag to exchange' }

  const states = await loadPlayerStates(supabase, gameId)
  const state = states.find((s) => s.player_id === playerId)
  if (!state) return { error: 'You are not in this game' }

  const unique = new Set(tileIndices)
  if (unique.size !== tileIndices.length) return { error: 'Duplicate tile selected' }
  for (const i of tileIndices) {
    if (i < 0 || i >= state.rack.length) return { error: 'Invalid tile selected' }
  }

  // Pull the chosen tiles off the rack, return them to the bag, then redraw.
  const chosen = tileIndices.map((i) => state.rack[i])
  const kept = state.rack.filter((_, i) => !unique.has(i))
  const bag = shuffle([...session.bag, ...chosen])
  const drawn = bag.splice(0, chosen.length)
  const newRack = [...kept, ...drawn]

  state.rack = newRack
  const { error: stateError } = await supabase
    .from('scrabble_player_state')
    .update({ rack: newRack })
    .eq('id', state.id)
  if (stateError) return { error: stateError.message }

  const names = await loadPlayerNames(supabase, gameId)
  return advanceScorelessTurn(supabase, gameId, session, states, names, 'exchange', playerId, bag)
}

export async function processScrabblePass(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.phase === 'finished') return { error: 'Game already finished' }
  if (currentTurnPlayerId(session) !== playerId) return { error: "It's not your turn" }

  const states = await loadPlayerStates(supabase, gameId)
  const names = await loadPlayerNames(supabase, gameId)
  return advanceScorelessTurn(supabase, gameId, session, states, names, 'pass', playerId, [...session.bag])
}

/** The player on the clock ran out of time — treat it as a pass. */
export async function processScrabbleExpireTurn(supabase: SupabaseClient, gameId: string): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.phase === 'finished') return {}
  if (!session.turn_deadline_at || new Date(session.turn_deadline_at).getTime() > Date.now()) return {}

  const states = await loadPlayerStates(supabase, gameId)
  const names = await loadPlayerNames(supabase, gameId)
  const movingPlayerId = currentTurnPlayerId(session)
  return advanceScorelessTurn(supabase, gameId, session, states, names, 'pass', movingPlayerId, [...session.bag])
}

// ---------------------------------------------------------------------------
// Play again
// ---------------------------------------------------------------------------

/** True when the host can reset the room for another round. */
export async function canScrabblePlayAgain(
  supabase: SupabaseClient,
  gameId: string,
  gameStatus: string
): Promise<boolean> {
  if (gameStatus === 'waiting' || gameStatus === 'finished') return true
  if (gameStatus !== 'active') return false

  const { data: session } = await supabase.from('scrabble_sessions').select('phase').eq('game_id', gameId).maybeSingle()
  return session?.phase === 'finished'
}

/** Play again — keep the finished session so initialize can re-deal on rematch. */
export async function clearScrabbleSessionData(
  _supabase: SupabaseClient,
  _gameId: string
): Promise<{ error?: string }> {
  return {}
}
