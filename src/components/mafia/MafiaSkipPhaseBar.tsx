'use client'

interface MafiaSkipPhaseBarProps {
  phase: 'day' | 'voting'
  skipRequestCount: number
  skipRequiredCount: number
  hasRequestedSkip: boolean
  /** During Voting, a skip request only counts once the player has cast a lynch vote —
   *  otherwise a majority could rush the phase to elimination before everyone's picked
   *  anyone, resolving on a partial tally and eliminating no one despite most intending to
   *  vote for someone. Discussion has no votes yet, so this doesn't apply there. */
  needsVoteFirst?: boolean
  disabled?: boolean
  onSkip: () => void
}

/**
 * Lets the town vote to skip ahead out of Discussion or Voting early instead of always
 * waiting out the full timer — separate from the per-voter "abstain" skip on the roster grid
 * during Voting, which only clears that player's own vote. This one needs the same majority
 * as a lynch vote (floor(alive/2)+1) before the phase actually advances.
 */
export function MafiaSkipPhaseBar({
  phase,
  skipRequestCount,
  skipRequiredCount,
  hasRequestedSkip,
  needsVoteFirst,
  disabled,
  onSkip,
}: MafiaSkipPhaseBarProps) {
  const label = phase === 'day' ? 'Discussion' : 'Voting'
  return (
    <div className="glass-card border border-[var(--border)] rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3">
      <p className="text-xs text-[var(--muted)]">
        {needsVoteFirst
          ? 'Cast your vote to be able to skip ahead.'
          : hasRequestedSkip
            ? `Waiting for the rest of the town to skip ${label.toLowerCase()}...`
            : `Skip ${label}?`}
      </p>
      <button
        type="button"
        disabled={disabled || hasRequestedSkip || needsVoteFirst}
        onClick={onSkip}
        className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--primary)] rounded-full px-3 py-1.5 transition bg-[var(--surface-inset-bg)] disabled:opacity-60"
      >
        ⏭ {hasRequestedSkip ? 'Skipped' : `Skip ${label}`} ({skipRequestCount}/{skipRequiredCount})
      </button>
    </div>
  )
}
