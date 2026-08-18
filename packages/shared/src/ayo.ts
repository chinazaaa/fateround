/**
 * Ayo — pure game engine, shared between web and mobile.
 *
 * Mirrors the pure section of `src/lib/ayo.ts` (roughly lines 1–730 of the web
 * file). The web module also contains async supabase paths (loadAyoVariant,
 * canAyoPlayAgain, etc.) that stay on the web side — this file is deliberately
 * DB-free so it's safe to import from React Native (no `SupabaseClient`, no
 * `markGameFinished`).
 *
 * Callers on both platforms use the same names; keep signatures identical to
 * the web file when adding new helpers here so a symbol lifted later stays
 * source-compatible.
 */

import type { AyoSession, AyoSide, AyoVariant } from './types'

export const AYO_MIN_PLAYERS = 2
export const AYO_MAX_PLAYERS = 2
export const AYO_DEFAULT_MAX_PLAYERS = 2

export const AYO_PIT_COUNT = 12
export const AYO_PITS_PER_SIDE = 6
export const AYO_STARTING_SEEDS = 4
export const AYO_TOTAL_SEEDS = 48

export const AYO_DEFAULT_VARIANT: AyoVariant = 'traditional'

export function parseAyoVariant(_raw: unknown): AyoVariant {
  // Oware is temporarily disabled — every Ayo game is Traditional.
  return 'traditional'
}

export type AyoBoardConfig = {
  variant: AyoVariant
  aRowSize: number
  bRowSize: number
}

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

// ── Pure board helpers ──────────────────────────────────────────────────────

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

function rowRange(side: AyoSide): { start: number; end: number } {
  const start = side === 'a' ? 0 : AYO_PITS_PER_SIDE
  return { start, end: start + AYO_PITS_PER_SIDE - 1 }
}

function isOwareCaptureCount(count: number): boolean {
  return count === 2 || count === 3
}

export function legalMoves(
  pits: number[],
  side: AyoSide,
  config: Pick<AyoBoardConfig, 'aRowSize' | 'bRowSize'> = { aRowSize: AYO_PITS_PER_SIDE, bRowSize: AYO_PITS_PER_SIDE }
): number[] {
  return activePitIndices(side, config).filter((pit) => pits[pit] > 0)
}

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
 * Feeding-aware legal moves. Signature matches the web version (3-arg config).
 * The old 4-arg (pits, side, aRowSize, bRowSize) shape is gone — a couple of
 * mobile call sites that used it were updated in the same change.
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

// ── Trace + sow ─────────────────────────────────────────────────────────────

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
      if (after === 4) {
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
      if (before === 0) break
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

export function shouldEndGameForSide(pits: number[], sideToMove: AyoSide, config: AyoBoardConfig): boolean {
  if (seedsOnBoard(pits) === 0) return true
  return legalMovesForSide(pits, sideToMove, config).length === 0
}

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
  seedsSown: number
  capturedThisMove: number
}

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

    if (!eightSeedEndgame && boardLeft > 0) {
      const collected = collectRemainingSeeds(sown, nextCapturedA, nextCapturedB)
      finalPits = collected.pits
      nextCapturedA = collected.capturedA
      nextCapturedB = collected.capturedB
    }

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

  // Oware
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

// ── Session helpers (still pure) ────────────────────────────────────────────

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
