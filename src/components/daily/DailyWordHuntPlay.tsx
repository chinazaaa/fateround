'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { WordHuntGrid } from '@/components/word-hunt/WordHuntGrid'
import { WORD_HUNT_GRID_SIZE, wordFromPath, WORD_HUNT_MIN_WORD_LENGTH } from '@/lib/word-hunt'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { hashWord } from '@/lib/daily-word-hash'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DAILY_SUBMIT_CONFIRM } from '@/components/daily/daily-submit-confirm'
import { getOrCreateStartedAt, loadDailyAnswers, saveDailyAnswers, clearDailyProgress } from '@/lib/daily-progress'

interface DailyWordHuntPlayProps {
  challengeId: string
  grid: string[][]
  /** Hashes of the board's valid words — lets the client reject non-words without exposing answers. */
  validWordHashes: string[]
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

function scoreWord(word: string): number {
  const len = word.length
  if (len === 3) return 100
  if (len === 4) return 400
  if (len === 5) return 800
  return 800 + (len - 5) * 400
}

export function DailyWordHuntPlay({
  challengeId,
  grid,
  validWordHashes,
  timer: maxSeconds,
  onSubmit,
}: DailyWordHuntPlayProps) {
  const [startAtMs] = useState(() => getOrCreateStartedAt(challengeId))
  const [selectedPath, setSelectedPath] = useState<number[]>([])
  const [foundWords, setFoundWords] = useState<string[]>(() => loadDailyAnswers<string[]>(challengeId) ?? [])
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)
  const { confirm } = useConfirm()

  const validHashSet = useMemo(() => new Set(validWordHashes), [validWordHashes])

  useEffect(() => {
    if (!submitted) saveDailyAnswers(challengeId, foundWords)
  }, [challengeId, foundWords, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted,
    startAtMs,
  })

  const foundSet = useMemo(() => new Set(foundWords.map((w) => w.toLowerCase())), [foundWords])
  const totalPoints = foundWords.reduce((sum, w) => sum + scoreWord(w), 0)

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    clearDailyProgress(challengeId)
    onSubmit({
      timeSeconds: elapsed,
      submission: { words: foundWords },
    })
  }, [foundWords, elapsed, onSubmit, challengeId])

  const confirmAndSubmit = useCallback(async () => {
    if (await confirm(DAILY_SUBMIT_CONFIRM)) handleSubmit()
  }, [confirm, handleSubmit])

  // Auto-submit on time up
  useEffect(() => {
    if (isTimeUp && !submitted) handleSubmit()
  }, [isTimeUp, submitted, handleSubmit])

  const handleStrokeEnd = useCallback(
    (path: number[]) => {
      if (submitted) return
      const word = wordFromPath(grid, path).toLowerCase()
      // Only accept a real board word (hash membership) that meets the length floor and is new.
      if (word.length >= WORD_HUNT_MIN_WORD_LENGTH && !foundSet.has(word) && validHashSet.has(hashWord(word))) {
        setFoundWords((prev) => [...prev, word])
      }
      setSelectedPath([])
    },
    [grid, foundSet, validHashSet, submitted]
  )

  return (
    <div className="space-y-4">
      {/* Timer + score bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{
          background: 'var(--surface-sunken)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
        }}
      >
        <div>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Score: </span>
          <span className="font-bold" style={{ fontFeatureSettings: '"tnum"' }}>
            {totalPoints}
          </span>
        </div>
        <span
          className={`font-mono font-bold ${isTimeUp ? 'text-error' : ''}`}
          style={{ fontSize: 'var(--text-lg)', fontFeatureSettings: '"tnum"' }}
        >
          {formatted}
        </span>
      </div>

      {/* Grid */}
      <div className="mx-auto" style={{ maxWidth: '320px' }}>
        <WordHuntGrid
          grid={grid}
          selectedPath={selectedPath}
          onPathChange={setSelectedPath}
          onStrokeEnd={handleStrokeEnd}
          disabled={submitted || isTimeUp}
        />
      </div>

      {/* Found words */}
      <div className="fr-card !p-4">
        <p
          className="font-semibold uppercase tracking-wider mb-2"
          style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}
        >
          Words found: {foundWords.length}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {foundWords.map((word, i) => (
            <span key={i} className="fr-badge fr-badge--soft font-semibold">
              {word.toUpperCase()} +{scoreWord(word)}
            </span>
          ))}
          {foundWords.length === 0 && (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>Trace letters to form words</span>
          )}
        </div>
      </div>

      {/* Manual submit button */}
      {!submitted && !isTimeUp && foundWords.length > 0 && (
        <div className="text-center">
          <button className="fr-btn fr-btn--primary" onClick={confirmAndSubmit}>
            Submit ({foundWords.length} words)
          </button>
        </div>
      )}
    </div>
  )
}
