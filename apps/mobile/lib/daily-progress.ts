/**
 * Client-side persistence for an in-progress daily challenge — mobile mirror of
 * `src/lib/daily-progress.ts`. Uses AsyncStorage so an in-progress attempt
 * survives an OS-level app kill (localStorage isn't available on native).
 *
 * Keyed by challengeId (unique per game per day). Stores the answers blob plus
 * a fixed `startedAt` so the timer reflects real elapsed time across relaunches
 * instead of resetting. Cleared on submit. Best-effort — never throws.
 *
 * The read helpers are async and return null on any failure, so a callsite can
 * `await loadDailyStartedAt(...)` in an effect and treat the null case as
 * "fresh attempt". A synchronous cache (`getStartedAtCached`) fills the gap
 * for consumers that must render before the first async read completes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

const storageKey = (challengeId: string) => `daily-progress:${challengeId}`

interface Stored<T> {
  startedAt: number
  answers: T | null
}

// In-memory mirror so callers that need a synchronous value (e.g. computing
// initial timer state during first render) can get the last known startedAt
// without another AsyncStorage round-trip.
const cache = new Map<string, Stored<unknown>>()

async function read<T>(challengeId: string): Promise<Stored<T> | null> {
  if (!challengeId) return null
  try {
    const raw = await AsyncStorage.getItem(storageKey(challengeId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Stored<T>
    cache.set(challengeId, parsed)
    return parsed
  } catch {
    return null
  }
}

async function write<T>(challengeId: string, data: Stored<T>): Promise<void> {
  if (!challengeId) return
  cache.set(challengeId, data)
  try {
    await AsyncStorage.setItem(storageKey(challengeId), JSON.stringify(data))
  } catch {
    // storage full / disabled — progress just won't persist
  }
}

/**
 * Epoch-ms when this attempt started. Set once on first call; stable across
 * relaunches. If nothing is stored, this creates and persists `Date.now()`.
 */
export async function getOrCreateStartedAt(challengeId: string): Promise<number> {
  const existing = await read(challengeId)
  if (existing?.startedAt) return existing.startedAt
  const now = Date.now()
  await write(challengeId, { startedAt: now, answers: existing?.answers ?? null })
  return now
}

export async function loadDailyAnswers<T>(challengeId: string): Promise<T | null> {
  return (await read<T>(challengeId))?.answers ?? null
}

export async function saveDailyAnswers<T>(challengeId: string, answers: T): Promise<void> {
  const existing = await read(challengeId)
  const startedAt = existing?.startedAt ?? Date.now()
  await write<T>(challengeId, { startedAt, answers })
}

/** True if there's a saved (unsubmitted) attempt for this challenge. */
export async function hasDailyProgress(challengeId: string): Promise<boolean> {
  return (await read(challengeId)) !== null
}

/** Epoch-ms this attempt started, or null if none saved. */
export async function loadDailyStartedAt(challengeId: string): Promise<number | null> {
  return (await read(challengeId))?.startedAt ?? null
}

/**
 * Synchronous read from the in-memory cache. Returns null on the very first
 * hub render before AsyncStorage has been queried; consumers should call
 * `preloadDailyProgress(...)` from an effect and re-render.
 */
export function getStartedAtCached(challengeId: string): number | null {
  const entry = cache.get(challengeId)
  return entry?.startedAt ?? null
}

export async function clearDailyProgress(challengeId: string): Promise<void> {
  if (!challengeId) return
  cache.delete(challengeId)
  try {
    await AsyncStorage.removeItem(storageKey(challengeId))
  } catch {
    // ignore
  }
}

/**
 * Warm the cache for a batch of challenge ids (used by the hub on load so the
 * "Continue" / "See result" pill can render correctly on the first paint after
 * the initial fetch resolves).
 */
export async function preloadDailyProgress(challengeIds: readonly string[]): Promise<void> {
  await Promise.all(challengeIds.filter(Boolean).map((id) => read(id)))
}
