import type { AyoSide } from '@fateround/shared'

/**
 * Client-side replay of a sow, used to drive the board animation. Ported
 * verbatim from the web `src/lib/ayo.ts` trace logic so the mobile animation
 * follows the exact same seed-by-seed path the server computes. Pit indices:
 * 0–5 = side A, 6–11 = side B; sowing is anti-clockwise = (pit + 1) % 12.
 */

export const AYO_PIT_COUNT = 12
export const AYO_PITS_PER_SIDE = 6

export type AyoVariant = 'traditional' | 'oware'

export type AyoBoardConfig = {
  variant: AyoVariant
  aRowSize: number
  bRowSize: number
}

export function parseAyoVariant(raw: unknown): AyoVariant {
  return raw === 'oware' ? 'oware' : 'traditional'
}

/** Human-readable reason a game ended, e.g. "by resignation". Ported from web. */
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

function sideOfPit(pit: number): AyoSide {
  return pit < AYO_PITS_PER_SIDE ? 'a' : 'b'
}

function opponentSide(side: AyoSide): AyoSide {
  return side === 'a' ? 'b' : 'a'
}

function nextPit(pit: number): number {
  return (pit + 1) % AYO_PIT_COUNT
}

function rowRange(side: AyoSide): { start: number; end: number } {
  const start = side === 'a' ? 0 : AYO_PITS_PER_SIDE
  return { start, end: start + AYO_PITS_PER_SIDE - 1 }
}

function rowSizeForSide(side: AyoSide, config: Pick<AyoBoardConfig, 'aRowSize' | 'bRowSize'>): number {
  return side === 'a' ? config.aRowSize : config.bRowSize
}

export function isPitActive(pit: number, config: Pick<AyoBoardConfig, 'aRowSize' | 'bRowSize'>): boolean {
  const side = sideOfPit(pit)
  const rowSize = rowSizeForSide(side, config)
  const { start } = rowRange(side)
  return pit >= start && pit < start + rowSize
}

function nextActivePit(pit: number, config: Pick<AyoBoardConfig, 'aRowSize' | 'bRowSize'>): number {
  let current = pit
  for (let step = 0; step < AYO_PIT_COUNT; step += 1) {
    current = nextPit(current)
    if (isPitActive(current, config)) return current
  }
  throw new Error('No active pits')
}

function isOwareCaptureCount(count: number): boolean {
  return count === 2 || count === 3
}

function captureOwareFromLanding(
  pits: number[],
  landingPit: number,
  moverSide: AyoSide,
  config: Pick<AyoBoardConfig, 'aRowSize' | 'bRowSize'>
): { pits: number[]; capture: number } {
  const next = [...pits]
  const opponent = opponentSide(moverSide)
  if (sideOfPit(landingPit) !== opponent || !isOwareCaptureCount(next[landingPit]!)) {
    return { pits: next, capture: 0 }
  }
  const { start } = rowRange(opponent)
  const end = start + rowSizeForSide(opponent, config) - 1
  let capture = 0
  for (let i = landingPit; i >= start; i -= 1) {
    if (i > end || !isOwareCaptureCount(next[i]!)) break
    capture += next[i]!
    next[i] = 0
  }
  return { pits: next, capture }
}

function resolveTraditionalHouseWin(
  landingPit: number,
  moverSide: AyoSide,
  seedsRemaining: number
): { winnerSide: AyoSide; turnEnds: boolean } {
  const landingSide = sideOfPit(landingPit)
  if (landingSide === moverSide) return { winnerSide: moverSide, turnEnds: true }
  if (seedsRemaining > 0) return { winnerSide: landingSide, turnEnds: false }
  return { winnerSide: moverSide, turnEnds: true }
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
  | { type: 'relay'; pitIndex: number; seedsPickedUp: number; pitsAfter: number[] }
  | { type: 'house_win'; pitIndex: number; winnerSide: AyoSide; turnEnds: boolean; pitsAfter: number[] }
  | { type: 'end'; pitIndex: number; pitsAfter: number[] }

export type AyoSowTrace = {
  pits: number[]
  capture: number
  housesA: number
  housesB: number
  landingPit: number
  steps: AyoSowStep[]
}

function traceTraditionalSow(pits: number[], pitIndex: number, config: AyoBoardConfig): AyoSowTrace {
  const moverSide = sideOfPit(pitIndex)
  const next = [...pits]
  const steps: AyoSowStep[] = []
  let seeds = next[pitIndex]!
  next[pitIndex] = 0
  steps.push({ type: 'pickup', pitIndex, seedsTaken: seeds, pitsAfter: [...next] })

  let current = pitIndex
  let capture = 0
  let housesA = 0
  let housesB = 0
  let landingPit = pitIndex

  while (seeds > 0) {
    current = nextActivePit(current, config)
    const before = next[current]!
    next[current] += 1
    seeds -= 1
    landingPit = current
    const after = next[current]!

    steps.push({
      type: 'drop',
      pitIndex: current,
      countBefore: before,
      countAfter: after,
      seedsInHand: seeds,
      pitsAfter: [...next],
    })

    if (after === 4 && before === 3) {
      const { winnerSide, turnEnds } = resolveTraditionalHouseWin(current, moverSide, seeds)
      next[current] = 0
      capture += 4
      if (winnerSide === 'a') housesA += 1
      else housesB += 1
      steps.push({ type: 'house_win', pitIndex: current, winnerSide, turnEnds, pitsAfter: [...next] })
      if (turnEnds) break
      continue
    }

    if (seeds === 0) {
      if (before === 0) break
      const pickedUp = next[current]!
      next[current] = 0
      seeds = pickedUp
      steps.push({ type: 'relay', pitIndex: current, seedsPickedUp: pickedUp, pitsAfter: [...next] })
    }
  }

  steps.push({ type: 'end', pitIndex: landingPit, pitsAfter: [...next] })
  return { pits: next, capture, housesA, housesB, landingPit, steps }
}

function traceOwareSow(pits: number[], pitIndex: number, config: AyoBoardConfig): AyoSowTrace {
  const moverSide = sideOfPit(pitIndex)
  const steps: AyoSowStep[] = []
  let seeds = pits[pitIndex]!
  const next = [...pits]
  next[pitIndex] = 0
  steps.push({ type: 'pickup', pitIndex, seedsTaken: seeds, pitsAfter: [...next] })

  let current = pitIndex
  while (seeds > 0) {
    current = nextPit(current)
    if (current === pitIndex) continue
    if (!isPitActive(current, config)) continue
    const before = next[current]!
    next[current] += 1
    seeds -= 1
    steps.push({
      type: 'drop',
      pitIndex: current,
      countBefore: before,
      countAfter: next[current]!,
      seedsInHand: seeds,
      pitsAfter: [...next],
    })
  }

  const { pits: afterCapture, capture } = captureOwareFromLanding(next, current, moverSide, config)
  if (capture > 0) {
    steps.push({ type: 'house_win', pitIndex: current, winnerSide: moverSide, turnEnds: true, pitsAfter: [...afterCapture] })
  }
  steps.push({ type: 'end', pitIndex: current, pitsAfter: [...afterCapture] })

  return { pits: afterCapture, capture, housesA: 0, housesB: 0, landingPit: current, steps }
}

export function traceSowFromPit(pits: number[], pitIndex: number, config: AyoBoardConfig): AyoSowTrace {
  if (config.variant === 'traditional') return traceTraditionalSow(pits, pitIndex, config)
  return traceOwareSow(pits, pitIndex, config)
}
