import type { MatchingPairsPlayerScore } from '@/lib/memory-match'
import { formatMinutesSeconds } from '@/lib/timer-format'

function StatChip({
  children,
  variant = 'neutral',
}: {
  children: React.ReactNode
  variant?: 'green' | 'red' | 'neutral'
}) {
  const colors = {
    green: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    red: 'bg-red-500/10 text-red-500 border-red-500/20',
    neutral: 'bg-[var(--surface-inset-bg)] text-muted border-[var(--border-strong)]',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full text-xs font-bold border ${colors[variant]}`}
    >
      {children}
    </span>
  )
}

interface MatchingPairsStatDetailsProps {
  score: MatchingPairsPlayerScore
  gridSizePairs: number
}

export function MatchingPairsStatDetails({ score, gridSizePairs }: MatchingPairsStatDetailsProps) {
  const timeSecs = score.timeTakenMs != null ? Math.max(0, Math.floor(score.timeTakenMs / 1000)) : null

  return (
    <div className="space-y-2">
      {/* Summary line */}
      <div className="flex flex-wrap gap-1.5 text-xs text-muted">
        <StatChip>
          Pairs {score.pairsMatched}/{gridSizePairs}
        </StatChip>
        <StatChip>Wrong {score.wrongAttempts}</StatChip>
        {timeSecs !== null && <StatChip>⏱️ {formatMinutesSeconds(timeSecs)}</StatChip>}
        <StatChip>🔥 {score.longestStreak}</StatChip>
      </div>

      {/* Scoring chips */}
      <div className="flex flex-wrap gap-1.5">
        <StatChip variant="green">Base +{score.pairsMatched * 1000}</StatChip>
        {score.streakBonusTotal > 0 && <StatChip variant="green">Streak +{score.streakBonusTotal}</StatChip>}
        {score.placementBonus > 0 && <StatChip variant="green">Placement +{score.placementBonus}</StatChip>}
        {score.cleanStreakMultiplierBonus > 0 && (
          <StatChip variant="green">Clean streak +{score.cleanStreakMultiplierBonus}</StatChip>
        )}
        {score.speedParBonus > 0 && <StatChip variant="green">Speed +{score.speedParBonus}</StatChip>}
        {score.perfectGame && <StatChip variant="green">⭐ Perfect +2000</StatChip>}
        {score.wrongPenaltyTotal > 0 && <StatChip variant="red">Penalty -{score.wrongPenaltyTotal}</StatChip>}
      </div>

      {/* Total */}
      <div className="text-xs font-bold text-body pt-0.5">Total {score.finalScore} pts</div>
    </div>
  )
}
