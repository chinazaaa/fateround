'use client'

import type { YahtzeeCategory, YahtzeeCategoryPoints, YahtzeePlayerScore } from '@/types'
import {
  YAHTZEE_CATEGORY_LABELS,
  YAHTZEE_LOWER_CATEGORIES,
  YAHTZEE_UPPER_CATEGORIES,
  categoryScore,
  jokerApplies,
  upperBonus,
  upperScore,
  totalScore,
} from '@/lib/yahtzee'

const YAHTZEE_UPPER_BONUS_THRESHOLD = 63

const COMPACT_LABELS: Partial<Record<YahtzeeCategory, string>> = {
  three_kind: '3 of a Kind',
  four_kind: '4 of a Kind',
  full_house: 'Full House',
  small_straight: 'Sm. Str.',
  large_straight: 'Lg. Str.',
  yahtzee: 'YAHTZEE',
}

interface YahtzeeScorecardProps {
  players: { id: string; name: string }[]
  scores: YahtzeePlayerScore[]
  myPlayerId?: string | null
  activePlayerId?: string | null
  dice?: number[]
  scoringEnabled?: boolean
  onScore?: (category: YahtzeeCategory) => void
}

function ScoreCell({
  value,
  preview,
  scoreable,
  onScore,
}: {
  value: number | null
  preview: number | null
  scoreable: boolean
  onScore?: () => void
}) {
  if (value != null) {
    return (
      <span className="yahtzee-score-filled inline-flex min-w-[1.75rem] items-center justify-center rounded-md px-1 py-0.5 text-xs font-bold tabular-nums">
        {value}
      </span>
    )
  }

  if (preview != null) {
    if (scoreable && onScore) {
      return (
        <button
          type="button"
          onClick={onScore}
          className="yahtzee-score-pick w-full min-w-[1.75rem] rounded-md px-1 py-0.5 text-xs tabular-nums transition-all active:scale-95 touch-manipulation"
        >
          {preview}
        </button>
      )
    }
    return <span className="text-xs font-semibold italic tabular-nums text-[var(--primary)]/50">{preview}</span>
  }

  return <span className="text-xs text-[var(--foreground)]/20 select-none">—</span>
}

function categoryLabel(category: YahtzeeCategory) {
  return COMPACT_LABELS[category] ?? YAHTZEE_CATEGORY_LABELS[category]
}

export function YahtzeeScorecard({
  players,
  scores,
  myPlayerId,
  activePlayerId,
  dice,
  scoringEnabled,
  onScore,
}: YahtzeeScorecardProps) {
  if (players.length === 0 || scores.length === 0) {
    return <div className="glass-card p-4 text-center text-muted text-xs">Loading…</div>
  }

  const orderedScores = players.map((p) => {
    const pScore = scores.find((s) => s.player_id === p.id)
    return { player: p, score: pScore?.scores.categories ?? null, bonus: pScore?.scores.bonusYahtzees ?? 0 }
  })

  const playerColClass = (playerId: string) => {
    const isActive = playerId === activePlayerId
    const isYou = playerId === myPlayerId
    return [
      'px-1 py-1.5 text-center align-middle',
      isActive ? 'yahtzee-score-col-active' : '',
      isYou && !isActive ? 'yahtzee-score-col-you' : '',
    ].join(' ')
  }

  const renderCategoryRow = (category: YahtzeeCategory, isYahtzeeRow = false) => (
    <tr key={category} className="yahtzee-score-row">
      <td
        className={[
          'sticky left-0 z-10 px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap',
          isYahtzeeRow ? 'text-[var(--marry)] font-black tracking-wide' : 'text-[var(--foreground)]/80',
        ].join(' ')}
      >
        {categoryLabel(category)}
      </td>
      {orderedScores.map(({ player, score }) => {
        const isActive = player.id === activePlayerId
        const isYou = player.id === myPlayerId
        const val = score ? score[category] : null
        // Under the Joker rule the lower boxes preview their max (a Large Straight cell showing
        // 40 for five 4s), so the number itself tells the player the Joker is live before they
        // click — nothing here forces or blocks, the server still does that.
        const joker = isActive && score ? jokerApplies(dice ?? [], score) : false
        const previewVal = isActive && val == null && dice ? categoryScore(dice, category, { joker }) : null

        return (
          <td key={player.id} className={playerColClass(player.id)}>
            <ScoreCell
              value={val}
              preview={previewVal}
              scoreable={!!(isYou && scoringEnabled)}
              onScore={onScore ? () => onScore(category) : undefined}
            />
          </td>
        )
      })}
    </tr>
  )

  return (
    <div className="yahtzee-scorecard glass-card-strong overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left yahtzee-score-table">
          <thead>
            <tr className="border-b-2 border-[var(--border-strong)]">
              <th className="sticky left-0 z-20 w-[5.5rem] px-2 py-2 text-left text-[9px] font-black uppercase tracking-widest text-[var(--foreground)]/30 bg-[var(--card-strong)]">
                Category
              </th>
              {orderedScores.map(({ player, score, bonus }) => {
                const isActive = player.id === activePlayerId
                const isYou = player.id === myPlayerId
                const total = score ? totalScore(score, bonus) : 0
                const initial = player.name.charAt(0).toUpperCase()
                return (
                  <th
                    key={player.id}
                    className={['px-1 py-2 min-w-[4rem] text-center', isActive ? 'yahtzee-score-col-active' : ''].join(
                      ' '
                    )}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span
                        className={[
                          'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black',
                          isActive
                            ? 'bg-[var(--primary)] text-white shadow-[0_0_0_2px_var(--primary),0_0_0_4px_color-mix(in_srgb,var(--primary)_25%,transparent)]'
                            : 'bg-[var(--surface-inset-bg)] border border-[var(--border-strong)] text-[var(--foreground)]/60',
                        ].join(' ')}
                      >
                        {initial}
                      </span>
                      <span className="font-bold text-[10px] truncate max-w-[3.5rem] leading-tight text-[var(--foreground)]">
                        {isYou ? 'You' : player.name.split(' ')[0]}
                      </span>
                      <span
                        className={[
                          'text-[10px] font-black tabular-nums leading-none',
                          isActive ? 'text-[var(--primary)]' : 'text-[var(--foreground)]/50',
                        ].join(' ')}
                      >
                        {total}
                      </span>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {/* ── Upper section header ── */}
            <tr className="yahtzee-score-section-header">
              <td
                colSpan={orderedScores.length + 1}
                className="sticky left-0 z-10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--primary)]/70"
              >
                Upper Section
              </td>
            </tr>

            {YAHTZEE_UPPER_CATEGORIES.map((cat) => renderCategoryRow(cat))}

            {/* ── Bonus row ── */}
            <tr className="yahtzee-score-subtotal">
              <td className="sticky left-0 z-10 px-2 py-1.5 text-[10px] font-bold text-[var(--foreground)]/60">
                Bonus
                <span className="block text-[8px] font-medium text-[var(--foreground)]/35 leading-none">+35 at 63</span>
              </td>
              {orderedScores.map(({ player, score }) => {
                const sub = score ? upperScore(score) : 0
                const bonus = score ? upperBonus(score) : 0
                const pct = Math.min(1, sub / YAHTZEE_UPPER_BONUS_THRESHOLD)
                return (
                  <td key={player.id} className={playerColClass(player.id)}>
                    {bonus > 0 ? (
                      <span className="yahtzee-score-bonus text-[10px] tabular-nums">+35 ✓</span>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[9px] tabular-nums text-[var(--foreground)]/50 font-semibold">
                          {sub}/{YAHTZEE_UPPER_BONUS_THRESHOLD}
                        </span>
                        <div className="w-7 h-1 rounded-full bg-[var(--border-strong)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
                            style={{ width: `${pct * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>

            {/* ── Lower section header ── */}
            <tr className="yahtzee-score-section-header">
              <td
                colSpan={orderedScores.length + 1}
                className="sticky left-0 z-10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--primary)]/70"
              >
                Lower Section
              </td>
            </tr>

            {YAHTZEE_LOWER_CATEGORIES.map((cat) => renderCategoryRow(cat, cat === 'yahtzee'))}

            {/* ── Total row ── */}
            <tr className="yahtzee-score-total">
              <td className="sticky left-0 z-10 px-2 py-1.5 text-[11px] font-black text-[var(--foreground)]">Total</td>
              {orderedScores.map(({ player, score, bonus }) => (
                <td key={player.id} className={playerColClass(player.id)}>
                  <span className="text-sm font-black tabular-nums text-[var(--primary)]">
                    {score ? totalScore(score, bonus) : 0}
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {players.length > 3 && (
        <p className="text-center text-[9px] text-[var(--foreground)]/30 py-1 border-t border-[var(--border)]">
          ← scroll to see all players →
        </p>
      )}
    </div>
  )
}

export function YahtzeeLeaderboard({
  rows,
  players,
  highlightPlayerId,
}: {
  rows: { player_id: string; scores: { categories: YahtzeeCategoryPoints; bonusYahtzees?: number } }[]
  players: { id: string; name: string }[]
  highlightPlayerId?: string | null
}) {
  const sorted = [...rows].sort(
    (a, b) =>
      totalScore(b.scores.categories, b.scores.bonusYahtzees) - totalScore(a.scores.categories, a.scores.bonusYahtzees)
  )

  return (
    <div className="grid grid-cols-1 gap-2">
      {sorted.map((row, index) => {
        const player = players.find((p) => p.id === row.player_id)
        const total = totalScore(row.scores.categories, row.scores.bonusYahtzees)
        const isYou = row.player_id === highlightPlayerId
        const rankColors = ['bg-amber-500', 'bg-slate-400', 'bg-amber-700', 'bg-[var(--faint)]']

        return (
          <div
            key={row.player_id}
            className={[
              'flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all',
              isYou
                ? 'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]'
                : 'border-[var(--border)] bg-[var(--card)]',
            ].join(' ')}
          >
            <span
              className={[
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-white',
                rankColors[Math.min(index, 3)],
              ].join(' ')}
            >
              {index + 1}
            </span>
            <span className="font-bold text-sm flex-1 truncate">{player?.name ?? 'Player'}</span>
            {isYou && <span className="text-[9px] font-black uppercase text-[var(--primary)]">You</span>}
            <span className="font-black text-lg tabular-nums text-[var(--primary)]">{total}</span>
          </div>
        )
      })}
    </div>
  )
}
