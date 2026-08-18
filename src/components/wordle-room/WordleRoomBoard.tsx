'use client'

import { useEffect, useEffectEvent, type CSSProperties } from 'react'
import { wordleKeyBestStates, type WordleLetterState } from '@/lib/daily-wordle'

// Shared wordle tile/keyboard styling — mirrors the Daily Challenge board's CSS so
// Wordle Room plays and looks identical. The color variables are defined at :root so
// the category badge (rendered outside .wordle-scope) can use them too.
const WORDLE_CSS = `
:root {
  --wl-correct: #6aaa64;
  --wl-present: #c9b458;
  --wl-absent: #787c7e;
}
[data-theme='dark'] {
  --wl-correct: #538d4e;
  --wl-present: #b59f3b;
  --wl-absent: #3a3a3c;
}
.wl-cat-badge {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: var(--text-xs, 0.72rem);
  font-weight: 700;
  letter-spacing: 0.02em;
}
.wl-board { display: flex; flex-direction: column; gap: 5px; }
.wl-row { display: grid; gap: 5px; perspective: 600px; }
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
.wl-tile--focus { outline: 2px solid var(--primary); outline-offset: -2px; }
.wl-tile--graded { border-color: transparent; background: var(--tile-bg); color: #fff; }
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

export interface WordleRoomGradedGuess {
  word: string
  states: WordleLetterState[]
}

interface Props {
  /** The current word players are racing to solve (revealed only on demand). */
  word: string
  /** Graded guesses already submitted for the current word. */
  guesses: WordleRoomGradedGuess[]
  /** The word being typed right now ('' when empty). */
  current: string
  /** The word to reveal on a lost word ('' during normal play). */
  revealWord?: string
  maxAttempts: number
  disabled?: boolean
  message?: string | null
  shake?: boolean
  onAddLetter: (letter: string) => void
  onBackspace: () => void
  onSubmit: () => void
  /** Optional cursor position within the current row. When provided together with
   *  onFocusTile, filled tiles become click-to-edit so the player can jump the cursor
   *  onto any letter and overwrite it in place. */
  cursorAt?: number
  onFocusTile?: (index: number) => void
}

export function WordleRoomBoard({
  word,
  guesses,
  current,
  revealWord = '',
  maxAttempts,
  disabled = false,
  message,
  shake = false,
  onAddLetter,
  onBackspace,
  onSubmit,
  cursorAt,
  onFocusTile,
}: Props) {
  const wordLength = word.length
  const revealed = revealWord.length > 0
  const won = guesses.length > 0 && guesses[guesses.length - 1]!.word === word
  const gameOver = revealed || guesses.length >= maxAttempts

  const bestStates = wordleKeyBestStates(
    guesses.map((g) => g.word),
    word
  )

  // Physical keyboard support. Effect Events give the keydown listener a stable
  // reference to the latest callbacks without re-subscribing on every render (or
  // writing to a ref during render).
  const onAddLetterEvent = useEffectEvent(onAddLetter)
  const onBackspaceEvent = useEffectEvent(onBackspace)
  const onSubmitEvent = useEffectEvent(onSubmit)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (disabled || gameOver) return
      // Never hijack typing in an editable element (input/textarea/contenteditable) —
      // the board's controls only react to keys pressed elsewhere on the page.
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Enter') {
        e.preventDefault()
        onSubmitEvent()
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        onBackspaceEvent()
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        onAddLetterEvent(e.key)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [disabled, gameOver])

  const renderGradedRow = (r: number) => {
    const row = guesses[r]!
    const isLast = r === guesses.length - 1
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
        const isFocused = cursorAt === i
        const clickable = onFocusTile != null && i < current.length && !disabled
        return (
          <span
            key={i}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-label={clickable ? `Edit letter ${i + 1}: ${ch.toUpperCase()}` : undefined}
            onClick={clickable ? () => onFocusTile!(i) : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      onFocusTile!(i)
                    }
                  }
                : undefined
            }
            style={clickable ? { cursor: 'pointer' } : undefined}
            className={`wl-tile wl-tile--current ${isFocused ? 'wl-tile--focus' : ''} ${i === current.length - 1 && (cursorAt == null || cursorAt === current.length) ? 'wl-tile--pop' : ''}`}
          >
            {ch.toUpperCase()}
          </span>
        )
      })}
    </div>
  )

  const renderRevealRow = () => (
    <div key="reveal" className="wl-row" style={{ gridTemplateColumns: `repeat(${wordLength}, minmax(0, 1fr))` }}>
      {revealWord.split('').map((ch, i) => (
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
    if (r < guesses.length) {
      rows.push(renderGradedRow(r))
    } else if (r === guesses.length && gameOver && !won) {
      rows.push(renderRevealRow())
    } else if (r === guesses.length && !gameOver) {
      rows.push(renderCurrentRow())
    } else {
      rows.push(renderEmptyRow(r))
    }
  }

  return (
    <div className="wordle-scope">
      <div className="wl-board">{rows}</div>

      <div className="wl-message text-center">{message ? <span role="alert">{message}</span> : null}</div>

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
                    onClick={onSubmit}
                    disabled={disabled || gameOver}
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
                    onClick={onBackspace}
                    disabled={disabled || gameOver}
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
                  onClick={() => onAddLetter(key)}
                  disabled={disabled || gameOver}
                  aria-label={`${key}, ${state ? STATE_ANNOUNCE[state] : 'unused'}`}
                >
                  {key}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <style>{WORDLE_CSS}</style>
    </div>
  )
}
