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

function WyrOptionStat({
  label,
  text,
  count,
  max,
  color,
  isWinner,
}: {
  label: string
  text: string
  count: number
  max: number
  color: string
  isWinner?: boolean
}) {
  const pct = max > 0 ? Math.min((count / max) * 100, 100) : 0

  return (
    <div
      className={`rounded-xl px-3 py-3 transition-colors ${
        isWinner ? 'bg-white/8 ring-1 ring-white/15' : 'surface-inset'
      }`}
    >
      {isWinner && (
        <p className="text-[9px] uppercase tracking-wider font-bold text-white/70 mb-1 text-center">Winner</p>
      )}
      <p className="text-[10px] uppercase tracking-wider text-faint text-center">{label}</p>
      <p className="text-white/90 text-xs mt-2 leading-snug line-clamp-4 min-h-[3rem]">{text}</p>
      <p className="text-center mt-3">
        <span className="font-black text-lg text-white">{count}</span>
        <span className="text-faint text-xs ml-1">votes</span>
      </p>
      <div className="h-2 bg-white/8 rounded-full mt-2 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export function WyrRoundResults({
  optionA,
  optionB,
  countA,
  countB,
  voterCount,
  myChoice,
}: {
  optionA: string
  optionB: string
  countA: number
  countB: number
  voterCount: number
  myChoice?: 'a' | 'b' | null
}) {
  const max = Math.max(countA, countB, 1)
  const aWins = countA > countB
  const bWins = countB > countA
  const borderCls =
    myChoice === 'a' ? 'border-violet-500/40' : myChoice === 'b' ? 'border-sky-500/40' : 'border-white/10'

  return (
    <div className="space-y-4">
      <p className="text-muted text-xs uppercase tracking-wider text-center">
        Round results · {voterCount} {voterCount === 1 ? 'vote' : 'votes'}
      </p>
      <div className={`glass-card border-2 ${borderCls} rounded-2xl p-4 space-y-4`}>
        <p className="text-white/80 text-sm text-center leading-relaxed">
          Would you rather{' '}
          <span className="text-violet-200 font-medium">{optionA}</span>
          {' '}or{' '}
          <span className="text-sky-200 font-medium">{optionB}</span>?
        </p>
        <div className="grid grid-cols-2 gap-3">
          <WyrOptionStat
            label="Option A"
            text={optionA}
            count={countA}
            max={max}
            color="#a78bfa"
            isWinner={aWins}
          />
          <WyrOptionStat
            label="Option B"
            text={optionB}
            count={countB}
            max={max}
            color="#38bdf8"
            isWinner={bWins}
          />
        </div>
        {myChoice && (
          <p className="text-faint text-xs text-center">
            You picked Option {myChoice.toUpperCase()}
          </p>
        )}
      </div>
    </div>
  )
}

export function MltRoundResults({
  question,
  rows,
  voterCount,
  maxCount,
  winnerNames,
  myPickName,
}: {
  question: string
  rows: Array<{ playerId: string; name: string; count: number }>
  voterCount: number
  maxCount: number
  winnerNames: string[]
  myPickName?: string | null
}) {
  const barMax = Math.max(maxCount, 1)

  return (
    <div className="space-y-4">
      <p className="text-muted text-xs uppercase tracking-wider text-center">
        Round results · {voterCount} {voterCount === 1 ? 'vote' : 'votes'}
      </p>
      <div className="glass-card border-2 border-amber-500/30 rounded-2xl p-5 space-y-4">
        <p className="text-white/90 text-base text-center leading-snug font-medium">{question}</p>

        {winnerNames.length > 0 && (
          <div className="surface-inset rounded-xl px-4 py-4 text-center ring-1 ring-amber-400/20">
            <p className="text-[10px] uppercase tracking-wider text-amber-200/80 mb-1">Most likely</p>
            <p className="text-2xl font-black text-white">{winnerNames.join(' & ')}</p>
            <p className="text-faint text-xs mt-1">
              {maxCount} {maxCount === 1 ? 'vote' : 'votes'}
            </p>
          </div>
        )}

        <div className="space-y-2">
          {rows.map((row) => {
            const isWinner = maxCount > 0 && row.count === maxCount
            const pct = Math.min((row.count / barMax) * 100, 100)
            return (
              <div
                key={row.playerId}
                className={`rounded-xl px-3 py-2.5 ${isWinner ? 'bg-white/8 ring-1 ring-amber-400/20' : 'surface-inset'}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className={`text-sm truncate ${isWinner ? 'text-white font-semibold' : 'text-white/85'}`}>
                    {row.name}
                  </p>
                  <span className="text-sm font-bold text-white shrink-0">{row.count}</span>
                </div>
                <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: isWinner ? '#fbbf24' : '#64748b' }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {myPickName && (
          <p className="text-faint text-xs text-center">You picked {myPickName}</p>
        )}
      </div>
    </div>
  )
}
