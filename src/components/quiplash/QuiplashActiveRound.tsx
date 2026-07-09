'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { LiveLeaderboardLayout } from '@/components/LiveLeaderboardLayout'
import { QuiplashFinishedResults } from '@/components/quiplash/QuiplashFinishedResults'
import {
  answerAuthorName,
  answerOptionLabel,
  battleVoteOptions,
  canPlayerVoteInBattle,
  countVotesForBattle,
  isNoVoterDrawBattle,
  isSoloRoundBattle,
  parseQuiplashMetadata,
  phaseDeadlineCountdown,
  playerIsBattleContestant,
  QUIPLASH_MAX_ANSWER_LENGTH,
  QUIPLASH_REVEAL_SECONDS,
  roundAnswersVisibleToPlayer,
  tallyQuiplashScores,
} from '@/lib/quiplash'
import { useQuiplashAdvance } from '@/hooks/useQuiplashAdvance'
import { playVoteSubmittedSound } from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type { Game, Player, QuiplashAnswer, QuiplashBattle, QuiplashSession, QuiplashVote, Round } from '@/types'

type PlayScreen =
  | 'waiting'
  | 'writing'
  | 'writing_locked'
  | 'writing_watch'
  | 'voting'
  | 'voting_locked'
  | 'voting_watch'
  | 'reveal'
  | 'finished'

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
  const myAnswer = useMemo(
    () => roundAnswers.find((a) => a.player_id === myPlayerId) ?? null,
    [roundAnswers, myPlayerId]
  )

  const activeBattle = useMemo(() => {
    if (!session?.active_battle_id) return null
    return battles.find((b) => b.id === session.active_battle_id) ?? null
  }, [battles, session?.active_battle_id])

  const battleAnswerA = activeBattle ? (answers.find((a) => a.id === activeBattle.answer_a_id) ?? null) : null
  const battleAnswerB = activeBattle ? (answers.find((a) => a.id === activeBattle.answer_b_id) ?? null) : null

  const myVote = useMemo(() => {
    if (!activeBattle) return null
    return votes.find((v) => v.battle_id === activeBattle.id && v.player_id === myPlayerId) ?? null
  }, [votes, activeBattle, myPlayerId])

  const isBattleContestant = useMemo(() => {
    if (!activeBattle) return false
    return playerIsBattleContestant(activeBattle, answers, myPlayerId)
  }, [activeBattle, answers, myPlayerId])

  const canVoteInBattle = useMemo(() => {
    if (!activeBattle || session?.phase !== 'voting') return false
    return canPlayerVoteInBattle(activeBattle, answers, myPlayerId, { readOnly })
  }, [activeBattle, answers, myPlayerId, readOnly, session?.phase])

  const battleVotes = useMemo(() => {
    if (!activeBattle) return []
    return votes.filter((v) => v.battle_id === activeBattle.id)
  }, [votes, activeBattle])

  const revealAnswers = useMemo(() => {
    if (!battleAnswerA || !battleAnswerB) return []
    if (battleAnswerA.id === battleAnswerB.id) return [battleAnswerA]
    return [battleAnswerA, battleAnswerB]
  }, [battleAnswerA, battleAnswerB])

  const activeBattleVoteOptions = useMemo(() => {
    if (!activeBattle) return []
    return battleVoteOptions(activeBattle, answers)
  }, [activeBattle, answers])

  const watchRoundAnswers = useMemo(
    () => roundAnswersVisibleToPlayer(roundAnswers, { playerId: myPlayerId, spectator: readOnly }),
    [roundAnswers, myPlayerId, readOnly]
  )

  const leaderboard = useMemo(() => tallyQuiplashScores(battles, answers, players), [battles, answers, players])

  const canSubmitAnswer = !readOnly

  const screen: PlayScreen = useMemo(() => {
    if (game.status === 'finished' || session?.phase === 'finished') return 'finished'
    if (!currentRound || !session) return 'waiting'
    if (session.phase === 'writing') {
      if (!canSubmitAnswer) return 'writing_watch'
      return myAnswer ? 'writing_locked' : 'writing'
    }
    if (session.phase === 'voting') {
      if (!canVoteInBattle) return 'voting_watch'
      return myVote ? 'voting_locked' : 'voting'
    }
    if (session.phase === 'reveal') return 'reveal'
    return 'waiting'
  }, [game.status, session, currentRound, myAnswer, myVote, canVoteInBattle, canSubmitAnswer])

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

  useQuiplashAdvance({
    gameCode,
    game,
    enabled: !skipGameSync && game.status === 'active',
    onAdvanced: onReload,
  })

  // Nudge the server as soon as a phase timer hits zero — don't wait for the next poll tick.
  useEffect(() => {
    if (skipGameSync || game.status !== 'active' || !session?.turn_deadline_at || countdown > 0) return
    const key = `${session.phase}:${session.turn_deadline_at}`
    if (advancedDeadlineRef.current === key) return
    advancedDeadlineRef.current = key
    void fetch('/api/quiplash/advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode }),
    }).then(() => onReload?.())
  }, [countdown, game.status, gameCode, onReload, session?.phase, session?.turn_deadline_at, skipGameSync])

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
    if (!activeBattle || !canVoteInBattle || readOnly || voting || myVote) return
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
          battleId: activeBattle.id,
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

  const revealTally = activeBattle && screen === 'reveal' ? countVotesForBattle(activeBattle, battleVotes) : null
  const soloRound = activeBattle ? isSoloRoundBattle(activeBattle) : false
  const noVoterDraw = activeBattle ? isNoVoterDrawBattle(activeBattle, battleVotes) : false
  const soloWinnerIsMe = soloRound && myAnswer?.id === activeBattle?.winner_answer_id

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
      <div className="glass-card p-5 text-center space-y-2">
        <p className="label-caps text-xs">
          Round {currentRound.round_number} of {game.rounds_count}
        </p>
        {session.phase === 'writing' && (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--primary-strong)]">Fill in the blank</p>
            <p className="text-xl font-black leading-snug">{metadata.prompt}</p>
            {!canSubmitAnswer && <p className="text-sm font-semibold text-muted">Watching this round</p>}
          </>
        )}
        {session.phase === 'voting' && activeBattle && (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--primary-strong)]">Fill in the blank</p>
            <p className="text-xl font-black leading-snug">{metadata.prompt}</p>
            <p className="text-sm font-semibold text-muted">
              {canVoteInBattle ? 'Pick the funnier answer' : 'Current match'}
            </p>
          </>
        )}
        {session.phase === 'reveal' && (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--primary-strong)]">Fill in the blank</p>
            <p className="text-lg font-black leading-snug">{metadata.prompt}</p>
            <p className="text-sm font-semibold text-muted">Battle results</p>
          </>
        )}
        {countdown > 0 && session.phase !== 'reveal' && (
          <p className="text-sm font-bold tabular-nums text-[var(--primary-strong)]">{countdown}s left</p>
        )}
        {session.phase === 'reveal' && countdown > 0 && <p className="text-sm text-muted">Next in {countdown}s…</p>}
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
          <p className="text-muted text-sm">Spectators can&apos;t submit answers — follow along until battles begin.</p>
        </div>
      )}

      {screen === 'writing_locked' && (
        <div className="glass-card p-5 text-center space-y-2">
          <p className="text-2xl">✅</p>
          <p className="font-semibold">Answer locked in</p>
          <p className="text-muted text-sm">&ldquo;{myAnswer?.text}&rdquo;</p>
          <p className="text-faint text-xs">Battles start when everyone finishes or time runs out.</p>
        </div>
      )}

      {(screen === 'voting' || screen === 'voting_locked') && activeBattle && activeBattleVoteOptions.length > 0 && (
        <div className="space-y-3">
          {activeBattleVoteOptions.map((answer, index) => {
            const label = answerOptionLabel(index)
            const isPicked = myVote?.chosen_answer_id === answer.id
            const canVote = screen === 'voting' && !voting && canVoteInBattle
            return (
              <button
                key={answer.id}
                type="button"
                disabled={!canVote}
                onClick={() => void submitVote(answer.id)}
                className={[
                  'w-full text-left glass-card p-4 transition-all border-2',
                  isPicked ? 'border-[var(--primary)]/50 bg-[var(--primary)]/5' : 'border-[var(--border-strong)]',
                  canVote ? 'cursor-pointer hover:border-[var(--primary)]/40' : 'cursor-default',
                ].join(' ')}
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-white font-black">
                    {label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{answer.text}</p>
                    {isPicked && <p className="text-faint text-xs mt-1">Your vote</p>}
                  </div>
                </div>
              </button>
            )
          })}
          {screen === 'voting_locked' && (
            <p className="text-center text-sm text-muted">Vote locked — waiting for everyone…</p>
          )}
        </div>
      )}

      {screen === 'voting_watch' && watchRoundAnswers.length > 0 && (
        <div className="space-y-3">
          {watchRoundAnswers.map((answer, index) => {
            const label = answerOptionLabel(index)
            const inActiveBattle = activeBattleVoteOptions.some((option) => option.id === answer.id)
            return (
              <div
                key={answer.id}
                className={[
                  'glass-card p-4 border-2',
                  inActiveBattle ? 'border-[var(--primary)]/30' : 'border-[var(--border-strong)]',
                ].join(' ')}
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-white font-black">
                    {label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{answer.text}</p>
                    {inActiveBattle && (
                      <p className="text-faint text-xs mt-1">
                        {readOnly ? 'In the current battle' : 'Being voted on right now'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <p className="text-center text-sm text-muted">
            {readOnly ? 'Spectators cannot vote — watch the match play out.' : 'Waiting for others to vote…'}
          </p>
        </div>
      )}

      {screen === 'reveal' && activeBattle && revealTally && revealAnswers.length > 0 && (
        <div className="space-y-3">
          {soloRound && (
            <div className="glass-card p-4 text-center space-y-1 border-2 border-emerald-500/40 bg-emerald-500/5">
              <p className="font-semibold">
                {soloWinnerIsMe
                  ? `No one else submitted — you got ${activeBattle.points_awarded} pts for this round!`
                  : 'No one else submitted this round.'}
              </p>
            </div>
          )}
          {noVoterDraw && (
            <div className="glass-card p-4 text-center space-y-1 border-2 border-[var(--border-strong)]">
              <p className="font-semibold">It&apos;s a draw</p>
              <p className="text-muted text-sm">
                {isBattleContestant
                  ? 'Only two people answered and no one else could vote on this match.'
                  : 'Only two people answered — there was no one available to vote.'}
              </p>
            </div>
          )}
          {revealAnswers.map((answer, index) => {
            const label = answerOptionLabel(index)
            const votesFor =
              answer.id === activeBattle.answer_a_id ? revealTally.votesA : revealTally.votesB
            const isWinner = revealTally.winnerId === answer.id
            return (
              <div
                key={answer.id}
                className={[
                  'glass-card p-4 border-2',
                  isWinner ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-[var(--border-strong)] opacity-80',
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
                        {answerAuthorName(answer.id, answers, players)} · {votesFor} vote{votesFor === 1 ? '' : 's'}
                      </p>
                    )}
                    {isWinner && revealTally.points > 0 && (
                      <p className="text-emerald-600 dark:text-emerald-300 text-xs font-bold mt-1">
                        Winner! +{revealTally.points} pts
                      </p>
                    )}
                    {!soloRound && !revealTally.winnerId && !noVoterDraw && (
                      <p className="text-muted text-xs mt-1">Tie — no points this battle</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <p className="text-center text-sm text-muted">Next battle in {countdown || QUIPLASH_REVEAL_SECONDS}s…</p>
        </div>
      )}
    </LiveLeaderboardLayout>
  )
}
