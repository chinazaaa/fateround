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

/**
 * Seconds elapsed since the attempt's persisted start, clamped to the challenge's limit.
 *
 * Submit paths must use THIS rather than the timer hook's `elapsed` state. That state is
 * `useState(0)` and only reaches its real value when the hook's own effect schedules it, so an
 * auto-submit effect firing in the same commit — which is exactly what happens when a reload
 * restores an already-finished board — reads 0 and records a perfect zero-second time.
 *
 * Pass `endAtMs` where the attempt stops before the submit does: a component that freezes its
 * timer on completion and then holds the finished board on screen before submitting must report
 * the moment it finished, not the moment the hold expired.
 */
export function elapsedSinceStart(startAtMs: number, maxSeconds: number, endAtMs?: number): number {
  const seconds = Math.floor(((endAtMs ?? Date.now()) - startAtMs) / 1000)
  return Math.min(Math.max(0, seconds), maxSeconds)
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
