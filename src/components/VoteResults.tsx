import type { GameType, ParticipantGender } from '@/types'
import { isPairGame } from '@/lib/game-types'
import { genderLabel, parseParticipantGenderFromDb } from '@/lib/participants'
import { getInitial } from '@/lib/utils'
import {
  type VoteCategory,
  type RoundTally,
  getCategoryMeta,
  getVoteCategories,
  winnerNames,
  myActionBorderClass,
  assignmentEmojiFor,
} from '@/lib/vote-stats'

function PairParticipantResultCard({
  gameType,
  name,
  gender,
  greenCount,
  redCount,
  maxGreen,
  maxRed,
  isGreenWinner,
  isRedWinner,
  myFlag,
}: {
  gameType?: GameType | string
  name: string
  gender?: ParticipantGender | string | null
  greenCount: number
  redCount: number
  maxGreen: number
  maxRed: number
  isGreenWinner: boolean
  isRedWinner: boolean
  myFlag?: 'kiss' | 'kill' | null
}) {
  const greenMeta = getCategoryMeta(gameType, 'kiss')
  const redMeta = getCategoryMeta(gameType, 'smash')
  const parsedGender = gender ? parseParticipantGenderFromDb(gender) : null
  const borderCls = myActionBorderClass(gameType, myFlag ?? null)

  return (
    <div className={`glass-card border-2 ${borderCls} rounded-2xl p-4`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="avatar w-10 h-10 text-lg shrink-0">{getInitial(name)}</div>
        <div className="min-w-0 flex-1">
          <p className="text-white font-bold text-lg leading-tight truncate">{name}</p>
          {myFlag && (
            <p className="text-faint text-xs mt-0.5">
              You: {assignmentEmojiFor(gameType, myFlag)}
            </p>
          )}
        </div>
        {parsedGender && (
          <span className="text-[10px] uppercase tracking-wider text-faint shrink-0">
            {genderLabel(parsedGender)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <VoteCountStat
          emoji={greenMeta.emoji}
          label={greenMeta.label}
          count={greenCount}
          max={maxGreen}
          color={greenMeta.color}
          isWinner={isGreenWinner}
        />
        <VoteCountStat
          emoji={redMeta.emoji}
          label={redMeta.label}
          count={redCount}
          max={maxRed}
          color={redMeta.color}
          isWinner={isRedWinner}
        />
      </div>
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
      className={`text-center rounded-xl px-2 py-3 transition-colors ${
        isWinner ? 'bg-white/8 ring-1 ring-white/15' : 'surface-inset'
      }`}
    >
      {isWinner && (
        <p className="text-[9px] uppercase tracking-wider font-bold text-white/70 mb-1">Winner</p>
      )}
      <p className="text-base leading-none">
        {emoji}{' '}
        <span className={`font-black ${isWinner ? 'text-white' : 'text-white/90'}`}>{count}</span>
      </p>
      <p className="text-faint text-xs mt-1.5">{label}</p>
      <div className="h-2 bg-white/8 rounded-full mt-2.5 overflow-hidden">
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
  participantDetails,
  myFlagsByParticipantId,
  renderCard,
}: {
  gameType?: GameType | string
  tallies: RoundTally[]
  nameById: Map<string, string>
  voterCount: number
  participantDetails?: Array<{ id: string; name: string; gender?: ParticipantGender | string | null }>
  myFlagsByParticipantId?: Record<string, 'kiss' | 'kill' | null>
  renderCard?: (args: {
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

  if (isPairGame(gameType)) {
    const details =
      participantDetails ??
      tallies.map((t) => ({ id: t.id, name: nameById.get(t.id) ?? '', gender: null }))

    return (
      <div className="space-y-4">
        <p className="text-muted text-xs uppercase tracking-wider text-center">
          Round results · {voterCount} {voterCount === 1 ? 'vote' : 'votes'}
        </p>
        <div className="space-y-3">
          {tallies.map((tally) => {
            const detail = details.find((d) => d.id === tally.id)
            const name = detail?.name ?? nameById.get(tally.id) ?? ''
            const greenWins = tally.kiss > tally.smash
            const redWins = tally.smash > tally.kiss
            return (
              <PairParticipantResultCard
                key={tally.id}
                gameType={gameType}
                name={name}
                gender={detail?.gender}
                greenCount={tally.kiss}
                redCount={tally.smash}
                maxGreen={maxes.kiss}
                maxRed={maxes.smash}
                isGreenWinner={greenWins}
                isRedWinner={redWins}
                myFlag={myFlagsByParticipantId?.[tally.id] ?? null}
              />
            )
          })}
        </div>
      </div>
    )
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
          return renderCard?.({ tally, name, maxes, isWinner })
        })}
      </div>
    </div>
  )
}
