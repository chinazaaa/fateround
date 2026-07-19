'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameScores, useGameStats } from '@/components/roster/RosterDrawerContext'
import { QuiplashFinishedResults } from '@/components/quiplash/QuiplashFinishedResults'
import {
  answerAuthorName,
  answerOptionLabel,
  canPlayerVoteInRound,
  countVotesForRound,
  parseQuiplashMetadata,
  phaseDeadlineCountdown,
  quiplashRoundVotingHint,
  QUIPLASH_MAX_ANSWER_LENGTH,
  QUIPLASH_REVEAL_SECONDS,
  roundVoteOptions,
  soloRoundPoints,
  tallyQuiplashScores,
} from '@/lib/quiplash'
import { playerIsViewer } from '@/lib/viewers'
import { useQuiplashAdvance } from '@/hooks/useQuiplashAdvance'
import { isAdvanceDriver } from '@/lib/advance-driver'
import { playVoteSubmittedSound } from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type { Game, Player, QuiplashAnswer, QuiplashBattle, QuiplashSession, QuiplashVote, Round } from '@/types'

type PlayScreen = 'waiting' | 'writing' | 'writing_locked' | 'writing_watch' | 'voting' | 'reveal' | 'finished'

export function QuiplashActiveRound({
  gameCode,
  game,
  players,
  rounds,
  session,
  answers,
  battles,
  votes,
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
  session: QuiplashSession | null
  answers: QuiplashAnswer[]
  battles: QuiplashBattle[]
  votes: QuiplashVote[]
  myPlayerId: string
  myResumeToken: string | null
  playerName: string
  onReload?: () => void
  skipGameSync?: boolean
  readOnly?: boolean
}) {
  const { error: toastError } = useToast()
  const [answerText, setAnswerText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [voting, setVoting] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const advancedDeadlineRef = useRef<string | null>(null)

  const currentRound = useMemo(() => {
    const byPointer = rounds.find((r) => r.round_number === game.current_round_number) ?? null
    const active = rounds.find((r) => r.status === 'active') ?? null
    return active ?? byPointer
  }, [rounds, game.current_round_number])

  const metadata = currentRound ? parseQuiplashMetadata(currentRound.quiplash_metadata) : null
  const roundAnswers = useMemo(
    () => (currentRound ? answers.filter((a) => a.round_id === currentRound.id) : []),
    [answers, currentRound]
  )
  const myPlayer = useMemo(() => players.find((p) => p.id === myPlayerId) ?? null, [players, myPlayerId])

  const cannotParticipate = useMemo(() => {
    if (readOnly) return true
    if (!myPlayer) return false
    if (myPlayer.spectator === true || myPlayer.is_eliminated === true) return true
    return playerIsViewer(myPlayer, game)
  }, [readOnly, myPlayer, game])

  const myAnswer = useMemo(
    () => roundAnswers.find((a) => a.player_id === myPlayerId) ?? null,
    [roundAnswers, myPlayerId]
  )

  const roundVotes = useMemo(() => {
    if (!currentRound) return []
    return votes.filter((v) => v.round_id === currentRound.id)
  }, [votes, currentRound])

  const myVote = useMemo(() => {
    if (!currentRound) return null
    return roundVotes.find((v) => v.player_id === myPlayerId) ?? null
  }, [roundVotes, currentRound, myPlayerId])

  const voteOptions = useMemo(() => {
    if (!myPlayerId) return roundAnswers
    return roundVoteOptions(roundAnswers, myPlayerId)
  }, [roundAnswers, myPlayerId])

  const canVoteInRound = useMemo(() => {
    if (session?.phase !== 'voting' || !currentRound) return false
    return canPlayerVoteInRound(roundAnswers, myPlayerId, { readOnly: cannotParticipate })
  }, [session?.phase, currentRound, roundAnswers, myPlayerId, cannotParticipate])

  const revealTally = useMemo(() => {
    if (!currentRound) return []
    return countVotesForRound(currentRound.id, roundVotes)
  }, [currentRound, roundVotes])

  const revealAnswers = useMemo(() => {
    if (!currentRound) return []
    const byVotes = new Map(revealTally.map((row) => [row.answerId, row.votes]))
    return [...roundAnswers].sort(
      (a, b) => (byVotes.get(b.id) ?? 0) - (byVotes.get(a.id) ?? 0) || a.text.localeCompare(b.text)
    )
  }, [currentRound, roundAnswers, revealTally])

  const topVoteCount = revealTally[0]?.votes ?? 0
  const soloRound = roundAnswers.length === 1
  const soloWinnerIsMe = soloRound && myAnswer?.id === roundAnswers[0]?.id

  const leaderboard = useMemo(
    () => tallyQuiplashScores(battles, answers, players, votes),
    [battles, answers, players, votes]
  )

  // Live scores feed the shared roster drawer (opened from the header).
  const rosterScores = useMemo(() => Object.fromEntries(leaderboard.map((row) => [row.id, row.score])), [leaderboard])
  useGameScores(rosterScores, { suffix: ' pts' })
  const rosterDetails = useMemo(() => {
    const authorOf: Record<string, string> = {}
    for (const a of answers) authorOf[a.id] = a.player_id
    const counts: Record<string, number> = {}
    for (const v of votes) {
      const author = authorOf[v.chosen_answer_id]
      if (author) counts[author] = (counts[author] ?? 0) + 1
    }
    return Object.fromEntries(leaderboard.map((row) => [row.id, `🗳 ${counts[row.id] ?? 0} votes`]))
  }, [leaderboard, answers, votes])
  useGameStats(rosterDetails)

  const canSubmitAnswer = !cannotParticipate

  const screen: PlayScreen = useMemo(() => {
    if (game.status === 'finished' || session?.phase === 'finished') return 'finished'
    if (!currentRound || !session) return 'waiting'
    if (session.phase === 'writing') {
      if (!canSubmitAnswer) return 'writing_watch'
      return myAnswer ? 'writing_locked' : 'writing'
    }
    if (session.phase === 'voting') return 'voting'
    if (session.phase === 'reveal') return 'reveal'
    return 'waiting'
  }, [game.status, session, currentRound, myAnswer, canSubmitAnswer])

  useEffect(() => {
    setAnswerText('')
  }, [currentRound?.id])

  useEffect(() => {
    if (!session?.turn_deadline_at) {
      setCountdown(0)
      return
    }
    const tick = () => setCountdown(phaseDeadlineCountdown(session.turn_deadline_at))
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [session?.turn_deadline_at, session?.phase])

  // W5: only an elected quorum of clients drives auto-advance (see isAdvanceDriver).
  const isDriver = useMemo(() => isAdvanceDriver(players, myPlayerId), [players, myPlayerId])

  useQuiplashAdvance({
    gameCode,
    game,
    enabled: !skipGameSync && game.status === 'active' && isDriver,
    onAdvanced: onReload,
  })

  useEffect(() => {
    if (skipGameSync || !isDriver || game.status !== 'active' || !session?.turn_deadline_at || countdown > 0) return
    const key = `${session.phase}:${session.turn_deadline_at}`
    if (advancedDeadlineRef.current === key) return
    advancedDeadlineRef.current = key
    void fetch('/api/quiplash/advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode }),
    }).then(() => onReload?.())
  }, [countdown, game.status, gameCode, isDriver, onReload, session?.phase, session?.turn_deadline_at, skipGameSync])

  const submitAnswer = async () => {
    if (!currentRound || !canSubmitAnswer || submitting || myAnswer) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    const trimmed = answerText.trim()
    if (!trimmed) {
      toastError('Write something funny first')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/quiplash/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          resumeToken: myResumeToken,
          roundId: currentRound.id,
          text: trimmed,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit')
      playVoteSubmittedSound()
      await onReload?.()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const submitVote = async (chosenAnswerId: string) => {
    if (!currentRound || !canVoteInRound || cannotParticipate || voting || myVote) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setVoting(true)
    try {
      const res = await fetch('/api/quiplash/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          resumeToken: myResumeToken,
          roundId: currentRound.id,
          chosenAnswerId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to vote')
      playVoteSubmittedSound()
      await onReload?.()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to vote')
    } finally {
      setVoting(false)
    }
  }

  if (screen === 'finished') {
    return (
      <QuiplashFinishedResults
        game={game}
        players={players}
        battles={battles}
        answers={answers}
        votes={votes}
        highlightPlayerId={myPlayerId}
      />
    )
  }

  if (screen === 'waiting') {
    return (
      <div className="glass-card p-8 text-center space-y-3">
        <p className="text-3xl">⏳</p>
        <p className="text-lg font-bold">Get ready…</p>
        <p className="text-muted text-sm">The next prompt is coming up.</p>
      </div>
    )
  }

  if (!metadata || !currentRound || !session) return null

  const canTapVote = canVoteInRound && !myVote && !voting
  const votingHint = quiplashRoundVotingHint({
    canVote: canTapVote,
    hasVoted: !!myVote,
    cannotParticipate,
    answerCount: roundAnswers.length,
  })

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="glass-card p-5 text-center space-y-3">
        <p className="label-caps text-xs">
          Round {currentRound.round_number} of {game.rounds_count}
        </p>
        {session.phase === 'writing' && (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--primary-strong)]">Step 1 · Write</p>
            <p className="text-xl font-black leading-snug">{metadata.prompt}</p>
            {!canSubmitAnswer && <p className="text-sm font-semibold text-muted">Watching this round</p>}
            {canSubmitAnswer && !myAnswer && (
              <p className="text-sm text-muted">Everyone writes one funny answer — yours stays secret until results.</p>
            )}
          </>
        )}
        {session.phase === 'voting' && (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--primary-strong)]">Step 2 · Vote</p>
            <p className="text-lg font-black leading-snug">{metadata.prompt}</p>
            <p className="text-sm font-semibold text-[var(--primary-strong)]">Pick the funniest answer</p>
            <p className="text-sm text-muted">{votingHint}</p>
          </>
        )}
        {session.phase === 'reveal' && (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--primary-strong)]">Step 3 · Results</p>
            <p className="text-lg font-black leading-snug">{metadata.prompt}</p>
            <p className="text-sm text-muted">Who wrote what — points go to every vote your answer received.</p>
          </>
        )}
        {countdown > 0 && session.phase !== 'reveal' && (
          <p className="text-sm font-bold tabular-nums text-[var(--primary-strong)]">{countdown}s left</p>
        )}
        {session.phase === 'reveal' && countdown > 0 && (
          <p className="text-sm text-muted">Next round in {countdown}s…</p>
        )}
      </div>

      {screen === 'writing' && (
        <div className="space-y-3">
          <textarea
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value.slice(0, QUIPLASH_MAX_ANSWER_LENGTH))}
            placeholder="Your funniest answer…"
            rows={3}
            maxLength={QUIPLASH_MAX_ANSWER_LENGTH}
            disabled={submitting}
            className="input-field resize-none w-full"
          />
          <p className="text-faint text-xs text-right tabular-nums">
            {answerText.length}/{QUIPLASH_MAX_ANSWER_LENGTH}
          </p>
          <button
            type="button"
            disabled={submitting || !answerText.trim()}
            onClick={() => void submitAnswer()}
            className="btn-primary w-full py-3 font-bold"
          >
            {submitting ? 'Submitting…' : 'Submit answer'}
          </button>
        </div>
      )}

      {screen === 'writing_watch' && (
        <div className="glass-card p-6 text-center space-y-2">
          <p className="text-3xl">👀</p>
          <p className="font-semibold">You&apos;re watching</p>
          <p className="text-muted text-sm">Spectators can&apos;t submit answers — voting comes next.</p>
        </div>
      )}

      {screen === 'writing_locked' && (
        <div className="glass-card p-5 text-center space-y-2">
          <p className="text-2xl">✅</p>
          <p className="font-semibold">Answer locked in</p>
          <p className="text-muted text-sm">&ldquo;{myAnswer?.text}&rdquo;</p>
          <p className="text-faint text-xs">
            Everyone votes once when writing finishes — you can&apos;t pick your own.
          </p>
        </div>
      )}

      {screen === 'voting' && voteOptions.length > 0 && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {voteOptions.map((answer, index) => {
              const label = answerOptionLabel(index)
              const isPicked = myVote?.chosen_answer_id === answer.id
              return (
                <button
                  key={answer.id}
                  type="button"
                  disabled={!canTapVote}
                  onClick={() => void submitVote(answer.id)}
                  className={[
                    // transition-colors (not transition-all) so selecting an answer
                    // recolours the box without animating its size/position — the
                    // boxes stay put while voting.
                    'relative min-h-[8rem] rounded-2xl border-2 p-4 text-left transition-colors',
                    isPicked
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 shadow-[var(--card-shadow-glow)]'
                      : 'border-[var(--border-strong)] bg-[var(--card-strong)]',
                    canTapVote
                      ? 'cursor-pointer hover:border-[var(--primary)]/50 hover:bg-[var(--card-hover)]'
                      : 'cursor-default opacity-95',
                  ].join(' ')}
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)] text-lg font-black text-white">
                    {label}
                  </span>
                  <p className="mt-3 text-base font-semibold leading-snug">{answer.text}</p>
                  {isPicked && (
                    <span className="absolute right-3 top-3 rounded-full bg-[var(--primary)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--primary-strong)]">
                      Your pick
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {myAnswer && (
            <p className="text-center text-sm text-muted">
              Your answer isn&apos;t listed — you can&apos;t vote for your own.
            </p>
          )}
        </div>
      )}

      {screen === 'reveal' && (
        <div className="space-y-3">
          {soloRound && (
            <div className="glass-card p-4 text-center space-y-1 border-2 border-emerald-500/40 bg-emerald-500/5">
              <p className="font-semibold">
                {soloWinnerIsMe
                  ? `No one else submitted — you got ${soloRoundPoints(players.filter((p) => p.spectator !== true).length)} pts!`
                  : 'No one else submitted this round.'}
              </p>
            </div>
          )}
          {revealAnswers.map((answer, index) => {
            const label = answerOptionLabel(index)
            const votesFor = revealTally.find((row) => row.answerId === answer.id)?.votes ?? 0
            const isTop = votesFor > 0 && votesFor === topVoteCount
            const author = answerAuthorName(answer.id, answers, players)
            return (
              <div
                key={answer.id}
                className={[
                  'glass-card p-4 border-2',
                  isTop ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-[var(--border-strong)] opacity-90',
                ].join(' ')}
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-white font-black">
                    {label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{answer.text}</p>
                    {!soloRound && (
                      <p className="text-faint text-xs mt-1">
                        Written by <span className="font-semibold text-body">{author}</span> · {votesFor} vote
                        {votesFor === 1 ? '' : 's'}
                      </p>
                    )}
                    {votesFor > 0 && (
                      <p className="text-emerald-600 dark:text-emerald-300 text-xs font-bold mt-1">+{votesFor} pts</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
