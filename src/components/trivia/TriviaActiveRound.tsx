'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { LiveLeaderboardLayout } from '@/components/LiveLeaderboardLayout'
import { FinalResultsShareBlock } from '@/components/FinalResultsShareBlock'
import {
  formatTriviaChoiceLabel,
  parseTriviaMetadata,
  revealCountdownSeconds,
  tallyTriviaPlayerScores,
  TRIVIA_REVEAL_SECONDS,
} from '@/lib/trivia'
import { useRoundTimer } from '@/hooks/useRoundTimer'
import { useTriviaRevealAdvance } from '@/hooks/useTriviaRevealAdvance'
import { useTriviaNotifications } from '@/hooks/useTriviaNotifications'
import { playVoteSubmittedSound } from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type { Game, Player, Round, TriviaAnswer } from '@/types'

type PlayScreen = 'waiting' | 'active' | 'locked' | 'revealed' | 'finished'

const CHOICE_BADGE =
  'inline-flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-white font-black'
const TIMER_BADGE =
  'inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3.5 py-1.5 font-bold text-white tabular-nums text-base'
const COUNTDOWN_TEXT = 'text-[var(--primary-strong)] dark:text-rose-300 font-bold text-lg sm:text-xl'

interface TriviaActiveRoundProps {
  gameCode: string
  game: Game
  players: Player[]
  rounds: Round[]
  answers: TriviaAnswer[]
  myPlayerId: string
  myResumeToken: string | null
  playerName: string
  onReload?: () => void
  /** Host play tab runs sync via useTriviaHostRoundAutomation — skip duplicate polling */
  skipGameSync?: boolean
  readOnly?: boolean
}

export function TriviaActiveRound({
  gameCode,
  game,
  players,
  rounds,
  answers,
  myPlayerId,
  myResumeToken,
  playerName,
  onReload,
  skipGameSync = false,
  readOnly = false,
}: TriviaActiveRoundProps) {
  const { error: toastError } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [submittingChoice, setSubmittingChoice] = useState<number | null>(null)
  const [lastResult, setLastResult] = useState<{ isCorrect: boolean; points: number } | null>(null)
  const [timeExpired, setTimeExpired] = useState(false)
  const [expiredAtMs, setExpiredAtMs] = useState<number | null>(null)
  const [revealCountdown, setRevealCountdown] = useState(TRIVIA_REVEAL_SECONDS)
  const answerLockRef = useRef(false)

  const currentRound = useMemo(() => {
    const byPointer = rounds.find((r) => r.round_number === game.current_round_number) ?? null
    const active = rounds.find((r) => r.status === 'active') ?? null
    if (active && byPointer && active.id !== byPointer.id && byPointer.status === 'finished') {
      return active
    }
    return byPointer
  }, [rounds, game.current_round_number])
  const metadata = currentRound ? parseTriviaMetadata(currentRound.trivia_metadata) : null
  const myAnswer = useMemo(
    () =>
      currentRound ? (answers.find((a) => a.player_id === myPlayerId && a.round_id === currentRound.id) ?? null) : null,
    [answers, currentRound, myPlayerId]
  )
  const leaderboard = useMemo(() => tallyTriviaPlayerScores(answers, players), [answers, players])
  const isLastRound = (game.current_round_number ?? 0) >= (game.rounds_count ?? 0)

  const screen: PlayScreen = useMemo(() => {
    if (game.status === 'finished') return 'finished'
    if (!currentRound || currentRound.status === 'pending') return 'waiting'
    if (currentRound.status === 'finished') {
      if (game.status === 'active' && currentRound.ended_at) {
        const remaining = revealCountdownSeconds(currentRound.ended_at)
        if (remaining <= 0) return 'waiting'
      }
      return 'revealed'
    }
    if (myAnswer || lastResult || timeExpired) return 'locked'
    return 'active'
  }, [game.status, currentRound, myAnswer, lastResult, timeExpired])

  useEffect(() => {
    setLastResult(null)
    setTimeExpired(false)
    setExpiredAtMs(null)
    setSubmittingChoice(null)
    answerLockRef.current = false
  }, [currentRound?.id])

  const showCorrectAnswer = !!metadata && (currentRound?.status === 'finished' || timeExpired)

  useEffect(() => {
    if (!showCorrectAnswer || game.status !== 'active') return

    const tick = () => {
      if (currentRound?.ended_at) {
        setRevealCountdown(revealCountdownSeconds(currentRound.ended_at))
        return
      }
      if (expiredAtMs != null) {
        const deadline = expiredAtMs + TRIVIA_REVEAL_SECONDS * 1000
        setRevealCountdown(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
      }
    }

    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [showCorrectAnswer, game.status, currentRound?.ended_at, currentRound?.id, expiredAtMs])

  const roundStillTiming = currentRound?.status === 'active' && !timeExpired

  const timeLeft = useRoundTimer({
    game,
    currentRound: currentRound?.status === 'active' ? currentRound : null,
    active: roundStillTiming,
    onExpire: () => {
      setTimeExpired(true)
      setExpiredAtMs(Date.now())
    },
  })

  const correct = myAnswer?.is_correct ?? lastResult?.isCorrect

  useTriviaRevealAdvance({
    gameCode,
    game,
    rounds,
    enabled: !skipGameSync && game.status === 'active',
    onAdvanced: onReload,
  })

  useTriviaNotifications({
    game,
    currentRound,
    screen,
    correct,
    timeLeft,
    timeExpired,
    showCorrectAnswer,
  })

  const submitAnswer = useCallback(
    async (choiceIndex: number) => {
      if (!currentRound || readOnly || submitting || myAnswer || answerLockRef.current) return
      if (!myResumeToken) {
        toastError('Your player session expired — rejoin to continue')
        return
      }
      answerLockRef.current = true
      setSubmitting(true)
      setSubmittingChoice(choiceIndex)
      try {
        const res = await fetch('/api/trivia/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: gameCode,
            resumeToken: myResumeToken,
            roundId: currentRound.id,
            choiceIndex,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          answerLockRef.current = false
          throw new Error(data.error ?? 'Failed to submit')
        }
        setLastResult({ isCorrect: data.isCorrect, points: data.points })
        playVoteSubmittedSound()
        onReload?.()
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to submit')
      } finally {
        setSubmitting(false)
        setSubmittingChoice(null)
      }
    },
    [currentRound, readOnly, submitting, myAnswer, gameCode, myResumeToken, toastError, onReload]
  )

  const points = myAnswer?.points ?? lastResult?.points ?? 0
  const waitingOnTimer = screen === 'locked' && !timeExpired && currentRound?.status === 'active'
  const inRevealCountdown =
    showCorrectAnswer && game.status === 'active' && (revealCountdown > 0 || !currentRound?.ended_at)

  const liveLeaderboard = (
    <PaginatedLeaderboard
      title="Leaderboard"
      rows={leaderboard.map((row, i) => ({ ...row, rank: i + 1 }))}
      highlightId={myPlayerId}
      scoreLabel={(n) => `${n} pts`}
      totalQuestions={game.rounds_count ?? undefined}
    />
  )

  if (screen === 'finished') {
    return (
      <div className="space-y-5">
        <FinalResultsShareBlock
          game={game}
          participants={[]}
          votes={[]}
          rounds={rounds}
          players={players}
          triviaAnswers={answers}
        >
          <div className="glass-card-strong p-8 text-center space-y-2">
            <p className="text-4xl">🏆</p>
            <p className="text-2xl font-black">Game over!</p>
            {leaderboard[0] && (
              <p className="text-muted text-base mt-2">
                {leaderboard[0].name} wins with {leaderboard[0].score} pts
              </p>
            )}
          </div>
          <PaginatedLeaderboard
            title="Final leaderboard"
            rows={leaderboard.map((row, i) => ({ ...row, rank: i + 1 }))}
            highlightId={myPlayerId}
            scoreLabel={(n) => `${n} pts`}
            totalQuestions={game.rounds_count ?? undefined}
          />
        </FinalResultsShareBlock>
      </div>
    )
  }

  return (
    <LiveLeaderboardLayout sidebar={liveLeaderboard}>
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <p className="text-muted text-sm sm:text-base">
            Playing as <span className="text-body font-semibold">{playerName}</span>
          </p>
          {currentRound && game.status === 'active' && (
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm sm:text-base text-muted">
              <span>
                Round {currentRound.round_number} of {game.rounds_count}
              </span>
              {roundStillTiming && <span className={TIMER_BADGE}>{timeLeft}s</span>}
            </div>
          )}
        </div>

        {screen === 'waiting' && (
          <div className="glass-card-strong p-8 sm:p-10 text-center space-y-3">
            <p className="text-xl sm:text-2xl font-bold text-body">
              {currentRound?.status === 'finished' && game.status === 'active'
                ? isLastRound
                  ? 'Wrapping up…'
                  : 'Starting next question…'
                : 'Get ready…'}
            </p>
            <p className="text-muted text-base">
              {currentRound?.status === 'finished' && game.status === 'active' && !isLastRound
                ? 'Hang tight — the next round is loading'
                : 'Waiting for the next question'}
            </p>
          </div>
        )}

        {screen === 'active' && metadata && (
          <div className="glass-card-strong p-6 sm:p-8 space-y-6">
            <p className="text-xl sm:text-2xl font-bold text-body leading-snug text-center sm:text-left">
              {metadata.question}
            </p>
            <div className="grid gap-3 sm:gap-4">
              {metadata.choices.map((choice, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => submitAnswer(i)}
                  disabled={submitting || readOnly}
                  className="rounded-2xl border-2 border-[var(--border-strong)] px-5 py-4 sm:py-5 min-h-[3.25rem] text-left text-base sm:text-lg font-medium hover:border-[var(--primary)] hover:bg-rose-500/5 active:scale-[0.98] active:border-[var(--primary)] transition-transform transition-colors flex items-center gap-3 disabled:opacity-50 touch-manipulation select-none"
                >
                  <span className={CHOICE_BADGE}>{formatTriviaChoiceLabel(i)}</span>
                  <span className="flex-1">{choice}</span>
                  {submittingChoice === i && <span className="text-muted text-sm shrink-0">Submitting…</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {(screen === 'locked' || screen === 'revealed') && metadata && currentRound && (
          <div className="glass-card-strong p-6 sm:p-8 space-y-4 text-center">
            {myAnswer || lastResult ? (
              <>
                <p
                  className={`text-2xl sm:text-3xl font-black ${correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'}`}
                >
                  {correct ? 'Correct!' : 'Not quite…'}
                </p>
                <p className="text-lg text-muted">+{points} points</p>
              </>
            ) : (
              <p className="text-xl font-bold text-body">Time&apos;s up — no answer submitted</p>
            )}
            {showCorrectAnswer && (
              <p className="text-base sm:text-lg text-body pt-2">
                Answer:{' '}
                <span className="font-semibold">
                  {formatTriviaChoiceLabel(metadata.correct_index)}. {metadata.choices[metadata.correct_index]}
                </span>
              </p>
            )}
            {waitingOnTimer && (myAnswer || lastResult) && (
              <p className={`${COUNTDOWN_TEXT} text-sm sm:text-base`}>Answer locked — results in {timeLeft}s</p>
            )}
            {showCorrectAnswer && game.status === 'active' && inRevealCountdown && revealCountdown > 0 && (
              <p className={`${COUNTDOWN_TEXT} pt-2`}>
                {isLastRound ? `Final results in ${revealCountdown}s…` : `Next question in ${revealCountdown}s…`}
              </p>
            )}
            {showCorrectAnswer && game.status === 'active' && revealCountdown <= 0 && (
              <p className={`${COUNTDOWN_TEXT} pt-2`}>
                {isLastRound ? 'Showing final results…' : 'Starting next question…'}
              </p>
            )}
          </div>
        )}
      </div>
    </LiveLeaderboardLayout>
  )
}
