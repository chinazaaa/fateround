import type { GameType } from '@/types'
import { isPairGame } from '@/lib/game-types'
import {
  type VoteCategory,
  type RoundTally,
  getCategoryMeta,
  getVoteCategories,
  winnerNames,
} from '@/lib/vote-stats'

function PairRoundResultsSummary({
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
  const greenMeta = getCategoryMeta(gameType, 'kiss')
  const redMeta = getCategoryMeta(gameType, 'smash')

  return (
    <div className="glass-card border border-white/12 p-4 space-y-3">
      <p className="text-muted text-xs uppercase tracking-wider text-center">
        Round breakdown · {voterCount} {voterCount === 1 ? 'vote' : 'votes'}
      </p>
      <div className="space-y-2">
        {tallies.map((tally) => {
          const name = nameById.get(tally.id) ?? ''
          const maxGreen = Math.max(...tallies.map((t) => t.kiss))
          const maxRed = Math.max(...tallies.map((t) => t.smash))
          const greenLead = maxGreen > 0 && tally.kiss === maxGreen
          const redLead = maxRed > 0 && tally.smash === maxRed
          return (
            <div
              key={tally.id}
              className="surface-inset rounded-xl px-3 py-3 flex items-center justify-between gap-3"
            >
              <p className="text-white font-semibold truncate">{name}</p>
              <div className="flex gap-3 shrink-0 text-sm">
                <span
                  className={greenLead ? 'font-bold' : 'text-white/70'}
                  style={greenLead ? { color: greenMeta.color } : undefined}
                >
                  {greenMeta.emoji} {tally.kiss}
                </span>
                <span
                  className={redLead ? 'font-bold' : 'text-white/70'}
                  style={redLead ? { color: redMeta.color } : undefined}
                >
                  {redMeta.emoji} {tally.smash}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-faint text-[10px] text-center leading-snug">
        Each voter picks one {greenMeta.label.toLowerCase()} and one {redMeta.label.toLowerCase()} — so one person&apos;s{' '}
        {greenMeta.label.toLowerCase()} count matches the other&apos;s {redMeta.label.toLowerCase()} count.
      </p>
    </div>
  )
}

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
  if (isPairGame(gameType) && tallies.length === 2) {
    return (
      <PairRoundResultsSummary
        gameType={gameType}
        tallies={tallies}
        nameById={nameById}
        voterCount={voterCount}
      />
    )
  }

  const categories = getVoteCategories(gameType)

  return (
    <div className="glass-card border border-white/12 p-4 space-y-3">
      <p className="text-muted text-xs uppercase tracking-wider text-center">
        Round winners · {voterCount} {voterCount === 1 ? 'vote' : 'votes'}
      </p>
      <div className={`grid gap-2 ${categories.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
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
