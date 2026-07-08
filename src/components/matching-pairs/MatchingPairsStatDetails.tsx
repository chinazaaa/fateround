import type { MatchingPairsPlayerScore } from '@/lib/memory-match'
import { formatMinutesSeconds } from '@/lib/timer-format'

interface MatchingPairsStatDetailsProps {
  score: MatchingPairsPlayerScore
  gridSizePairs: number
}

export function MatchingPairsStatDetails({ score, gridSizePairs }: MatchingPairsStatDetailsProps) {
  const timeSecs = score.timeTakenMs != null ? Math.max(0, Math.floor(score.timeTakenMs / 1000)) : null

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      <div className="text-muted">Pairs</div>
      <div className="text-right font-semibold text-body">
        {score.pairsMatched}/{gridSizePairs}
      </div>
      <div className="text-muted">Wrong attempts</div>
      <div className="text-right font-semibold text-body">{score.wrongAttempts}</div>
      {timeSecs !== null && (
        <>
          <div className="text-muted">Time taken</div>
          <div className="text-right font-semibold text-body">{formatMinutesSeconds(timeSecs)}</div>
        </>
      )}
      <div className="text-muted">Highest streak</div>
      <div className="text-right font-semibold text-body">{score.longestStreak}</div>
      <div className="text-muted">Base score</div>
      <div className="text-right font-semibold text-emerald-500">+{score.pairsMatched * 1000} pts</div>
      {score.streakBonusTotal > 0 && (
        <>
          <div className="text-muted">Streak bonus</div>
          <div className="text-right font-semibold text-emerald-500">+{score.streakBonusTotal} pts</div>
        </>
      )}
      {score.placementBonus > 0 && (
        <>
          <div className="text-muted">Placement bonus</div>
          <div className="text-right font-semibold text-emerald-500">+{score.placementBonus} pts</div>
        </>
      )}
      {score.cleanStreakMultiplierBonus > 0 && (
        <>
          <div className="text-muted">Clean streak multiplier</div>
          <div className="text-right font-semibold text-emerald-500">+{score.cleanStreakMultiplierBonus} pts</div>
        </>
      )}
      {score.speedParBonus > 0 && (
        <>
          <div className="text-muted">Speed under par</div>
          <div className="text-right font-semibold text-emerald-500">+{score.speedParBonus} pts</div>
        </>
      )}
      {score.wrongPenaltyTotal > 0 && (
        <>
          <div className="text-muted">Wrong penalty</div>
          <div className="text-right font-semibold text-red-500">-{score.wrongPenaltyTotal} pts</div>
        </>
      )}
      {score.perfectGame && (
        <>
          <div />
          <div className="text-right font-semibold text-emerald-500">Perfect game! ⭐</div>
        </>
      )}
      <div className="border-t border-[var(--border)] pt-1 mt-1 col-span-2" />
      <div className="text-muted font-semibold">Total</div>
      <div className="text-right font-bold text-body">{score.finalScore} pts</div>
    </div>
  )
}
