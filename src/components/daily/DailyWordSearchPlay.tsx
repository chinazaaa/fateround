'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { WordSearchBoard } from '@/components/word-search/WordSearchBoard'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DAILY_SUBMIT_CONFIRM } from '@/components/daily/daily-submit-confirm'
import { getOrCreateStartedAt, loadDailyAnswers, saveDailyAnswers, clearDailyProgress } from '@/lib/daily-progress'
import type { WordSearchMetadata } from '@/lib/word-search'

interface DailyWordSearchPlayProps {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

type WordSearchProgress = { foundWords: string[]; myFoundCells: boolean[][] }

export function DailyWordSearchPlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: DailyWordSearchPlayProps) {
  const metadata = puzzle.metadata as WordSearchMetadata
  const totalWords = metadata.words?.length ?? 0

  const saved = loadDailyAnswers<WordSearchProgress>(challengeId)
  const [startAtMs] = useState(() => getOrCreateStartedAt(challengeId))
  const [foundWords, setFoundWords] = useState<string[]>(saved?.foundWords ?? [])
  const [myFoundCells, setMyFoundCells] = useState<boolean[][]>(
    () => saved?.myFoundCells ?? Array.from({ length: metadata.size }, () => Array(metadata.size).fill(false))
  )
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)
  const { confirm } = useConfirm()

  useEffect(() => {
    if (!submitted) saveDailyAnswers<WordSearchProgress>(challengeId, { foundWords, myFoundCells })
  }, [challengeId, foundWords, myFoundCells, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted,
    startAtMs,
  })

  const wordsSet = useMemo(() => new Set(metadata.words?.map((w) => w.toUpperCase()) ?? []), [metadata.words])
  const foundSet = useMemo(() => new Set(foundWords.map((w) => w.toUpperCase())), [foundWords])

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    clearDailyProgress(challengeId)
    onSubmit({
      timeSeconds: elapsed,
      submission: { words: foundWords, hintsUsed: 0 },
    })
  }, [foundWords, elapsed, onSubmit, challengeId])

  const confirmAndSubmit = useCallback(async () => {
    if (await confirm(DAILY_SUBMIT_CONFIRM)) handleSubmit()
  }, [confirm, handleSubmit])

  useEffect(() => {
    if (isTimeUp && !submitted) handleSubmit()
  }, [isTimeUp, submitted, handleSubmit])

  // Auto-submit when all words found
  useEffect(() => {
    if (foundWords.length === totalWords && totalWords > 0 && !submitted) {
      handleSubmit()
    }
  }, [foundWords.length, totalWords, submitted, handleSubmit])

  const handleSelect = useCallback(
    (start: [number, number], end: [number, number]) => {
      if (submitted) return
      // Extract word from grid between start and end
      const [sr, sc] = start
      const [er, ec] = end
      const dr = er === sr ? 0 : er > sr ? 1 : -1
      const dc = ec === sc ? 0 : ec > sc ? 1 : -1
      const steps = Math.max(Math.abs(er - sr), Math.abs(ec - sc))

      let word = ''
      const cells: [number, number][] = []
      for (let i = 0; i <= steps; i++) {
        const r = sr + dr * i
        const c = sc + dc * i
        word += metadata.grid[r]?.[c] ?? ''
        cells.push([r, c])
      }

      const upper = word.toUpperCase()
      const reversed = upper.split('').reverse().join('')
      const match = wordsSet.has(upper) ? upper : wordsSet.has(reversed) ? reversed : null

      if (match && !foundSet.has(match)) {
        setFoundWords((prev) => [...prev, match])
        setMyFoundCells((prev) => {
          const next = prev.map((row) => [...row])
          for (const [r, c] of cells) next[r][c] = true
          return next
        })
      }
    },
    [metadata.grid, wordsSet, foundSet, submitted]
  )

  return (
    <div className="space-y-4">
      {/* Timer + progress bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{
          background: 'var(--surface-sunken)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
        }}
      >
        <div>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Found: </span>
          <span className="font-bold" style={{ fontFeatureSettings: '"tnum"' }}>
            {foundWords.length}/{totalWords}
          </span>
        </div>
        <span
          className={`font-mono font-bold ${isTimeUp ? 'text-error' : ''}`}
          style={{ fontSize: 'var(--text-lg)', fontFeatureSettings: '"tnum"' }}
        >
          {formatted}
        </span>
      </div>

      {/* Word list — above the board so players can see target words */}
      <div className="fr-card !p-4">
        <div className="flex flex-wrap gap-1.5">
          {(metadata.words ?? []).map((word, i) => {
            const found = foundSet.has(word.toUpperCase())
            return (
              <span
                key={i}
                className={`fr-badge font-semibold ${found ? 'fr-badge--soft line-through' : ''}`}
                style={!found ? { background: 'var(--surface-sunken)', color: 'var(--text-muted)' } : undefined}
              >
                {word}
              </span>
            )
          })}
        </div>
      </div>

      {/* Board */}
      <WordSearchBoard
        metadata={metadata}
        myFoundCells={myFoundCells}
        onSelect={handleSelect}
        readOnly={submitted || isTimeUp}
      />

      {!submitted && !isTimeUp && foundWords.length > 0 && foundWords.length < totalWords && (
        <div className="text-center">
          <button className="fr-btn fr-btn--primary" onClick={confirmAndSubmit}>
            Submit ({foundWords.length}/{totalWords})
          </button>
        </div>
      )}
    </div>
  )
}
