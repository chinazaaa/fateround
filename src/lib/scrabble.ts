import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { callFinishRpc, roundPayload, type FinishResult, type FinishRound } from '@/lib/finish-session'
import { SCRABBLE_RACK_SIZE } from '@/lib/scrabble-constants'
import {
  currentTurnPlayerId,
  emptyScrabbleBoard,
  isScrabbleResultsPhase,
  scorePlacement,
  tileScore,
  withPlacedTiles,
} from '@/lib/scrabble-board'
import { isValidScrabbleWord } from '@/lib/scrabble-dictionaries'
import { SCRABBLE_DEFAULT_DICTIONARY } from '@/lib/scrabble-dictionary-meta'
import { tileSetForDictionary } from '@/lib/scrabble-rulesets'
import type { Game, ScrabblePlacedTile, ScrabblePlayerState, ScrabbleSession } from '@/types'
import { SCRABBLE_MAX_PLAYERS, SCRABBLE_MIN_PLAYERS } from '@/lib/player-limits'
export { SCRABBLE_MAX_PLAYERS, SCRABBLE_MIN_PLAYERS }

/** Allowed per-turn timer values in seconds (0 = no timer). */
export const SCRABBLE_TIMER_OPTIONS = [0, 60, 120, 180, 300] as const

/** Clamp a requested per-turn timer to an allowed value; defaults to off. */
export function clampScrabbleTimer(value: unknown): number {
  const n = Number(value)
  return (SCRABBLE_TIMER_OPTIONS as readonly number[]).includes(n) ? n : 0
}

// ── Chess-clock mode (per-player time bank) ───────────────────────────────────
// An alternative to the per-turn timer: each player gets a fixed budget that only
// counts down while it's their turn. A player whose bank hits zero "flags out" —
// they can spectate but their seat is skipped. The game ends when every remaining
// player has flagged out (highest final score wins, standard rack penalty applied).

export type ScrabbleClockMode = 'standard' | 'chess'

/** Per-player time-bank options for chess-clock mode, in seconds (3–30 minutes). */
export const SCRABBLE_CLOCK_OPTIONS = [180, 300, 600, 900, 1200, 1800] as const
export const SCRABBLE_DEFAULT_CLOCK_SECONDS = 600

export function parseScrabbleClockMode(value: unknown): ScrabbleClockMode {
  return value === 'chess' ? 'chess' : 'standard'
}

/** Clamp a requested per-player bank to an allowed value; defaults to 10 minutes. */
export function clampScrabbleClockSeconds(value: unknown): number {
  const n = Number(value)
  return (SCRABBLE_CLOCK_OPTIONS as readonly number[]).includes(n) ? n : SCRABBLE_DEFAULT_CLOCK_SECONDS
}

/** mm:ss for a remaining time bank (rounds up, never negative). */
export function formatScrabbleClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

// ── Whole-game session timer (so a game can't run for hours) ──────────────────

/** Whole-game length options in seconds. 0 = no limit. */
export const SCRABBLE_GAME_DURATION_OPTIONS = [0, 600, 900, 1800, 3600, 5400, 7200] as const
/** How much time the host can add mid-game (seconds). */
export const SCRABBLE_GAME_TIME_EXTENSION_OPTIONS = [600, 900, 1800] as const
export const SCRABBLE_MAX_GAME_DURATION_SECONDS = 14_400

export function clampScrabbleGameDuration(raw: unknown): number {
  const n = Number(raw ?? 0)
  return (SCRABBLE_GAME_DURATION_OPTIONS as readonly number[]).includes(n) ? n : 0
}

export function clampScrabbleTimeExtension(raw: unknown): number {
  const n = Number(raw ?? 0)
  return (SCRABBLE_GAME_TIME_EXTENSION_OPTIONS as readonly number[]).includes(n) ? n : 0
}

export function formatScrabbleGameDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return 'No limit'
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 === 1 ? '' : 's'}`
  return `${Math.round(seconds / 60)} minutes`
}

export function scrabbleGameSessionExpired(
  sessionStartedAt: string | null | undefined,
  durationSeconds: number | null | undefined
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  if (!sessionStartedAt) return false
  const elapsed = (Date.now() - new Date(sessionStartedAt).getTime()) / 1000
  return elapsed >= durationSeconds
}

/** Finalize a scrabble game now: tally final scores (rack penalties applied, as at
 *  a normal game end), pick the winner by score, and finish the session + game in ONE
 *  database transaction (see finish_scrabble_session). Shared by the time-limit auto-end
 *  and the host's early-end so both produce a proper winner and final scores. `reason`
 *  prefixes the status message. */
async function finalizeScrabbleSession(
  supabase: SupabaseClient,
  gameId: string,
  reason: string,
  round?: FinishRound
): Promise<{ error: string | null; skipped?: boolean }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Session not found' }

  let finished: FinishResult
  if (session.phase === 'finished') {
    // Already finished: the function never re-tallies, it only completes the games-row flip (repair path).
    finished = await finishScrabbleRound(supabase, gameId, session, { patch: {}, round })
  } else {
    const { data: statesRaw, error: statesError } = await supabase
      .from('scrabble_player_state')
      .select('*')
      .eq('game_id', gameId)
    // A failed read (or no seated player) must never be finalized: with no players the round would be published
    // with no winner, and a retry sees a finished session and never recalculates.
    if (statesError) return { error: internalErrorMessage('scrabble', statesError) }
    const states = seatedStates(session, (statesRaw ?? []) as ScrabblePlayerState[])
    if (states.length === 0) return { error: internalErrorMessage('scrabble', 'no seated players to finalize') }
    const { data: playersRaw } = await supabase.from('players').select('id,name').eq('game_id', gameId)
    const names = new Map((playersRaw ?? []).map((p) => [p.id as string, p.name as string]))

    const tileSet = tileSetForDictionary(await loadDictionaryId(supabase, gameId))
    const result = finalizeScores(states, names, null, tileSet.values)
    finished = await finishScrabbleRound(supabase, gameId, session, {
      patch: {
        winner_player_id: result.winnerPlayerId,
        is_tie: result.isTie,
        status_message: `${reason} ${result.statusMessage}`,
      },
      states: scoreWrites(states, result.finalScores),
      round,
    })
  }
  if (finished.error) return { error: finished.error }
  if (finished.won || finished.already) return { error: null }
  // The finish was decided about another round (a rematch happened): never read the retained finished session of
  // the earlier round as "someone finished it".
  if (finished.roundMismatch) return { error: null, skipped: true }
  // Lost the claim. If the round is finished now, someone else ended it (success). If it is still
  // running, a play/pass moved the session first and THIS request did not end the round.
  const { session: after, error: rereadError } = await loadSession(supabase, gameId)
  if (rereadError) return { error: rereadError }
  return after?.phase === 'finished' ? { error: null } : { error: null, skipped: true }
}

/** End the game now because the session clock ran out. */
async function finishScrabbleByTimeLimit(
  supabase: SupabaseClient,
  gameId: string,
  round: FinishRound
): Promise<{ error: string | null; skipped?: boolean }> {
  return finalizeScrabbleSession(supabase, gameId, "Time's up!", round)
}

/** End the game now because the host chose to end it early. Tallies final scores
 *  and picks a winner, same as a natural game end. */
export async function finishScrabbleGameEarly(
  supabase: SupabaseClient,
  gameId: string,
  // The round the host's request was authorized against (from the authenticated game snapshot).
  round?: FinishRound
): Promise<{ error: string | null; skipped?: boolean }> {
  return finalizeScrabbleSession(supabase, gameId, 'Host ended the game.', round)
}

export async function finishExpiredScrabbleGame(
  supabase: SupabaseClient,
  game: Pick<Game, 'id' | 'status' | 'session_started_at' | 'game_duration_seconds'> & {
    sessions_played?: number | null
  }
): Promise<{ finished: boolean; error?: string }> {
  if (game.status !== 'active') return { finished: false }
  if (!scrabbleGameSessionExpired(game.session_started_at, game.game_duration_seconds)) return { finished: false }
  // The expiry was decided from THIS snapshot: the finish applies only to that round (a rematch after the snapshot
  // is a different round and answers `lost`).
  const { error, skipped } = await finishScrabbleByTimeLimit(supabase, game.id, {
    sessionStartedAt: game.session_started_at ?? null,
    sessionsPlayed: game.sessions_played ?? undefined,
    // An extension changes the limit but not the round: the finish must lose when the limit moved after this decision.
    gameDurationSeconds: game.game_duration_seconds ?? null,
  })
  if (error) return { finished: false, error }
  // `skipped`: a normal play / pass won the claim and the round is still running: not finished, not an error.
  return { finished: !skipped }
}

export async function extendScrabbleGameDuration(
  supabase: SupabaseClient,
  gameId: string,
  extensionSeconds: number
): Promise<{ error?: string; newDurationSeconds?: number }> {
  const seconds = clampScrabbleTimeExtension(extensionSeconds)
  if (seconds <= 0) return { error: 'Invalid extension' }

  const { data: game } = await supabase
    .from('games')
    .select('id, status, game_duration_seconds')
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return { error: 'Game not found' }
  if (game.status !== 'active') return { error: 'Game not active' }

  const current = (game.game_duration_seconds as number | null) ?? 0
  if (current <= 0) return { error: 'This game has no time limit to extend' }

  const next = current + seconds
  if (next > SCRABBLE_MAX_GAME_DURATION_SECONDS) {
    return { error: `Total game time cannot exceed ${formatScrabbleGameDuration(SCRABBLE_MAX_GAME_DURATION_SECONDS)}` }
  }

  const { error: gameError } = await supabase.from('games').update({ game_duration_seconds: next }).eq('id', gameId)
  if (gameError) return { error: internalErrorMessage('scrabble', gameError) }

  // CAS the cosmetic status bump so it can't clobber a session that finished
  // concurrently (and resurrect a stale "game continues" message).
  const { session } = await loadSession(supabase, gameId)
  if (session && session.phase !== 'finished') {
    await persistSession(
      supabase,
      gameId,
      { status_message: `Host added ${formatScrabbleGameDuration(seconds)} — game continues.` },
      session.updated_at
    )
  }

  return { newDurationSeconds: next }
}

// Re-export the client-safe turn helpers so callers can grab everything from one place.
export { currentTurnPlayerId, isScrabbleResultsPhase }

// ---------------------------------------------------------------------------
// Dictionary
// ---------------------------------------------------------------------------

// Word validation now lives in the server-only ./scrabble-dictionaries module so
// each game can pick its own word list. Re-exported here for existing callers.
export { isValidScrabbleWord }

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

/** A fresh, shuffled tile bag for the given edition's distribution. '?' is a blank. */
function freshBag(distribution: Record<string, number>): string[] {
  const bag: string[] = []
  for (const [letter, count] of Object.entries(distribution)) {
    for (let i = 0; i < count; i += 1) bag.push(letter)
  }
  return shuffle(bag)
}

/** Total point value of the tiles left on a rack ('?' blanks score 0). */
function rackValue(rack: string[], values: Record<string, number>): number {
  return rack.reduce((sum, t) => sum + tileScore(t, t === '?', values), 0)
}

function computeDeadline(timerSeconds: number, now: number): string | null {
  return timerSeconds > 0 ? new Date(now + timerSeconds * 1000).toISOString() : null
}

async function loadTimerSeconds(supabase: SupabaseClient, gameId: string): Promise<number> {
  const { data } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
  return data?.timer_seconds ?? 0
}

async function loadDictionaryId(supabase: SupabaseClient, gameId: string): Promise<string> {
  const { data } = await supabase.from('games').select('scrabble_dictionary_id').eq('id', gameId).maybeSingle()
  return data?.scrabble_dictionary_id ?? SCRABBLE_DEFAULT_DICTIONARY
}

async function loadClockConfig(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ mode: ScrabbleClockMode; clockSeconds: number }> {
  const { data } = await supabase
    .from('games')
    .select('scrabble_clock_mode, scrabble_clock_seconds')
    .eq('id', gameId)
    .maybeSingle()
  const mode = parseScrabbleClockMode(data?.scrabble_clock_mode)
  const clockSeconds = mode === 'chess' ? clampScrabbleClockSeconds(data?.scrabble_clock_seconds) : 0
  return { mode, clockSeconds }
}

/** Players still on the clock (not flagged out). Everyone in standard mode. */
function activePlayerCount(session: ScrabbleSession, states: ScrabblePlayerState[]): number {
  if (session.clock_mode !== 'chess') return session.turn_order.length
  const out = new Set(states.filter((s) => s.timed_out).map((s) => s.player_id))
  return session.turn_order.filter((id) => !out.has(id)).length
}

/**
 * The seat that plays next. Standard mode: the next seat, wrapping. Chess mode: the
 * next seat that hasn't flagged out (walking forward, and — for solo play — allowed
 * to land back on the current seat), or -1 when every seat has flagged out.
 * Callers pass `states` already reflecting any flag-out applied to the current mover.
 */
function nextTurnIndex(session: ScrabbleSession, states: ScrabblePlayerState[]): number {
  const len = session.turn_order.length
  if (len === 0) return -1
  if (session.clock_mode !== 'chess') return (session.current_turn_index + 1) % len
  const out = new Set(states.filter((s) => s.timed_out).map((s) => s.player_id))
  for (let step = 1; step <= len; step += 1) {
    const idx = (session.current_turn_index + step) % len
    if (!out.has(session.turn_order[idx])) return idx
  }
  return -1
}

/**
 * Deduct the time the current mover spent on this turn from their bank. Returns the
 * `scrabble_player_state` patch to fold into the mover's write (and marks them flagged
 * out if the bank hit zero), or null in standard mode.
 */
function chessClockPatch(
  session: ScrabbleSession,
  moverState: ScrabblePlayerState,
  now: number
): { clock_ms_remaining: number; timed_out: boolean } | null {
  if (session.clock_mode !== 'chess') return null
  const started = session.turn_started_at ? new Date(session.turn_started_at).getTime() : now
  const elapsed = Math.max(0, now - started)
  const remaining = Math.max(0, (moverState.clock_ms_remaining ?? 0) - elapsed)
  return { clock_ms_remaining: remaining, timed_out: moverState.timed_out || remaining <= 0 }
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
  if (error) return { session: null, error: internalErrorMessage('scrabble', error) }
  return { session: data as ScrabbleSession | null }
}

/**
 * Optimistic-concurrency session write. The update only lands if the row still
 * carries the `expectedUpdatedAt` we read at load time, so when two requests race
 * (e.g. every client driving the turn timer, or a timeout overlapping a play) only
 * the first wins — the loser gets 0 rows back and the caller aborts before mutating
 * any rack, score, or the tile bag. Reports whether this write won the claim; a database
 * failure is reported as `error`, never as a lost claim.
 */
async function persistSession(
  supabase: SupabaseClient,
  gameId: string,
  patch: Partial<ScrabbleSession>,
  expectedUpdatedAt: string,
  // The move's player-state writes (the mover's rack / score / clock). With them the claim is ONE database
  // transaction (apply_scrabble_move): the new session version and the states it describes become visible
  // together, so a finish or another move can never act on a version whose state writes are still pending, and a
  // lost claim writes nothing.
  stateWrites?: ScrabbleStateWrite[]
): Promise<{ won: boolean; error?: string }> {
  if (stateWrites && stateWrites.length > 0) {
    const { data, error } = await supabase.rpc('apply_scrabble_move', {
      p_game_id: gameId,
      p_expected_updated_at: expectedUpdatedAt,
      p_session_patch: patch,
      p_state_writes: stateWrites,
    })
    if (error) return { won: false, error: internalErrorMessage('scrabble', error) }
    const status = (data as { status?: string } | null)?.status
    if (status === 'applied') return { won: true }
    if (status === 'lost') return { won: false }
    return {
      won: false,
      error: internalErrorMessage('scrabble', `apply_scrabble_move answered ${status ?? 'nothing'}`),
    }
  }
  const { data, error } = await supabase
    .from('scrabble_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('updated_at', expectedUpdatedAt)
    .select('game_id')
  // A database failure is not a lost race: reporting it as one would answer success for a write that never landed.
  if (error) return { won: false, error: internalErrorMessage('scrabble', error) }
  return { won: (data?.length ?? 0) > 0 }
}

/**
 * Only seats still in the session's turn order count. A leave that has already shrunk turn_order but not yet
 * deleted its state row must not be ranked (a stale high score would win), tallied or written. Chess-clock seats
 * that flagged out stay in turn_order, so they remain ranked.
 */
function seatedStates(session: ScrabbleSession, states: ScrabblePlayerState[]): ScrabblePlayerState[] {
  const seated = new Set(session.turn_order ?? [])
  return states.filter((s) => seated.has(s.player_id))
}

async function loadPlayerStates(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ states: ScrabblePlayerState[]; error?: string }> {
  const { data, error } = await supabase
    .from('scrabble_player_state')
    .select('*')
    .eq('game_id', gameId)
    .order('player_order')
  // A failed read is an error, never an empty game (an empty tally would publish a round with no winner).
  if (error) return { states: [], error: internalErrorMessage('scrabble', error) }
  return { states: (data ?? []) as ScrabblePlayerState[] }
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
  wentOutPlayerId: string | null,
  values: Record<string, number>
): EndgameResult {
  const finalScores = new Map<string, number>()
  let totalRacks = 0
  for (const s of states) {
    const value = rackValue(s.rack, values)
    totalRacks += value
    finalScores.set(s.player_id, s.score - value)
  }

  if (wentOutPlayerId) {
    const outState = states.find((s) => s.player_id === wentOutPlayerId)
    const bonus = totalRacks - (outState ? rackValue(outState.rack, values) : 0)
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

type ScrabbleStateWrite = {
  player_id: string
  score?: number
  rack?: string[]
  clock_ms_remaining?: number | null
  timed_out?: boolean
}

/**
 * The final per-player state writes. Racks are left as-is for the results screen; `mover` merges the mover's own
 * state changes (rack, clock, ...) into that player's entry, the final score winning over the move's score.
 */
function scoreWrites(
  states: ScrabblePlayerState[],
  finalScores: Map<string, number>,
  mover?: { playerId: string; write: Omit<ScrabbleStateWrite, 'player_id'> }
): ScrabbleStateWrite[] {
  return states.map((s) => ({
    player_id: s.player_id,
    ...(mover?.playerId === s.player_id ? mover.write : {}),
    score: finalScores.get(s.player_id) ?? s.score,
  }))
}

/** Everything one finish writes, applied by `finish_scrabble_session` in a single transaction (or not at all). */
async function finishScrabbleRound(
  supabase: SupabaseClient,
  gameId: string,
  session: { updated_at: string },
  o: { patch: Record<string, unknown>; states?: ScrabbleStateWrite[]; removePlayerId?: string; round?: FinishRound }
): Promise<FinishResult> {
  const { phase: _phase, updated_at: _updatedAt, turn_deadline_at: _d, turn_started_at: _t, ...patch } = o.patch
  void [_phase, _updatedAt, _d, _t]
  return callFinishRpc(
    supabase,
    'finish_scrabble_session',
    {
      p_game_id: gameId,
      p_expected_updated_at: session.updated_at,
      p_session_patch: patch,
      p_state_writes: o.states ?? [],
      p_remove_player_id: o.removePlayerId ?? null,
      p_round: roundPayload(o.round),
    },
    'scrabble',
    gameId
  )
}

/** Action result for a finish: error -> error, landed -> success, lost CAS (or already finished) -> skipped. */
function finishOutcome(finished: FinishResult): { error?: string; skipped?: boolean } {
  if (finished.error) return { error: finished.error }
  return finished.won ? {} : { skipped: true }
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

  const timerSeconds = await loadTimerSeconds(supabase, gameId)
  const { mode: clockMode, clockSeconds } = await loadClockConfig(supabase, gameId)
  const tileSet = tileSetForDictionary(await loadDictionaryId(supabase, gameId))
  const names = await loadPlayerNames(supabase, gameId)

  const turnOrder = shuffle(playerIds)
  const bag = freshBag(tileSet.distribution)

  // Deal 7 tiles to each player up front, shrinking the bag as we go.
  const racks = new Map<string, string[]>()
  for (const pid of turnOrder) racks.set(pid, bag.splice(0, SCRABBLE_RACK_SIZE))

  const now = Date.now()
  const isChess = clockMode === 'chess'
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
    // Chess-clock mode drives timing off each player's bank + turn_started_at, so it
    // leaves the per-turn deadline off; standard mode uses the per-turn deadline.
    turn_deadline_at: isChess ? null : computeDeadline(timerSeconds, now),
    clock_mode: clockMode,
    turn_started_at: isChess ? new Date(now).toISOString() : null,
  }
  const stateRows = turnOrder.map((pid, idx) => ({
    player_id: pid,
    rack: racks.get(pid) ?? [],
    score: 0,
    player_order: idx,
    clock_ms_remaining: isChess ? clockSeconds * 1000 : null,
    timed_out: false,
  }))

  // The deal is ONE database transaction under the games row lock (deal_scrabble_session): the previous racks and the
  // session are replaced together (a failed deal leaves the previous result intact), an overlapping second deal finds
  // the round already `playing` and never interleaves its racks with the first (this is also the guard that a live
  // game is never re-dealt, which would reset every score), and a seat whose player row is gone is rejected up front.
  const { data, error } = await supabase.rpc('deal_scrabble_session', {
    p_game_id: gameId,
    p_session_row: sessionRow,
    p_state_rows: stateRows,
  })
  if (error) return { error: internalErrorMessage('scrabble', error) }
  const outcome = (data ?? {}) as { status?: string; reason?: string }
  if (outcome.status === 'in_progress') return { error: 'Game already in progress' }
  if (outcome.status !== 'dealt') {
    return {
      error: internalErrorMessage(
        'scrabble',
        `deal_scrabble_session rejected the call: ${outcome.reason ?? outcome.status}`
      ),
    }
  }
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
): Promise<{ error?: string; skipped?: boolean }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.phase === 'finished') return { error: 'Game already finished' }
  if (currentTurnPlayerId(session) !== playerId) return { error: "It's not your turn" }

  const loaded = await loadPlayerStates(supabase, gameId)
  if (loaded.error) return { error: loaded.error }
  const states = seatedStates(session, loaded.states)
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

  const dictId = await loadDictionaryId(supabase, gameId)
  const tileSet = tileSetForDictionary(dictId)

  // Every placed letter — including the letter chosen for a blank — must belong to
  // the selected edition's alphabet. The rack check above only consumes '?' for a
  // blank, so without this a direct API call could place a letter from outside this
  // edition (e.g. Ñ in an English game).
  const allowedLetters = new Set(tileSet.alphabet)
  for (const t of tiles) {
    const letter = t.letter.toUpperCase()
    if (!allowedLetters.has(letter)) {
      return { error: `"${letter}" is not available in this Word Tiles edition` }
    }
  }

  const placement = scorePlacement(session.board, tiles, tileSet.values)
  if (!placement.valid) return { error: placement.error ?? 'Invalid placement' }

  for (const word of placement.words) {
    if (!isValidScrabbleWord(word, dictId)) return { error: `"${word.toUpperCase()}" is not a valid word` }
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

  const wrapIndex = (session.current_turn_index + 1) % session.turn_order.length
  const wentOut = bag.length === 0 && newRack.length === 0

  // Mirror the move into the in-memory state so finalizeScores sees the mover's
  // new score/rack — but DON'T write the rack/score or the bag yet. Those land
  // only after the session claim wins, so a request that lost the turn race never
  // mutates a rack, a score, or the shared bag (which would corrupt the 100-tile set).
  state.rack = newRack
  state.score = newScore

  // Chess-clock: deduct the time this turn took; the mover may flag out on this move.
  const clockPatch = chessClockPatch(session, state, now)
  if (clockPatch) {
    state.clock_ms_remaining = clockPatch.clock_ms_remaining
    state.timed_out = clockPatch.timed_out
  }
  const moverStateWrite = { rack: newRack, score: newScore, ...(clockPatch ?? {}) }

  if (wentOut) {
    const result = finalizeScores(states, names, playerId, tileSet.values)

    // The round ends on this play: session, the mover's rack / clock, every final score and the games flip are
    // ONE transaction (finish_scrabble_session).
    const finished = await finishScrabbleRound(supabase, gameId, session, {
      patch: {
        board,
        bag,
        current_turn_index: wrapIndex,
        consecutive_passes: 0,
        last_move: lastMove,
        winner_player_id: result.winnerPlayerId,
        is_tie: result.isTie,
        status_message: result.statusMessage,
      },
      states: scoreWrites(states, result.finalScores, { playerId, write: { rack: newRack, ...(clockPatch ?? {}) } }),
    })
    return finishOutcome(finished)
  }

  // Next seat that can still play (chess mode skips flagged-out players).
  const nextIndex = nextTurnIndex(session, states)

  // Chess mode: the mover just used the last live clock — end the game now.
  if (session.clock_mode === 'chess' && nextIndex === -1) {
    const result = finalizeScores(states, names, null, tileSet.values)
    const finished = await finishScrabbleRound(supabase, gameId, session, {
      patch: {
        board,
        bag,
        consecutive_passes: 0,
        last_move: lastMove,
        winner_player_id: result.winnerPlayerId,
        is_tie: result.isTie,
        status_message: result.statusMessage,
      },
      states: scoreWrites(states, result.finalScores, { playerId, write: { rack: newRack, ...(clockPatch ?? {}) } }),
    })
    return finishOutcome(finished)
  }

  const nextPlayerId = session.turn_order[nextIndex]
  const advance =
    session.clock_mode === 'chess'
      ? { turn_started_at: new Date(now).toISOString(), turn_deadline_at: null }
      : { turn_deadline_at: computeDeadline(timerSeconds, now) }
  const persisted = await persistSession(
    supabase,
    gameId,
    {
      board,
      bag,
      current_turn_index: nextIndex,
      consecutive_passes: 0,
      last_move: lastMove,
      status_message: turnMessage(names, nextPlayerId),
      ...advance,
    },
    session.updated_at,
    [{ player_id: playerId, ...moverStateWrite }]
  )
  if (!persisted.won) return persisted.error ? { error: persisted.error } : { skipped: true }

  return {}
}

// ---------------------------------------------------------------------------
// Scoreless turns: exchange / pass / timeout
// ---------------------------------------------------------------------------

/**
 * Shared persistence for a scoreless turn (pass, exchange, or timeout). Claims the
 * session via CAS keyed on `session.updated_at` and reports whether it won. Callers
 * that also mutate a rack (exchange) MUST gate that write on `won` — a lost claim
 * means another request already took this turn, so the returned bag must not land.
 */
async function advanceScorelessTurn(
  supabase: SupabaseClient,
  gameId: string,
  session: ScrabbleSession,
  states: ScrabblePlayerState[],
  names: Map<string, string>,
  kind: 'exchange' | 'pass',
  movingPlayerId: string,
  bag: string[],
  // The mover's rack after an exchange: part of the move, so it is ranked (a finishing exchange scores the NEW rack)
  // and written together with the finish (or, for a non-finishing move, right after the claim).
  newRack?: string[]
): Promise<{ error?: string; won: boolean; finished?: boolean }> {
  const timerSeconds = await loadTimerSeconds(supabase, gameId)
  const now = Date.now()
  const isChess = session.clock_mode === 'chess'

  // Chess-clock: deduct the mover's elapsed time; a pass/exchange can flag them out.
  const moverState = states.find((s) => s.player_id === movingPlayerId)
  const clockPatch = moverState ? chessClockPatch(session, moverState, now) : null
  if (clockPatch && moverState) {
    moverState.clock_ms_remaining = clockPatch.clock_ms_remaining
    moverState.timed_out = clockPatch.timed_out
  }
  if (newRack && moverState) moverState.rack = newRack
  const moverWrite: Omit<ScrabbleStateWrite, 'player_id'> = {
    ...(newRack ? { rack: newRack } : {}),
    ...(clockPatch ?? {}),
  }

  const consecutivePasses = session.consecutive_passes + 1
  const lastMove = { player_id: movingPlayerId, kind, words: [], score: 0, tiles: [] }
  const nextIndex = nextTurnIndex(session, states)
  // Stalemate end: everyone passed/exchanged twice around. In chess mode the ring is
  // just the players still on the clock. A -1 next seat means every seat has flagged.
  const passLimit = activePlayerCount(session, states) * 2
  const endGame = nextIndex === -1 || consecutivePasses >= passLimit

  if (endGame) {
    // An empty tally would publish a round with no winner ("Winner wins with -Infinity points!").
    if (states.length === 0)
      return { won: false, error: internalErrorMessage('scrabble', 'no seated players to finalize') }
    const tileSet = tileSetForDictionary(await loadDictionaryId(supabase, gameId))
    const result = finalizeScores(states, names, null, tileSet.values)

    const finished = await finishScrabbleRound(supabase, gameId, session, {
      patch: {
        bag,
        current_turn_index: nextIndex === -1 ? session.current_turn_index : nextIndex,
        consecutive_passes: consecutivePasses,
        last_move: lastMove,
        winner_player_id: result.winnerPlayerId,
        is_tie: result.isTie,
        status_message: result.statusMessage,
      },
      states: scoreWrites(
        states,
        result.finalScores,
        moverState && Object.keys(moverWrite).length > 0
          ? { playerId: moverState.player_id, write: moverWrite }
          : undefined
      ),
    })
    return { won: finished.won, error: finished.error, finished: finished.won }
  }

  const nextPlayerId = session.turn_order[nextIndex]
  const advance = isChess
    ? { turn_started_at: new Date(now).toISOString(), turn_deadline_at: null }
    : { turn_deadline_at: computeDeadline(timerSeconds, now) }
  const persisted = await persistSession(
    supabase,
    gameId,
    {
      bag,
      current_turn_index: nextIndex,
      consecutive_passes: consecutivePasses,
      last_move: lastMove,
      status_message: turnMessage(names, nextPlayerId),
      ...advance,
    },
    session.updated_at,
    // The mover's rack (an exchange) / clock commit with the claim.
    moverState && Object.keys(moverWrite).length > 0 ? [{ player_id: moverState.player_id, ...moverWrite }] : undefined
  )
  return { won: persisted.won, error: persisted.error }
}

export async function processScrabbleExchange(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  tileIndices: number[]
): Promise<{ error?: string; skipped?: boolean }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.phase === 'finished') return { error: 'Game already finished' }
  if (currentTurnPlayerId(session) !== playerId) return { error: "It's not your turn" }
  if (session.bag.length < SCRABBLE_RACK_SIZE) return { error: 'Not enough tiles in the bag to exchange' }

  const loaded = await loadPlayerStates(supabase, gameId)
  if (loaded.error) return { error: loaded.error }
  const states = seatedStates(session, loaded.states)
  const state = states.find((s) => s.player_id === playerId)
  if (!state) return { error: 'You are not in this game' }

  const unique = new Set(tileIndices)
  if (unique.size !== tileIndices.length) return { error: 'Duplicate tile selected' }
  for (const i of tileIndices) {
    if (i < 0 || i >= state.rack.length) return { error: 'Invalid tile selected' }
  }

  // Pull the chosen tiles off the rack, return them to the bag, then redraw.
  // The shuffle/redraw is computed up front but the new bag and rack are committed
  // ONLY after the session claim wins below — a lost race must never mutate the
  // shared bag or this rack, which would irreversibly corrupt the 100-tile set.
  const chosen = tileIndices.map((i) => state.rack[i])
  const kept = state.rack.filter((_, i) => !unique.has(i))
  const bag = shuffle([...session.bag, ...chosen])
  const drawn = bag.splice(0, chosen.length)
  const newRack = [...kept, ...drawn]

  const names = await loadPlayerNames(supabase, gameId)
  // Claim the session (commits the new bag via CAS). Only if we won is it safe to
  // write the rack — otherwise another request already took this turn.
  const { error, won } = await advanceScorelessTurn(
    supabase,
    gameId,
    session,
    states,
    names,
    'exchange',
    playerId,
    bag,
    newRack
  )
  if (error) return { error }
  return won ? {} : { skipped: true }
}

export async function processScrabblePass(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string; skipped?: boolean }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.phase === 'finished') return { error: 'Game already finished' }
  if (currentTurnPlayerId(session) !== playerId) return { error: "It's not your turn" }

  const loaded = await loadPlayerStates(supabase, gameId)
  if (loaded.error) return { error: loaded.error }
  const states = seatedStates(session, loaded.states)
  const names = await loadPlayerNames(supabase, gameId)
  const { error, won } = await advanceScorelessTurn(supabase, gameId, session, states, names, 'pass', playerId, [
    ...session.bag,
  ])
  if (error) return { error }
  return won ? {} : { skipped: true }
}

/**
 * The player on the clock ran out of time. Standard mode: treat it as a pass. Chess
 * mode: the player "flags out" — they're marked timed_out (spectating from now on) and
 * their seat is skipped; when nobody is left on the clock the game ends. Deadline-gated
 * server-side, so it's safe for any client to fire.
 */
export async function processScrabbleExpireTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; skipped?: boolean }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.phase === 'finished') return {}

  if (session.clock_mode === 'chess') return processScrabbleChessTimeout(supabase, gameId, session)

  if (!session.turn_deadline_at || new Date(session.turn_deadline_at).getTime() > Date.now()) return {}

  const loaded = await loadPlayerStates(supabase, gameId)
  if (loaded.error) return { error: loaded.error }
  const states = seatedStates(session, loaded.states)
  const names = await loadPlayerNames(supabase, gameId)
  const movingPlayerId = currentTurnPlayerId(session)
  const { error, won } = await advanceScorelessTurn(supabase, gameId, session, states, names, 'pass', movingPlayerId, [
    ...session.bag,
  ])
  if (error) return { error }
  // A lost claim (another action moved the session first) is not an expiry that happened.
  return won ? {} : { skipped: true }
}

/** Chess-clock flag-out: the current player's bank hit zero. Mark them out and hand
 *  the turn to the next player still on the clock — or end the game if none remain. */
async function processScrabbleChessTimeout(
  supabase: SupabaseClient,
  gameId: string,
  session: ScrabbleSession
): Promise<{ error?: string; skipped?: boolean }> {
  const loaded = await loadPlayerStates(supabase, gameId)
  if (loaded.error) return { error: loaded.error }
  const states = seatedStates(session, loaded.states)
  const names = await loadPlayerNames(supabase, gameId)
  const moverId = currentTurnPlayerId(session)
  const moverState = states.find((s) => s.player_id === moverId)
  if (!moverState) return {}

  // Recompute the bank authoritatively — bail if the client fired early and there's
  // actually time left (guards a premature /expire-turn against the real clock).
  const patch = chessClockPatch(session, moverState, Date.now())
  if (!patch || !patch.timed_out) return {}

  moverState.timed_out = true
  moverState.clock_ms_remaining = 0
  const flaggedName = names.get(moverId) ?? 'A player'
  const now = Date.now()
  const nextIndex = nextTurnIndex(session, states)

  if (nextIndex === -1) {
    // Everyone has flagged out — end the game (standard rack penalty, winner by score).
    const tileSet = tileSetForDictionary(await loadDictionaryId(supabase, gameId))
    const result = finalizeScores(states, names, null, tileSet.values)
    const finished = await finishScrabbleRound(supabase, gameId, session, {
      patch: {
        winner_player_id: result.winnerPlayerId,
        is_tie: result.isTie,
        status_message: `${flaggedName} ran out of time. ${result.statusMessage}`,
      },
      states: scoreWrites(states, result.finalScores, {
        playerId: moverState.player_id,
        write: { clock_ms_remaining: 0, timed_out: true },
      }),
    })
    if (finished.error) return { error: finished.error }
    return finished.won ? {} : { skipped: true }
  }

  const nextPlayerId = session.turn_order[nextIndex]
  const persisted = await persistSession(
    supabase,
    gameId,
    {
      current_turn_index: nextIndex,
      status_message: `${flaggedName} ran out of time. ${turnMessage(names, nextPlayerId)}`,
      turn_started_at: new Date(now).toISOString(),
      turn_deadline_at: null,
    },
    session.updated_at,
    // The flagged-out seat's clock commits with the claim.
    [{ player_id: moverState.player_id, clock_ms_remaining: 0, timed_out: true }]
  )
  if (persisted.error) return { error: persisted.error }
  return persisted.won ? {} : { skipped: true }
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

/**
 * Remove a player from a Scrabble game (they left or were kicked). Without this the
 * player's id stayed in `turn_order`, so the game kept handing them turns — a ghost
 * row with no name and a reset score, and a timer that kept counting on a player who
 * was gone. Drop them from the turn order (fixing current_turn_index), end the game
 * if fewer than two players remain, then delete their state + player row.
 *
 * The session write is compare-and-swapped on `updated_at`: the new turn state is derived
 * from a snapshot, so an unconditional write could clobber a concurrent play (handing the
 * mover a second turn) or a concurrent leave (dropping its removal), or leave the turn on
 * a removed player. A lost race retries against a freshly read session; the players row
 * is only deleted once the session write has landed.
 */
export const SCRABBLE_REMOVE_CONFLICT_ERROR = 'Game changed, please try again.'
const SCRABBLE_REMOVE_MAX_ATTEMPTS = 4

export async function removeScrabblePlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerName?: string
): Promise<{ error: string | null; retained?: boolean }> {
  for (let attempt = 0; attempt < SCRABBLE_REMOVE_MAX_ATTEMPTS; attempt++) {
    const result = await removeScrabblePlayerOnce(supabase, gameId, playerId, playerName)
    if (result !== 'retry') return result
  }
  return { error: SCRABBLE_REMOVE_CONFLICT_ERROR }
}

async function removeScrabblePlayerOnce(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerName?: string
): Promise<{ error: string | null; retained?: boolean } | 'retry'> {
  const { data: sessionRaw, error: lookupError } = await supabase
    .from('scrabble_sessions')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle()
  // A failed lookup is not "no session": falling through would delete the player's rows while the
  // session still lists them in turn_order. A successful lookup that finds no row still reaches cleanup.
  if (lookupError) return { error: internalErrorMessage('scrabble', lookupError) }
  const session = sessionRaw as ScrabbleSession | null
  const order = session ? [...(session.turn_order ?? [])] : []
  const removedIndex = order.indexOf(playerId)

  // The round was published while this leave was retrying and the seat was never removed from the live session:
  // the finished result keeps its seats (the players route retains them for a finished game). A seat that is
  // already out of the turn order still gets its cleanup below.
  // A reopened lobby (Play Again: games.status is back to 'waiting', the finished session row is still around) is
  // not a published result: its seats are ordinary lobby seats and the leave must delete them.
  let reopenedLobby = false
  if (session?.phase === 'finished' && removedIndex >= 0) {
    const { data: gameRow, error: gameError } = await supabase
      .from('games')
      .select('status')
      .eq('id', gameId)
      .maybeSingle()
    if (gameError) return { error: internalErrorMessage('scrabble', gameError) }
    if (gameRow?.status !== 'waiting') return { error: null, retained: true }
    reopenedLobby = true
  }

  // In an active game and actually in the turn order: rewrite the turn order.
  if (session && removedIndex >= 0 && session.phase !== 'finished') {
    const turnOrder = order.filter((id) => id !== playerId)
    let currentTurnIndex = session.current_turn_index
    if (removedIndex < currentTurnIndex) currentTurnIndex -= 1
    else if (removedIndex === currentTurnIndex && turnOrder.length > 0) currentTurnIndex %= turnOrder.length
    if (turnOrder.length === 0) currentTurnIndex = 0

    const removedName = playerName ?? 'A player'
    const { data: statesRaw, error: statesError } = await supabase
      .from('scrabble_player_state')
      .select('*')
      .eq('game_id', gameId)
    // A failed read is not "no seats": states = [] would let a chess-clock game finish with no winner.
    // Stop before any write, so the session and the player stay untouched and the leave can be retried.
    if (statesError) return { error: internalErrorMessage('scrabble', statesError) }
    // Only seats still in the (freshly read) turn order count: a concurrent leave that already shrank
    // turn_order but has not yet deleted its state row must not count as a winner / active seat / tie.
    const remaining = new Set(turnOrder)
    const states = ((statesRaw ?? []) as ScrabblePlayerState[]).filter((s) => remaining.has(s.player_id))
    const names = await loadPlayerNames(supabase, gameId)

    const update: Record<string, unknown> = {
      turn_order: turnOrder,
      current_turn_index: currentTurnIndex,
      consecutive_passes: 0,
      updated_at: new Date().toISOString(),
    }

    // Chess mode: a lone player still on the clock may keep playing solo, so only end
    // when nobody is left on the clock (or the room drops below two players entirely).
    const isChess = session.clock_mode === 'chess'
    const activeRemaining = isChess ? states.filter((s) => !s.timed_out).length : turnOrder.length
    const finishing = turnOrder.length < 2 || activeRemaining === 0
    if (finishing) {
      // Not enough players to keep going — the last player standing wins (by current score).
      let winnerPlayerId: string | null = null
      let isTie = false
      if (states.length > 0) {
        const best = Math.max(...states.map((s) => s.score))
        const leaders = states.filter((s) => s.score === best)
        isTie = leaders.length > 1
        winnerPlayerId = isTie ? null : leaders[0].player_id
      }
      const winnerName = winnerPlayerId ? (names.get(winnerPlayerId) ?? 'Winner') : null
      update.phase = 'finished'
      update.winner_player_id = winnerPlayerId
      update.is_tie = isTie
      update.status_message = winnerName
        ? `${removedName} left — ${winnerName} wins!`
        : `${removedName} left — game over.`
      update.turn_deadline_at = null
      update.turn_started_at = null
    } else if (isChess) {
      // Hand the turn to the next seat still on the clock (may be the current seat).
      const out = new Set(states.filter((s) => s.timed_out).map((s) => s.player_id))
      for (let step = 0; step < turnOrder.length; step += 1) {
        const cand = (currentTurnIndex + step) % turnOrder.length
        if (!out.has(turnOrder[cand])) {
          currentTurnIndex = cand
          break
        }
      }
      update.current_turn_index = currentTurnIndex
      const nextPlayerId = turnOrder[currentTurnIndex]
      update.status_message = `${removedName} left. ${turnMessage(names, nextPlayerId)}`
      update.turn_started_at = new Date().toISOString()
      update.turn_deadline_at = null
    } else {
      const timerSeconds = await loadTimerSeconds(supabase, gameId)
      const nextPlayerId = turnOrder[currentTurnIndex]
      update.status_message = `${removedName} left. ${turnMessage(names, nextPlayerId)}`
      update.turn_deadline_at = computeDeadline(timerSeconds, Date.now())
    }

    if (finishing) {
      // Not enough players to keep going: the round ends and the leaver's rows go in the same transaction.
      const finished = await finishScrabbleRound(supabase, gameId, session, { patch: update, removePlayerId: playerId })
      if (finished.error) return { error: finished.error }
      if (finished.won) return { error: null }
      return finished.already ? { error: null, retained: true } : 'retry'
    }

    const { data: claimed, error: sessionError } = await supabase
      .from('scrabble_sessions')
      .update(update)
      .eq('game_id', gameId)
      .eq('updated_at', session.updated_at)
      .select('game_id')
    if (sessionError) return { error: internalErrorMessage('scrabble', sessionError) }
    if (!claimed || claimed.length === 0) return 'retry'

    await supabase.from('scrabble_player_state').delete().eq('game_id', gameId).eq('player_id', playerId)
    const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
    return { error: error ? internalErrorMessage('scrabble', error) : null }
  }

  // Lobby, spectator, already-finished, or not in the turn order — just drop their state + row.
  if (reopenedLobby && session) {
    // The leaver's player row (and its state rows, by cascade) go FIRST. A deal that lands afterwards cannot seat
    // them (`deal_scrabble_session` rejects a seat whose player row is gone), and a deal that landed before changes
    // the session version, so the seat removal below loses and the retry takes the live-round leave path against
    // the new round.
    await supabase.from('scrabble_player_state').delete().eq('game_id', gameId).eq('player_id', playerId)
    const { error: rowError } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
    if (rowError) return { error: internalErrorMessage('scrabble', rowError) }
    const { data: seatUpdated, error: seatError } = await supabase
      .from('scrabble_sessions')
      .update({ turn_order: order.filter((id) => id !== playerId) })
      .eq('game_id', gameId)
      .eq('updated_at', session.updated_at)
      .select('game_id')
    if (seatError) return { error: internalErrorMessage('scrabble', seatError) }
    if (!seatUpdated || seatUpdated.length === 0) return 'retry'
    return { error: null }
  }
  await supabase.from('scrabble_player_state').delete().eq('game_id', gameId).eq('player_id', playerId)
  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  if (error) return { error: internalErrorMessage('scrabble', error) }
  // This path took no lock: a first deal that committed after the lookup (and accepted the leaver, whose row still
  // existed) may now list a seat whose rows were just deleted. Success only when no session lists the leaver; the
  // retry then takes the live-round path, which removes the seat from the turn order.
  const { data: after, error: afterError } = await supabase
    .from('scrabble_sessions')
    .select('turn_order')
    .eq('game_id', gameId)
    .maybeSingle()
  if (afterError) return { error: internalErrorMessage('scrabble', afterError) }
  if (((after?.turn_order as string[] | null) ?? []).includes(playerId)) return 'retry'
  return { error: null }
}
