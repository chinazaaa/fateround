'use client'

import { useEffect, useState } from 'react'
import type { GameType, ParticipantGender } from '@/types'
import { ResultsPagination, usePagination, RESULTS_PAGE_SIZE } from '@/components/ui/ResultsPagination'
import { isPairGame } from '@/lib/game-types'
import { genderLabel, parseParticipantGenderFromDb } from '@/lib/participants'
import { Avatar } from '@/components/Avatar'
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
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold text-lg leading-tight truncate">{name}</p>
          {myFlag && <p className="text-faint text-xs mt-0.5">You: {assignmentEmojiFor(gameType, myFlag)}</p>}
        </div>
        {parsedGender && (
          <span className="text-[10px] uppercase tracking-wider text-faint shrink-0">{genderLabel(parsedGender)}</span>
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
    <div className="glass-card border border-theme-strong p-4 space-y-3">
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
              <p className="text-body font-semibold text-sm mt-1 leading-tight truncate">
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
        isWinner ? 'result-row-winner' : 'surface-inset'
      }`}
    >
      {isWinner && <p className="text-[9px] uppercase tracking-wider font-bold text-muted mb-1">Winner</p>}
      <p className="text-base leading-none">
        {emoji} <span className={`font-black ${isWinner ? 'text-body' : 'text-body'}`}>{count}</span>
      </p>
      <p className="text-faint text-xs mt-1.5">{label}</p>
      <div className="bar-track-sm mt-2.5">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
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
      participantDetails ?? tallies.map((t) => ({ id: t.id, name: nameById.get(t.id) ?? '', gender: null }))

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
    <div className={`rounded-xl px-3 py-3 transition-colors ${isWinner ? 'result-row-winner' : 'surface-inset'}`}>
      {isWinner && <p className="text-[9px] uppercase tracking-wider font-bold text-muted mb-1 text-center">Winner</p>}
      <p className="text-[10px] uppercase tracking-wider text-faint text-center">{label}</p>
      <p className="text-body text-xs mt-2 leading-snug line-clamp-4 min-h-[3rem]">{text}</p>
      <p className="text-center mt-3">
        <span className="font-black text-lg text-body">{count}</span>
        <span className="text-faint text-xs ml-1">votes</span>
      </p>
      <div className="bar-track-sm mt-2">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
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
  const borderCls = myChoice === 'a' ? 'border-violet-500/40' : myChoice === 'b' ? 'border-sky-500/40' : 'border-theme'

  return (
    <div className="space-y-4">
      <p className="text-muted text-xs uppercase tracking-wider text-center">
        Round results · {voterCount} {voterCount === 1 ? 'vote' : 'votes'}
      </p>
      <div className={`glass-card border-2 ${borderCls} rounded-2xl p-4 space-y-4`}>
        <p className="text-body-muted text-sm text-center leading-relaxed">
          Would you rather <span className="label-violet font-medium">{optionA}</span> or{' '}
          <span className="label-sky font-medium">{optionB}</span>?
        </p>
        <div className="grid grid-cols-2 gap-3">
          <WyrOptionStat label="Option A" text={optionA} count={countA} max={max} color="#a78bfa" isWinner={aWins} />
          <WyrOptionStat label="Option B" text={optionB} count={countB} max={max} color="#38bdf8" isWinner={bWins} />
        </div>
        {myChoice && <p className="text-faint text-xs text-center">You picked Option {myChoice.toUpperCase()}</p>}
      </div>
    </div>
  )
}

export function MltRoundResults({
  question,
  rows,
  voterCount,
  maxCount,
  winnerNames: winners,
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
  const [showAll, setShowAll] = useState(false)
  const votedRows = rows.filter((r) => r.count > 0)
  const compactRows = votedRows.length > 0 ? votedRows : rows.slice(0, RESULTS_PAGE_SIZE)
  const listRows = showAll ? rows : compactRows
  const { page, totalPages, start, end, setPage, reset } = usePagination(listRows.length, RESULTS_PAGE_SIZE)

  useEffect(() => {
    reset()
  }, [showAll, rows.length, reset])

  const pageRows = listRows.slice(start, end)
  const hiddenCount = rows.length - compactRows.length

  return (
    <div className="space-y-4">
      <p className="text-muted text-xs uppercase tracking-wider text-center">
        Round results · {voterCount} {voterCount === 1 ? 'vote' : 'votes'}
      </p>
      <div className="glass-card border-2 border-amber-500/30 rounded-2xl p-5 space-y-4">
        <p className="text-body text-base text-center leading-snug font-medium">{question}</p>

        {winners.length > 0 && (
          <div className="surface-inset rounded-xl px-4 py-4 text-center ring-1 ring-amber-400/20">
            <p className="text-[10px] uppercase tracking-wider label-amber mb-1">Most likely</p>
            <p className="text-2xl font-black text-body">{winners.join(' & ')}</p>
            <p className="text-faint text-xs mt-1">
              {maxCount} {maxCount === 1 ? 'vote' : 'votes'}
            </p>
          </div>
        )}

        <div className="space-y-2">
          {!showAll && hiddenCount > 0 && (
            <p className="text-faint text-xs text-center">
              Showing {compactRows.length} with votes · {hiddenCount} others hidden
            </p>
          )}
          {showAll && rows.length > RESULTS_PAGE_SIZE && (
            <p className="text-faint text-[10px] uppercase tracking-wider text-center">All {rows.length} names</p>
          )}
          <div className="space-y-2">
            {pageRows.map((row) => {
              const isWinner = maxCount > 0 && row.count === maxCount
              const pct = Math.min((row.count / barMax) * 100, 100)
              return (
                <div
                  key={row.playerId}
                  className={`rounded-xl px-3 py-2.5 ${isWinner ? 'result-row-winner-amber' : 'result-row'}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className={`text-sm truncate ${isWinner ? 'text-body font-semibold' : 'text-body'}`}>
                      {row.name}
                    </p>
                    <span className="text-sm font-bold text-body shrink-0">{row.count}</span>
                  </div>
                  <div className="bar-track-xs">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: isWinner ? '#fbbf24' : '#64748b' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <ResultsPagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={listRows.length}
            noun="names"
          />
          {rows.length > compactRows.length && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full text-center text-sm font-semibold text-[var(--primary)] hover:opacity-80 transition-opacity pt-1"
            >
              {showAll ? 'Show votes only' : `Show all ${rows.length} names`}
            </button>
          )}
        </div>

        {myPickName && <p className="text-faint text-xs text-center">You picked {myPickName}</p>}
      </div>
    </div>
  )
}

export function WstRoundResults({
  quote,
  rows,
  voterCount,
  maxCount,
  topGuesses,
  correctName,
  correctCount,
  myPickName,
}: {
  quote: string
  rows: Array<{ participantId: string; name: string; count: number }>
  voterCount: number
  maxCount: number
  topGuesses: string[]
  correctName: string | null
  correctCount: number
  myPickName?: string | null
}) {
  const barMax = Math.max(maxCount, 1)
  const [showAll, setShowAll] = useState(false)
  const votedRows = rows.filter((r) => r.count > 0)
  const correctRow = correctName ? rows.find((r) => r.name === correctName) : undefined
  const compactRows = (() => {
    if (votedRows.length > 0) {
      const ids = new Set(votedRows.map((r) => r.participantId))
      if (correctRow && !ids.has(correctRow.participantId)) {
        return [...votedRows, correctRow]
      }
      return votedRows
    }
    if (correctRow) return [correctRow]
    return rows.slice(0, RESULTS_PAGE_SIZE)
  })()
  const listRows = showAll ? rows : compactRows
  const { page, totalPages, start, end, setPage, reset } = usePagination(listRows.length, RESULTS_PAGE_SIZE)

  useEffect(() => {
    reset()
  }, [showAll, rows.length, reset])

  const pageRows = listRows.slice(start, end)
  const hiddenCount = rows.length - compactRows.length

  return (
    <div className="space-y-4">
      <p className="text-muted text-xs uppercase tracking-wider text-center">
        Round results · {voterCount} {voterCount === 1 ? 'vote' : 'votes'}
      </p>
      <div className="glass-card border-2 border-teal-500/30 rounded-2xl p-5 space-y-4">
        <div className="text-center space-y-1">
          <p className="text-[10px] uppercase tracking-wider label-teal">The quote</p>
          <p className="text-body text-base leading-snug font-medium italic">&ldquo;{quote}&rdquo;</p>
        </div>

        {correctName && (
          <div className="surface-inset rounded-xl px-4 py-4 text-center ring-1 ring-teal-400/20">
            <p className="text-[10px] uppercase tracking-wider label-teal mb-1">Actually said by</p>
            <p className="text-2xl font-black text-body">{correctName}</p>
            <p className="text-faint text-xs mt-1">
              {correctCount} of {voterCount} guessed right
            </p>
          </div>
        )}

        {topGuesses.length > 0 && maxCount > 0 && (
          <p className="text-faint text-xs text-center">
            Top guess{topGuesses.length > 1 ? 'es' : ''}: {topGuesses.join(', ')} ({maxCount} vote
            {maxCount === 1 ? '' : 's'})
          </p>
        )}

        <div className="space-y-2">
          {!showAll && hiddenCount > 0 && (
            <p className="text-faint text-xs text-center">
              Showing {compactRows.length} with activity · {hiddenCount} others hidden
            </p>
          )}
          {showAll && rows.length > RESULTS_PAGE_SIZE && (
            <p className="text-faint text-[10px] uppercase tracking-wider text-center">All {rows.length} names</p>
          )}
          <div className="space-y-2">
            {pageRows.map((row) => {
              const isTop = maxCount > 0 && row.count === maxCount
              const isCorrect = correctName && row.name === correctName
              const pct = Math.min((row.count / barMax) * 100, 100)
              return (
                <div
                  key={row.participantId}
                  className={`rounded-xl px-3 py-2.5 ${
                    isCorrect ? 'result-row-winner-teal' : isTop ? 'result-row-winner' : 'result-row'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className={`text-sm truncate ${isCorrect ? 'text-accent-correct' : 'text-body'}`}>
                      {row.name}
                      {isCorrect ? ' ✓' : ''}
                    </p>
                    <span className="text-sm font-bold text-body shrink-0">{row.count}</span>
                  </div>
                  <div className="bar-track-xs">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: isCorrect ? '#2dd4bf' : '#64748b' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <ResultsPagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={listRows.length}
            noun="names"
          />
          {rows.length > compactRows.length && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full text-center text-sm font-semibold text-[var(--primary)] hover:opacity-80 transition-opacity pt-1"
            >
              {showAll ? 'Show guesses only' : `Show all ${rows.length} names`}
            </button>
          )}
        </div>

        {myPickName && <p className="text-faint text-xs text-center">You guessed {myPickName}</p>}
      </div>
    </div>
  )
}

export function AnimeWstRoundResults({
  quote,
  animeName,
  rows,
  voterCount,
  maxCount,
  topGuesses,
  correctCharacter,
  correctCount,
  myPickName,
}: {
  quote: string
  animeName: string
  rows: Array<{ choice: string; count: number }>
  voterCount: number
  maxCount: number
  topGuesses: string[]
  correctCharacter: string
  correctCount: number
  myPickName?: string | null
}) {
  const barMax = Math.max(maxCount, 1)

  return (
    <div className="space-y-4">
      <p className="text-muted text-xs uppercase tracking-wider text-center">
        Round results · {voterCount} {voterCount === 1 ? 'vote' : 'votes'}
      </p>
      <div className="glass-card border-2 border-teal-500/30 rounded-2xl p-5 space-y-4">
        <div className="text-center space-y-1">
          <p className="text-[10px] uppercase tracking-wider label-teal">The quote</p>
          <p className="text-body text-base leading-snug font-medium italic">&ldquo;{quote}&rdquo;</p>
          <p className="text-teal-400 text-xs font-semibold mt-1">{animeName}</p>
        </div>

        <div className="surface-inset rounded-xl px-4 py-4 text-center ring-1 ring-teal-400/20">
          <p className="text-[10px] uppercase tracking-wider label-teal mb-1">Said by</p>
          <p className="text-2xl font-black text-body">{correctCharacter}</p>
          <p className="text-faint text-xs mt-1">
            {correctCount} of {voterCount} guessed right
          </p>
        </div>

        {topGuesses.length > 0 && maxCount > 0 && (
          <p className="text-faint text-xs text-center">
            Top guess{topGuesses.length > 1 ? 'es' : ''}: {topGuesses.join(', ')} ({maxCount} vote
            {maxCount === 1 ? '' : 's'})
          </p>
        )}

        <div className="space-y-2">
          {rows.map((row) => {
            const isTop = maxCount > 0 && row.count === maxCount
            const isCorrect = row.choice === correctCharacter
            const pct = Math.min((row.count / barMax) * 100, 100)
            return (
              <div
                key={row.choice}
                className={`rounded-xl px-3 py-2.5 ${
                  isCorrect ? 'result-row-winner-teal' : isTop ? 'result-row-winner' : 'result-row'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className={`text-sm truncate ${isCorrect ? 'text-accent-correct' : 'text-body'}`}>
                    {row.choice}
                    {isCorrect ? ' ✓' : ''}
                  </p>
                  <span className="text-sm font-bold text-body shrink-0">{row.count}</span>
                </div>
                <div className="bar-track-xs">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: isCorrect ? '#2dd4bf' : '#64748b' }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {myPickName && <p className="text-faint text-xs text-center">You guessed {myPickName}</p>}
      </div>
    </div>
  )
}

export type HotSeatSubmissionRow = {
  id: string
  text: string
  submission_type: string
}

function hotSeatSubmissionStyle(type: string) {
  const styles = {
    compliment: { emoji: '💛', border: 'border-amber-500/30', bg: 'bg-amber-500/10' },
    roast: { emoji: '🔥', border: 'border-red-500/30', bg: 'bg-red-500/10' },
    observation: { emoji: '👀', border: 'border-slate-500/30', bg: 'bg-slate-500/10' },
  } as const
  return (
    styles[type as keyof typeof styles] ?? {
      emoji: '💬',
      border: 'border-slate-500/30',
      bg: 'bg-slate-500/10',
    }
  )
}

export function HotSeatRoundResults({
  hotSeatPlayerName,
  submissions,
  animate = true,
}: {
  hotSeatPlayerName: string
  submissions: HotSeatSubmissionRow[]
  animate?: boolean
}) {
  return (
    <>
      <div className="glass-card border-2 border-amber-500/40 rounded-2xl p-4 text-center">
        <p className="text-amber-400 text-xs uppercase tracking-wider mb-1">In the hot seat</p>
        <p className="text-2xl font-black text-body">{hotSeatPlayerName}</p>
      </div>

      {submissions.length === 0 ? (
        <div className="glass-card px-4 py-6 text-center">
          <p className="text-muted">No submissions this round</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-muted text-xs uppercase tracking-wider text-center">
            What everyone said ({submissions.length})
          </p>
          {submissions.map((sub, i) => {
            const typeConfig = hotSeatSubmissionStyle(sub.submission_type)
            return (
              <div
                key={sub.id}
                className={`glass-card border ${typeConfig.border} ${typeConfig.bg} rounded-xl px-4 py-3`}
                style={
                  animate
                    ? {
                        animation: 'fade-in 0.4s ease backwards',
                        animationDelay: `${i * 150}ms`,
                      }
                    : undefined
                }
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{typeConfig.emoji}</span>
                  <p className="text-body text-sm leading-relaxed">{sub.text}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
