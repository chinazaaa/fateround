type PlaySession = {
  id: string
  session_started_at: string
  finished_at: string | null
}

export type AveragePlayTime = {
  averageSeconds: number | null
  sampleCount: number
}

export function computeAveragePlayTime(
  sessions: PlaySession[],
  latestRoundEndedAtByGame: Map<string, string>
): AveragePlayTime {
  const durations: number[] = []

  for (const session of sessions) {
    const endedAt = session.finished_at ?? latestRoundEndedAtByGame.get(session.id)
    if (!endedAt) continue

    const seconds = (new Date(endedAt).getTime() - new Date(session.session_started_at).getTime()) / 1000
    if (seconds > 0) durations.push(seconds)
  }

  if (durations.length === 0) {
    return { averageSeconds: null, sampleCount: 0 }
  }

  const averageSeconds = Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
  return { averageSeconds, sampleCount: durations.length }
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
