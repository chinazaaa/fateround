'use client'

import { useEffect, useMemo, useState } from 'react'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { LiveLeaderboardLayout } from '@/components/LiveLeaderboardLayout'
import { TwoTruthsShareBlock } from '@/components/two-truths/TwoTruthsShareBlock'
import { TwoTruthsSubmitterBadge } from '@/components/two-truths/TwoTruthsSubmitterBadge'
import {
  formatTtlChoiceLabel,
  parseTtlMetadata,
  playerDisplayName,
  revealCountdownSeconds,
  tallyTtlScores,
} from '@/lib/two-truths'
import { useRoundTimer } from '@/hooks/useRoundTimer'
import { useTwoTruthsAdvance } from '@/hooks/useTwoTruthsAdvance'
import { playVoteSubmittedSound } from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type { Game, Player, Round, TtlGuess } from '@/types'

type PlayScreen = 'waiting' | 'featured' | 'active' | 'locked' | 'revealed' | 'finished'

export function TwoTruthsActiveRound({
  gameCode,
  game,
  players,
  rounds,
  guesses,
  myPlayerId,
  myResumeToken,
  playerName,
  onReload,
  skipGameSync = false,
  readOnly = false,
}: {
  gameCode: string
  game: Game
  players: Player[]
  rounds: Round[]
  guesses: TtlGuess[]
  myPlayerId: string
  myResumeToken: string | null
  playerName: string
  onReload?: () => void
  skipGameSync?: boolean
  readOnly?: boolean
}) {
  const { error: toastError } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [submittingIndex, setSubmittingIndex] = useState<number | null>(null)
  const [timeExpired, setTimeExpired] = useState(false)

  const currentRound = useMemo(() => {
    const byPointer = rounds.find((r) => r.round_number === game.current_round_number) ?? null
    const active = rounds.find((r) => r.status === 'active') ?? null
    if (active && byPointer && active.id !== byPointer.id && byPointer.status === 'finished') return active
    return byPointer ?? active
  }, [rounds, game.current_round_number])

  const metadata = currentRound ? parseTtlMetadata(currentRound.ttl_metadata) : null
  const isFeatured = currentRound?.submitter_player_id === myPlayerId
  const myGuess = useMemo(
    () =>
      currentRound ? (guesses.find((g) => g.player_id === myPlayerId && g.round_id === currentRound.id) ?? null) : null,
    [guesses, currentRound, myPlayerId]
  )
  const leaderboard = useMemo(() => tallyTtlScores(guesses, players, rounds), [guesses, players, rounds])
  const featuredName = playerDisplayName(currentRound?.submitter_player_id, players)

  const upcomingRound = useMemo(() => {
    if (game.status !== 'active') return null
    const pending = rounds.filter((r) => r.status === 'pending').sort((a, b) => a.round_number - b.round_number)
    return pending[0] ?? null
  }, [rounds, game.status])

  const screen: PlayScreen = useMemo(() => {
    if (game.status === 'finished') return 'finished'
    if (!currentRound || currentRound.status === 'pending') return 'waiting'
    if (currentRound.status === 'finished') {
      if (game.status === 'active' && currentRound.ended_at && revealCountdownSeconds(currentRound.ended_at) > 0) {
        return 'revealed'
      }
      return 'waiting'
    }
    if (isFeatured) return 'featured'
    if (myGuess || timeExpired) return 'locked'
    return 'active'
  }, [game.status, currentRound, isFeatured, myGuess, timeExpired])

  useEffect(() => {
    setTimeExpired(false)
    setSubmittingIndex(null)
  }, [currentRound?.id])

  useTwoTruthsAdvance({
    gameCode,
    game,
    enabled: !skipGameSync && game.status === 'active',
    onAdvanced: onReload,
  })

  const timerActive = game.status === 'active' && currentRound?.status === 'active' && !isFeatured
  const secondsLeft = useRoundTimer({
    game,
    currentRound,
    active: timerActive,
    onExpire: () => setTimeExpired(true),
  })

  const submitGuess = async (index: number) => {
    if (!currentRound || readOnly || submitting) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setSubmitting(true)
    setSubmittingIndex(index)
    try {
      const res = await fetch('/api/two-truths/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          resumeToken: myResumeToken,
          roundId: currentRound.id,
          guessedIndex: index,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to guess')
      playVoteSubmittedSound()
      await onReload?.()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to guess')
    } finally {
      setSubmitting(false)
      setSubmittingIndex(null)
    }
  }

  const showLie = screen === 'revealed' || screen === 'finished'
  const pickedIndex = myGuess?.guessed_index ?? null

  if (screen === 'finished') {
    return (
      <div className="space-y-4">
        <TwoTruthsShareBlock game={game}>
          <div className="glass-card p-8 text-center space-y-2">
            <p className="text-4xl">🏆</p>
            <p className="text-2xl font-black">Game over!</p>
            <p className="text-muted text-sm">Final standings for {playerName}</p>
          </div>
          <PaginatedLeaderboard
            title="Final leaderboard"
            rows={leaderboard.map((row, i) => ({ id: row.id, name: row.name, score: row.score, rank: i + 1 }))}
            highlightId={myPlayerId}
            scoreLabel={(score) => `${score} pts`}
          />
        </TwoTruthsShareBlock>
        <p className="text-faint text-xs text-center">
          You&apos;ll return to the lobby automatically when the host starts another game.
        </p>
      </div>
    )
  }

  if (screen === 'waiting') {
    const upcomingName = upcomingRound ? playerDisplayName(upcomingRound.submitter_player_id, players) : null
    return (
      <div className="glass-card p-8 text-center space-y-3">
        <p className="text-3xl">⏳</p>
        <p className="text-lg font-bold">Waiting for the next round…</p>
        {upcomingRound && (
          <div className="flex justify-center pt-1">
            <TwoTruthsSubmitterBadge
              submitterId={upcomingRound.submitter_player_id}
              players={players}
              highlightPlayerId={myPlayerId}
              size="sm"
            />
          </div>
        )}
        {upcomingName && <p className="text-muted text-sm">Up next: {upcomingName}&apos;s statements</p>}
      </div>
    )
  }

  if (!metadata || !currentRound) return null

  return (
    <LiveLeaderboardLayout
      sidebar={
        <PaginatedLeaderboard
          title="Leaderboard"
          rows={leaderboard.map((row, i) => ({ id: row.id, name: row.name, score: row.score, rank: i + 1 }))}
          highlightId={myPlayerId}
          scoreLabel={(score) => `${score} pts`}
        />
      }
    >
      <div className="glass-card p-5 text-center space-y-3">
        <p className="label-caps text-xs">
          Round {currentRound.round_number} of {game.rounds_count}
        </p>
        <div className="flex justify-center">
          <TwoTruthsSubmitterBadge
            submitterId={currentRound.submitter_player_id}
            players={players}
            highlightPlayerId={myPlayerId}
          />
        </div>
        <p className="text-lg font-black">{featuredName}&apos;s two truths & a lie</p>
        {screen === 'featured' && (
          <p className="text-muted text-sm">Sit tight — everyone else is guessing which statement is the lie.</p>
        )}
        {timerActive && secondsLeft > 0 && (
          <p className="text-sm font-bold tabular-nums text-[var(--primary-strong)]">{secondsLeft}s left</p>
        )}
      </div>

      <div className="space-y-3">
        {metadata.statements.map((statement, index) => {
          const isLie = showLie && index === metadata.lie_index
          const isPicked = pickedIndex === index && (screen === 'locked' || screen === 'revealed')
          const canPick = screen === 'active' && !submitting && !readOnly
          return (
            <button
              key={index}
              type="button"
              disabled={!canPick}
              onClick={() => void submitGuess(index)}
              className={[
                'w-full text-left glass-card p-4 transition-all border-2',
                isLie
                  ? 'border-violet-500/60 bg-violet-500/10'
                  : isPicked
                    ? 'border-[var(--primary)]/50 bg-[var(--primary)]/5'
                    : showLie
                      ? 'border-[var(--border-strong)] opacity-80'
                      : 'border-[var(--border-strong)] hover:border-[var(--primary)]/40',
                canPick ? 'cursor-pointer' : 'cursor-default',
              ].join(' ')}
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-white font-black">
                  {formatTtlChoiceLabel(index)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{statement}</p>
                  {isLie && <p className="text-violet-600 dark:text-violet-300 text-xs font-bold mt-1">🤥 The lie</p>}
                  {isPicked && !isLie && screen === 'locked' && <p className="text-faint text-xs mt-1">Your guess</p>}
                  {submittingIndex === index && <p className="text-faint text-xs mt-1">Submitting…</p>}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {screen === 'locked' && (
        <div className="glass-card p-4 text-center text-sm text-muted">
          {myGuess
            ? 'Guess locked in — results when everyone finishes or time runs out'
            : "Time's up — waiting for results…"}
        </div>
      )}

      {screen === 'revealed' && myGuess && (
        <div
          className={[
            'glass-card p-4 text-center font-semibold',
            myGuess.is_correct ? 'text-emerald-700 dark:text-emerald-200' : 'text-muted',
          ].join(' ')}
        >
          {myGuess.is_correct ? `Correct! +${myGuess.points} pts` : 'Not the lie — better luck next round'}
        </div>
      )}

      {screen === 'revealed' && (
        <p className="text-center text-sm text-muted">
          Next round in {revealCountdownSeconds(currentRound.ended_at)}s…
        </p>
      )}
    </LiveLeaderboardLayout>
  )
}
