import {
  ROUND_RESULTS_AUTO_ADVANCE_SECONDS,
  finalResultsAutoRevealSeconds,
} from '@fateround/shared/round-timing'
import { GameFinishedScreen, type FinishedLeaderboardRow } from '@/components/game/GameChrome'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'

/**
 * Between-rounds interstitial for Matching Pairs. Self-ticks the "Next round in
 * Xs…" / "Final results in Xs…" line internally so the heavy parent player view
 * (board + per-round tallies) no longer re-renders twice a second (M1).
 */
export function MatchingPairsRoundResults({
  currentRoundNumber,
  totalRounds,
  isLastRound,
  endedAt,
  gameType,
  detail,
  leaderboard,
}: {
  currentRoundNumber: number
  totalRounds: number
  isLastRound: boolean
  endedAt: string | null
  gameType?: string | null
  detail?: string
  leaderboard: FinishedLeaderboardRow[]
}) {
  const countdown = useDeadlineCountdown(
    endedAt,
    isLastRound ? finalResultsAutoRevealSeconds(gameType ?? undefined) : ROUND_RESULTS_AUTO_ADVANCE_SECONDS,
    true
  )
  const nextLine = isLastRound
    ? countdown > 0
      ? `Final results in ${countdown}…`
      : 'Tallying final results…'
    : countdown > 0
      ? `Next round in ${countdown}…`
      : 'Starting next round…'
  return (
    <GameFinishedScreen
      title={`Round ${currentRoundNumber}/${totalRounds} complete!`}
      subtitle={nextLine}
      detail={detail}
      leaderboard={leaderboard}
    />
  )
}
