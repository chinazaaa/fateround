/**
 * Per-game-type solo-vs-bot scoreboard (mobile, SecureStore-backed).
 *
 * Mobile parallel of `src/lib/solo-scoreboard.ts`. The API is the same shape;
 * only the storage layer differs — SecureStore is the mobile app's standard
 * per-key client store (see `lib/solo-auto-start.ts`, `lib/secure-session.ts`).
 * Values are small (three integers) so SecureStore's per-key size limits don't
 * bite.
 *
 * Reads/writes are async on mobile — callers should treat these as promises.
 */

import * as SecureStore from 'expo-secure-store'

export type SoloScoreboardKey = 'whot' | 'uno' | 'crazy_eights' | 'ayo' | 'ludo' | 'yahtzee'

export type SoloScoreboard = {
  human: number
  bot: number
  draws: number
}

const EMPTY: SoloScoreboard = { human: 0, bot: 0, draws: 0 }

function storageKey(key: SoloScoreboardKey): string {
  return `solo-${key}-scoreboard-v1`
}

function normalizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function normalizeScoreboard(input: Partial<SoloScoreboard> | null | undefined): SoloScoreboard {
  return {
    human: normalizeCount(input?.human),
    bot: normalizeCount(input?.bot),
    draws: normalizeCount(input?.draws),
  }
}

export async function readSoloScoreboard(key: SoloScoreboardKey): Promise<SoloScoreboard> {
  try {
    const raw = await SecureStore.getItemAsync(storageKey(key))
    if (!raw) return { ...EMPTY }
    return normalizeScoreboard(JSON.parse(raw) as Partial<SoloScoreboard>)
  } catch {
    return { ...EMPTY }
  }
}

export async function writeSoloScoreboard(key: SoloScoreboardKey, next: SoloScoreboard): Promise<void> {
  try {
    await SecureStore.setItemAsync(storageKey(key), JSON.stringify(normalizeScoreboard(next)))
  } catch {
    /* noop — storage failure just means the tally doesn't persist */
  }
}

export async function recordSoloOutcome(
  key: SoloScoreboardKey,
  outcome: 'human' | 'bot' | 'draw'
): Promise<SoloScoreboard> {
  const current = await readSoloScoreboard(key)
  const next: SoloScoreboard = {
    human: current.human + (outcome === 'human' ? 1 : 0),
    bot: current.bot + (outcome === 'bot' ? 1 : 0),
    draws: current.draws + (outcome === 'draw' ? 1 : 0),
  }
  await writeSoloScoreboard(key, next)
  return next
}

export async function resetSoloScoreboard(key: SoloScoreboardKey): Promise<SoloScoreboard> {
  const zero = { ...EMPTY }
  await writeSoloScoreboard(key, zero)
  return zero
}
