'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { getOrCreateStartedAt, loadDailyAnswers, saveDailyAnswers, clearDailyProgress } from '@/lib/daily-progress'
import { gradeWordleGuess, wordleKeyBestStates, type WordleLetterState } from '@/lib/daily-wordle'

interface DailyWordlePlayProps {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

// Progress persisted to localStorage so a refresh doesn't wipe the board or a half-typed row.
type WordleProgress = {
  guesses: string[]
  current: string
}

const KEYBOARD_ROWS: ReadonlyArray<readonly string[]> = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
]

const TILE_BG: Record<WordleLetterState, string> = {
  correct: 'var(--wl-correct)',
  present: 'var(--wl-present)',
  absent: 'var(--wl-absent)',
}

const STATE_ANNOUNCE: Record<WordleLetterState, string> = {
  correct: 'correct',
  present: 'in the word',
  absent: 'not in the word',
}

const WORDLE_CSS = `
.wordle-scope {
  --wl-correct: #6aaa64;
  --wl-present: #c9b458;
  --wl-absent: #787c7e;
}
[data-theme='dark'] .wordle-scope {
  --wl-correct: #538d4e;
  --wl-present: #b59f3b;
  --wl-absent: #3a3a3c;
}

.wl-board { display: flex; flex-direction: column; gap: 5px; }
.wl-row {
  display: grid;
  gap: 5px;
  perspective: 600px;
}
.wl-tile {
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: var(--text-lg, 1.15rem);
  text-transform: uppercase;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm, 4px);
  background: var(--surface-sunken);
  color: var(--text);
}
.wl-tile--current { border-color: var(--border-strong); }
.wl-tile--graded {
  border-color: transparent;
  background: var(--tile-bg);
  color: #fff;
}
.wl-tile--reveal { border-color: var(--primary); }
.wl-tile--flip {
  background: var(--surface-sunken);
  border-color: var(--border);
  transform-style: preserve-3d;
  animation: wl-flip 0.5s ease forwards;
}
@keyframes wl-flip {
  0%, 49% { transform: rotateX(0deg); background: var(--surface-sunken); border-color: var(--border); }
  50% { transform: rotateX(90deg); background: var(--tile-bg); border-color: transparent; }
  100% { transform: rotateX(0deg); background: var(--tile-bg); border-color: transparent; }
}
.wl-tile--pop { animation: wl-pop 0.12s ease; }
@keyframes wl-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
}
.wl-row--shake { animation: wl-shake 0.5s ease; }
@keyframes wl-shake {
  10%, 90% { transform: translateX(-1px); }
  20%, 80% { transform: translateX(2px); }
  30%, 50%, 70% { transform: translateX(-4px); }
  40%, 60% { transform: translateX(4px); }
}

.wl-keyboard { display: flex; flex-direction: column; gap: 6px; max-width: 480px; margin: 0 auto; width: 100%; }
.wl-key-row { display: flex; justify-content: center; gap: 4px; }
.wl-key {
  flex: 1;
  min-width: 0;
  height: 44px;
  border-radius: var(--radius-sm, 4px);
  border: 1.5px solid var(--border);
  background: var(--surface-sunken);
  color: var(--text);
  font-weight: 700;
  font-size: var(--text-sm, 0.875rem);
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}
.wl-key:active { transform: scale(0.96); }
.wl-key--wide { flex: 1.5; font-size: 0.72rem; }
.wl-key--correct { background: var(--wl-correct); border-color: transparent; color: #fff; }
.wl-key--present { background: var(--wl-present); border-color: transparent; color: #fff; }
.wl-key--absent { background: var(--wl-absent); border-color: transparent; color: rgba(255, 255, 255, 0.9); }
.wl-key:disabled { opacity: 0.5; cursor: default; }

.wl-cat-badge {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: var(--text-xs, 0.72rem);
  font-weight: 700;
  letter-spacing: 0.02em;
}
.wl-message { min-height: 1.5rem; font-weight: 600; }
.wl-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .wl-tile--flip, .wl-tile--pop, .wl-row--shake { animation: none !important; }
  .wl-tile--flip { background: var(--tile-bg); border-color: transparent; }
}
`

export function DailyWordlePlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: DailyWordlePlayProps) {
  const word = typeof puzzle.word === 'string' ? puzzle.word.toLowerCase() : ''
  const categoryLabel = typeof puzzle.categoryLabel === 'string' ? puzzle.categoryLabel : 'Wordle'
  const hint = typeof puzzle.hint === 'string' ? puzzle.hint : ''
  const wordLength = typeof puzzle.length === 'number' ? puzzle.length : word.length
  const maxAttempts = typeof puzzle.maxAttempts === 'number' ? puzzle.maxAttempts : wordLength + 1

  const savedProgress = loadDailyAnswers<WordleProgress>(challengeId)
  const [startAtMs] = useState(() => getOrCreateStartedAt(challengeId))
  const [guesses, setGuesses] = useState<string[]>(savedProgress?.guesses ?? [])
  const [current, setCurrent] = useState<string>(savedProgress?.current ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [shake, setShake] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)

  const won = guesses.length > 0 && guesses[guesses.length - 1] === word
  const gameOver = won || guesses.length >= maxAttempts

  useEffect(() => {
    if (!submitted) saveDailyAnswers<WordleProgress>(challengeId, { guesses, current })
  }, [challengeId, guesses, current, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted,
    startAtMs,
  })

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    clearDailyProgress(challengeId)
    onSubmit({ timeSeconds: elapsed, submission: { guesses } })
  }, [guesses, elapsed, onSubmit, challengeId])

  // Win/loss reveal delay, then auto-submit. The server re-grades `submission.guesses`, so a player
  // who closes the tab mid-reveal and reloads is handled too (gameOver restores from saved progress).
  useEffect(() => {
    if (!gameOver || submitted || submitRef.current) return
    const delay = won ? 1400 : 2400
    const t = setTimeout(handleSubmit, delay)
    return () => clearTimeout(t)
  }, [gameOver, won, submitted, handleSubmit])

  useEffect(() => {
    if (isTimeUp && !submitted && !submitRef.current) handleSubmit()
  }, [isTimeUp, submitted, handleSubmit])

  const gameOverMessage = gameOver ? (won ? 'Correct!' : 'Out of attempts') : null
  const gameOverAnnouncement = gameOver
    ? won
      ? `Correct! Solved in ${guesses.length} of ${maxAttempts} guesses.`
      : `Out of attempts. The word was ${word.toUpperCase()}.`
    : null

  const addLetter = useCallback(
    (key: string) => {
      const ch = key.toLowerCase()
      if (!/^[a-z]$/.test(ch)) return
      setMessage(null)
      setCurrent((c) => (c.length >= wordLength ? c : c + ch))
    },
    [wordLength]
  )

  const backspace = useCallback(() => {
    setMessage(null)
    setCurrent((c) => c.slice(0, -1))
  }, [])

  const submitGuess = useCallback(() => {
    if (gameOver || submitted || submitRef.current) return
    if (current.length < wordLength) {
      setMessage('Not enough letters')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }
    const guess = current.toLowerCase()
    setGuesses((g) => [...g, guess])
    setCurrent('')
    setMessage(null)
    setAnnouncement(`Guess ${guesses.length + 1} of ${maxAttempts}`)
  }, [current, wordLength, gameOver, submitted, guesses.length, maxAttempts])

  // Physical keyboard support.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (gameOver || submitted || submitRef.current) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Enter') {
        e.preventDefault()
        submitGuess()
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        backspace()
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        addLetter(e.key)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [gameOver, submitted, submitGuess, addLetter, backspace])

  const graded = guesses.map((g) => ({ word: g, states: gradeWordleGuess(g, word) }))
  const bestStates = wordleKeyBestStates(guesses, word)
  const remainingGuesses = Math.max(0, maxAttempts - guesses.length)

  const renderGradedRow = (r: number) => {
    const row = graded[r]!
    const isLast = r === graded.length - 1
    return (
      <div key={r} className="wl-row" style={{ gridTemplateColumns: `repeat(${wordLength}, minmax(0, 1fr))` }}>
        {row.word.split('').map((ch, i) => {
          const state = row.states[i]!
          const style = {
            '--tile-bg': TILE_BG[state],
            animationDelay: isLast ? `${i * 0.35}s` : undefined,
          } as CSSProperties
          return (
            <span
              key={i}
              className={`wl-tile wl-tile--graded ${isLast ? 'wl-tile--flip' : ''}`}
              style={style}
              aria-label={`${ch.toUpperCase()}, ${STATE_ANNOUNCE[state]}, position ${i + 1}`}
            >
              {ch.toUpperCase()}
            </span>
          )
        })}
      </div>
    )
  }

  const renderCurrentRow = () => (
    <div
      key="current"
      className={`wl-row ${shake ? 'wl-row--shake' : ''}`}
      style={{ gridTemplateColumns: `repeat(${wordLength}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: wordLength }).map((_, i) => {
        const ch = current[i] ?? ''
        return (
          <span key={i} className={`wl-tile wl-tile--current ${i === current.length - 1 ? 'wl-tile--pop' : ''}`}>
            {ch.toUpperCase()}
          </span>
        )
      })}
    </div>
  )

  const renderRevealRow = () => (
    <div key="reveal" className="wl-row" style={{ gridTemplateColumns: `repeat(${wordLength}, minmax(0, 1fr))` }}>
      {word.split('').map((ch, i) => (
        <span key={i} className="wl-tile wl-tile--reveal">
          {ch.toUpperCase()}
        </span>
      ))}
    </div>
  )

  const renderEmptyRow = (r: number) => (
    <div key={r} className="wl-row" style={{ gridTemplateColumns: `repeat(${wordLength}, minmax(0, 1fr))` }}>
      {Array.from({ length: wordLength }).map((_, i) => (
        <span key={i} className="wl-tile" />
      ))}
    </div>
  )

  const rows = []
  for (let r = 0; r < maxAttempts; r++) {
    if (r < graded.length) {
      rows.push(renderGradedRow(r))
    } else if (r === graded.length && !gameOver) {
      rows.push(renderCurrentRow())
    } else {
      rows.push(renderEmptyRow(r))
    }
  }
  if (gameOver && !won) {
    rows.push(renderRevealRow())
  }

  return (
    <div className="fr-card fr-card--xl wordle-scope">
      <div className="space-y-3" style={{ maxWidth: 460, margin: '0 auto' }}>
        <div className="flex items-center justify-between gap-3">
          <span className="wl-cat-badge" style={{ background: 'var(--wl-correct)', color: '#fff' }}>
            {categoryLabel}
          </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            {gameOver ? 'Game over' : `${remainingGuesses} guess${remainingGuesses === 1 ? '' : 'es'} left`}
          </span>
          <span className="font-bold tabular-nums" style={{ color: isTimeUp ? '#ef4444' : 'var(--text)' }}>
            {formatted}
          </span>
        </div>

        <div className="wl-board">{rows}</div>

        <div className="wl-message text-center">
          {message || gameOverMessage ? <span role="alert">{message || gameOverMessage}</span> : null}
        </div>

        {gameOver && !won && hint && (
          <p className="text-center" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Hint: {hint}
          </p>
        )}

        <div className="wl-keyboard">
          {KEYBOARD_ROWS.map((row, ri) => (
            <div key={ri} className="wl-key-row">
              {row.map((key) => {
                if (key === 'ENTER') {
                  return (
                    <button
                      key={key}
                      type="button"
                      className="wl-key wl-key--wide"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={submitGuess}
                      disabled={submitted}
                      aria-label="Submit guess"
                    >
                      Enter
                    </button>
                  )
                }
                if (key === 'BACK') {
                  return (
                    <button
                      key={key}
                      type="button"
                      className="wl-key wl-key--wide"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={backspace}
                      disabled={submitted}
                      aria-label="Delete last letter"
                    >
                      &#9003;
                    </button>
                  )
                }
                const state = bestStates.get(key.toLowerCase())
                return (
                  <button
                    key={key}
                    type="button"
                    className={`wl-key ${state ? `wl-key--${state}` : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addLetter(key)}
                    disabled={submitted}
                    aria-label={`${key}, ${state ? STATE_ANNOUNCE[state] : 'unused'}`}
                  >
                    {key}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div role="status" aria-live="polite" className="wl-visually-hidden">
        {gameOverAnnouncement || announcement}
      </div>

      <style>{WORDLE_CSS}</style>
    </div>
  )
}
