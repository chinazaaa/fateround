import { internalErrorMessage } from '@/lib/api-errors'
import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import type { AyoSession, AyoSide, AyoStats, AyoVariant } from '@/types'
import { AYO_DEFAULT_MAX_PLAYERS, AYO_MAX_PLAYERS, AYO_MIN_PLAYERS } from '@/lib/player-limits'
export { AYO_DEFAULT_MAX_PLAYERS, AYO_MAX_PLAYERS, AYO_MIN_PLAYERS }

export const AYO_PIT_COUNT = 12
export const AYO_PITS_PER_SIDE = 6
export const AYO_STARTING_SEEDS = 4
export const AYO_TOTAL_SEEDS = 48

export const AYO_DEFAULT_VARIANT: AyoVariant = 'traditional'

export function parseAyoVariant(_raw: unknown): AyoVariant {
  // Oware is temporarily disabled — every Ayo game is Traditional. This is the single
  // chokepoint the server routes rules through, so it also normalises any legacy
  // 'oware' rows. To restore Oware: return raw === 'oware' ? 'oware' : 'traditional'.
  return 'traditional'
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
  /** Total seeds dropped across the whole move, relay laps included (a full board lap == 12). */
  seedsSown: number
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
  let seedsSown = 0

  // Relay sowing continues laps until a lap's last seed lands in an empty house
  // or completes a capture. In a pathological full board it could fail to reach
  // a stop, so bound the total seeds moved to guarantee the move terminates.
  let guard = 0
  const guardMax = AYO_TOTAL_SEEDS * AYO_PIT_COUNT * 4

  while (seeds > 0) {
    current = nextActivePit(current, config)
    const before = next[current]
    next[current] += 1
    seeds -= 1
    seedsSown += 1
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

    if (seeds === 0) {
      // Only the last seed of a lap can capture or end the turn.
      if (after === 4) {
        // Completing exactly four wins the house for the mover — whether it is
        // the mover's own house or the opponent's. The turn ends.
        next[current] = 0
        capture += 4
        if (moverSide === 'a') housesA += 1
        else housesB += 1
        if (recordSteps) {
          steps.push({
            type: 'house_win',
            pitIndex: current,
            winnerSide: moverSide,
            turnEnds: true,
            pitsAfter: [...next],
          })
        }
        break
      }
      if (before === 0) break // landed in an empty house — turn ends, no capture
      // Non-empty landing (2, 3, 5, 6…), e.g. 4+1=5 wins nothing: pick up all and keep sowing.
      const pickedUp = next[current]
      next[current] = 0
      seeds = pickedUp
      if (recordSteps) {
        steps.push({ type: 'relay', pitIndex: current, seedsPickedUp: pickedUp, pitsAfter: [...next] })
      }
    }

    guard += 1
    if (guard > guardMax) break
  }

  if (recordSteps) {
    steps.push({ type: 'end', pitIndex: landingPit, pitsAfter: [...next] })
  }

  return { pits: next, capture, housesA, housesB, landingPit, seedsSown, steps }
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
  let seedsSown = 0
  while (seeds > 0) {
    current = nextPit(current)
    if (current === pitIndex) continue
    if (!isPitActive(current, config)) continue
    const before = next[current]
    next[current] += 1
    seeds -= 1
    seedsSown += 1
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
    seedsSown,
    steps,
  }
}

export function traceSowFromPit(pits: number[], pitIndex: number, config: AyoBoardConfig): AyoSowTrace {
  if (config.variant === 'traditional') return traceTraditionalSow(pits, pitIndex, config)
  return traceOwareSow(pits, pitIndex, config)
}

type AyoSowResult = {
  pits: number[]
  capture: number
  housesA: number
  housesB: number
  landingPit: number
  seedsSown: number
}

function sowTraditionalRelay(pits: number[], pitIndex: number, config: AyoBoardConfig): AyoSowResult {
  const {
    pits: sown,
    capture,
    housesA,
    housesB,
    landingPit,
    seedsSown,
  } = runTraditionalSow(pits, pitIndex, config, false)
  return { pits: sown, capture, housesA, housesB, landingPit, seedsSown }
}

export function sowFromPit(pits: number[], pitIndex: number, config: AyoBoardConfig): AyoSowResult {
  const moverSide = sideOfPit(pitIndex)

  if (config.variant === 'traditional') {
    return sowTraditionalRelay(pits, pitIndex, config)
  }

  let seeds = pits[pitIndex]
  const next = [...pits]
  next[pitIndex] = 0
  let current = pitIndex
  let seedsSown = 0

  while (seeds > 0) {
    current = nextPit(current)
    if (current === pitIndex) continue
    if (!isPitActive(current, config)) continue
    next[current] += 1
    seeds -= 1
    seedsSown += 1
  }

  const { pits: afterCapture, capture } = captureOwareFromLanding(next, current, moverSide, config)
  return { pits: afterCapture, capture, housesA: 0, housesB: 0, landingPit: current, seedsSown }
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
  /** Seeds moved in this sow, relay laps included — for the per-game accumulator. */
  seedsSown: number
  /** Seeds captured by THIS move (0 or 4) — for the per-game accumulator. */
  capturedThisMove: number
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

  const {
    pits: sown,
    capture,
    housesA: wonA,
    housesB: wonB,
    landingPit,
    seedsSown,
  } = sowFromPit(pits, pitIndex, config)
  let nextCapturedA = side === 'a' ? capturedA + capture : capturedA
  let nextCapturedB = side === 'b' ? capturedB + capture : capturedB
  let nextHousesA = housesA + wonA
  let nextHousesB = housesB + wonB
  const nextTurn = resolveNextTurn(side)

  if (config.variant === 'traditional') {
    let finalPits = sown
    const boardLeft = seedsOnBoard(sown)

    // Official endgame rule: once only eight seeds remain, the player who captures
    // the first four automatically receives the remaining four, which are not
    // replayed. Every capture removes exactly four, so a capture that leaves four
    // on the board is that moment — award the tail to the mover and end the game.
    const eightSeedEndgame = capture > 0 && boardLeft === 4
    if (eightSeedEndgame) {
      finalPits = Array(AYO_PIT_COUNT).fill(0)
      if (side === 'a') {
        nextCapturedA += 4
        nextHousesA += 1
      } else {
        nextCapturedB += 4
        nextHousesB += 1
      }
    }

    // The game also ends if the board is now empty or the next player is blocked.
    const gameOver = eightSeedEndgame || boardLeft === 0 || legalMovesForSide(sown, nextTurn, config).length === 0

    if (!gameOver) {
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
        seedsSown,
        capturedThisMove: capture,
      }
    }

    // If a side was blocked with seeds still on the board, each side keeps the
    // seeds on its own row so all 48 are accounted for before scoring.
    if (!eightSeedEndgame && boardLeft > 0) {
      const collected = collectRemainingSeeds(sown, nextCapturedA, nextCapturedB)
      finalPits = collected.pits
      nextCapturedA = collected.capturedA
      nextCapturedB = collected.capturedB
    }

    // Winner is whoever captured more houses (captured seeds as tiebreak).
    const { draw, winnerSide } = dealWinnerFromHouses(nextHousesA, nextHousesB, nextCapturedA, nextCapturedB)
    return {
      pits: finalPits,
      capturedA: nextCapturedA,
      capturedB: nextCapturedB,
      housesA: nextHousesA,
      housesB: nextHousesB,
      aRowSize: config.aRowSize,
      bRowSize: config.bRowSize,
      nextTurn,
      finished: true,
      draw,
      winnerSide,
      lastPit: landingPit,
      resultReason: 'most_houses',
      matchFinished: false,
      seedsSown,
      capturedThisMove: capture,
    }
  }

  // Oware: a deal ends when the board empties or the player about to move is stuck.
  const endDeal = shouldEndGameForSide(sown, nextTurn, config)

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
      seedsSown,
      capturedThisMove: capture,
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
    seedsSown,
    capturedThisMove: capture,
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
  // Every game is a fresh full board (12 houses, 6 per side). Rematches swap sides
  // and carry win streaks; matchRound is just a rematch counter for display.
  const aRowSize = AYO_PITS_PER_SIDE
  const bRowSize = AYO_PITS_PER_SIDE
  let matchRound = 1

  if (existing) {
    bId = existing.player_a_id
    aId = existing.player_b_id
    aStreak = existing.b_win_streak ?? 0
    bStreak = existing.a_win_streak ?? 0
    matchRound = (existing.match_round ?? 1) + 1
    if (!playerIds.includes(aId) || !playerIds.includes(bId)) {
      ;[aId, bId] = shuffle(playerIds)
      aStreak = 0
      bStreak = 0
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
    // Reset the per-game trophy accumulators with the rest of the board on every (re)start.
    a_stats: {},
    b_stats: {},
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

// ---------------------------------------------------------------------------
// Per-game trophy accumulator (a_stats / b_stats on the session row).
// Folded at finish by src/lib/trophies/game-facts/ayo.ts. Purely additive, written inside the
// same CAS window as the board so a move is never double-counted. See migration 20260812040000.
// ---------------------------------------------------------------------------

/** Fold one applied move into the paired accumulators. Pure. */
export function bumpAyoStats(
  prevA: AyoStats,
  prevB: AyoStats,
  args: {
    moverSide: AyoSide
    pitIndex: number
    seedsSown: number
    captured: boolean
    capturedA: number
    capturedB: number
  }
): { a_stats: AyoStats; b_stats: AyoStats } {
  const a: AyoStats = { ...prevA }
  const b: AyoStats = { ...prevB }
  const mine = args.moverSide === 'a' ? a : b

  mine.moves = (mine.moves ?? 0) + 1
  if (args.captured) mine.capturing_moves = (mine.capturing_moves ?? 0) + 1
  // `last_capture` is SET, not added — at finish it reflects the winner's final move.
  mine.last_capture = args.captured ? 1 : 0

  const localHouse = args.pitIndex - (args.moverSide === 'a' ? 0 : AYO_PITS_PER_SIDE)
  if (localHouse >= 0 && localHouse < AYO_PITS_PER_SIDE) {
    mine.sown_mask = (mine.sown_mask ?? 0) | (1 << localHouse)
  }
  mine.max_sown = Math.max(mine.max_sown ?? 0, args.seedsSown)

  // Deficit is symmetric — settle both seats from the running capture totals after this move.
  a.worst_deficit = Math.max(a.worst_deficit ?? 0, args.capturedB - args.capturedA)
  b.worst_deficit = Math.max(b.worst_deficit ?? 0, args.capturedA - args.capturedB)

  return { a_stats: a, b_stats: b }
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
        : variant === 'traditional'
          ? `${names.get(winnerPlayerId!) ?? 'Winner'} is Ọta — most houses won!`
          : `${names.get(winnerPlayerId!) ?? 'Winner'} is Ọta! Mo ki ota, mo ki ope o.`
    : turnMessage(nextName, result.nextTurn)

  const nextRemaining = result.nextTurn === 'a' ? aMs : bMs
  const nextDeadline = !finished && timed && nextRemaining != null ? new Date(now + nextRemaining).toISOString() : null

  // Fold this move into the per-game trophy accumulator, in the same CAS write as the board.
  const { a_stats, b_stats } = bumpAyoStats(session.a_stats ?? {}, session.b_stats ?? {}, {
    moverSide: side,
    pitIndex,
    seedsSown: result.seedsSown,
    captured: result.capturedThisMove > 0,
    capturedA: result.capturedA,
    capturedB: result.capturedB,
  })

  const won = await persistSession(
    supabase,
    gameId,
    {
      pits: result.pits,
      captured_a: result.capturedA,
      captured_b: result.capturedB,
      houses_a: result.housesA,
      houses_b: result.housesB,
      a_stats,
      b_stats,
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
