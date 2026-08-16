/**
 * Per-game-type solo-vs-bot scoreboard (client-only).
 *
 * Tracks a running "You N — Bot M" tally across restarts of the same solo
 * game. Persisted to localStorage so the score survives across the tab
 * closing and coming back — separate from sessionStorage, which the solo
 * clients already use for in-progress game state.
 *
 * There's no supabase call here: the score is a per-device tally, not a
 * cross-device leaderboard. Solo practice has no account attached.
 */

export type SoloScoreboardKey = 'whot' | 'uno' | 'crazy_eights' | 'ayo' | 'ludo'

export type SoloScoreboard = {
  human: number
  bot: number
  draws: number
}

const EMPTY: SoloScoreboard = { human: 0, bot: 0, draws: 0 }

function storageKey(key: SoloScoreboardKey): string {
  return `solo-${key}-scoreboard-v1`
}

/** Only non-negative safe integers are valid game counts. Everything else
 *  (a tampered localStorage entry, a caller passing NaN / floats / negatives)
 *  gets clamped to zero rather than persisting a nonsensical tally. */
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

export function readSoloScoreboard(key: SoloScoreboardKey): SoloScoreboard {
  if (typeof window === 'undefined') return { ...EMPTY }
  try {
    const raw = window.localStorage.getItem(storageKey(key))
    if (!raw) return { ...EMPTY }
    return normalizeScoreboard(JSON.parse(raw) as Partial<SoloScoreboard>)
  } catch {
    return { ...EMPTY }
  }
}

export function writeSoloScoreboard(key: SoloScoreboardKey, next: SoloScoreboard): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(normalizeScoreboard(next)))
  } catch {
    /* noop — storage full / disabled is fine, score just doesn't persist */
  }
}

export function recordSoloOutcome(key: SoloScoreboardKey, outcome: 'human' | 'bot' | 'draw'): SoloScoreboard {
  const current = readSoloScoreboard(key)
  const next: SoloScoreboard = {
    human: current.human + (outcome === 'human' ? 1 : 0),
    bot: current.bot + (outcome === 'bot' ? 1 : 0),
    draws: current.draws + (outcome === 'draw' ? 1 : 0),
  }
  writeSoloScoreboard(key, next)
  return next
}

export function resetSoloScoreboard(key: SoloScoreboardKey): SoloScoreboard {
  const zero = { ...EMPTY }
  writeSoloScoreboard(key, zero)
  return zero
}
