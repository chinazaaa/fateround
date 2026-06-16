'use client'

import type { YahtzeeCategory, YahtzeeCategoryPoints } from '@/types'
import {
  YAHTZEE_CATEGORY_LABELS,
  YAHTZEE_LOWER_CATEGORIES,
  YAHTZEE_UPPER_CATEGORIES,
  categoryScore,
  upperBonus,
  upperScore,
  totalScore,
} from '@/lib/yahtzee'

function ScoreRow({
  category,
  points,
  preview,
  disabled,
  onScore,
}: {
  category: YahtzeeCategory
  points: number | null
  preview?: number | null
  disabled?: boolean
  onScore?: (category: YahtzeeCategory) => void
}) {
  const filled = points != null
  const canPick = !filled && onScore && !disabled && preview != null
  const displayValue = filled ? points : preview != null ? preview : '—'

  return (
    <button
      type="button"
      disabled={!canPick}
      onClick={() => canPick && onScore(category)}
      className={[
        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
        filled ? 'bg-[var(--surface-inset-bg)] text-[var(--foreground)]' : canPick ? 'bg-[color-mix(in_srgb,var(--marry)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--marry)_20%,transparent)]' : 'text-muted',
        !canPick && !filled ? 'opacity-60' : '',
      ].join(' ')}
    >
      <span className="font-medium">{YAHTZEE_CATEGORY_LABELS[category]}</span>
      <span className="font-bold tabular-nums">
        {displayValue}
      </span>
    </button>
  )
}

export function YahtzeeScorecard({
  categories,
  dice,
  scoringEnabled,
  onScore,
}: {
  categories: YahtzeeCategoryPoints
  dice?: number[]
  scoringEnabled?: boolean
  onScore?: (category: YahtzeeCategory) => void
}) {
  const upperSum = upperScore(categories)
  const bonus = upperBonus(categories)
  const total = totalScore(categories)

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-faint mb-2 px-1">Upper section</p>
        <div className="grid grid-cols-2 gap-2">
          {YAHTZEE_UPPER_CATEGORIES.map((category) => (
            <ScoreRow
              key={category}
              category={category}
              points={categories[category]}
              preview={dice && categories[category] == null ? categoryScore(dice, category) : null}
              disabled={!scoringEnabled}
              onScore={onScore}
            />
          ))}
        </div>
        <p className="text-xs text-muted text-right mt-2 px-1">
          Upper total: {upperSum}
          {bonus > 0 ? ` + bonus ${bonus}` : ''}
        </p>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-faint mb-2 px-1">Lower section</p>
        <div className="grid grid-cols-2 gap-2">
          {YAHTZEE_LOWER_CATEGORIES.map((category) => (
            <ScoreRow
              key={category}
              category={category}
              points={categories[category]}
              preview={dice && categories[category] == null ? categoryScore(dice, category) : null}
              disabled={!scoringEnabled}
              onScore={onScore}
            />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] px-4 py-3 flex items-center justify-between">
        <span className="font-semibold">Total</span>
        <span className="text-xl font-black text-[var(--marry)] tabular-nums">{total}</span>
      </div>
    </div>
  )
}

export function YahtzeeLeaderboard({
  rows,
  players,
  highlightPlayerId,
}: {
  rows: { player_id: string; scores: { categories: YahtzeeCategoryPoints } }[]
  players: { id: string; name: string }[]
  highlightPlayerId?: string | null
}) {
  const sorted = [...rows].sort(
    (a, b) => totalScore(b.scores.categories) - totalScore(a.scores.categories)
  )

  return (
    <div className="space-y-2">
      {sorted.map((row, index) => {
        const player = players.find((p) => p.id === row.player_id)
        const total = totalScore(row.scores.categories)
        const isYou = row.player_id === highlightPlayerId
        return (
          <div
            key={row.player_id}
            className={[
              'flex items-center gap-3 rounded-xl border px-4 py-3',
              isYou ? 'border-[var(--marry)]/50 bg-[color-mix(in_srgb,var(--marry)_10%,transparent)]' : 'border-[var(--border-strong)] bg-[var(--card)]',
            ].join(' ')}
          >
            <span className="text-lg font-black text-faint w-6">{index + 1}</span>
            <span className="font-semibold flex-1">{player?.name ?? 'Player'}</span>
            {isYou && <span className="text-[10px] font-bold uppercase text-[var(--marry)]">You</span>}
            <span className="font-black text-[var(--marry)] tabular-nums">{total}</span>
          </div>
        )
      })}
    </div>
  )
}
