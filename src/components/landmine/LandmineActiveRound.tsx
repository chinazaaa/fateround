'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import {
  gameLandmineMode,
  gameLandmineMineSource,
  gameLandmineCategoryTimer,
  landmineModeLabel,
  clampLandmineMineCount,
  normalizeAnswer,
  parseLandmineMetadata,
  phaseSecondsLeft,
  playerDisplayName,
  resolveActiveLandmineRound,
  revealCountdownSeconds,
  reviewTargetForMarker,
  roundCallerPlayerId,
  tallyLandmineScores,
  clampLandmineWritingTimer,
  clampLandmineMarkingTimer,
  LANDMINE_MAX_ANSWER_LENGTH,
} from '@/lib/landmine'
import { useLandmineAdvance } from '@/hooks/useLandmineAdvance'
import { isAdvanceDriver } from '@/lib/advance-driver'
import { playVoteSubmittedSound } from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type { Game, LandmineAnswer, LandmineMark, LandmineMetadata, Player, Round } from '@/types'

type PlayScreen =
  | 'waiting'
  | 'category_pick'
  | 'setup'
  | 'category_wait'
  | 'setter_watch'
  | 'writing'
  | 'writing_locked'
  | 'marking'
  | 'marking_locked'
  | 'revealed'
  | 'finished'

type CategoryOption = { id: string; name: string; entryCount: number }

export function LandmineActiveRound({
  gameCode,
  game,
  players,
  rounds,
  answers,
  marks,
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
  answers: LandmineAnswer[]
  marks: LandmineMark[]
  myPlayerId: string
  myResumeToken: string | null
  playerName?: string
  onReload?: () => void
  skipGameSync?: boolean
  readOnly?: boolean
}) {
  const { error: toastError } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [picking, setPicking] = useState(false)
  const [answerText, setAnswerText] = useState('')
  const [markValid, setMarkValid] = useState<boolean | null>(null)
  const [categories, setCategories] = useState<CategoryOption[]>([])
  // Manual mode: the setter types the category + mine word(s) themselves.
  const [setupCategory, setSetupCategory] = useState('')
  const [setupMines, setSetupMines] = useState<string[]>([''])
  const [tick, setTick] = useState(0)
  // Optimistic lock-in: the POST is authoritative, but we flip to the locked view the instant it
  // succeeds instead of waiting on a full state reload (that reload latency is what felt like
  // "forever" on a slow connection). Keyed by round id so it resets each round.
  const [lockedAnswerRound, setLockedAnswerRound] = useState<string | null>(null)
  const [lockedAnswerText, setLockedAnswerText] = useState('')
  const [lockedMarkRound, setLockedMarkRound] = useState<string | null>(null)
  const answerRef = useRef('')
  answerRef.current = answerText
  const draftTimerRef = useRef<number | null>(null)
  const autoSubmittedRoundRef = useRef<string | null>(null)
  const hydratedRoundRef = useRef<string | null>(null)
  const submittingRef = useRef(false)

  const currentRound = useMemo(
    () => resolveActiveLandmineRound(rounds, game.current_round_number),
    [rounds, game.current_round_number]
  )
  const metadata: LandmineMetadata | null = currentRound ? parseLandmineMetadata(currentRound.landmine_metadata) : null
  const callerId = currentRound ? roundCallerPlayerId(currentRound, metadata) : null
  const isCaller = callerId === myPlayerId
  const callerName = playerDisplayName(callerId, players)
  const manual = gameLandmineMineSource(game) === 'manual'
  // In manual mode the caller is the "setter": they plant the mine and sit out the round.
  const isSetter = manual && isCaller
  const mineCount = clampLandmineMineCount(metadata?.mine_count)

  const roundAnswers = useMemo(
    () => (currentRound ? answers.filter((a) => a.round_id === currentRound.id) : []),
    [answers, currentRound]
  )
  const roundMarks = useMemo(
    () => (currentRound ? marks.filter((m) => m.round_id === currentRound.id) : []),
    [marks, currentRound]
  )
  // The setter's mirror-payout row (outcome 'setter') is not a real answer — keep it out of the
  // answer boards and per-answer lists (it still counts in the leaderboard, which reads `answers`).
  const playerAnswers = useMemo(() => roundAnswers.filter((a) => a.outcome !== 'setter'), [roundAnswers])
  const myAnswer = roundAnswers.find((a) => a.player_id === myPlayerId && a.outcome !== 'setter') ?? null
  const myMark = roundMarks.find((m) => m.marker_player_id === myPlayerId) ?? null
  const reviewTargetId = reviewTargetForMarker(metadata, myPlayerId)
  const reviewTargetAnswer = reviewTargetId ? (roundAnswers.find((a) => a.player_id === reviewTargetId) ?? null) : null
  const leaderboard = useMemo(() => tallyLandmineScores(answers, players), [answers, players])
  const mode = gameLandmineMode(game)

  const writingTimer = clampLandmineWritingTimer(game.timer_seconds)
  const markingTimer = clampLandmineMarkingTimer(game.operative_timer_seconds)
  // Manual setters get the (longer) answer timer to type a category + mine; auto mode uses the
  // short category-pick timer. This must mirror phaseExpired() on the server.
  const categoryTimer = manual ? writingTimer : gameLandmineCategoryTimer(game)
  const secondsLeft = useMemo(() => {
    void tick
    return metadata ? phaseSecondsLeft(metadata, writingTimer, markingTimer, categoryTimer) : null
  }, [metadata, tick, writingTimer, markingTimer, categoryTimer])

  // Per-second tick for the countdown display.
  // Keep ticking through every phase INCLUDING reveal, so the "next round in Xs" countdown
  // updates and players can see the wait is a timer, not a freeze.
  useEffect(() => {
    if (!metadata) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [metadata?.phase, currentRound?.id])

  // Reset transient state on round change.
  useEffect(() => {
    hydratedRoundRef.current = null
    autoSubmittedRoundRef.current = null
    setAnswerText('')
    setMarkValid(null)
    setSetupCategory('')
    setSetupMines([''])
    setLockedAnswerRound(null)
    setLockedAnswerText('')
    setLockedMarkRound(null)
    setSubmitting(false)
    submittingRef.current = false
    if (draftTimerRef.current != null) {
      window.clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
  }, [currentRound?.id])

  // Hydrate a draft answer if one exists and isn't yet locked.
  useEffect(() => {
    if (!currentRound || metadata?.phase !== 'writing' || myAnswer?.submitted_at) return
    if (hydratedRoundRef.current === currentRound.id) return
    hydratedRoundRef.current = currentRound.id
    if (myAnswer?.answer) setAnswerText(myAnswer.answer)
  }, [currentRound?.id, metadata?.phase, myAnswer?.submitted_at, myAnswer?.answer])

  // Prefetch the category list as soon as the game is active — for EVERY player, not just the
  // current caller — so it's already loaded by the time someone has to pick. Fetching only when
  // you became the caller meant a cold request could outlast the (5–10s) pick timer and auto-pick
  // before you saw any options. `categoryLoad` bumps to force a retry.
  const [categoryError, setCategoryError] = useState(false)
  const [categoryLoad, setCategoryLoad] = useState(0)
  useEffect(() => {
    // Manual mode doesn't use the admin category list — the setter types their own.
    if (game.status !== 'active' || readOnly || manual) return
    let cancelled = false
    setCategoryError(false)
    void fetch('/api/landmine/categories')
      .then((r) => {
        if (!r.ok) throw new Error('failed')
        return r.json()
      })
      .then((data) => {
        if (!cancelled) setCategories(data.categories ?? [])
      })
      .catch(() => {
        if (!cancelled) setCategoryError(true)
      })
    return () => {
      cancelled = true
    }
  }, [game.status, readOnly, categoryLoad, manual])

  const isDriver = useMemo(() => isAdvanceDriver(players, myPlayerId), [players, myPlayerId])
  useLandmineAdvance({
    gameCode,
    game,
    enabled: !skipGameSync && game.status === 'active' && isDriver,
    onAdvanced: onReload,
  })

  const queueDraftSave = () => {
    if (draftTimerRef.current != null) window.clearTimeout(draftTimerRef.current)
    draftTimerRef.current = window.setTimeout(() => {
      draftTimerRef.current = null
      if (readOnly || !currentRound || metadata?.phase !== 'writing' || myAnswer?.submitted_at || !myResumeToken) return
      void fetch('/api/landmine/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          resumeToken: myResumeToken,
          roundId: currentRound.id,
          answer: answerRef.current,
        }),
      })
    }, 1500)
  }

  const pickCategory = async (categoryId: string) => {
    if (!currentRound || readOnly || picking) return
    if (!myResumeToken) return toastError('Your player session expired — rejoin to continue')
    setPicking(true)
    try {
      const res = await fetch('/api/landmine/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, roundId: currentRound.id, categoryId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to pick category')
      playVoteSubmittedSound()
      await onReload?.()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to pick category')
    } finally {
      setPicking(false)
    }
  }

  const submitSetup = async () => {
    if (!currentRound || readOnly || picking) return
    if (!myResumeToken) return toastError('Your player session expired — rejoin to continue')
    const category = setupCategory.trim()
    const mines = setupMines.map((m) => m.trim()).filter(Boolean)
    if (!category) return toastError('Type a category')
    if (mines.length === 0) return toastError(`Type ${mineCount > 1 ? 'at least one mine' : 'the mine'}`)
    setPicking(true)
    try {
      const res = await fetch('/api/landmine/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          resumeToken: myResumeToken,
          roundId: currentRound.id,
          category,
          mines,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to set up round')
      playVoteSubmittedSound()
      await onReload?.()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to set up round')
    } finally {
      setPicking(false)
    }
  }

  const submitAnswerText = useCallback(
    async (value: string, opts?: { silent?: boolean }) => {
      if (!currentRound || readOnly || submittingRef.current) return
      if (!myResumeToken) {
        if (!opts?.silent) toastError('Your player session expired — rejoin to continue')
        return
      }
      // Cancel any queued draft so it can't fire after this submit.
      if (draftTimerRef.current != null) {
        window.clearTimeout(draftTimerRef.current)
        draftTimerRef.current = null
      }
      submittingRef.current = true
      setSubmitting(true)
      try {
        const res = await fetch('/api/landmine/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: gameCode,
            resumeToken: myResumeToken,
            roundId: currentRound.id,
            answer: value,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to submit')
        if (!opts?.silent) playVoteSubmittedSound()
        // Flip to the locked-in view immediately; reconcile via a background reload + realtime.
        setLockedAnswerRound(currentRound.id)
        setLockedAnswerText(value)
        void onReload?.()
      } catch (err) {
        if (!opts?.silent) toastError(err instanceof Error ? err.message : 'Failed to submit')
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [currentRound, readOnly, myResumeToken, gameCode, onReload, toastError]
  )

  // Auto-submit whatever is typed when the writing deadline passes. The setter sits out, so they
  // never auto-submit an answer.
  useEffect(() => {
    if (!currentRound || readOnly || isSetter || metadata?.phase !== 'writing' || myAnswer?.submitted_at) return
    if (!metadata.phase_started_at) return
    const deadline = new Date(metadata.phase_started_at).getTime() + writingTimer * 1000
    const msLeft = Math.max(0, deadline - Date.now())
    const handle = window.setTimeout(() => {
      if (autoSubmittedRoundRef.current === currentRound.id) return
      autoSubmittedRoundRef.current = currentRound.id
      void submitAnswerText(answerRef.current, { silent: true })
    }, msLeft)
    return () => window.clearTimeout(handle)
  }, [
    currentRound?.id,
    metadata?.phase,
    metadata?.phase_started_at,
    writingTimer,
    myAnswer?.submitted_at,
    readOnly,
    isSetter,
    submitAnswerText,
  ])

  const submitMark = async (valid: boolean) => {
    if (!currentRound || readOnly || submitting || !reviewTargetAnswer) return
    if (!myResumeToken) return toastError('Your player session expired — rejoin to continue')
    setSubmitting(true)
    try {
      const res = await fetch('/api/landmine/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, roundId: currentRound.id, valid }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to mark')
      playVoteSubmittedSound()
      // Flip to the marked view immediately; reconcile via a background reload + realtime.
      setLockedMarkRound(currentRound.id)
      void onReload?.()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to mark')
    } finally {
      setSubmitting(false)
    }
  }

  const screen: PlayScreen = useMemo(() => {
    if (game.status === 'finished') return 'finished'
    if (!currentRound) return 'waiting'
    if (currentRound.status === 'finished' || metadata?.phase === 'reveal') return 'revealed'
    const phase = metadata?.phase ?? 'category_pick'
    if (phase === 'category_pick') {
      if (manual) return isSetter ? 'setup' : 'category_wait'
      return isCaller ? 'category_pick' : 'category_wait'
    }
    // Manual mode: the setter planted the mine and sits out — they watch, never answer or mark.
    if (isSetter && (phase === 'writing' || phase === 'marking')) return 'setter_watch'
    if (phase === 'writing') {
      const locked = !!myAnswer?.submitted_at || lockedAnswerRound === currentRound.id
      return locked ? 'writing_locked' : 'writing'
    }
    if (phase === 'marking') {
      const marked = !!myMark?.marked_at || lockedMarkRound === currentRound.id
      return marked ? 'marking_locked' : 'marking'
    }
    return 'waiting'
  }, [
    game.status,
    currentRound,
    metadata,
    isCaller,
    isSetter,
    manual,
    myAnswer,
    myMark,
    lockedAnswerRound,
    lockedMarkRound,
  ])

  // ── Finished ────────────────────────────────────────────────────────────────
  if (screen === 'finished') {
    const myRow = leaderboard.find((r) => r.id === myPlayerId)
    const winner = leaderboard.find((r) => !r.eliminated) ?? leaderboard[0]
    const iWon = !!myRow && winner != null && myRow.id === winner.id && (mode === 'elimination' || myRow.score > 0)
    return (
      <div className="space-y-6">
        <FinishedWinnerHero
          winnerName={winner?.name}
          game={game}
          subtitle={`Landmine · ${landmineModeLabel(mode)}`}
          emoji="🧨"
        />
        <PaginatedLeaderboard
          title="Final standings"
          rows={leaderboard.map((r) => ({ id: r.id, name: r.eliminated ? `${r.name} 💥` : r.name, score: r.score }))}
          highlightId={myPlayerId}
          scoreLabel={(n) => `${n} pts`}
          emphasizeLeader
        />
        {iWon && (
          <PostWinToCommunity
            gameType="landmine"
            gameCode={game.id}
            winnerName={myRow?.name ?? ''}
            roundKey={game.session_started_at ?? undefined}
          />
        )}
      </div>
    )
  }

  if (screen === 'waiting') {
    const upcoming = rounds.filter((r) => r.status === 'pending').sort((a, b) => a.round_number - b.round_number)[0]
    return (
      <div className="glass-card p-8 text-center space-y-3">
        <p className="text-3xl">⏳</p>
        <p className="text-lg font-bold">Next round coming up…</p>
        {upcoming && (
          <p className="text-muted text-sm">
            Up next: {playerDisplayName(upcoming.submitter_player_id, players)}{' '}
            {manual ? 'sets the category & mine' : 'picks the category'}
          </p>
        )}
      </div>
    )
  }

  if (!currentRound || !metadata) return null

  const timerBadge =
    secondsLeft != null && metadata.phase !== 'reveal' ? (
      <span className={`text-sm font-bold ${secondsLeft <= 10 ? 'text-red-400' : 'text-muted'}`}>{secondsLeft}s</span>
    ) : null

  const roundHeader = (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted">
        Round {currentRound.round_number} · {landmineModeLabel(mode)}
      </div>
      {timerBadge}
    </div>
  )

  // Shared transparency board — everyone sees every answer and its Valid/Void verdict live
  // (the mine stays hidden until reveal). Mirrors I Call On's open scoreboard.
  const answerBoard = (
    <div className="space-y-1.5">
      <p className="label-caps text-xs">Everyone’s answers</p>
      {playerAnswers.map((a) => {
        const name = playerDisplayName(a.player_id, players)
        const hasText = !!normalizeAnswer(a.answer)
        const mark = roundMarks.find((m) => m.target_player_id === a.player_id)
        const verdict = !hasText
          ? { text: '—', cls: 'text-muted' }
          : mark?.marked_at
            ? mark.valid
              ? { text: '✓ Valid', cls: 'text-emerald-300' }
              : { text: '✕ Void', cls: 'text-red-300' }
            : { text: '· marking', cls: 'text-muted' }
        return (
          <div
            key={a.player_id}
            className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
              a.player_id === myPlayerId ? 'border-sky-500/40 bg-sky-500/5' : 'border-white/10'
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {name}
                {a.player_id === myPlayerId ? ' (you)' : ''}
              </p>
              <p className="text-sm text-muted truncate">{a.answer || '(no answer)'}</p>
            </div>
            <span className={`text-xs font-bold shrink-0 ${verdict.cls}`}>{verdict.text}</span>
          </div>
        )
      })}
    </div>
  )

  // ── Category pick ─────────────────────────────────────────────────────────────
  if (screen === 'category_pick') {
    return (
      <div className="glass-card p-6 space-y-4">
        {roundHeader}
        <div className="text-center space-y-1">
          <p className="text-3xl">🧨</p>
          <p className="font-bold text-lg">You’re the caller — pick a category</p>
          <p className="text-sm text-muted">A mine will be planted secretly. Choose wisely.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={picking || readOnly}
              onClick={() => void pickCategory(c.id)}
              className="btn-secondary text-left px-4 py-3 rounded-xl disabled:opacity-50"
            >
              {c.name}
            </button>
          ))}
        </div>
        {categories.length === 0 &&
          (categoryError ? (
            <div className="text-center space-y-2">
              <p className="text-sm text-red-300">Couldn’t load categories.</p>
              <button
                type="button"
                onClick={() => setCategoryLoad((n) => n + 1)}
                className="btn-secondary px-4 py-2 rounded-xl text-sm"
              >
                Retry
              </button>
            </div>
          ) : (
            <p className="text-muted text-sm text-center">Loading categories…</p>
          ))}
      </div>
    )
  }

  // ── Manual setup — the setter types the category + mine(s) ─────────────────────
  if (screen === 'setup') {
    return (
      <div className="glass-card p-6 space-y-4">
        {roundHeader}
        <div className="text-center space-y-1">
          <p className="text-3xl">🧨</p>
          <p className="font-bold text-lg">You’re the setter — plant the mine</p>
          <p className="text-sm text-muted">
            Pick a category, then set the secret mine{mineCount > 1 ? 's' : ''}. You sit this round out and score
            whatever the room scores.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <p className="label-caps text-xs mb-1">Category</p>
            <input
              type="text"
              value={setupCategory}
              onChange={(e) => setSetupCategory(e.target.value)}
              placeholder="e.g. Countries in North America"
              maxLength={80}
              autoComplete="off"
              className="input-field w-full"
            />
          </div>
          <div className="space-y-2">
            <p className="label-caps text-xs">Secret mine{mineCount > 1 ? `s (up to ${mineCount})` : ''}</p>
            {Array.from({ length: mineCount }).map((_, i) => (
              <input
                key={i}
                type="text"
                value={setupMines[i] ?? ''}
                onChange={(e) => {
                  const next = [...setupMines]
                  while (next.length < mineCount) next.push('')
                  next[i] = e.target.value
                  setSetupMines(next)
                }}
                placeholder={mineCount > 1 ? `Mine ${i + 1}` : 'The mine word'}
                maxLength={LANDMINE_MAX_ANSWER_LENGTH}
                autoComplete="off"
                className="input-field w-full"
              />
            ))}
            <p className="text-xs text-muted">
              Anyone who types {mineCount > 1 ? 'one of these' : 'this'} scores 0. Keep it tempting but dodgeable.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={picking || readOnly || !setupCategory.trim() || setupMines.every((m) => !m.trim())}
          onClick={() => void submitSetup()}
          className="btn-primary w-full py-3 disabled:opacity-50"
        >
          Start the round
        </button>
      </div>
    )
  }

  if (screen === 'category_wait') {
    return (
      <div className="glass-card p-8 text-center space-y-2">
        {roundHeader}
        <p className="text-3xl">🎯</p>
        <p className="font-bold">
          {callerName} is {manual ? 'setting the category & mine' : 'picking a category'}…
        </p>
      </div>
    )
  }

  // ── Manual setter watching their round play out ────────────────────────────────
  if (screen === 'setter_watch') {
    return (
      <div className="glass-card p-6 space-y-4">
        {roundHeader}
        <div className="text-center space-y-1">
          <p className="text-3xl">🕵️</p>
          <p className="font-bold">You set this round — sit back and watch</p>
          <p className="text-sm text-muted">
            Category: <span className="font-semibold">{metadata.category}</span>. You’ll score the total everyone else
            earns.
          </p>
        </div>
        {answerBoard}
      </div>
    )
  }

  // ── Writing ───────────────────────────────────────────────────────────────────
  if (screen === 'writing') {
    return (
      <div className="glass-card p-6 space-y-4">
        {roundHeader}
        <div className="text-center space-y-1">
          <p className="text-sm text-muted uppercase tracking-wide">Category</p>
          <p className="text-2xl font-black">{metadata.category}</p>
          <p className="text-sm text-muted">Type one answer — dodge the hidden mine.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={answerText}
            onChange={(e) => {
              setAnswerText(e.target.value)
              queueDraftSave()
            }}
            onKeyDown={(e) =>
              e.key === 'Enter' && !submitting && answerText.trim() && void submitAnswerText(answerText)
            }
            placeholder="Your answer"
            maxLength={LANDMINE_MAX_ANSWER_LENGTH}
            autoComplete="off"
            className="input-field flex-1"
          />
          <button
            type="button"
            disabled={submitting || !answerText.trim()}
            onClick={() => void submitAnswerText(answerText)}
            className="btn-primary btn-fit shrink-0 px-4 py-2.5 text-sm"
          >
            Lock in
          </button>
        </div>
        <p className="text-xs text-muted text-center">{playerAnswers.filter((a) => a.submitted_at).length} locked in</p>
      </div>
    )
  }

  if (screen === 'writing_locked') {
    return (
      <div className="glass-card p-8 text-center space-y-2">
        {roundHeader}
        <p className="text-3xl">🔒</p>
        <p className="font-bold">Answer locked in</p>
        <p className="text-sm text-muted">“{myAnswer?.answer || lockedAnswerText}” — waiting for everyone else…</p>
      </div>
    )
  }

  // ── Marking ───────────────────────────────────────────────────────────────────
  if (screen === 'marking') {
    const targetName = playerDisplayName(reviewTargetId, players)
    const targetText = reviewTargetAnswer?.answer ?? ''
    const hasText = !!normalizeAnswer(targetText)
    return (
      <div className="glass-card p-6 space-y-4">
        {roundHeader}
        <div className="text-center space-y-1">
          <p className="text-sm text-muted">Category: {metadata.category}</p>
          <p className="font-bold">Does {targetName}’s answer fit the category?</p>
          <p className="text-2xl font-black mt-2">{hasText ? `“${targetText}”` : '(no answer)'}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={submitting || !hasText}
            onClick={() => {
              setMarkValid(true)
              void submitMark(true)
            }}
            className="btn-secondary py-3 rounded-xl border-emerald-500/50 disabled:opacity-50"
          >
            ✓ Valid
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setMarkValid(false)
              void submitMark(false)
            }}
            className="btn-secondary py-3 rounded-xl border-red-500/50"
          >
            ✕ Void
          </button>
        </div>
        <p className="text-xs text-muted text-center">The mine is still hidden — judge only whether it fits.</p>
        {markValid !== null && <p className="sr-only">selected</p>}
        {answerBoard}
      </div>
    )
  }

  if (screen === 'marking_locked') {
    return (
      <div className="glass-card p-6 space-y-4">
        {roundHeader}
        <div className="text-center space-y-1">
          <p className="text-3xl">✅</p>
          <p className="font-bold">Your mark is in</p>
          <p className="text-sm text-muted">Waiting for the other markers…</p>
        </div>
        {answerBoard}
      </div>
    )
  }

  // ── Reveal ────────────────────────────────────────────────────────────────────
  if (screen === 'revealed') {
    const mines = metadata.revealed_mines ?? []
    void tick // re-read each second so the countdown below updates
    const revealLeft = revealCountdownSeconds(currentRound.ended_at)
    return (
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-muted">
            Round {currentRound.round_number} · {metadata.category}
          </div>
          {game.status === 'active' && revealLeft > 0 && (
            <span className="text-sm font-bold text-sky-300">Next round in {revealLeft}s</span>
          )}
        </div>
        <div className="text-center space-y-1">
          <p className="text-3xl">💥</p>
          <p className="font-bold">The mine{mines.length > 1 ? 's were' : ' was'}:</p>
          <p className="text-2xl font-black text-red-400">{mines.join(', ') || '—'}</p>
        </div>
        <div className="space-y-2">
          {(() => {
            const setterRow = manual ? roundAnswers.find((a) => a.outcome === 'setter') : null
            return (
              <>
                {setterRow && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {playerDisplayName(setterRow.player_id, players)}
                      </p>
                      <p className="text-sm text-muted truncate">🧨 Set this round’s mine</p>
                    </div>
                    <span className="text-sm font-bold shrink-0 text-amber-300">+{setterRow.points ?? 0}</span>
                  </div>
                )}
                {playerAnswers.map((a) => {
                  const name = playerDisplayName(a.player_id, players)
                  const badge =
                    a.outcome === 'mine'
                      ? { text: '💥 Mine', cls: 'text-red-300' }
                      : a.outcome === 'void'
                        ? { text: 'Void · 0', cls: 'text-muted' }
                        : a.outcome === 'empty'
                          ? { text: '— · 0', cls: 'text-muted' }
                          : { text: `+${a.points ?? 0}${a.is_original ? ' ⭐' : ''}`, cls: 'text-emerald-300' }
                  return (
                    <div
                      key={a.player_id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{name}</p>
                        <p className="text-sm text-muted truncate">{a.answer || '(no answer)'}</p>
                      </div>
                      <span className={`text-sm font-bold shrink-0 ${badge.cls}`}>{badge.text}</span>
                    </div>
                  )
                })}
              </>
            )
          })()}
        </div>
        <PaginatedLeaderboard
          title="Standings"
          rows={leaderboard.map((r) => ({ id: r.id, name: r.eliminated ? `${r.name} 💥` : r.name, score: r.score }))}
          highlightId={myPlayerId}
          scoreLabel={(n) => `${n} pts`}
          emphasizeLeader
        />
      </div>
    )
  }

  return null
}
