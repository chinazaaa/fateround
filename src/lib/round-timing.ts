import { isHotSeat } from '@/lib/game-types'

/** Seconds to wait on round results before auto-starting the next round. */
export const ROUND_RESULTS_AUTO_ADVANCE_SECONDS = 30

/** Seconds to wait after the final round before auto-showing the leaderboard. */
export const FINAL_RESULTS_AUTO_REVEAL_SECONDS = 8

/** Hot Seat — extra time on the last reveal so players can read all submissions. */
export const HOT_SEAT_FINAL_RESULTS_AUTO_REVEAL_SECONDS = 30

export function finalResultsAutoRevealSeconds(gameType?: string): number {
  return isHotSeat(gameType) ? HOT_SEAT_FINAL_RESULTS_AUTO_REVEAL_SECONDS : FINAL_RESULTS_AUTO_REVEAL_SECONDS
}

export function msUntilDeadline(
  anchorTime: string | null | undefined,
  delaySeconds: number,
  fallbackStartMs = Date.now()
): number {
  const start = anchorTime ? new Date(anchorTime).getTime() : fallbackStartMs
  const deadline = start + delaySeconds * 1000
  return Math.max(0, deadline - Date.now())
}

export function secondsUntilDeadline(
  anchorTime: string | null | undefined,
  delaySeconds: number,
  fallbackStartMs = Date.now()
): number {
  return Math.ceil(msUntilDeadline(anchorTime, delaySeconds, fallbackStartMs) / 1000)
}

export function roundResultsWaitMessage(opts: {
  isLastRound: boolean
  autoReveal: boolean
  nextRoundSecondsLeft: number
  finalRevealSecondsLeft?: number
  finalLabel?: 'results' | 'leaderboard'
}): string {
  const finalWord = opts.finalLabel === 'leaderboard' ? 'leaderboard' : 'results'
  if (opts.isLastRound) {
    if (!opts.autoReveal) return `⏳ Waiting for final ${finalWord}...`
    const left = opts.finalRevealSecondsLeft ?? 0
    if (left > 0) return `⏳ Final ${finalWord} in ${left}s…`
    return `⏳ Final ${finalWord} in a few seconds...`
  }
  if (opts.nextRoundSecondsLeft > 0) {
    return `⏳ Next round starting in ${opts.nextRoundSecondsLeft}s…`
  }
  return '⏳ Waiting for next round...'
}
