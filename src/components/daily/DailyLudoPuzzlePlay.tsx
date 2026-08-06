'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DAILY_SUBMIT_CONFIRM } from '@/components/daily/daily-submit-confirm'
import { getOrCreateStartedAt, loadDailyAnswers, saveDailyAnswers, clearDailyProgress } from '@/lib/daily-progress'
import { LudoBoard } from '@/components/ludo/LudoBoard'
import { TRACK_GRID, HOME_GRID } from '@/lib/ludo-board-layout'
import type { LudoSession, LudoPlayerState, LudoPiece, Player } from '@/types'

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

const HOME_ENTRY_STEPS = 51
const FINISH_STEPS = 56
const PUZZLE_PLAYER_ID = 'puzzle-player'
const PUZZLE_COLOR = 'green' as const

// ---------------------------------------------------------------------------
// Helpers (game logic)
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
// Bridge: puzzle pieces → LudoBoard props
// ---------------------------------------------------------------------------

function buildLudoPlayerState(pieces: LudoPuzzlePiece[]): LudoPlayerState {
  return {
    id: 'state-1',
    game_id: 'puzzle',
    player_id: PUZZLE_PLAYER_ID,
    color: PUZZLE_COLOR,
    pieces: pieces as LudoPiece[],
    player_order: 0,
    created_at: '',
  }
}

const STUB_SESSION: LudoSession = {
  id: 'puzzle',
  game_id: 'puzzle',
  turn_order: [PUZZLE_PLAYER_ID],
  current_turn_index: 0,
  phase: 'move',
  last_dice: null,
  remaining_dice: null,
  consecutive_sixes: 0,
  extra_turn: false,
  status_message: null,
  winner_player_id: null,
  turn_deadline_at: null,
  created_at: '',
  updated_at: '',
}

const STUB_PLAYERS: Player[] = [
  {
    id: PUZZLE_PLAYER_ID,
    name: 'You',
    game_id: 'puzzle',
    gender: 'both',
    identity_gender: null,
    participant_id: null,
    joined_at: '',
  },
]

function buildHighlightCells(pieces: LudoPuzzlePiece[], roll: number): Set<string> {
  const cells = new Set<string>()
  for (const p of pieces) {
    if (!canMove(p, roll)) continue
    const steps = stepsFromPiece(p)
    const newSteps = steps === -1 ? 0 : steps + roll
    const landing = pieceFromSteps(p.id, newSteps)
    if (landing.zone === 'track') {
      const grid = TRACK_GRID[landing.pos]
      if (grid) cells.add(`${grid.row},${grid.col}`)
    } else if (landing.zone === 'home') {
      const grid = HOME_GRID[PUZZLE_COLOR][landing.pos]
      if (grid) cells.add(`${grid.row},${grid.col}`)
    }
  }
  return cells
}

// ---------------------------------------------------------------------------
// Dice face SVG
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

function DiceFace({ value, size = 56 }: { value: number; size?: number }) {
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
// Dice sequence preview
// ---------------------------------------------------------------------------

function DiceSequencePreview({ sequence, currentIndex }: { sequence: number[]; currentIndex: number }) {
  const previewCount = 5
  const upcoming = sequence.slice(currentIndex, currentIndex + previewCount)
  const remaining = sequence.length - currentIndex

  return (
    <div className="flex items-center gap-2">
      {upcoming.map((v, i) => (
        <div
          key={currentIndex + i}
          style={{
            width: i === 0 ? 24 : 18,
            height: i === 0 ? 24 : 18,
            borderRadius: 4,
            background: i === 0 ? 'var(--text)' : 'var(--bg-surface)',
            color: i === 0 ? 'var(--card)' : 'var(--text-muted)',
            fontSize: i === 0 ? 13 : 10,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--border)',
            opacity: i === 0 ? 1 : 0.5 + 0.1 * (previewCount - i),
          }}
        >
          {v}
        </div>
      ))}
      {remaining > previewCount && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>+{remaining - previewCount} more</span>
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

  useEffect(() => {
    if (!submitted) saveDailyAnswers(challengeId, state)
  }, [challengeId, state, submitted])

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
    onSubmit({
      timeSeconds: Math.min(elapsed, maxSeconds),
      submission: { moves: state.moves },
    })
  }, [challengeId, elapsed, maxSeconds, onSubmit, state.moves])

  useEffect(() => {
    if (isTimeUp && !submitRef.current) handleSubmit()
  }, [isTimeUp, handleSubmit])

  useEffect(() => {
    if (allFinished(state.pieces) && state.moves.length > 0 && !submitRef.current) {
      handleSubmit()
    }
  }, [state.pieces, state.moves.length, handleSubmit])

  useEffect(() => {
    if (state.rollIndex >= puzzleData.diceSequence.length && !submitRef.current && state.moves.length > 0) {
      handleSubmit()
    }
  }, [state.rollIndex, puzzleData.diceSequence.length, state.moves.length, handleSubmit])

  useEffect(() => {
    if (submitted) return
    if (state.rollIndex >= puzzleData.diceSequence.length) return
    if (allFinished(state.pieces)) return

    const currentRoll = puzzleData.diceSequence[state.rollIndex]
    if (!anyLegalMove(state.pieces, currentRoll)) {
      setSkipMessage(`No legal move for ${currentRoll} — skipping`)
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

  const currentRoll = state.rollIndex < puzzleData.diceSequence.length ? puzzleData.diceSequence[state.rollIndex] : null
  const tokensHome = state.pieces.filter((p) => p.zone === 'finished').length
  const highlightedPieces = useMemo(() => {
    if (submitted || currentRoll === null || skipMessage) return new Set<number>()
    return new Set(state.pieces.filter((p) => canMove(p, currentRoll)).map((p) => p.id))
  }, [state.pieces, currentRoll, submitted, skipMessage])

  // Bridge to LudoBoard
  const ludoStates = useMemo(() => [buildLudoPlayerState(state.pieces)], [state.pieces])
  const selectablePieceIds = useMemo(() => [...highlightedPieces], [highlightedPieces])
  const highlightCells = useMemo(
    () =>
      currentRoll !== null && !submitted && !skipMessage ? buildHighlightCells(state.pieces, currentRoll) : undefined,
    [state.pieces, currentRoll, submitted, skipMessage]
  )

  return (
    <div className="space-y-3">
      {/* Header bar */}
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

      {/* Dice + instructions */}
      <div
        className="flex flex-col items-center gap-3 rounded-xl p-4"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        {currentRoll !== null ? (
          <div className="flex items-center gap-4">
            <DiceFace value={currentRoll} size={56} />
            <div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text)' }}>
                Move {currentRoll}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                {highlightedPieces.size > 0 ? 'Tap a glowing piece to move it' : 'No moves available — skipping...'}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text)' }}>No more rolls</div>
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

        {/* Upcoming dice preview */}
        {currentRoll !== null && puzzleData.diceSequence.length > 1 && (
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>Upcoming:</span>
            <DiceSequencePreview sequence={puzzleData.diceSequence} currentIndex={state.rollIndex} />
          </div>
        )}
      </div>

      {/* How it works (first roll only) */}
      {state.rollIndex === 0 && (
        <div
          className="rounded-xl px-4 py-3"
          style={{ background: 'var(--bg-surface)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>How to play</div>
          <div>
            Get all 4 green tokens around the board and into the home lane. Roll 6 to leave base. Tap a glowing piece to
            move it.
            {state.obstacles.length > 0 && ' Land on red obstacles to capture them (+50 pts).'} Fewer rolls = higher
            score. Par: {puzzleData.optimalRolls} rolls.
          </div>
        </div>
      )}

      {/* The actual Ludo board */}
      <LudoBoard
        session={STUB_SESSION}
        states={ludoStates}
        players={STUB_PLAYERS}
        myPlayerId={PUZZLE_PLAYER_ID}
        onMovePiece={!submitted ? handlePieceTap : undefined}
        selectablePieceIds={selectablePieceIds}
        highlightCells={highlightCells}
      />

      {/* Captures counter */}
      {state.captures > 0 && (
        <div className="text-center" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Obstacles captured: {state.captures} (+{state.captures * 50} pts)
        </div>
      )}

      {/* Submit early */}
      {state.moves.length > 0 && !submitted && !allFinished(state.pieces) && (
        <button type="button" onClick={handleManualSubmit} className="fr-btn fr-btn--secondary fr-btn--sm w-full">
          Submit early ({state.moves.length} rolls used)
        </button>
      )}

      {/* All done */}
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
