import type { GameType } from '@/types'
import {
  type VoteCategory,
  type RoundTally,
  getCategoryMeta,
  getVoteCategories,
  winnerNames,
} from '@/lib/vote-stats'

export function RoundWinnersSummary({
  gameType,
  tallies,
  nameById,
  voterCount,
}: {
  gameType?: GameType | string
  tallies: RoundTally[]
  nameById: Map<string, string>
  voterCount: number
}) {
  const categories = getVoteCategories(gameType)

  return (
    <div className="glass-card border border-white/12 p-4 space-y-3">
      <p className="text-muted text-xs uppercase tracking-wider text-center">
        Round winners · {voterCount} {voterCount === 1 ? 'vote' : 'votes'}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {categories.map((category) => {
          const meta = getCategoryMeta(gameType, category)
          const winners = winnerNames(tallies, category, nameById)
          const max = Math.max(...tallies.map((t) => t[category]), 0)
          return (
            <div key={category} className="surface-inset rounded-xl px-2 py-3 text-center">
              <p className="text-lg">{meta.emoji}</p>
              <p className="text-faint text-[10px] uppercase tracking-wider mt-0.5">{meta.label}</p>
              <p className="text-white font-semibold text-sm mt-1 leading-tight truncate">
                {winners.length > 0 ? winners.join(' & ') : '—'}
              </p>
              {max > 0 && <p className="text-faint text-[10px] mt-0.5">{max} votes</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function VoteCountStat({
  emoji,
  label,
  count,
  max,
  color,
  isWinner,
}: {
  emoji: string
  label: string
  count: number
  max: number
  color: string
  isWinner?: boolean
}) {
  const pct = max > 0 ? Math.min((count / max) * 100, 100) : 0

  return (
    <div
      className={`text-center rounded-xl px-1 py-2 transition-colors ${
        isWinner ? 'bg-white/8 ring-1 ring-white/15' : ''
      }`}
    >
      {isWinner && (
        <p className="text-[9px] uppercase tracking-wider font-bold text-white/70 mb-0.5">Winner</p>
      )}
      <p className="text-base leading-none">
        {emoji}{' '}
        <span className={`font-black ${isWinner ? 'text-white' : 'text-white/90'}`}>{count}</span>
      </p>
      <p className="text-faint text-xs mt-1">{label}</p>
      <div className="h-2 bg-white/8 rounded-full mt-2 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export function ParticipantRoundResults({
  gameType,
  tallies,
  nameById,
  voterCount,
  renderCard,
}: {
  gameType?: GameType | string
  tallies: RoundTally[]
  nameById: Map<string, string>
  voterCount: number
  renderCard: (args: {
    tally: RoundTally
    name: string
    maxes: Record<VoteCategory, number>
    isWinner: (category: VoteCategory) => boolean
  }) => React.ReactNode
}) {
  const maxes = {
    kiss: Math.max(1, ...tallies.map((t) => t.kiss)),
    marry: Math.max(1, ...tallies.map((t) => t.marry)),
    smash: Math.max(1, ...tallies.map((t) => t.smash)),
  }

  return (
    <div className="space-y-4">
      <RoundWinnersSummary gameType={gameType} tallies={tallies} nameById={nameById} voterCount={voterCount} />
      <div className="space-y-3">
        {tallies.map((tally) => {
          const name = nameById.get(tally.id) ?? ''
          const isWinner = (category: VoteCategory) => {
            const max = Math.max(...tallies.map((t) => t[category]))
            return max > 0 && tally[category] === max
          }
          return renderCard({ tally, name, maxes, isWinner })
        })}
      </div>
    </div>
  )
}
