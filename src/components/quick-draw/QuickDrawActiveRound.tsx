'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { LiveLeaderboardLayout } from '@/components/LiveLeaderboardLayout'
import { QuickDrawFinishedResults } from '@/components/quick-draw/QuickDrawFinishedResults'
import { DrawingCanvas, DrawingPreview } from '@/components/quick-draw/DrawingCanvas'
import {
  activeDrawingForSession,
  assignmentForPlayer,
  canPlayerSubmitFakeTitle,
  canPlayerVoteOnDrawing,
  quickDrawTitlingHint,
  quickDrawVotingHint,
  QUICK_DRAW_MAX_TITLE_LENGTH,
  QUICK_DRAW_REVEAL_SECONDS,
  phaseDeadlineCountdown,
  playerDisplayName,
  playerIsDrawingArtist,
  shuffledTitleOptions,
  tallyQuickDrawScores,
  titlesForDrawing,
  votesForDrawing,
} from '@/lib/quick-draw'
import { playerIsViewer } from '@/lib/viewers'
import { useQuickDrawAdvance } from '@/hooks/useQuickDrawAdvance'
import { isAdvanceDriver } from '@/lib/advance-driver'
import { playVoteSubmittedSound } from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type {
  QuickDrawAssignment,
  QuickDrawDrawing,
  QuickDrawDrawingStrokeData,
  QuickDrawSession,
  QuickDrawTitle,
  QuickDrawVote,
  Game,
  Player,
  Round,
} from '@/types'

type PlayScreen =
  | 'waiting'
  | 'drawing'
  | 'drawing_locked'
  | 'drawing_watch'
  | 'titling'
  | 'titling_locked'
  | 'titling_watch'
  | 'voting'
  | 'reveal'
  | 'finished'

export function QuickDrawActiveRound({
  gameCode,
  game,
  players,
  rounds,
  session,
  assignments,
  drawings,
  titles,
  votes,
  myPlayerId,
  myResumeToken,
  onReload,
  skipGameSync = false,
  readOnly = false,
}: {
  gameCode: string
  game: Game
  players: Player[]
  rounds: Round[]
  session: QuickDrawSession | null
  assignments: QuickDrawAssignment[]
  drawings: QuickDrawDrawing[]
  titles: QuickDrawTitle[]
  votes: QuickDrawVote[]
  myPlayerId: string
  myResumeToken: string | null
  onReload?: () => void
  skipGameSync?: boolean
  readOnly?: boolean
}) {
  const { error: toastError } = useToast()
  const [titleText, setTitleText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [voting, setVoting] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const advancedDeadlineRef = useRef<string | null>(null)

  const currentRound = useMemo(() => {
    const byPointer = rounds.find((r) => r.round_number === game.current_round_number) ?? null
    const active = rounds.find((r) => r.status === 'active') ?? null
    return active ?? byPointer
  }, [rounds, game.current_round_number])

  const myPlayer = useMemo(() => players.find((p) => p.id === myPlayerId) ?? null, [players, myPlayerId])

  const cannotParticipate = useMemo(() => {
    if (readOnly) return true
    if (!myPlayer) return false
    if (myPlayer.spectator === true || myPlayer.is_eliminated === true) return true
    return playerIsViewer(myPlayer, game)
  }, [readOnly, myPlayer, game])

  const myAssignment = useMemo(() => {
    if (!currentRound) return null
    return assignmentForPlayer(assignments, currentRound.id, myPlayerId)
  }, [assignments, currentRound, myPlayerId])

  const roundDrawings = useMemo(() => {
    if (!currentRound) return []
    return drawings.filter((d) => d.round_id === currentRound.id)
  }, [drawings, currentRound])

  const myDrawing = useMemo(
    () => roundDrawings.find((d) => d.player_id === myPlayerId) ?? null,
    [roundDrawings, myPlayerId]
  )

  const activeDrawing = useMemo(() => {
    if (!currentRound || !session) return null
    return activeDrawingForSession(drawings, currentRound.id, players, session.drawing_index)
  }, [drawings, currentRound, players, session])

  const activeTitles = useMemo(() => {
    if (!activeDrawing) return []
    return titlesForDrawing(titles, activeDrawing.id)
  }, [titles, activeDrawing])

  const shuffledTitles = useMemo(() => shuffledTitleOptions(activeTitles), [activeTitles])

  const activeVotes = useMemo(() => {
    if (!activeDrawing) return []
    return votesForDrawing(votes, activeDrawing.id)
  }, [votes, activeDrawing])

  const myTitle = useMemo(() => {
    if (!activeDrawing) return null
    return activeTitles.find((t) => t.player_id === myPlayerId && !t.is_real) ?? null
  }, [activeTitles, activeDrawing, myPlayerId])

  const myVote = useMemo(() => {
    if (!activeDrawing) return null
    return activeVotes.find((v) => v.player_id === myPlayerId) ?? null
  }, [activeVotes, activeDrawing, myPlayerId])

  const isArtist = playerIsDrawingArtist(activeDrawing, myPlayerId)

  const canSubmitTitle = canPlayerSubmitFakeTitle(activeDrawing, myPlayerId, { readOnly: cannotParticipate })
  const canVote = canPlayerVoteOnDrawing(activeDrawing, myPlayerId, { readOnly: cannotParticipate })

  const leaderboard = useMemo(
    () => tallyQuickDrawScores(titles, votes, drawings, players),
    [titles, votes, drawings, players]
  )

  const screen: PlayScreen = useMemo(() => {
    if (game.status === 'finished' || session?.phase === 'finished') return 'finished'
    if (!currentRound || !session) return 'waiting'
    if (session.phase === 'drawing') {
      if (!cannotParticipate) return myDrawing ? 'drawing_locked' : 'drawing'
      return 'drawing_watch'
    }
    if (session.phase === 'titling') {
      if (isArtist || cannotParticipate) return 'titling_watch'
      return myTitle ? 'titling_locked' : 'titling'
    }
    if (session.phase === 'voting') return 'voting'
    if (session.phase === 'reveal') return 'reveal'
    return 'waiting'
  }, [game.status, session, currentRound, myDrawing, cannotParticipate, isArtist, myTitle])

  useEffect(() => {
    setTitleText('')
  }, [activeDrawing?.id])

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

  useQuickDrawAdvance({
    gameCode,
    game,
    enabled: !skipGameSync && game.status === 'active' && isDriver,
    onAdvanced: onReload,
  })

  useEffect(() => {
    if (skipGameSync || !isDriver || game.status !== 'active' || !session?.turn_deadline_at || countdown > 0) return
    const key = `${session.phase}:${session.drawing_index}:${session.turn_deadline_at}`
    if (advancedDeadlineRef.current === key) return
    advancedDeadlineRef.current = key
    void fetch('/api/quick-draw/advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode }),
    }).then(() => onReload?.())
  }, [
    countdown,
    game.status,
    gameCode,
    isDriver,
    onReload,
    session?.phase,
    session?.drawing_index,
    session?.turn_deadline_at,
    skipGameSync,
  ])

  const submitDrawing = async (strokeData: QuickDrawDrawingStrokeData) => {
    if (!currentRound || cannotParticipate || submitting || myDrawing) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/quick-draw/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          resumeToken: myResumeToken,
          roundId: currentRound.id,
          strokeData,
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

  const submitTitle = async () => {
    if (!activeDrawing || !canSubmitTitle || submitting || myTitle) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    const trimmed = titleText.trim()
    if (!trimmed) {
      toastError('Write a title first')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/quick-draw/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          resumeToken: myResumeToken,
          drawingId: activeDrawing.id,
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

  const submitVote = async (chosenTitleId: string) => {
    if (!activeDrawing || !canVote || voting || myVote) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setVoting(true)
    try {
      const res = await fetch('/api/quick-draw/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          resumeToken: myResumeToken,
          drawingId: activeDrawing.id,
          chosenTitleId,
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
      <QuickDrawFinishedResults
        game={game}
        players={players}
        drawings={drawings}
        titles={titles}
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
        <p className="text-muted text-sm">The next round is coming up.</p>
      </div>
    )
  }

  if (!currentRound || !session) return null

  const phaseLabel =
    session.phase === 'drawing'
      ? 'Step 1 · Draw'
      : session.phase === 'titling'
        ? 'Step 2 · Fake titles'
        : session.phase === 'voting'
          ? 'Step 3 · Vote'
          : 'Results'

  const artistName = activeDrawing ? playerDisplayName(activeDrawing.player_id, players) : 'Someone'

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
          {session.phase !== 'drawing' && activeDrawing && (
            <>
              {' '}
              · Drawing {session.drawing_index + 1} of {roundDrawings.length}
            </>
          )}
        </p>
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--primary-strong)]">{phaseLabel}</p>
        {session.phase === 'drawing' && myAssignment && (
          <p className="text-sm text-muted">Your secret prompt — only you see this until results.</p>
        )}
        {session.phase !== 'drawing' && activeDrawing && (
          <p className="text-sm text-muted">
            Drawing by <span className="font-semibold text-body">{artistName}</span>
          </p>
        )}
        {countdown > 0 && session.phase !== 'reveal' && (
          <p className="text-sm font-bold tabular-nums text-[var(--primary-strong)]">{countdown}s left</p>
        )}
        {session.phase === 'reveal' && countdown > 0 && <p className="text-sm text-muted">Next in {countdown}s…</p>}
      </div>

      {screen === 'drawing' && myAssignment && (
        <DrawingCanvas prompt={myAssignment.prompt} onSubmit={submitDrawing} submitting={submitting} />
      )}

      {screen === 'drawing_locked' && myDrawing && (
        <div className="space-y-3">
          <div className="glass-card p-4 text-center space-y-2">
            <p className="text-2xl">✅</p>
            <p className="font-semibold">Drawing submitted</p>
            <p className="text-faint text-xs">Waiting for everyone else to finish drawing…</p>
          </div>
          <DrawingPreview strokeData={myDrawing.stroke_data} />
        </div>
      )}

      {screen === 'drawing_watch' && (
        <div className="glass-card p-6 text-center space-y-2">
          <p className="text-3xl">👀</p>
          <p className="font-semibold">You&apos;re watching</p>
          <p className="text-muted text-sm">Players are drawing their prompts — titles come next.</p>
        </div>
      )}

      {(screen === 'titling' ||
        screen === 'titling_locked' ||
        screen === 'titling_watch' ||
        screen === 'voting' ||
        screen === 'reveal') &&
        activeDrawing && <DrawingPreview strokeData={activeDrawing.stroke_data} />}

      {screen === 'titling' && (
        <div className="space-y-3">
          <p className="text-sm text-muted text-center">
            {quickDrawTitlingHint({ canSubmit: true, hasSubmitted: false, cannotParticipate: false, isArtist: false })}
          </p>
          <input
            value={titleText}
            onChange={(e) => setTitleText(e.target.value.slice(0, QUICK_DRAW_MAX_TITLE_LENGTH))}
            placeholder="Write a fake title…"
            maxLength={QUICK_DRAW_MAX_TITLE_LENGTH}
            disabled={submitting}
            className="input-field w-full"
          />
          <button
            type="button"
            disabled={submitting || !titleText.trim()}
            onClick={() => void submitTitle()}
            className="btn-primary w-full py-3 font-bold"
          >
            {submitting ? 'Submitting…' : 'Submit title'}
          </button>
        </div>
      )}

      {screen === 'titling_locked' && myTitle && (
        <div className="glass-card p-5 text-center space-y-2">
          <p className="text-2xl">✅</p>
          <p className="font-semibold">Title locked in</p>
          <p className="text-muted text-sm">&ldquo;{myTitle.text}&rdquo;</p>
        </div>
      )}

      {screen === 'titling_watch' && (
        <div className="glass-card p-5 text-center space-y-2">
          <p className="text-3xl">👀</p>
          <p className="font-semibold">{isArtist ? "That's your drawing" : "You're watching"}</p>
          <p className="text-muted text-sm">
            {quickDrawTitlingHint({
              canSubmit: false,
              hasSubmitted: false,
              cannotParticipate: true,
              isArtist,
            })}
          </p>
        </div>
      )}

      {screen === 'voting' && shuffledTitles.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted text-center">
            {quickDrawVotingHint({
              canVote: canVote && !myVote,
              hasVoted: !!myVote,
              cannotParticipate,
              isArtist,
            })}
          </p>
          <div className="grid gap-3">
            {shuffledTitles.map((title, index) => {
              const isPicked = myVote?.chosen_title_id === title.id
              const canTap = canVote && !myVote && !voting
              return (
                <button
                  key={title.id}
                  type="button"
                  disabled={!canTap}
                  onClick={() => void submitVote(title.id)}
                  className={[
                    'rounded-2xl border-2 p-4 text-left transition-all',
                    isPicked
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                      : 'border-[var(--border-strong)] bg-[var(--card-strong)]',
                    canTap ? 'cursor-pointer hover:border-[var(--primary)]/50' : 'cursor-default',
                  ].join(' ')}
                >
                  <span className="text-xs font-bold text-faint">Option {index + 1}</span>
                  <p className="mt-1 font-semibold leading-snug">{title.text}</p>
                  {isPicked && <p className="mt-1 text-xs font-semibold text-[var(--primary-strong)]">Your pick</p>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {screen === 'reveal' && activeDrawing && (
        <div className="space-y-3">
          {shuffledTitles.map((title) => {
            const voteCount = activeVotes.filter((v) => v.chosen_title_id === title.id).length
            const author = title.is_real
              ? `${artistName} (real prompt)`
              : title.player_id
                ? playerDisplayName(title.player_id, players)
                : 'Unknown'
            return (
              <div
                key={title.id}
                className={[
                  'glass-card p-4 border-2',
                  title.is_real ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-[var(--border-strong)]',
                ].join(' ')}
              >
                <p className="font-semibold leading-snug">{title.text}</p>
                <p className="text-faint text-xs mt-1">
                  {title.is_real ? '✓ Real title' : `Fake by ${author}`} · {voteCount} vote{voteCount === 1 ? '' : 's'}
                </p>
                {voteCount > 0 && (
                  <p className="text-emerald-600 dark:text-emerald-300 text-xs font-bold mt-1">+{voteCount} pts</p>
                )}
              </div>
            )
          })}
          <p className="text-center text-xs text-faint">Reveal lasts {QUICK_DRAW_REVEAL_SECONDS}s</p>
        </div>
      )}
    </LiveLeaderboardLayout>
  )
}
