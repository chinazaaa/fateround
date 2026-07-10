import { internalErrorMessage } from '@/lib/api-errors'
import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import type { AyoSession, AyoSide } from '@/types'

export const AYO_MIN_PLAYERS = 2
export const AYO_MAX_PLAYERS = 2
export const AYO_DEFAULT_MAX_PLAYERS = 2

export const AYO_PIT_COUNT = 12
export const AYO_PITS_PER_SIDE = 6
export const AYO_STARTING_SEEDS = 4
export const AYO_TOTAL_SEEDS = 48

/** Per-player total clock options, in seconds (0 = untimed). */
export const AYO_TIME_OPTIONS = [0, 30, 180, 300, 600] as const
export const AYO_DEFAULT_TIME_SECONDS = 0

export type AyoMoveRequest = { pitIndex: number }

export function clampAyoTimer(value: unknown): number {
  const n = Number(value)
  return (AYO_TIME_OPTIONS as readonly number[]).includes(n) ? n : AYO_DEFAULT_TIME_SECONDS
}

export function ayoIsTimed(session: Pick<AyoSession, 'a_time_ms' | 'b_time_ms'>): boolean {
  return session.a_time_ms != null && session.b_time_ms != null
}

// ---------------------------------------------------------------------------
// Pure board helpers (no DB) — exported for unit testing.
// ---------------------------------------------------------------------------

export function startingPits(): number[] {
  return Array(AYO_PIT_COUNT).fill(AYO_STARTING_SEEDS)
}

export function sideOfPit(pit: number): AyoSide {
  return pit < AYO_PITS_PER_SIDE ? 'a' : 'b'
}

export function pitBelongsToSide(pit: number, side: AyoSide): boolean {
  return sideOfPit(pit) === side
}

export function nextPit(pit: number): number {
  return (pit + 1) % AYO_PIT_COUNT
}

export function legalMoves(pits: number[], side: AyoSide): number[] {
  const start = side === 'a' ? 0 : AYO_PITS_PER_SIDE
  const moves: number[] = []
  for (let i = start; i < start + AYO_PITS_PER_SIDE; i += 1) {
    if (pits[i] > 0) moves.push(i)
  }
  return moves
}

export function hasSeedsOnSide(pits: number[], side: AyoSide): boolean {
  return legalMoves(pits, side).length > 0
}

export function totalSeedsOnSide(pits: number[], side: AyoSide): number {
  const start = side === 'a' ? 0 : AYO_PITS_PER_SIDE
  let sum = 0
  for (let i = start; i < start + AYO_PITS_PER_SIDE; i += 1) sum += pits[i]
  return sum
}

export function seedsOnBoard(pits: number[]): number {
  return pits.reduce((sum, n) => sum + n, 0)
}

export function opponentSide(side: AyoSide): AyoSide {
  return side === 'a' ? 'b' : 'a'
}

/** Sow seeds from `pitIndex` anti-clockwise; apply capture-on-four on opponent pits. */
export function sowFromPit(pits: number[], pitIndex: number): { pits: number[]; capture: number; landingPit: number } {
  let seeds = pits[pitIndex]
  const next = [...pits]
  next[pitIndex] = 0
  let current = pitIndex
  const moverSide = sideOfPit(pitIndex)

  while (seeds > 0) {
    current = nextPit(current)
    next[current] += 1
    seeds -= 1
  }

  let capture = 0
  if (sideOfPit(current) !== moverSide && next[current] === 4) {
    capture = 4
    next[current] = 0
  }

  return { pits: next, capture, landingPit: current }
}

export function collectRemainingSeeds(
  pits: number[],
  capturedA: number,
  capturedB: number
): { pits: number[]; capturedA: number; capturedB: number } {
  const aRemain = totalSeedsOnSide(pits, 'a')
  const bRemain = totalSeedsOnSide(pits, 'b')
  return {
    pits: Array(AYO_PIT_COUNT).fill(0),
    capturedA: capturedA + aRemain,
    capturedB: capturedB + bRemain,
  }
}

export function shouldEndGame(pits: number[]): boolean {
  if (seedsOnBoard(pits) === 0) return true
  // Game ends when either row is exhausted — remaining seeds are collected.
  return !hasSeedsOnSide(pits, 'a') || !hasSeedsOnSide(pits, 'b')
}

/** Who moves next after `mover` — opponent if they can, otherwise mover again, else mover (game ends). */
export function resolveNextTurn(pits: number[], mover: AyoSide): AyoSide {
  const other = opponentSide(mover)
  if (hasSeedsOnSide(pits, other)) return other
  if (hasSeedsOnSide(pits, mover)) return mover
  return other
}

export function totalScore(capturedA: number, capturedB: number, side: AyoSide): number {
  return side === 'a' ? capturedA : capturedB
}

export type AyoMoveResult = {
  pits: number[]
  capturedA: number
  capturedB: number
  nextTurn: AyoSide
  finished: boolean
  draw: boolean
  winnerSide: AyoSide | null
  lastPit: number
}

/** Apply a move for `side` from `pitIndex`. Pure — no DB. */
export function applyAyoMove(
  pits: number[],
  capturedA: number,
  capturedB: number,
  side: AyoSide,
  pitIndex: number
): AyoMoveResult {
  if (!pitBelongsToSide(pitIndex, side)) {
    throw new Error('Illegal pit')
  }
  if (pits[pitIndex] <= 0) {
    throw new Error('Empty pit')
  }

  const { pits: sown, capture, landingPit } = sowFromPit(pits, pitIndex)
  const nextCapturedA = side === 'a' ? capturedA + capture : capturedA
  const nextCapturedB = side === 'b' ? capturedB + capture : capturedB

  if (shouldEndGame(sown)) {
    const collected = collectRemainingSeeds(sown, nextCapturedA, nextCapturedB)
    const scoreA = collected.capturedA
    const scoreB = collected.capturedB
    const draw = scoreA === scoreB
    const winnerSide: AyoSide | null = draw ? null : scoreA > scoreB ? 'a' : 'b'
    return {
      pits: collected.pits,
      capturedA: scoreA,
      capturedB: scoreB,
      nextTurn: side,
      finished: true,
      draw,
      winnerSide,
      lastPit: landingPit,
    }
  }

  const nextTurn = resolveNextTurn(sown, side)
  return {
    pits: sown,
    capturedA: nextCapturedA,
    capturedB: nextCapturedB,
    nextTurn,
    finished: false,
    draw: false,
    winnerSide: null,
    lastPit: landingPit,
  }
}

// ---------------------------------------------------------------------------
// Session helpers (DB-backed) — mirror src/lib/checkers.ts.
// ---------------------------------------------------------------------------

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function sideForPlayer(session: AyoSession, playerId: string): AyoSide | null {
  if (session.player_a_id === playerId) return 'a'
  if (session.player_b_id === playerId) return 'b'
  return null
}

export function currentTurnPlayerId(session: AyoSession): string {
  return session.current_turn === 'a' ? session.player_a_id : session.player_b_id
}

export function playerIdForSide(session: AyoSession, side: AyoSide): string {
  return side === 'a' ? session.player_a_id : session.player_b_id
}

export function ayoScores(session: Pick<AyoSession, 'pits' | 'captured_a' | 'captured_b'>): {
  a: number
  b: number
} {
  return {
    a: session.captured_a + totalSeedsOnSide(session.pits, 'a'),
    b: session.captured_b + totalSeedsOnSide(session.pits, 'b'),
  }
}

export async function canAyoPlayAgain(supabase: SupabaseClient, gameId: string, gameStatus: string): Promise<boolean> {
  if (gameStatus === 'waiting' || gameStatus === 'finished') return true
  if (gameStatus !== 'active') return false

  const { data: session } = await supabase.from('ayo_sessions').select('status').eq('game_id', gameId).maybeSingle()
  return session?.status === 'finished'
}

export function ayoResultDetail(reason: string | null | undefined): string {
  switch (reason) {
    case 'most_seeds':
      return 'with the most captured seeds'
    case 'timeout':
      return 'on time'
    case 'resignation':
      return 'by resignation'
    default:
      return ''
  }
}

export function isAyoChampion(streak: number): boolean {
  return streak >= 3
}

export function isAyoResultsPhase(
  gameStatus: string | undefined,
  session: Pick<AyoSession, 'status' | 'is_draw' | 'winner_player_id'> | null | undefined
): boolean {
  if (!gameStatus || gameStatus === 'waiting') return false
  if (gameStatus === 'finished') return true
  if (!session) return false
  return session.status === 'finished' || session.is_draw || !!session.winner_player_id
}

async function loadPlayerNames(supabase: SupabaseClient, gameId: string): Promise<Map<string, string>> {
  const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
  const names = new Map<string, string>()
  for (const p of playerRows ?? []) names.set(p.id, p.name)
  return names
}

function turnMessage(name: string, side: AyoSide): string {
  return `${name}'s turn`
}

function sideLabel(side: AyoSide): string {
  return side === 'a' ? 'Player A' : 'Player B'
}

export async function initializeAyoGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  if (playerIds.length !== AYO_MIN_PLAYERS) {
    return { error: `Need exactly ${AYO_MIN_PLAYERS} players to start` }
  }

  const { data: existing } = await supabase
    .from('ayo_sessions')
    .select('player_a_id, player_b_id, a_win_streak, b_win_streak')
    .eq('game_id', gameId)
    .maybeSingle()

  let aId: string
  let bId: string
  let aStreak = 0
  let bStreak = 0

  if (existing) {
    bId = existing.player_a_id
    aId = existing.player_b_id
    aStreak = existing.b_win_streak ?? 0
    bStreak = existing.a_win_streak ?? 0
    if (!playerIds.includes(aId) || !playerIds.includes(bId)) {
      ;[aId, bId] = shuffle(playerIds)
      aStreak = 0
      bStreak = 0
    }
  } else {
    ;[aId, bId] = shuffle(playerIds)
  }

  if (!aId || !bId) return { error: 'Need exactly 2 players to start' }

  const { data: gameRow } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
  const timerSeconds = gameRow?.timer_seconds ?? 0
  const initialMs = timerSeconds > 0 ? timerSeconds * 1000 : null

  const names = await loadPlayerNames(supabase, gameId)
  const now = Date.now()

  const sessionRow = {
    player_a_id: aId,
    player_b_id: bId,
    pits: startingPits(),
    captured_a: 0,
    captured_b: 0,
    current_turn: 'a' as const,
    a_time_ms: initialMs,
    b_time_ms: initialMs,
    a_win_streak: aStreak,
    b_win_streak: bStreak,
    turn_started_at: new Date(now).toISOString(),
    last_pit: null,
    status: 'active' as const,
    result_reason: null,
    winner_player_id: null,
    is_draw: false,
    status_message: turnMessage(names.get(aId) ?? sideLabel('a'), 'a'),
    turn_deadline_at: initialMs != null ? new Date(now + initialMs).toISOString() : null,
    updated_at: new Date().toISOString(),
  }

  const { error } = existing
    ? await supabase.from('ayo_sessions').update(sessionRow).eq('game_id', gameId)
    : await supabase.from('ayo_sessions').insert({ ...sessionRow, game_id: gameId })
  if (error) return { error: internalErrorMessage('ayo', error) }
  return {}
}

async function loadSession(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ session: AyoSession | null; error?: string }> {
  const { data, error } = await supabase.from('ayo_sessions').select('*').eq('game_id', gameId).maybeSingle()
  if (error) return { session: null, error: internalErrorMessage('ayo', error) }
  if (!data) return { session: null }
  const session = data as AyoSession
  if (!Array.isArray(session.pits) || session.pits.length !== AYO_PIT_COUNT) {
    return { session: null, error: 'Invalid board state' }
  }
  return { session }
}

async function persistSession(
  supabase: SupabaseClient,
  gameId: string,
  patch: Partial<AyoSession>,
  expectedUpdatedAt: string
): Promise<boolean> {
  const { data } = await supabase
    .from('ayo_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('updated_at', expectedUpdatedAt)
    .select('game_id')
  return (data?.length ?? 0) > 0
}

function finishStreaks(
  session: AyoSession,
  winnerSide: AyoSide | null,
  draw: boolean
): { a_win_streak: number; b_win_streak: number } {
  if (draw || !winnerSide) {
    return { a_win_streak: 0, b_win_streak: 0 }
  }
  if (winnerSide === 'a') {
    return { a_win_streak: session.a_win_streak + 1, b_win_streak: 0 }
  }
  return { a_win_streak: 0, b_win_streak: session.b_win_streak + 1 }
}

export async function processAyoMove(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  move: AyoMoveRequest
): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.status === 'finished') return { error: 'Game already finished' }

  const side = sideForPlayer(session, playerId)
  if (!side) return { error: 'You are not in this game' }
  if (session.current_turn !== side) return { error: "It's not your turn" }

  const pitIndex = move.pitIndex
  if (!Number.isInteger(pitIndex) || pitIndex < 0 || pitIndex >= AYO_PIT_COUNT) {
    return { error: 'Illegal pit' }
  }
  if (!legalMoves(session.pits, side).includes(pitIndex)) {
    return { error: 'Illegal move' }
  }

  let result: AyoMoveResult
  try {
    result = applyAyoMove(session.pits, session.captured_a, session.captured_b, side, pitIndex)
  } catch {
    return { error: 'Illegal move' }
  }

  const timed = ayoIsTimed(session)
  const now = Date.now()
  let aMs = session.a_time_ms
  let bMs = session.b_time_ms
  let finished = result.finished
  let draw = result.draw
  let reason: string | null = finished ? 'most_seeds' : null
  let winnerSide = result.winnerSide

  if (timed) {
    const startedAt = session.turn_started_at ? new Date(session.turn_started_at).getTime() : now
    const elapsed = Math.max(0, now - startedAt)
    if (side === 'a') aMs = Math.max(0, (session.a_time_ms ?? 0) - elapsed)
    else bMs = Math.max(0, (session.b_time_ms ?? 0) - elapsed)

    const moverRemaining = (side === 'a' ? aMs : bMs) ?? 0
    if (moverRemaining <= 0 && !finished) {
      finished = true
      draw = false
      reason = 'timeout'
      winnerSide = opponentSide(side)
    }
  }

  const names = await loadPlayerNames(supabase, gameId)
  const winnerPlayerId = winnerSide ? playerIdForSide(session, winnerSide) : null
  const moverName = names.get(playerId) ?? sideLabel(side)
  const nextPlayerId = playerIdForSide(session, result.nextTurn)
  const nextName = names.get(nextPlayerId) ?? sideLabel(result.nextTurn)
  const streaks = finished ? finishStreaks(session, winnerSide, draw) : {}

  const statusMessage = finished
    ? reason === 'timeout'
      ? `${moverName} ran out of time — ${names.get(winnerPlayerId!) ?? 'Opponent'} is Ọta!`
      : draw
        ? "It's a draw — 24 seeds each!"
        : `${names.get(winnerPlayerId!) ?? 'Winner'} is Ọta! Mo ki ota, mo ki ope o.`
    : turnMessage(nextName, result.nextTurn)

  const nextRemaining = result.nextTurn === 'a' ? aMs : bMs
  const nextDeadline = !finished && timed && nextRemaining != null ? new Date(now + nextRemaining).toISOString() : null

  const won = await persistSession(
    supabase,
    gameId,
    {
      pits: result.pits,
      captured_a: result.capturedA,
      captured_b: result.capturedB,
      current_turn: result.nextTurn,
      a_time_ms: aMs,
      b_time_ms: bMs,
      last_pit: result.lastPit,
      status: finished ? 'finished' : 'active',
      result_reason: reason,
      winner_player_id: winnerPlayerId,
      is_draw: draw,
      status_message: statusMessage,
      turn_started_at: finished ? null : new Date(now).toISOString(),
      turn_deadline_at: nextDeadline,
      ...streaks,
    },
    session.updated_at
  )
  if (!won) return {}

  if (finished) {
    await markGameFinished(supabase, gameId)
  }

  return {}
}

export async function processAyoExpireTurn(supabase: SupabaseClient, gameId: string): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.status === 'finished') return {}
  if (!session.turn_deadline_at || new Date(session.turn_deadline_at).getTime() > Date.now()) return {}

  const names = await loadPlayerNames(supabase, gameId)
  const loserSide = session.current_turn
  const winnerSide = opponentSide(loserSide)
  const winnerPlayerId = playerIdForSide(session, winnerSide)
  const loserName = names.get(playerIdForSide(session, loserSide)) ?? sideLabel(loserSide)
  const winnerName = names.get(winnerPlayerId) ?? sideLabel(winnerSide)
  const streaks = finishStreaks(session, winnerSide, false)

  const won = await persistSession(
    supabase,
    gameId,
    {
      status: 'finished',
      result_reason: 'timeout',
      winner_player_id: winnerPlayerId,
      is_draw: false,
      a_time_ms: loserSide === 'a' ? 0 : session.a_time_ms,
      b_time_ms: loserSide === 'b' ? 0 : session.b_time_ms,
      turn_started_at: null,
      status_message: `${loserName} ran out of time — ${winnerName} is Ọta!`,
      turn_deadline_at: null,
      ...streaks,
    },
    session.updated_at
  )
  if (!won) return {}

  await markGameFinished(supabase, gameId)
  return {}
}

export async function processAyoResign(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { session, error: loadError } = await loadSession(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Game not found' }
  if (session.status === 'finished') return {}

  const side = sideForPlayer(session, playerId)
  if (!side) return { error: 'You are not in this game' }

  const names = await loadPlayerNames(supabase, gameId)
  const winnerSide = opponentSide(side)
  const winnerPlayerId = playerIdForSide(session, winnerSide)
  const loserName = names.get(playerId) ?? sideLabel(side)
  const winnerName = names.get(winnerPlayerId) ?? sideLabel(winnerSide)
  const streaks = finishStreaks(session, winnerSide, false)

  const won = await persistSession(
    supabase,
    gameId,
    {
      status: 'finished',
      result_reason: 'resignation',
      winner_player_id: winnerPlayerId,
      is_draw: false,
      status_message: `${loserName} resigned — ${winnerName} is Ọta!`,
      turn_deadline_at: null,
      ...streaks,
    },
    session.updated_at
  )
  if (!won) return {}

  await markGameFinished(supabase, gameId)
  return {}
}

export async function clearAyoSessionData(_supabase: SupabaseClient, _gameId: string): Promise<{ error?: string }> {
  return {}
}

export async function removeAyoPlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerName?: string
): Promise<{ error: string | null }> {
  const { data: sessionRaw } = await supabase.from('ayo_sessions').select('*').eq('game_id', gameId).maybeSingle()
  const session = sessionRaw as AyoSession | null

  if (
    session &&
    session.status === 'active' &&
    (session.player_a_id === playerId || session.player_b_id === playerId)
  ) {
    const side = sideForPlayer(session, playerId)!
    const otherId = playerIdForSide(session, opponentSide(side))
    const names = await loadPlayerNames(supabase, gameId)
    const loserName = playerName ?? names.get(playerId) ?? sideLabel(side)
    const winnerName = names.get(otherId) ?? 'Opponent'
    const streaks = finishStreaks(session, opponentSide(side), false)

    const { error: sessionError } = await supabase
      .from('ayo_sessions')
      .update({
        status: 'finished',
        result_reason: 'resignation',
        winner_player_id: otherId,
        is_draw: false,
        status_message: `${loserName} left — ${winnerName} is Ọta!`,
        turn_deadline_at: null,
        updated_at: new Date().toISOString(),
        ...streaks,
      })
      .eq('game_id', gameId)
    if (sessionError) return { error: internalErrorMessage('ayo', sessionError) }

    await markGameFinished(supabase, gameId)
    const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
    return { error: error?.message ?? null }
  }

  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  return { error: error?.message ?? null }
}
