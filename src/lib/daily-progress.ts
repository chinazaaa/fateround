// Client-side persistence for an in-progress daily challenge, keyed by challengeId (unique per game
// per day). Stores the answers blob plus a fixed `startedAt` so the timer reflects real elapsed time
// across reloads instead of resetting. Cleared on submit. Best-effort — never throws.

const storageKey = (challengeId: string) => `daily-progress:${challengeId}`

interface Stored<T> {
  startedAt: number
  answers: T | null
}

function read<T>(challengeId: string): Stored<T> | null {
  if (typeof window === 'undefined' || !challengeId) return null
  try {
    const raw = window.localStorage.getItem(storageKey(challengeId))
    return raw ? (JSON.parse(raw) as Stored<T>) : null
  } catch {
    return null
  }
}

function write<T>(challengeId: string, data: Stored<T>): void {
  if (typeof window === 'undefined' || !challengeId) return
  try {
    window.localStorage.setItem(storageKey(challengeId), JSON.stringify(data))
  } catch {
    // storage full / disabled — progress just won't persist
  }
}

/** Epoch-ms when this attempt started. Set once on first call; stable across reloads. */
export function getOrCreateStartedAt(challengeId: string): number {
  const existing = read(challengeId)
  if (existing?.startedAt) return existing.startedAt
  const now = Date.now()
  write(challengeId, { startedAt: now, answers: existing?.answers ?? null })
  return now
}

export function loadDailyAnswers<T>(challengeId: string): T | null {
  return read<T>(challengeId)?.answers ?? null
}

export function saveDailyAnswers<T>(challengeId: string, answers: T): void {
  const startedAt = read(challengeId)?.startedAt ?? Date.now()
  write<T>(challengeId, { startedAt, answers })
}

/** True if there's a saved (unsubmitted) attempt for this challenge — i.e. the player has started. */
export function hasDailyProgress(challengeId: string): boolean {
  return read(challengeId) !== null
}

/** Epoch-ms this attempt started, or null if none saved. */
export function getDailyStartedAt(challengeId: string): number | null {
  return read(challengeId)?.startedAt ?? null
}

export function clearDailyProgress(challengeId: string): void {
  if (typeof window === 'undefined' || !challengeId) return
  try {
    window.localStorage.removeItem(storageKey(challengeId))
  } catch {
    // ignore
  }
}
