'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { NpatCallerReviewPanel } from '@/components/npat/NpatCallerReviewPanel'
import { NpatFinalResultsShareBlock } from '@/components/npat/NpatFinalResultsShareBlock'
import { NpatScoreboard } from '@/components/npat/NpatScoreboard'
import { NpatGameTimerBar } from '@/components/npat/NpatGameTimerBar'
import {
  answerTotal,
  availableLettersForPick,
  clampNpatMarkingTimer,
  clampNpatTimer,
  duplicateKeysByCategory,
  isForcedInvalidAnswer,
  normalizeAnswer,
  NPAT_CATEGORIES,
  NPAT_CATEGORY_LABELS,
  NPAT_MAX_ANSWER_LENGTH,
  npatLettersRemaining,
  npatAnswerRequestPayload,
  parseNpatMetadata,
  phaseDeadlineMs,
  phaseSecondsLeft,
  playerDisplayName,
  revealCountdownSeconds,
  reviewTargetForMarker,
  tallyNpatScores,
} from '@/lib/npat'
import { useNpatAdvance } from '@/hooks/useNpatAdvance'
import { playVoteSubmittedSound } from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type { Game, NpatAnswer, NpatCategory, NpatMark, Player, Round } from '@/types'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

type PlayScreen =
  | 'waiting'
  | 'letter_pick'
  | 'letter_wait'
  | 'writing'
  | 'writing_locked'
  | 'marking'
  | 'marking_locked'
  | 'caller_review'
  | 'approval_wait'
  | 'revealed'
  | 'finished'

function updateAnswerField(
  category: NpatCategory,
  value: string,
  letter: string | null,
  prev: Record<NpatCategory, string>
): Record<NpatCategory, string> {
  if (!value) return { ...prev, [category]: '' }
  const trimmed = value.trimStart()
  if (trimmed.length > 0 && letter && trimmed[0].toUpperCase() !== letter.toUpperCase()) {
    return prev
  }
  return { ...prev, [category]: value }
}

export function NpatActiveRound({
  gameCode,
  game,
  players,
  rounds,
  answers,
  marks,
  myPlayerId,
  playerName,
  onReload,
  skipGameSync = false,
  readOnly = false,
}: {
  gameCode: string
  game: Game
  players: Player[]
  rounds: Round[]
  answers: NpatAnswer[]
  marks: NpatMark[]
  myPlayerId: string
  playerName: string
  onReload?: () => void
  skipGameSync?: boolean
  readOnly?: boolean
}) {
  const { error: toastError } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [pickingLetter, setPickingLetter] = useState(false)
  const emptyAnswerForm = useMemo(
    () => Object.fromEntries(NPAT_CATEGORIES.map((c) => [c, ''])) as Record<NpatCategory, string>,
    []
  )
  const defaultValidFlags = useMemo(
    () => Object.fromEntries(NPAT_CATEGORIES.map((c) => [c, true])) as Record<NpatCategory, boolean>,
    []
  )
  const [answerForm, setAnswerForm] = useState<Record<NpatCategory, string>>(emptyAnswerForm)
  const [validFlags, setValidFlags] = useState<Record<NpatCategory, boolean>>(defaultValidFlags)
  const [tick, setTick] = useState(0)
  const answerFormRef = useRef(answerForm)
  answerFormRef.current = answerForm
  const autoSubmittedRoundRef = useRef<string | null>(null)
  const draftTimerRef = useRef<number | null>(null)
  const submittingRef = useRef(false)

  const currentRound = useMemo(() => {
    const byPointer = rounds.find((r) => r.round_number === game.current_round_number) ?? null
    const active = rounds.find((r) => r.status === 'active') ?? null
    if (active && byPointer && active.id !== byPointer.id && byPointer.status === 'finished') return active
    return byPointer ?? active
  }, [rounds, game.current_round_number])

  const metadata = currentRound ? parseNpatMetadata(currentRound.npat_metadata) : null
  const roundAnswers = useMemo(
    () => (currentRound ? answers.filter((a) => a.round_id === currentRound.id) : []),
    [answers, currentRound]
  )
  const roundMarks = useMemo(
    () => (currentRound ? marks.filter((m) => m.round_id === currentRound.id) : []),
    [marks, currentRound]
  )
  const myAnswer = roundAnswers.find((a) => a.player_id === myPlayerId) ?? null
  const myMark = roundMarks.find((m) => m.marker_player_id === myPlayerId) ?? null
  const isCaller = currentRound?.submitter_player_id === myPlayerId
  const reviewTargetId = reviewTargetForMarker(metadata, myPlayerId)
  const reviewTargetAnswer = reviewTargetId
    ? roundAnswers.find((a) => a.player_id === reviewTargetId) ?? null
    : null
  const leaderboard = useMemo(() => tallyNpatScores(answers, players), [answers, players])
  const callerName = playerDisplayName(currentRound?.submitter_player_id, players)

  const writingTimer = clampNpatTimer(game.timer_seconds)
  const markingTimer = clampNpatMarkingTimer(game.operative_timer_seconds)
  const secondsLeft = useMemo(() => {
    void tick
    return metadata ? phaseSecondsLeft(metadata, writingTimer, markingTimer) : null
  }, [metadata, tick, writingTimer, markingTimer])

  const queueDraftSave = () => {
    if (draftTimerRef.current != null) window.clearTimeout(draftTimerRef.current)
    draftTimerRef.current = window.setTimeout(() => {
      draftTimerRef.current = null
      if (readOnly || !currentRound || metadata?.phase !== 'writing' || myAnswer?.submitted_at) return
      void fetch('/api/npat/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          npatAnswerRequestPayload({
            gameId: gameCode,
            playerId: myPlayerId,
            roundId: currentRound.id,
            answers: answerFormRef.current,
          })
        ),
      })
    }, 1500)
  }

  const updateAnswerFormField = (category: NpatCategory, value: string) => {
    let changed = false
    setAnswerForm((prev) => {
      const next = updateAnswerField(category, value, metadata?.letter ?? null, prev)
      changed = next !== prev
      return next
    })
    if (changed) queueDraftSave()
  }

  useEffect(() => {
    if (!metadata || metadata.phase === 'reveal') return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [metadata?.phase, currentRound?.id])

  useEffect(() => {
    setAnswerForm(emptyAnswerForm)
    setValidFlags(defaultValidFlags)
    setSubmitting(false)
    submittingRef.current = false
    autoSubmittedRoundRef.current = null
    if (draftTimerRef.current != null) {
      window.clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
  }, [currentRound?.id, emptyAnswerForm, defaultValidFlags])

  useEffect(() => {
    if (!myMark || !reviewTargetId) return
    const answer = roundAnswers.find((a) => a.player_id === reviewTargetId)
    if (!answer) return
    const dupes = duplicateKeysByCategory(roundAnswers)
    const letter = metadata?.letter ?? null
    const clamp = (category: NpatCategory, value: boolean) => {
      const text = answer[category]
      const normalized = normalizeAnswer(text)
      const isDuplicate = normalized ? dupes[category].has(normalized) : false
      return isForcedInvalidAnswer(text, letter, isDuplicate) ? false : value
    }
    setValidFlags(
      Object.fromEntries(
        NPAT_CATEGORIES.map((category) => [
          category,
          clamp(category, myMark[`valid_${category}` as keyof NpatMark] as boolean),
        ])
      ) as Record<NpatCategory, boolean>
    )
  }, [
    myMark?.id,
    myMark?.valid_name,
    myMark?.valid_animal,
    myMark?.valid_place,
    myMark?.valid_thing,
    myMark?.valid_food,
    currentRound?.id,
    reviewTargetId,
    roundAnswers,
    metadata?.letter,
  ])

  useNpatAdvance({
    gameCode,
    game,
    enabled: !skipGameSync && game.status === 'active',
    onAdvanced: onReload,
  })

  const screen: PlayScreen = useMemo(() => {
    if (game.status === 'finished') return 'finished'
    if (!currentRound || currentRound.status === 'pending') return 'waiting'
    if (currentRound.status === 'finished') {
      if (game.status === 'active' && currentRound.ended_at && revealCountdownSeconds(currentRound.ended_at) > 0) {
        return 'revealed'
      }
      return 'waiting'
    }
    const phase = metadata?.phase ?? 'letter_pick'
    if (phase === 'letter_pick') return isCaller ? 'letter_pick' : 'letter_wait'
    if (phase === 'writing') return myAnswer?.submitted_at ? 'writing_locked' : 'writing'
    if (phase === 'marking') return myMark?.marked_at ? 'marking_locked' : 'marking'
    if (phase === 'host_review') return isCaller ? 'caller_review' : 'approval_wait'
    return 'waiting'
  }, [game.status, currentRound, metadata, isCaller, myAnswer, myMark])

  const pickLetter = async (letter: string) => {
    if (!currentRound || readOnly || pickingLetter) return
    setPickingLetter(true)
    try {
      const res = await fetch('/api/npat/letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId, roundId: currentRound.id, letter }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to pick letter')
      playVoteSubmittedSound()
      await onReload?.()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to pick letter')
    } finally {
      setPickingLetter(false)
    }
  }

  const submitAnswersWithForm = async (
    values: Record<NpatCategory, string>,
    opts?: { silent?: boolean }
  ) => {
    if (!currentRound || readOnly || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      const res = await fetch('/api/npat/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          npatAnswerRequestPayload({
            gameId: gameCode,
            playerId: myPlayerId,
            roundId: currentRound.id,
            answers: values,
          })
        ),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit')
      if (!opts?.silent) playVoteSubmittedSound()
      await onReload?.()
    } catch (err) {
      if (!opts?.silent) {
        toastError(err instanceof Error ? err.message : 'Failed to submit')
      }
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (!currentRound || readOnly || metadata?.phase !== 'writing' || myAnswer?.submitted_at) return

    const deadline = phaseDeadlineMs(metadata, writingTimer, markingTimer)
    if (deadline == null) return

    const msLeft = Math.max(0, deadline - Date.now())
    const handle = window.setTimeout(() => {
      if (autoSubmittedRoundRef.current === currentRound.id) return
      autoSubmittedRoundRef.current = currentRound.id
      void submitAnswersWithForm(answerFormRef.current, { silent: true })
    }, msLeft)

    return () => window.clearTimeout(handle)
  }, [
    currentRound?.id,
    metadata?.phase,
    metadata?.phase_started_at,
    writingTimer,
    markingTimer,
    myAnswer?.submitted_at,
    readOnly,
    gameCode,
    myPlayerId,
  ])

  const submitAnswers = async () => {
    await submitAnswersWithForm(answerForm)
  }

  const submitMarks = async () => {
    if (!currentRound || readOnly || submitting || !reviewTargetAnswer) return
    setSubmitting(true)
    try {
      const dupes = duplicateKeysByCategory(roundAnswers)
      const letter = metadata?.letter ?? null
      const clamp = (category: NpatCategory, value: boolean) => {
        const text = reviewTargetAnswer[category]
        const normalized = normalizeAnswer(text)
        const isDuplicate = normalized ? dupes[category].has(normalized) : false
        return isForcedInvalidAnswer(text, letter, isDuplicate) ? false : value
      }
      const res = await fetch('/api/npat/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          playerId: myPlayerId,
          roundId: currentRound.id,
          ...Object.fromEntries(
            NPAT_CATEGORIES.map((category) => [
              `valid${category.charAt(0).toUpperCase()}${category.slice(1)}`,
              clamp(category, validFlags[category]),
            ])
          ),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit marks')
      playVoteSubmittedSound()
      await onReload?.()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to submit marks')
    } finally {
      setSubmitting(false)
    }
  }

  if (screen === 'finished') {
    return (
      <NpatFinalResultsShareBlock
        game={game}
        players={players}
        leaderboard={leaderboard}
        highlightPlayerId={myPlayerId}
      />
    )
  }

  if (screen === 'waiting') {
    const upcoming = rounds.filter((r) => r.status === 'pending').sort((a, b) => a.round_number - b.round_number)[0]
    return (
      <div className="glass-card p-8 text-center space-y-3">
        <p className="text-3xl">⏳</p>
        <p className="text-lg font-bold">Next letter coming up…</p>
        {upcoming && (
          <p className="text-muted text-sm">
            Up next: {playerDisplayName(upcoming.submitter_player_id, players)} calls the letter
          </p>
        )}
      </div>
    )
  }

  if (!currentRound || !metadata) return null

  const showTransparency =
    metadata?.phase === 'writing' ||
    metadata?.phase === 'marking' ||
    metadata?.phase === 'host_review' ||
    screen === 'revealed' ||
    screen === 'marking_locked' ||
    screen === 'writing_locked' ||
    screen === 'caller_review' ||
    screen === 'approval_wait'
  const showFinalScores = screen === 'revealed' || !!(metadata?.scores_computed && currentRound.status === 'finished')
  const maskScoreboardAnswers = metadata?.phase === 'writing'
  const lettersLeft = npatLettersRemaining(metadata)
  const availableLetters = availableLettersForPick(rounds)
  const usedLetters = LETTERS.filter((letter) => !availableLetters.includes(letter))

  const scoreboard = showTransparency ? (
    <NpatScoreboard
      letter={metadata.letter}
      players={players}
      answers={roundAnswers}
      marks={roundMarks}
      metadata={metadata}
      showScores={showFinalScores}
      maskAnswers={maskScoreboardAnswers}
    />
  ) : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] gap-4 items-start">
      <div className="min-w-0 space-y-4 order-1">
        <NpatGameTimerBar game={game} />

        <div className="glass-card p-5 text-center space-y-2">
          <p className="label-caps text-xs">
            Letter {currentRound.round_number}
            {lettersLeft > 0 ? ` · ${lettersLeft} letter${lettersLeft === 1 ? '' : 's'} left` : ''}
          </p>
          {metadata.letter ? (
            <p className="text-5xl font-black text-sky-500">{metadata.letter}</p>
          ) : (
            <p className="text-lg font-bold">{callerName} picks the letter</p>
          )}
          {secondsLeft != null && metadata.phase !== 'reveal' && (
            <p className="text-sm font-bold tabular-nums text-[var(--primary-strong)]">{secondsLeft}s left</p>
          )}
          {screen === 'revealed' && (
            <p className="text-sm text-muted">Next letter in {revealCountdownSeconds(currentRound.ended_at)}s…</p>
          )}
        </div>

        {screen === 'letter_pick' && (
          <div className="glass-card p-4 space-y-3">
            <p className="font-bold text-center">Pick a letter for everyone</p>
            <p className="text-faint text-xs text-center">
              {availableLetters.length} letters still available
              {usedLetters.length > 0 ? ` · ${usedLetters.join(', ')} already used` : ''}
            </p>
            <div className="grid grid-cols-7 gap-2">
              {LETTERS.map((letter) => {
                const used = !availableLetters.includes(letter)
                return (
                  <button
                    key={letter}
                    type="button"
                    disabled={pickingLetter || readOnly || used}
                    onClick={() => void pickLetter(letter)}
                    className={[
                      'h-10 rounded-lg border font-bold transition-colors',
                      used
                        ? 'border-[var(--border-strong)]/30 bg-[var(--surface-inset-bg)] text-faint line-through opacity-50 cursor-not-allowed'
                        : 'border-[var(--border-strong)] hover:border-sky-400 hover:bg-sky-500/10',
                    ].join(' ')}
                  >
                    {letter}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {screen === 'letter_wait' && (
          <div className="glass-card p-6 text-center text-muted">
            {callerName} is choosing the letter…
          </div>
        )}

        {(screen === 'writing' || screen === 'writing_locked') && (
          <div className="glass-card p-4 space-y-3">
            <p className="font-bold">Fill every category starting with {metadata.letter}</p>
            {NPAT_CATEGORIES.map((category) => (
              <label key={category} className="block space-y-1">
                <span className="text-sm font-semibold">{NPAT_CATEGORY_LABELS[category]}</span>
                <input
                  type="text"
                  autoComplete="off"
                  value={answerForm[category]}
                  maxLength={NPAT_MAX_ANSWER_LENGTH}
                  disabled={screen !== 'writing' || readOnly || submitting}
                  onChange={(e) => updateAnswerFormField(category, e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] px-3 py-2"
                  placeholder={`${metadata.letter}…`}
                />
              </label>
            ))}
            {screen === 'writing' ? (
              <button
                type="button"
                disabled={readOnly || submitting}
                onClick={() => void submitAnswers()}
                className="btn-primary w-full"
              >
                {submitting ? 'Submitting…' : 'Submit answers'}
              </button>
            ) : (
              <p className="text-center text-sm text-muted">Answers locked in — waiting for everyone…</p>
            )}
            {screen === 'writing' && secondsLeft != null && secondsLeft <= 10 && (
              <p className="text-center text-xs text-muted">
                Unsubmitted answers are sent automatically when time runs out.
              </p>
            )}
          </div>
        )}

        {screen === 'caller_review' && (
          <NpatCallerReviewPanel
            gameCode={gameCode}
            playerId={myPlayerId}
            round={currentRound}
            players={players}
            answers={answers}
            marks={marks}
            onApproved={onReload}
          />
        )}

        {screen === 'approval_wait' && (
          <div className="glass-card p-6 text-center space-y-2">
            <p className="text-2xl">👀</p>
            <p className="font-bold">Waiting for {callerName}&apos;s approval</p>
            <p className="text-sm text-muted">
              The letter caller is reviewing everyone&apos;s answers before scores are revealed.
            </p>
          </div>
        )}

        {(screen === 'marking' || screen === 'marking_locked') && reviewTargetAnswer && (() => {
          const markingDupes = duplicateKeysByCategory(roundAnswers)
          return (
          <div className="glass-card p-4 space-y-3">
            <p className="font-bold">
              Mark {playerDisplayName(reviewTargetId, players)}&apos;s answers
            </p>
            <p className="text-faint text-xs">
              Tap valid or invalid for each category. Wrong category (e.g. &quot;cat&quot; under Name) should be invalid.
              Duplicates are handled automatically.
            </p>
            {NPAT_CATEGORIES.map((category) => {
              const text = reviewTargetAnswer[category]
              const normalized = text.trim().toLowerCase()
              const isDuplicate = normalized ? markingDupes[category].has(normalized) : false
              const forcedInvalid = isForcedInvalidAnswer(text, metadata.letter, isDuplicate)
              const displayValid = forcedInvalid ? false : validFlags[category]
              return (
              <div key={category} className="rounded-lg border border-[var(--border-strong)] p-3 space-y-2">
                <p className="text-sm font-semibold">{NPAT_CATEGORY_LABELS[category]}</p>
                <p className="font-medium">{text || '—'}</p>
                {forcedInvalid && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-300 font-semibold">
                    {!text.trim() ? 'Empty — invalid automatically' : isDuplicate ? 'Duplicate — 5 pts each' : `Must start with ${metadata.letter}`}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={screen !== 'marking' || readOnly || submitting || forcedInvalid}
                    onClick={() => setValidFlags((prev) => ({ ...prev, [category]: true }))}
                    className={[
                      'rounded-lg py-2 text-sm font-bold border',
                      displayValid
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200'
                        : 'border-[var(--border-strong)]',
                    ].join(' ')}
                  >
                    Valid (+10)
                  </button>
                  <button
                    type="button"
                    disabled={screen !== 'marking' || readOnly || submitting || forcedInvalid}
                    onClick={() => setValidFlags((prev) => ({ ...prev, [category]: false }))}
                    className={[
                      'rounded-lg py-2 text-sm font-bold border',
                      !displayValid
                        ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-200'
                        : 'border-[var(--border-strong)]',
                    ].join(' ')}
                  >
                    Invalid (0)
                  </button>
                </div>
              </div>
            )})}
            {screen === 'marking' ? (
              <button
                type="button"
                disabled={readOnly || submitting}
                onClick={() => void submitMarks()}
                className="btn-primary w-full"
              >
                {submitting ? 'Saving marks…' : 'Lock in marks'}
              </button>
            ) : (
              <p className="text-center text-sm text-muted">Marks saved — everyone can see them below.</p>
            )}
          </div>
          )
        })()}

        {showTransparency && <div className="lg:hidden">{scoreboard}</div>}

        {screen === 'revealed' && myAnswer && myAnswer.score_name != null && (
          <div className="glass-card p-4 text-center font-semibold">
            You scored {answerTotal(myAnswer)} pts this round
          </div>
        )}
      </div>

      <aside className="min-w-0 space-y-4 order-2">
        <PaginatedLeaderboard
          title="Leaderboard"
          rows={leaderboard.map((row, i) => ({ id: row.id, name: row.name, score: row.score, rank: i + 1 }))}
          highlightId={myPlayerId}
          scoreLabel={(score) => `${score} pts`}
        />
        {scoreboard && <div className="hidden lg:block">{scoreboard}</div>}
      </aside>
    </div>
  )
}
