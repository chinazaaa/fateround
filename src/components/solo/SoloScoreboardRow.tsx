'use client'

import type { SoloScoreboard } from '@/lib/solo-scoreboard'

/**
 * Compact "You N — Bot M" row shown on solo-vs-bot finished screens.
 *
 * Reads from a caller-owned scoreboard object rather than reading localStorage
 * itself, so the parent can re-render after every recorded outcome without
 * this component polling. `onReset` lets the player zero the tally without
 * clearing anything else.
 */
export function SoloScoreboardRow({ scoreboard, onReset }: { scoreboard: SoloScoreboard; onReset: () => void }) {
  const played = scoreboard.human + scoreboard.bot + scoreboard.draws
  if (played === 0) return null
  return (
    <div className="mt-3 flex flex-col items-center gap-1">
      <p className="text-sm font-semibold text-body">
        You {scoreboard.human} — Bot {scoreboard.bot}
        {scoreboard.draws > 0 ? (
          <span className="text-faint font-normal">
            {' '}
            · {scoreboard.draws} draw{scoreboard.draws === 1 ? '' : 's'}
          </span>
        ) : null}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="text-xs text-faint underline underline-offset-2 hover:text-muted"
      >
        Reset score
      </button>
    </div>
  )
}
