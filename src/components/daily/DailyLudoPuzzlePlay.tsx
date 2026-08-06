'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DAILY_SUBMIT_CONFIRM } from '@/components/daily/daily-submit-confirm'
import { getOrCreateStartedAt, loadDailyAnswers, saveDailyAnswers, clearDailyProgress } from '@/lib/daily-progress'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LudoPuzzlePiece {
  id: number
  zone: 'base' | 'track' | 'home' | 'finished'
  pos: number
}

interface LudoObstacle {
  trackPos: number
}

interface DailyLudoPuzzlePlayProps {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

interface PuzzleData {
  startingPieces: LudoPuzzlePiece[]
  diceSequence: number[]
  obstacles: LudoObstacle[]
  optimalRolls: number
}

interface SavedState {
  pieces: LudoPuzzlePiece[]
  obstacles: LudoObstacle[]
  moves: Array<number | null>
  rollIndex: number
  captures: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRACK_LENGTH = 52
const HOME_ENTRY_STEPS = 51
const FINISH_STEPS = 56

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stepsFromPiece(piece: LudoPuzzlePiece): number {
  if (piece.zone === 'base') return -1
  if (piece.zone === 'track') return piece.pos
  if (piece.zone === 'home') return HOME_ENTRY_STEPS + piece.pos
  return FINISH_STEPS
}

function pieceFromSteps(id: number, steps: number): LudoPuzzlePiece {
  if (steps < 0) return { id, zone: 'base', pos: 0 }
  if (steps < HOME_ENTRY_STEPS) return { id, zone: 'track', pos: steps }
  if (steps < FINISH_STEPS) return { id, zone: 'home', pos: steps - HOME_ENTRY_STEPS }
  return { id, zone: 'finished', pos: 0 }
}

function canMove(piece: LudoPuzzlePiece, roll: number): boolean {
  const steps = stepsFromPiece(piece)
  if (piece.zone === 'finished') return false
  if (steps === -1) return roll === 6
  const candidate = steps + roll
  return candidate <= FINISH_STEPS
}

function anyLegalMove(pieces: LudoPuzzlePiece[], roll: number): boolean {
  return pieces.some((p) => canMove(p, roll))
}

function allFinished(pieces: LudoPuzzlePiece[]): boolean {
  return pieces.every((p) => p.zone === 'finished')
}

// ---------------------------------------------------------------------------
// Dice face SVG (dots pattern)
// ---------------------------------------------------------------------------

const DOT_LAYOUTS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [25, 25],
    [75, 75],
  ],
  3: [
    [25, 25],
    [50, 50],
    [75, 75],
  ],
  4: [
    [25, 25],
    [75, 25],
    [25, 75],
    [75, 75],
  ],
  5: [
    [25, 25],
    [75, 25],
    [50, 50],
    [25, 75],
    [75, 75],
  ],
  6: [
    [25, 20],
    [75, 20],
    [25, 50],
    [75, 50],
    [25, 80],
    [75, 80],
  ],
}

function DiceFace({ value, size = 64 }: { value: number; size?: number }) {
  const dots = DOT_LAYOUTS[value] ?? DOT_LAYOUTS[1]
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }}>
      <rect x="2" y="2" width="96" height="96" rx="16" fill="white" stroke="var(--border)" strokeWidth="3" />
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="10" fill="#1a1a2e" />
      ))}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Board visualization
//
// Simplified linear track: a path of cells wrapping in rows, plus a home
// lane and base/finish indicators. Mobile-friendly, max-w-lg.
// ---------------------------------------------------------------------------

const CELL_SIZE = 28
const CELL_GAP = 2

/** Render a single cell on the track/home lane. */
function BoardCell({
  index,
  type,
  pieces,
  obstacles,
  highlighted,
  onPieceTap,
}: {
  index: number
  type: 'track' | 'home'
  pieces: LudoPuzzlePiece[]
  obstacles: LudoObstacle[]
  highlighted: Set<number>
  onPieceTap: (id: number) => void
}) {
  const isStart = type === 'track' && index === 0
  const hasObstacle = type === 'track' && obstacles.some((o) => o.trackPos === index)
  const piecesHere = pieces.filter((p) => {
    if (type === 'track') return p.zone === 'track' && p.pos === index
    return p.zone === 'home' && p.pos === index
  })

  let bg = 'var(--bg-surface)'
  if (isStart) bg = '#4ade80'
  if (hasObstacle && piecesHere.length === 0) bg = '#f87171'
  if (type === 'home') bg = '#86efac'

  return (
    <div
      style={{
        width: CELL_SIZE,
        height: CELL_SIZE,
        borderRadius: 4,
        background: bg,
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        fontSize: 10,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {hasObstacle && piecesHere.length === 0 && <span style={{ color: '#fff', fontSize: 11 }}>X</span>}
      {piecesHere.length > 0 && (
        <div style={{ display: 'flex', gap: 1 }}>
          {piecesHere.map((p) => {
            const isHighlighted = highlighted.has(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => isHighlighted && onPieceTap(p.id)}
                disabled={!isHighlighted}
                style={{
                  width: piecesHere.length > 1 ? 12 : 18,
                  height: piecesHere.length > 1 ? 12 : 18,
                  borderRadius: '50%',
                  background: isHighlighted ? '#16a34a' : '#22c55e',
                  color: '#fff',
                  fontSize: piecesHere.length > 1 ? 7 : 9,
                  fontWeight: 800,
                  border: isHighlighted ? '2px solid var(--primary)' : '1px solid #15803d',
                  cursor: isHighlighted ? 'pointer' : 'default',
                  padding: 0,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: isHighlighted ? 'ludo-pulse 1s infinite' : undefined,
                }}
              >
                {p.id + 1}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DailyLudoPuzzlePlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: DailyLudoPuzzlePlayProps) {
  const puzzleData = useMemo<PuzzleData>(
    () => ({
      startingPieces: (puzzle.startingPieces ?? []) as LudoPuzzlePiece[],
      diceSequence: (puzzle.diceSequence ?? []) as number[],
      obstacles: (puzzle.obstacles ?? []) as LudoObstacle[],
      optimalRolls: (puzzle.optimalRolls ?? 0) as number,
    }),
    [puzzle]
  )

  const [startAtMs] = useState(() => getOrCreateStartedAt(challengeId))
  const [state, setState] = useState<SavedState>(() => {
    const saved = loadDailyAnswers<SavedState>(challengeId)
    if (saved) return saved
    return {
      pieces: puzzleData.startingPieces.map((p) => ({ ...p })),
      obstacles: puzzleData.obstacles.map((o) => ({ ...o })),
      moves: [],
      rollIndex: 0,
      captures: 0,
    }
  })
  const [skipMessage, setSkipMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)
  const { confirm } = useConfirm()

  // Persist state on every change
  useEffect(() => {
    if (!submitted) saveDailyAnswers(challengeId, state)
  }, [challengeId, state, submitted])

  // Timer
  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted,
    startAtMs,
  })

  // Submit handler
  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    clearDailyProgress(challengeId)
    onSubmit({
      timeSeconds: Math.min(elapsed, maxSeconds),
      submission: { moves: state.moves },
    })
  }, [challengeId, elapsed, maxSeconds, onSubmit, state.moves])

  // Auto-submit on time up
  useEffect(() => {
    if (isTimeUp && !submitRef.current) handleSubmit()
  }, [isTimeUp, handleSubmit])

  // Auto-submit when all pieces finished
  useEffect(() => {
    if (allFinished(state.pieces) && state.moves.length > 0 && !submitRef.current) {
      handleSubmit()
    }
  }, [state.pieces, state.moves.length, handleSubmit])

  // Auto-submit when dice sequence exhausted
  useEffect(() => {
    if (state.rollIndex >= puzzleData.diceSequence.length && !submitRef.current && state.moves.length > 0) {
      handleSubmit()
    }
  }, [state.rollIndex, puzzleData.diceSequence.length, state.moves.length, handleSubmit])

  // Auto-skip when no legal move exists for current roll
  useEffect(() => {
    if (submitted) return
    if (state.rollIndex >= puzzleData.diceSequence.length) return
    if (allFinished(state.pieces)) return

    const currentRoll = puzzleData.diceSequence[state.rollIndex]
    if (!anyLegalMove(state.pieces, currentRoll)) {
      setSkipMessage(`No legal move for ${currentRoll} — skipped`)
      const timeout = setTimeout(() => {
        setState((prev) => ({
          ...prev,
          moves: [...prev.moves, null],
          rollIndex: prev.rollIndex + 1,
        }))
        setSkipMessage(null)
      }, 800)
      return () => clearTimeout(timeout)
    }
  }, [state.rollIndex, state.pieces, puzzleData.diceSequence, submitted])

  // Move a piece
  const handlePieceTap = useCallback(
    (pieceId: number) => {
      if (submitted) return
      if (state.rollIndex >= puzzleData.diceSequence.length) return

      const roll = puzzleData.diceSequence[state.rollIndex]
      const piece = state.pieces.find((p) => p.id === pieceId)
      if (!piece || !canMove(piece, roll)) return

      setState((prev) => {
        const steps = stepsFromPiece(piece)
        const newSteps = steps === -1 ? 0 : steps + roll
        const newPiece = pieceFromSteps(pieceId, newSteps)

        const newPieces = prev.pieces.map((p) => (p.id === pieceId ? newPiece : p))

        // Check for obstacle capture
        let newObstacles = prev.obstacles
        let captureGain = 0
        if (newPiece.zone === 'track' && prev.obstacles.some((o) => o.trackPos === newPiece.pos)) {
          newObstacles = prev.obstacles.filter((o) => o.trackPos !== newPiece.pos)
          captureGain = 1
        }

        return {
          ...prev,
          pieces: newPieces,
          obstacles: newObstacles,
          moves: [...prev.moves, pieceId],
          rollIndex: prev.rollIndex + 1,
          captures: prev.captures + captureGain,
        }
      })
    },
    [submitted, state.rollIndex, state.pieces, puzzleData.diceSequence]
  )

  const handleManualSubmit = async () => {
    if (submitRef.current) return
    const ok = await confirm(DAILY_SUBMIT_CONFIRM)
    if (ok) handleSubmit()
  }

  // Derived values
  const currentRoll = state.rollIndex < puzzleData.diceSequence.length ? puzzleData.diceSequence[state.rollIndex] : null
  const tokensHome = state.pieces.filter((p) => p.zone === 'finished').length
  const highlightedPieces = useMemo(() => {
    if (submitted || currentRoll === null || skipMessage) return new Set<number>()
    return new Set(state.pieces.filter((p) => canMove(p, currentRoll)).map((p) => p.id))
  }, [state.pieces, currentRoll, submitted, skipMessage])

  // Base pieces (still in base zone)
  const basePieces = state.pieces.filter((p) => p.zone === 'base')
  const finishedPieces = state.pieces.filter((p) => p.zone === 'finished')

  // Track cells to render: show all 52 in wrapped rows
  const trackCells = useMemo(() => Array.from({ length: TRACK_LENGTH }, (_, i) => i), [])
  const homeCells = useMemo(() => Array.from({ length: 5 }, (_, i) => i), [])

  return (
    <div className="space-y-4">
      {/* Pulse animation for highlighted tokens */}
      <style>{`
        @keyframes ludo-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0.5); }
          50% { box-shadow: 0 0 0 6px rgba(22,163,74,0); }
        }
      `}</style>

      {/* Header bar: stats + timer */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-2.5"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div className="font-bold tabular-nums" style={{ fontSize: 'var(--text-sm)' }}>
          Roll {Math.min(state.rollIndex + 1, puzzleData.diceSequence.length)}/{puzzleData.diceSequence.length}
        </div>
        <div className="font-bold tabular-nums" style={{ fontSize: 'var(--text-sm)' }}>
          {tokensHome}/4 home
        </div>
        <div
          className="font-bold tabular-nums"
          style={{ fontSize: 'var(--text-sm)', color: elapsed >= maxSeconds - 10 ? 'var(--error)' : undefined }}
        >
          {formatted}
        </div>
      </div>

      {/* Instructions */}
      <p className="text-center" style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
        Move all 4 tokens home. Tap a highlighted token to move it. Roll 6 to leave base. Fewer rolls = higher score.
        Par: {puzzleData.optimalRolls} rolls.
      </p>

      {/* Dice display */}
      <div
        className="flex flex-col items-center gap-2 rounded-xl p-4"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div className="font-medium uppercase tracking-wider" style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
          Current Roll
        </div>
        {currentRoll !== null ? (
          <DiceFace value={currentRoll} size={64} />
        ) : (
          <div
            className="flex items-center justify-center rounded-xl"
            style={{
              width: 64,
              height: 64,
              background: 'var(--bg-surface)',
              border: '2px solid var(--border)',
              color: 'var(--text-muted)',
              fontWeight: 700,
              fontSize: 'var(--text-sm)',
            }}
          >
            Done
          </div>
        )}
        {skipMessage && (
          <div
            className="rounded-lg px-3 py-1.5 text-center font-medium"
            style={{
              background: 'var(--warning-bg, #fef3c7)',
              color: 'var(--warning-text, #92400e)',
              fontSize: 'var(--text-xs)',
            }}
          >
            {skipMessage}
          </div>
        )}
        {state.captures > 0 && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Captures: {state.captures}</div>
        )}
      </div>

      {/* Base + Finished indicators */}
      <div className="flex items-center justify-between gap-4">
        {/* Base */}
        <div className="flex-1 rounded-xl p-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div
            className="mb-1.5 font-medium uppercase tracking-wider"
            style={{ fontSize: '10px', color: 'var(--text-faint)' }}
          >
            Base
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((id) => {
              const inBase = basePieces.some((p) => p.id === id)
              const isHighlighted = highlightedPieces.has(id) && inBase
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => isHighlighted && handlePieceTap(id)}
                  disabled={!isHighlighted}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: inBase ? (isHighlighted ? '#16a34a' : '#22c55e') : 'var(--bg-surface)',
                    color: inBase ? '#fff' : 'var(--text-faint)',
                    fontSize: 11,
                    fontWeight: 800,
                    border: isHighlighted ? '2px solid var(--primary)' : '1px solid var(--border)',
                    cursor: isHighlighted ? 'pointer' : 'default',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: inBase ? 1 : 0.3,
                    animation: isHighlighted ? 'ludo-pulse 1s infinite' : undefined,
                  }}
                >
                  {id + 1}
                </button>
              )
            })}
          </div>
        </div>

        {/* Finished */}
        <div className="flex-1 rounded-xl p-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div
            className="mb-1.5 font-medium uppercase tracking-wider"
            style={{ fontSize: '10px', color: 'var(--text-faint)' }}
          >
            Finished
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((id) => {
              const isDone = finishedPieces.some((p) => p.id === id)
              return (
                <div
                  key={id}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: isDone ? '#16a34a' : 'var(--bg-surface)',
                    color: isDone ? '#fff' : 'var(--text-faint)',
                    fontSize: 11,
                    fontWeight: 800,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isDone ? 1 : 0.3,
                  }}
                >
                  {isDone ? '✓' : id + 1}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Track board */}
      <div className="rounded-xl p-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div
          className="mb-2 font-medium uppercase tracking-wider"
          style={{ fontSize: '10px', color: 'var(--text-faint)' }}
        >
          Track (0-51)
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: CELL_GAP,
          }}
        >
          {trackCells.map((i) => (
            <BoardCell
              key={i}
              index={i}
              type="track"
              pieces={state.pieces}
              obstacles={state.obstacles}
              highlighted={highlightedPieces}
              onPieceTap={handlePieceTap}
            />
          ))}
        </div>
      </div>

      {/* Home lane */}
      <div className="rounded-xl p-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div
          className="mb-2 font-medium uppercase tracking-wider"
          style={{ fontSize: '10px', color: 'var(--text-faint)' }}
        >
          Home Lane (slots 0-4)
        </div>
        <div style={{ display: 'flex', gap: CELL_GAP }}>
          {homeCells.map((i) => (
            <BoardCell
              key={i}
              index={i}
              type="home"
              pieces={state.pieces}
              obstacles={state.obstacles}
              highlighted={highlightedPieces}
              onPieceTap={handlePieceTap}
            />
          ))}
          {/* Finish indicator */}
          <div
            style={{
              width: CELL_SIZE,
              height: CELL_SIZE,
              borderRadius: 4,
              background: '#fbbf24',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 800,
              color: '#000',
              flexShrink: 0,
            }}
          >
            {'★'}
          </div>
        </div>
      </div>

      {/* Submit early button */}
      {state.moves.length > 0 && !submitted && !allFinished(state.pieces) && (
        <button type="button" onClick={handleManualSubmit} className="fr-btn fr-btn--secondary fr-btn--sm w-full">
          Submit early ({state.moves.length} rolls used)
        </button>
      )}

      {/* All done message */}
      {allFinished(state.pieces) && !submitted && (
        <div className="py-8 text-center">
          <p className="font-bold" style={{ fontSize: 'var(--text-lg)' }}>
            All tokens home!
          </p>
          <p className="mt-1" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Submitting...
          </p>
        </div>
      )}
    </div>
  )
}
