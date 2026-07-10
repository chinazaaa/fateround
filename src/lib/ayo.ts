import { internalErrorMessage } from '@/lib/api-errors'
import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import type { AyoSession, AyoSide, AyoVariant } from '@/types'

export const AYO_MIN_PLAYERS = 2
export const AYO_MAX_PLAYERS = 2
export const AYO_DEFAULT_MAX_PLAYERS = 2

export const AYO_PIT_COUNT = 12
export const AYO_PITS_PER_SIDE = 6
export const AYO_STARTING_SEEDS = 4
export const AYO_TOTAL_SEEDS = 48

export const AYO_DEFAULT_VARIANT: AyoVariant = 'traditional'

export function parseAyoVariant(raw: unknown): AyoVariant {
  return raw === 'oware' ? 'oware' : 'traditional'
}

export type AyoBoardConfig = {
  variant: AyoVariant
  aRowSize: number
  bRowSize: number
}

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

export function startingPits(aRowSize = AYO_PITS_PER_SIDE, bRowSize = AYO_PITS_PER_SIDE): number[] {
  const pits = Array(AYO_PIT_COUNT).fill(0)
  for (let i = 0; i < aRowSize; i += 1) pits[i] = AYO_STARTING_SEEDS
  for (let i = 0; i < bRowSize; i += 1) pits[AYO_PITS_PER_SIDE + i] = AYO_STARTING_SEEDS
  return pits
}

export function rowSizeForSide(side: AyoSide, config: Pick<AyoBoardConfig, 'aRowSize' | 'bRowSize'>): number {
  return side === 'a' ? config.aRowSize : config.bRowSize
}

export function isPitActive(pit: number, config: Pick<AyoBoardConfig, 'aRowSize' | 'bRowSize'>): boolean {
  const side = sideOfPit(pit)
  const rowSize = rowSizeForSide(side, config)
  const { start } = rowRange(side)
  return pit >= start && pit < start + rowSize
}

export function activePitIndices(side: AyoSide, config: Pick<AyoBoardConfig, 'aRowSize' | 'bRowSize'>): number[] {
  const { start } = rowRange(side)
  const rowSize = rowSizeForSide(side, config)
  return Array.from({ length: rowSize }, (_, i) => start + i)
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

/** Pits on `side`'s row, low index first (0–5 for A, 6–11 for B). */
function rowRange(side: AyoSide): { start: number; end: number } {
  const start = side === 'a' ? 0 : AYO_PITS_PER_SIDE
  return { start, end: start + AYO_PITS_PER_SIDE - 1 }
}

function isOwareCaptureCount(count: number): boolean {
  return count === 2 || count === 3
}

/** Non-empty pits on `side`'s active row (ignores feeding). */
export function legalMoves(
  pits: number[],
  side: AyoSide,
  config: Pick<AyoBoardConfig, 'aRowSize' | 'bRowSize'> = { aRowSize: AYO_PITS_PER_SIDE, bRowSize: AYO_PITS_PER_SIDE }
): number[] {
  return activePitIndices(side, config).filter((pit) => pits[pit] > 0)
}

/** True if sowing from `pitIndex` drops at least one seed on the opponent's active row. */
export function moveFeedsOpponent(
  pits: number[],
  pitIndex: number,
  config: Pick<AyoBoardConfig, 'aRowSize' | 'bRowSize'> = { aRowSize: AYO_PITS_PER_SIDE, bRowSize: AYO_PITS_PER_SIDE }
): boolean {
  const moverSide = sideOfPit(pitIndex)
  const opponent = opponentSide(moverSide)
  let seeds = pits[pitIndex]
  let current = pitIndex

  while (seeds > 0) {
    current = nextPit(current)
    if (current === pitIndex) continue
    if (sideOfPit(current) === opponent && isPitActive(current, config)) return true
    seeds -= 1
  }
  return false
}

/**
 * Legal moves for `side`, including the feeding rule (oware only): when the opponent's row is
 * empty, you must sow into their row if any of your moves can do so.
 */
export function legalMovesForSide(pits: number[], side: AyoSide, config: AyoBoardConfig): number[] {
  const base = legalMoves(pits, side, config)
  if (config.variant !== 'oware') return base
  if (!hasSeedsOnSide(pits, opponentSide(side), config)) {
    const feeding = base.filter((pit) => moveFeedsOpponent(pits, pit, config))
    if (feeding.length > 0) return feeding
  }
  return base
}

export function hasSeedsOnSide(
  pits: number[],
  side: AyoSide,
  config: Pick<AyoBoardConfig, 'aRowSize' | 'bRowSize'> = { aRowSize: AYO_PITS_PER_SIDE, bRowSize: AYO_PITS_PER_SIDE }
): boolean {
  return legalMoves(pits, side, config).length > 0
}

export function totalSeedsOnSide(
  pits: number[],
  side: AyoSide,
  config: Pick<AyoBoardConfig, 'aRowSize' | 'bRowSize'> = { aRowSize: AYO_PITS_PER_SIDE, bRowSize: AYO_PITS_PER_SIDE }
): number {
  return activePitIndices(side, config).reduce((sum, pit) => sum + pits[pit], 0)
}

export function seedsOnBoard(pits: number[]): number {
  return pits.reduce((sum, n) => sum + n, 0)
}

export function opponentSide(side: AyoSide): AyoSide {
  return side === 'a' ? 'b' : 'a'
}

function nextActivePit(pit: number, config: Pick<AyoBoardConfig, 'aRowSize' | 'bRowSize'>): number {
  let current = pit
  for (let step = 0; step < AYO_PIT_COUNT; step += 1) {
    current = nextPit(current)
    if (isPitActive(current, config)) return current
  }
  throw new Error('No active pits')
}

/** Oware: capture linked opponent houses with 2 or 3 seeds. */
export function captureOwareFromLanding(
  pits: number[],
  landingPit: number,
  moverSide: AyoSide,
  config: Pick<AyoBoardConfig, 'aRowSize' | 'bRowSize'>
): { pits: number[]; capture: number } {
  const next = [...pits]
  const opponent = opponentSide(moverSide)
  if (sideOfPit(landingPit) !== opponent || !isOwareCaptureCount(next[landingPit])) {
    return { pits: next, capture: 0 }
  }

  const { start } = rowRange(opponent)
  const end = start + rowSizeForSide(opponent, config) - 1
  let capture = 0
  for (let i = landingPit; i >= start; i -= 1) {
    if (i > end || !isOwareCaptureCount(next[i])) break
    capture += next[i]
    next[i] = 0
  }
  return { pits: next, capture }
}

/** Traditional: completing four (3 + last seed) wins the house — owner depends on pit side and seeds left. */
export function resolveTraditionalHouseWin(
  landingPit: number,
  moverSide: AyoSide,
  seedsRemaining: number
): { winnerSide: AyoSide; turnEnds: boolean } {
  const landingSide = sideOfPit(landingPit)
  if (landingSide === moverSide) {
    return { winnerSide: moverSide, turnEnds: true }
  }
  if (seedsRemaining > 0) {
    return { winnerSide: landingSide, turnEnds: false }
  }
  return { winnerSide: moverSide, turnEnds: true }
}

/** Clears a pit that completed four and returns captured seed count. */
export function captureTraditionalFromLanding(
  pits: number[],
  landingPit: number
): { pits: number[]; capture: number; houses: number } {
  const next = [...pits]
  if (next[landingPit] !== 4) return { pits: next, capture: 0, houses: 0 }
  const capture = 4
  next[landingPit] = 0
  return { pits: next, capture, houses: 1 }
}

export type AyoSowStep =
  | { type: 'pickup'; pitIndex: number; seedsTaken: number; pitsAfter: number[] }
  | {
      type: 'drop'
      pitIndex: number
      countBefore: number
      countAfter: number
      seedsInHand: number
      pitsAfter: number[]
    }
  | {
      type: 'relay'
      pitIndex: number
      seedsPickedUp: number
      pitsAfter: number[]
    }
  | {
      type: 'house_win'
      pitIndex: number
      winnerSide: AyoSide
      turnEnds: boolean
      pitsAfter: number[]
    }
  | { type: 'end'; pitIndex: number; pitsAfter: number[] }

export type AyoSowTrace = {
  pits: number[]
  capture: number
  housesA: number
  housesB: number
  landingPit: number
  steps: AyoSowStep[]
}

function runTraditionalSow(
  pits: number[],
  pitIndex: number,
  config: AyoBoardConfig,
  recordSteps: boolean
): AyoSowTrace {
  const moverSide = sideOfPit(pitIndex)
  const next = [...pits]
  const steps: AyoSowStep[] = []
  let seeds = next[pitIndex]
  next[pitIndex] = 0
  if (recordSteps) {
    steps.push({ type: 'pickup', pitIndex, seedsTaken: seeds, pitsAfter: [...next] })
  }

  let current = pitIndex
  let capture = 0
  let housesA = 0
  let housesB = 0
  let landingPit = pitIndex

  while (seeds > 0) {
    current = nextActivePit(current, config)
    const before = next[current]
    next[current] += 1
    seeds -= 1
    landingPit = current
    const after = next[current]

    if (recordSteps) {
      steps.push({
        type: 'drop',
        pitIndex: current,
        countBefore: before,
        countAfter: after,
        seedsInHand: seeds,
        pitsAfter: [...next],
      })
    }

    if (after === 4 && before === 3) {
      const { winnerSide, turnEnds } = resolveTraditionalHouseWin(current, moverSide, seeds)
      next[current] = 0
      capture += 4
      if (winnerSide === 'a') housesA += 1
      else housesB += 1
      if (recordSteps) {
        steps.push({
          type: 'house_win',
          pitIndex: current,
          winnerSide,
          turnEnds,
          pitsAfter: [...next],
        })
      }
      if (turnEnds) break
      continue
    }

    if (seeds === 0) {
      if (before === 0) break
      const pickedUp = next[current]
      next[current] = 0
      seeds = pickedUp
      if (recordSteps) {
        steps.push({
          type: 'relay',
          pitIndex: current,
          seedsPickedUp: pickedUp,
          pitsAfter: [...next],
        })
      }
    }
  }

  if (recordSteps) {
    steps.push({ type: 'end', pitIndex: landingPit, pitsAfter: [...next] })
  }

  return { pits: next, capture, housesA, housesB, landingPit, steps }
}

/** Step-by-step trace of a traditional sow (for board animation). */
export function traceTraditionalSow(pits: number[], pitIndex: number, config: AyoBoardConfig): AyoSowTrace {
  return runTraditionalSow(pits, pitIndex, config, true)
}

function traceOwareSow(pits: number[], pitIndex: number, config: AyoBoardConfig): AyoSowTrace {
  const moverSide = sideOfPit(pitIndex)
  const steps: AyoSowStep[] = []
  let seeds = pits[pitIndex]
  const next = [...pits]
  next[pitIndex] = 0
  steps.push({ type: 'pickup', pitIndex, seedsTaken: seeds, pitsAfter: [...next] })

  let current = pitIndex
  while (seeds > 0) {
    current = nextPit(current)
    if (current === pitIndex) continue
    if (!isPitActive(current, config)) continue
    const before = next[current]
    next[current] += 1
    seeds -= 1
    steps.push({
      type: 'drop',
      pitIndex: current,
      countBefore: before,
      countAfter: next[current],
      seedsInHand: seeds,
      pitsAfter: [...next],
    })
  }

  const { pits: afterCapture, capture } = captureOwareFromLanding(next, current, moverSide, config)
  if (capture > 0) {
    steps.push({
      type: 'house_win',
      pitIndex: current,
      winnerSide: moverSide,
      turnEnds: true,
      pitsAfter: [...afterCapture],
    })
  }
  steps.push({ type: 'end', pitIndex: current, pitsAfter: [...afterCapture] })

  return {
    pits: afterCapture,
    capture,
    housesA: 0,
    housesB: 0,
    landingPit: current,
    steps,
  }
}

export function traceSowFromPit(pits: number[], pitIndex: number, config: AyoBoardConfig): AyoSowTrace {
  if (config.variant === 'traditional') return traceTraditionalSow(pits, pitIndex, config)
  return traceOwareSow(pits, pitIndex, config)
}

function sowTraditionalRelay(
  pits: number[],
  pitIndex: number,
  config: AyoBoardConfig
): { pits: number[]; capture: number; housesA: number; housesB: number; landingPit: number } {
  const { pits: sown, capture, housesA, housesB, landingPit } = runTraditionalSow(pits, pitIndex, config, false)
  return { pits: sown, capture, housesA, housesB, landingPit }
}

export function sowFromPit(
  pits: number[],
  pitIndex: number,
  config: AyoBoardConfig
): { pits: number[]; capture: number; housesA: number; housesB: number; landingPit: number } {
  const moverSide = sideOfPit(pitIndex)

  if (config.variant === 'traditional') {
    return sowTraditionalRelay(pits, pitIndex, config)
  }

  let seeds = pits[pitIndex]
  const next = [...pits]
  next[pitIndex] = 0
  let current = pitIndex

  while (seeds > 0) {
    current = nextPit(current)
    if (current === pitIndex) continue
    if (!isPitActive(current, config)) continue
    next[current] += 1
    seeds -= 1
  }

  const { pits: afterCapture, capture } = captureOwareFromLanding(next, current, moverSide, config)
  return { pits: afterCapture, capture, housesA: 0, housesB: 0, landingPit: current }
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

/** When `side` cannot move, the opponent sweeps every seed still on the board. */
export function sweepBoardToWinner(
  pits: number[],
  capturedA: number,
  capturedB: number,
  winner: AyoSide
): { pits: number[]; capturedA: number; capturedB: number } {
  const boardTotal = seedsOnBoard(pits)
  return {
    pits: Array(AYO_PIT_COUNT).fill(0),
    capturedA: capturedA + (winner === 'a' ? boardTotal : 0),
    capturedB: capturedB + (winner === 'b' ? boardTotal : 0),
  }
}

/** Game ends when `sideToMove` has no legal move (oware feeding applies). */
export function shouldEndGameForSide(pits: number[], sideToMove: AyoSide, config: AyoBoardConfig): boolean {
  if (seedsOnBoard(pits) === 0) return true
  return legalMovesForSide(pits, sideToMove, config).length === 0
}

/** Traditional deals end when the board is empty. */
export function shouldEndTraditionalDeal(pits: number[], config: AyoBoardConfig): boolean {
  if (seedsOnBoard(pits) === 0) return true
  return !hasSeedsOnSide(pits, 'a', config) && !hasSeedsOnSide(pits, 'b', config)
}

/** @deprecated Use shouldEndGameForSide — kept for tests migrating off the old rule. */
export function shouldEndGame(pits: number[]): boolean {
  return seedsOnBoard(pits) === 0
}

/** Next player is always the opponent. */
export function resolveNextTurn(mover: AyoSide): AyoSide {
  return opponentSide(mover)
}

export function dealWinnerFromHouses(
  housesA: number,
  housesB: number,
  capturedA: number,
  capturedB: number
): { draw: boolean; winnerSide: AyoSide | null } {
  if (housesA !== housesB) {
    return { draw: false, winnerSide: housesA > housesB ? 'a' : 'b' }
  }
  if (capturedA !== capturedB) {
    return { draw: false, winnerSide: capturedA > capturedB ? 'a' : 'b' }
  }
  return { draw: true, winnerSide: null }
}

export function applyRoundHouseTransfer(
  winnerSide: AyoSide,
  aRowSize: number,
  bRowSize: number
): { aRowSize: number; bRowSize: number; matchFinished: boolean } {
  if (winnerSide === 'a') {
    const nextB = Math.max(0, bRowSize - 1)
    return { aRowSize, bRowSize: nextB, matchFinished: nextB <= 0 }
  }
  const nextA = Math.max(0, aRowSize - 1)
  return { aRowSize: nextA, bRowSize, matchFinished: nextA <= 0 }
}

export type AyoMoveResult = {
  pits: number[]
  capturedA: number
  capturedB: number
  housesA: number
  housesB: number
  aRowSize: number
  bRowSize: number
  nextTurn: AyoSide
  finished: boolean
  draw: boolean
  winnerSide: AyoSide | null
  lastPit: number
  resultReason: 'most_seeds' | 'most_houses' | 'match_won' | null
  matchFinished: boolean
}

/** Apply a move for `side` from `pitIndex`. Pure — no DB. */
export function applyAyoMove(
  pits: number[],
  capturedA: number,
  capturedB: number,
  housesA: number,
  housesB: number,
  side: AyoSide,
  pitIndex: number,
  config: AyoBoardConfig
): AyoMoveResult {
  if (!pitBelongsToSide(pitIndex, side) || !isPitActive(pitIndex, config)) {
    throw new Error('Illegal pit')
  }
  if (pits[pitIndex] <= 0) {
    throw new Error('Empty pit')
  }

  const { pits: sown, capture, housesA: wonA, housesB: wonB, landingPit } = sowFromPit(pits, pitIndex, config)
  const nextCapturedA = side === 'a' ? capturedA + capture : capturedA
  const nextCapturedB = side === 'b' ? capturedB + capture : capturedB
  const nextHousesA = housesA + wonA
  const nextHousesB = housesB + wonB
  const nextTurn = resolveNextTurn(side)

  const endDeal =
    config.variant === 'traditional'
      ? shouldEndTraditionalDeal(sown, config)
      : shouldEndGameForSide(sown, nextTurn, config)

  if (!endDeal) {
    return {
      pits: sown,
      capturedA: nextCapturedA,
      capturedB: nextCapturedB,
      housesA: nextHousesA,
      housesB: nextHousesB,
      aRowSize: config.aRowSize,
      bRowSize: config.bRowSize,
      nextTurn,
      finished: false,
      draw: false,
      winnerSide: null,
      lastPit: landingPit,
      resultReason: null,
      matchFinished: false,
    }
  }

  if (config.variant === 'traditional') {
    const { draw, winnerSide } = dealWinnerFromHouses(nextHousesA, nextHousesB, nextCapturedA, nextCapturedB)
    let aRowSize = config.aRowSize
    let bRowSize = config.bRowSize
    let matchFinished = false
    let resultReason: AyoMoveResult['resultReason'] = 'most_houses'

    if (!draw && winnerSide) {
      const transfer = applyRoundHouseTransfer(winnerSide, aRowSize, bRowSize)
      aRowSize = transfer.aRowSize
      bRowSize = transfer.bRowSize
      matchFinished = transfer.matchFinished
      if (matchFinished) resultReason = 'match_won'
    }

    return {
      pits: sown,
      capturedA: nextCapturedA,
      capturedB: nextCapturedB,
      housesA: nextHousesA,
      housesB: nextHousesB,
      aRowSize,
      bRowSize,
      nextTurn,
      finished: true,
      draw,
      winnerSide,
      lastPit: landingPit,
      resultReason,
      matchFinished,
    }
  }

  const swept = sweepBoardToWinner(sown, nextCapturedA, nextCapturedB, side)
  const scoreA = swept.capturedA
  const scoreB = swept.capturedB
  const draw = scoreA === scoreB
  const winnerSide: AyoSide | null = draw ? null : scoreA > scoreB ? 'a' : 'b'
  return {
    pits: swept.pits,
    capturedA: scoreA,
    capturedB: scoreB,
    housesA: nextHousesA,
    housesB: nextHousesB,
    aRowSize: config.aRowSize,
    bRowSize: config.bRowSize,
    nextTurn,
    finished: true,
    draw,
    winnerSide,
    lastPit: landingPit,
    resultReason: 'most_seeds',
    matchFinished: false,
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

export function boardConfigFromSession(
  session: Pick<AyoSession, 'a_row_size' | 'b_row_size'>,
  variant: AyoVariant
): AyoBoardConfig {
  return {
    variant,
    aRowSize: session.a_row_size ?? AYO_PITS_PER_SIDE,
    bRowSize: session.b_row_size ?? AYO_PITS_PER_SIDE,
  }
}

export function ayoScores(
  session: Pick<AyoSession, 'pits' | 'captured_a' | 'captured_b' | 'a_row_size' | 'b_row_size'>,
  variant: AyoVariant = 'oware'
): { a: number; b: number } {
  const config = boardConfigFromSession(session, variant)
  return {
    a: session.captured_a + totalSeedsOnSide(session.pits, 'a', config),
    b: session.captured_b + totalSeedsOnSide(session.pits, 'b', config),
  }
}

export function ayoHouseScores(session: Pick<AyoSession, 'houses_a' | 'houses_b'>): { a: number; b: number } {
  return { a: session.houses_a ?? 0, b: session.houses_b ?? 0 }
}

export function ayoResultDetail(reason: string | null | undefined, variant: AyoVariant = 'traditional'): string {
  switch (reason) {
    case 'most_houses':
      return 'with the most houses won'
    case 'match_won':
      return variant === 'traditional' ? 'match won — all opponent houses taken' : 'match won'
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

export async function canAyoPlayAgain(supabase: SupabaseClient, gameId: string, gameStatus: string): Promise<boolean> {
  if (gameStatus === 'waiting' || gameStatus === 'finished') return true
  if (gameStatus !== 'active') return false

  const { data: session } = await supabase.from('ayo_sessions').select('status').eq('game_id', gameId).maybeSingle()
  return session?.status === 'finished'
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

function turnMessage(name: string, _side: AyoSide): string {
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
    .select('player_a_id, player_b_id, a_win_streak, b_win_streak, a_row_size, b_row_size, match_round, result_reason')
    .eq('game_id', gameId)
    .maybeSingle()

  let aId: string
  let bId: string
  let aStreak = 0
  let bStreak = 0
  let aRowSize = AYO_PITS_PER_SIDE
  let bRowSize = AYO_PITS_PER_SIDE
  let matchRound = 1

  if (existing) {
    bId = existing.player_a_id
    aId = existing.player_b_id
    aStreak = existing.b_win_streak ?? 0
    bStreak = existing.a_win_streak ?? 0
    aRowSize = existing.a_row_size ?? AYO_PITS_PER_SIDE
    bRowSize = existing.b_row_size ?? AYO_PITS_PER_SIDE
    matchRound = (existing.match_round ?? 1) + 1
    if (existing.result_reason === 'match_won' || aRowSize <= 0 || bRowSize <= 0) {
      aRowSize = AYO_PITS_PER_SIDE
      bRowSize = AYO_PITS_PER_SIDE
      matchRound = 1
    }
    if (!playerIds.includes(aId) || !playerIds.includes(bId)) {
      ;[aId, bId] = shuffle(playerIds)
      aStreak = 0
      bStreak = 0
      aRowSize = AYO_PITS_PER_SIDE
      bRowSize = AYO_PITS_PER_SIDE
      matchRound = 1
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
    pits: startingPits(aRowSize, bRowSize),
    captured_a: 0,
    captured_b: 0,
    houses_a: 0,
    houses_b: 0,
    match_round: matchRound,
    a_row_size: aRowSize,
    b_row_size: bRowSize,
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
  const session = normalizeAyoSession(data as AyoSession)
  if (!Array.isArray(session.pits) || session.pits.length !== AYO_PIT_COUNT) {
    return { session: null, error: 'Invalid board state' }
  }
  return { session }
}

function normalizeAyoSession(session: AyoSession): AyoSession {
  return {
    ...session,
    houses_a: session.houses_a ?? 0,
    houses_b: session.houses_b ?? 0,
    match_round: session.match_round ?? 1,
    a_row_size: session.a_row_size ?? AYO_PITS_PER_SIDE,
    b_row_size: session.b_row_size ?? AYO_PITS_PER_SIDE,
  }
}

async function loadAyoVariant(supabase: SupabaseClient, gameId: string): Promise<AyoVariant> {
  const { data } = await supabase.from('games').select('ayo_variant').eq('id', gameId).maybeSingle()
  return parseAyoVariant(data?.ayo_variant)
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

  const variant = await loadAyoVariant(supabase, gameId)
  const config = boardConfigFromSession(session, variant)

  const pitIndex = move.pitIndex
  if (!Number.isInteger(pitIndex) || pitIndex < 0 || pitIndex >= AYO_PIT_COUNT) {
    return { error: 'Illegal pit' }
  }
  if (!legalMovesForSide(session.pits, side, config).includes(pitIndex)) {
    return { error: 'Illegal move' }
  }

  let result: AyoMoveResult
  try {
    result = applyAyoMove(
      session.pits,
      session.captured_a,
      session.captured_b,
      session.houses_a,
      session.houses_b,
      side,
      pitIndex,
      config
    )
  } catch {
    return { error: 'Illegal move' }
  }

  const timed = ayoIsTimed(session)
  const now = Date.now()
  let aMs = session.a_time_ms
  let bMs = session.b_time_ms
  let finished = result.finished
  let draw = result.draw
  let reason: string | null = finished ? result.resultReason : null
  let winnerSide = result.winnerSide
  const aRowSize = result.aRowSize
  const bRowSize = result.bRowSize
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
        ? variant === 'traditional'
          ? "It's a draw — equal houses!"
          : "It's a draw — 24 seeds each!"
        : reason === 'match_won'
          ? `${names.get(winnerPlayerId!) ?? 'Winner'} wins the match! Ọta!`
          : variant === 'traditional'
            ? `Round ${session.match_round}: ${names.get(winnerPlayerId!) ?? 'Winner'} wins the deal!`
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
      houses_a: result.housesA,
      houses_b: result.housesB,
      a_row_size: aRowSize,
      b_row_size: bRowSize,
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
