import type { MatchingPairsPlayerScore } from '@/lib/memory-match'

interface MatchingPairsStatDetailsProps {
  score: MatchingPairsPlayerScore
  gridSizePairs: number
}

export function MatchingPairsStatDetails({ score, gridSizePairs }: MatchingPairsStatDetailsProps) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      <div className="text-muted">Pairs</div>
      <div className="text-right font-semibold text-body">
        {score.pairsMatched}/{gridSizePairs}
      </div>
      <div className="text-muted">Wrong attempts</div>
      <div className="text-right font-semibold text-body">{score.wrongAttempts}</div>
      <div className="text-muted">Highest streak</div>
      <div className="text-right font-semibold text-body">{score.longestStreak}</div>
      <div className="text-muted">Streak bonus</div>
      <div className="text-right font-semibold text-body">+{score.streakBonusTotal} pts</div>
      <div className="text-muted">Placement bonus</div>
      <div className="text-right font-semibold text-body">+{score.placementBonus} pts</div>
      {score.perfectGame && (
        <>
          <div />
          <div className="text-right font-semibold text-emerald-500">Perfect game! ⭐</div>
        </>
      )}
    </div>
  )
}
