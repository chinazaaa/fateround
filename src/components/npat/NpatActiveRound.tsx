'use client'

import { useEffect, useMemo, useState } from 'react'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { LiveLeaderboardLayout } from '@/components/LiveLeaderboardLayout'
import { NpatScoreboard } from '@/components/npat/NpatScoreboard'
import { NpatGameTimerBar } from '@/components/npat/NpatGameTimerBar'
import {
  clampNpatMarkingTimer,
  clampNpatTimer,
  NPAT_CATEGORIES,
  NPAT_CATEGORY_LABELS,
  NPAT_MAX_ANSWER_LENGTH,
  npatLettersRemaining,
  parseNpatMetadata,
  phaseSecondsLeft,
  playerDisplayName,
  revealCountdownSeconds,
  reviewTargetForMarker,
  tallyNpatScores,
  unusedLetters,
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
  | 'revealed'
  | 'finished'

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
  const [form, setForm] = useState({ name: '', animal: '', place: '', thing: '' })
  const [validFlags, setValidFlags] = useState<Record<NpatCategory, boolean>>({
    name: true,
    animal: true,
    place: true,
    thing: true,
  })
  const [tick, setTick] = useState(0)

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

  useEffect(() => {
    if (!metadata || metadata.phase === 'reveal') return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [metadata?.phase, currentRound?.id])

  useEffect(() => {
    setForm({ name: '', animal: '', place: '', thing: '' })
    setValidFlags({ name: true, animal: true, place: true, thing: true })
    setSubmitting(false)
  }, [currentRound?.id])

  useEffect(() => {
    if (myMark) {
      setValidFlags({
        name: myMark.valid_name,
        animal: myMark.valid_animal,
        place: myMark.valid_place,
        thing: myMark.valid_thing,
      })
    }
  }, [myMark?.id, currentRound?.id])

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

  const submitAnswers = async () => {
    if (!currentRound || readOnly || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/npat/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          playerId: myPlayerId,
          roundId: currentRound.id,
          ...form,
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

  const submitMarks = async () => {
    if (!currentRound || readOnly || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/npat/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          playerId: myPlayerId,
          roundId: currentRound.id,
          validName: validFlags.name,
          validAnimal: validFlags.animal,
          validPlace: validFlags.place,
          validThing: validFlags.thing,
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
      <div className="space-y-4">
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
      </div>
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

  const showTransparency = metadata.phase === 'marking' || screen === 'revealed' || screen === 'marking_locked'
  const showFinalScores = screen === 'revealed' || !!(metadata.scores_computed && currentRound.status === 'finished')
  const lettersLeft = npatLettersRemaining(metadata)
  const availableLetters = unusedLetters(metadata.used_letters)

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
      <div className="space-y-4">
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
            <p className="text-faint text-xs text-center">{availableLetters.length} letters still available</p>
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
                      'h-10 rounded-lg border font-bold',
                      used
                        ? 'border-[var(--border-strong)]/40 text-faint line-through opacity-40 cursor-not-allowed'
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
                  value={form[category]}
                  maxLength={NPAT_MAX_ANSWER_LENGTH}
                  disabled={screen !== 'writing' || readOnly || submitting}
                  onChange={(e) => setForm((prev) => ({ ...prev, [category]: e.target.value }))}
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
          </div>
        )}

        {(screen === 'marking' || screen === 'marking_locked') && reviewTargetAnswer && (
          <div className="glass-card p-4 space-y-3">
            <p className="font-bold">
              Mark {playerDisplayName(reviewTargetId, players)}&apos;s answers
            </p>
            <p className="text-faint text-xs">
              Tap valid or invalid for each category. Wrong category (e.g. &quot;cat&quot; under Name) should be invalid.
              Duplicates are handled automatically.
            </p>
            {NPAT_CATEGORIES.map((category) => (
              <div key={category} className="rounded-lg border border-[var(--border-strong)] p-3 space-y-2">
                <p className="text-sm font-semibold">{NPAT_CATEGORY_LABELS[category]}</p>
                <p className="font-medium">{reviewTargetAnswer[category] || '—'}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={screen !== 'marking' || readOnly || submitting}
                    onClick={() => setValidFlags((prev) => ({ ...prev, [category]: true }))}
                    className={[
                      'rounded-lg py-2 text-sm font-bold border',
                      validFlags[category]
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200'
                        : 'border-[var(--border-strong)]',
                    ].join(' ')}
                  >
                    Valid (+10)
                  </button>
                  <button
                    type="button"
                    disabled={screen !== 'marking' || readOnly || submitting}
                    onClick={() => setValidFlags((prev) => ({ ...prev, [category]: false }))}
                    className={[
                      'rounded-lg py-2 text-sm font-bold border',
                      !validFlags[category]
                        ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-200'
                        : 'border-[var(--border-strong)]',
                    ].join(' ')}
                  >
                    Invalid (0)
                  </button>
                </div>
              </div>
            ))}
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
        )}

        {showTransparency && (
          <NpatScoreboard
            letter={metadata.letter}
            players={players}
            answers={roundAnswers}
            marks={roundMarks}
            metadata={metadata}
            showScores={showFinalScores}
          />
        )}

        {screen === 'revealed' && myAnswer && myAnswer.score_name != null && (
          <div className="glass-card p-4 text-center font-semibold">
            You scored{' '}
            {(myAnswer.score_name ?? 0) +
              (myAnswer.score_animal ?? 0) +
              (myAnswer.score_place ?? 0) +
              (myAnswer.score_thing ?? 0)}{' '}
            pts this round
          </div>
        )}
      </div>
    </LiveLeaderboardLayout>
  )
}
