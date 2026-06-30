type PlaySession = {
  id: string
  session_started_at: string
  finished_at: string | null
}

export type PlayTimeStat = {
  /** Typical (median) session length in seconds, or null when there's no sample. */
  typicalSeconds: number | null
  sampleCount: number
}

// Sessions longer than this are almost always abandoned games that were only
// marked finished much later (host closed the tab, etc.) — not real play time —
// so we exclude them from the stat.
const MAX_PLAUSIBLE_SESSION_SECONDS = 6 * 60 * 60

export function computeTypicalPlayTime(
  sessions: PlaySession[],
  latestRoundEndedAtByGame: Map<string, string>
): PlayTimeStat {
  const durations: number[] = []

  for (const session of sessions) {
    const endedAt = session.finished_at ?? latestRoundEndedAtByGame.get(session.id)
    if (!endedAt) continue

    const seconds = (new Date(endedAt).getTime() - new Date(session.session_started_at).getTime()) / 1000
    if (seconds > 0 && seconds <= MAX_PLAUSIBLE_SESSION_SECONDS) durations.push(seconds)
  }

  if (durations.length === 0) {
    return { typicalSeconds: null, sampleCount: 0 }
  }

  // Median, not mean: session durations are heavily right-skewed — a handful of
  // games left open for hours dragged the mean up to implausible values. The
  // median reflects a typical session and is robust to that long tail.
  durations.sort((a, b) => a - b)
  const mid = Math.floor(durations.length / 2)
  const typicalSeconds =
    durations.length % 2 === 0 ? Math.round((durations[mid - 1] + durations[mid]) / 2) : Math.round(durations[mid])

  return { typicalSeconds, sampleCount: durations.length }
}

export function formatPlayDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}
