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

const HOME_ENTRY_STEPS = 51
const FINISH_STEPS = 56
const TOTAL_STEPS = FINISH_STEPS + 1 // for progress bar

const TRACK_CELLS = 52 // 0..51
const CELLS_PER_ROW = 13
const HOME_LANE_CELLS = 5

const TOKEN_GREEN = '#22c55e'
const TOKEN_GREEN_DARK = '#16a34a'

// ---------------------------------------------------------------------------
// Helpers (game logic — unchanged)
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
// Board layout helpers
// ---------------------------------------------------------------------------

/** Returns the (row, col) position in the winding grid for a given track index. */
function trackCellPosition(trackIndex: number): { row: number; col: number } {
  const rowNum = Math.floor(trackIndex / CELLS_PER_ROW)
  const posInRow = trackIndex % CELLS_PER_ROW
  // Even rows go left-to-right, odd rows go right-to-left
  const col = rowNum % 2 === 0 ? posInRow : CELLS_PER_ROW - 1 - posInRow
  return { row: rowNum, col }
}

/** Returns the (row, col) for a home lane cell (0..4). Home lane is on a new row below track. */
function homeCellPosition(homeIndex: number): { row: number; col: number } {
  const trackRows = Math.ceil(TRACK_CELLS / CELLS_PER_ROW) // 4 rows
  // Home lane starts at beginning of a new row
  return { row: trackRows, col: homeIndex }
}

/** Returns the (row, col) for the finish star. */
function finishPosition(): { row: number; col: number } {
  const trackRows = Math.ceil(TRACK_CELLS / CELLS_PER_ROW)
  return { row: trackRows, col: HOME_LANE_CELLS }
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
// Base Yard — shows tokens still in base
// ---------------------------------------------------------------------------

function BaseYard({
  basePieces,
  highlighted,
  onTap,
}: {
  basePieces: LudoPuzzlePiece[]
  highlighted: Set<number>
  onTap: (id: number) => void
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 10,
        background: TOKEN_GREEN,
        border: '2px solid ' + TOKEN_GREEN_DARK,
        minHeight: 44,
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 800,
          color: '#fff',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        BASE
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2, 3].map((id) => {
          const inBase = basePieces.some((p) => p.id === id)
          const canTap = highlighted.has(id)
          return (
            <button
              key={id}
              type="button"
              disabled={!canTap}
              onClick={() => canTap && onTap(id)}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: inBase ? '2px solid rgba(255,255,255,0.5)' : '2px dashed rgba(255,255,255,0.3)',
                background: inBase ? '#fff' : 'rgba(255,255,255,0.1)',
                color: inBase ? TOKEN_GREEN_DARK : 'transparent',
                fontSize: 13,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: canTap ? 'pointer' : 'default',
                animation: canTap ? 'ludo-token-pulse 1.5s ease-in-out infinite' : undefined,
                boxShadow: canTap ? '0 0 0 2px #fff, 0 0 8px rgba(22,163,74,0.6)' : undefined,
                transition: 'all 0.2s',
              }}
            >
              {inBase ? id + 1 : ''}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Board Cell
// ---------------------------------------------------------------------------

function BoardCell({
  trackIndex,
  isStart,
  isObstacle,
  isHomeLane,
  isFinish,
  showNumber,
  tokens,
  highlightedTokens,
  onTokenTap,
  lastTrackRow,
}: {
  trackIndex?: number
  isStart?: boolean
  isObstacle?: boolean
  isHomeLane?: boolean
  isFinish?: boolean
  showNumber?: number | null
  tokens: LudoPuzzlePiece[]
  highlightedTokens: Set<number>
  onTokenTap: (id: number) => void
  lastTrackRow?: boolean
}) {
  let bg = 'var(--card)'
  let borderColor = 'var(--border)'
  let cellContent: React.ReactNode = null

  if (isStart) {
    bg = TOKEN_GREEN
    borderColor = TOKEN_GREEN_DARK
    cellContent = <span style={{ fontSize: 14, color: '#fff' }}>★</span>
  } else if (isFinish) {
    bg = TOKEN_GREEN_DARK
    borderColor = TOKEN_GREEN
    cellContent = <span style={{ fontSize: 16, color: '#fbbf24' }}>★</span>
  } else if (isHomeLane) {
    bg = `${TOKEN_GREEN}22`
    borderColor = TOKEN_GREEN
  } else if (isObstacle) {
    bg = '#fef2f2'
    borderColor = '#f87171'
    cellContent = <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 800 }}>X</span>
  }

  const hasTokens = tokens.length > 0

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1',
        borderRadius: 6,
        border: `1.5px solid ${borderColor}`,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        overflow: 'visible',
      }}
    >
      {/* Cell number label */}
      {showNumber != null && !hasTokens && !isStart && !isFinish && !isObstacle && (
        <span
          style={{
            fontSize: 8,
            fontWeight: 600,
            color: 'var(--text-faint)',
            position: 'absolute',
            bottom: 1,
            right: 2,
            lineHeight: 1,
          }}
        >
          {showNumber}
        </span>
      )}

      {/* Static cell content (star, X) if no tokens */}
      {!hasTokens && cellContent}

      {/* Connector arrow for row transitions */}
      {lastTrackRow !== undefined && lastTrackRow && (
        <span
          style={{
            position: 'absolute',
            right: -10,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 10,
            color: 'var(--text-faint)',
          }}
        >
          ↓
        </span>
      )}

      {/* Tokens on this cell */}
      {tokens.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            alignItems: 'center',
            justifyContent: 'center',
            position: 'absolute',
            inset: 0,
            zIndex: 10,
          }}
        >
          {tokens.map((t) => {
            const canTap = highlightedTokens.has(t.id)
            return (
              <button
                key={t.id}
                type="button"
                disabled={!canTap}
                onClick={(e) => {
                  e.stopPropagation()
                  if (canTap) onTokenTap(t.id)
                }}
                style={{
                  width: tokens.length > 2 ? 14 : tokens.length > 1 ? 16 : 22,
                  height: tokens.length > 2 ? 14 : tokens.length > 1 ? 16 : 22,
                  borderRadius: '50%',
                  background: TOKEN_GREEN,
                  border: `2px solid ${canTap ? '#fff' : 'rgba(255,255,255,0.4)'}`,
                  color: '#fff',
                  fontSize: tokens.length > 2 ? 7 : tokens.length > 1 ? 8 : 10,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: canTap ? 'pointer' : 'default',
                  boxShadow: canTap
                    ? '0 0 0 2px rgba(22,163,74,0.5), 0 0 8px rgba(22,163,74,0.4)'
                    : '0 1px 2px rgba(0,0,0,0.15)',
                  animation: canTap ? 'ludo-token-pulse 1.5s ease-in-out infinite' : undefined,
                  padding: 0,
                  lineHeight: 1,
                  transition: 'all 0.2s',
                  zIndex: canTap ? 20 : 10,
                }}
              >
                {t.id + 1}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The Board — winding path
// ---------------------------------------------------------------------------

function LudoPathBoard({
  pieces,
  obstacles,
  highlightedTokens,
  onTokenTap,
}: {
  pieces: LudoPuzzlePiece[]
  obstacles: LudoObstacle[]
  highlightedTokens: Set<number>
  onTokenTap: (id: number) => void
}) {
  const obstacleSet = useMemo(() => new Set(obstacles.map((o) => o.trackPos)), [obstacles])

  // Build rows of track cells
  const trackRows = Math.ceil(TRACK_CELLS / CELLS_PER_ROW) // 4
  const rows: Array<Array<{ type: 'track'; index: number } | { type: 'empty' }>> = []

  for (let r = 0; r < trackRows; r++) {
    const row: Array<{ type: 'track'; index: number } | { type: 'empty' }> = []
    for (let c = 0; c < CELLS_PER_ROW; c++) {
      const { row: rr, col: cc } = trackCellPosition(r * CELLS_PER_ROW + c)
      if (rr === r && r * CELLS_PER_ROW + c < TRACK_CELLS) {
        // Find which track index maps to this (r, c)
        // We need to find the trackIndex that produces (r, c)
        const trackIndex = r * CELLS_PER_ROW + (r % 2 === 0 ? c : CELLS_PER_ROW - 1 - c)
        if (trackIndex < TRACK_CELLS) {
          row.push({ type: 'track', index: trackIndex })
        } else {
          row.push({ type: 'empty' })
        }
      } else {
        row.push({ type: 'empty' })
      }
    }
    rows.push(row)
  }

  // Build home lane row
  const homeRow: Array<{ type: 'home'; index: number } | { type: 'finish' } | { type: 'empty' }> = []
  for (let c = 0; c < CELLS_PER_ROW; c++) {
    if (c < HOME_LANE_CELLS) {
      homeRow.push({ type: 'home', index: c })
    } else if (c === HOME_LANE_CELLS) {
      homeRow.push({ type: 'finish' })
    } else {
      homeRow.push({ type: 'empty' })
    }
  }

  // Group pieces by their board position
  const trackPieces = useMemo(() => {
    const map = new Map<string, LudoPuzzlePiece[]>()
    for (const p of pieces) {
      if (p.zone === 'track') {
        const key = `track-${p.pos}`
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(p)
      } else if (p.zone === 'home') {
        const key = `home-${p.pos}`
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(p)
      } else if (p.zone === 'finished') {
        const key = 'finish'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(p)
      }
    }
    return map
  }, [pieces])

  // Determine if a row's last cell should show a down-arrow connector
  // Row 0 last cell (rightmost) -> row 1 starts from right
  // Row 1 last cell (leftmost, col 0) -> row 2 starts from left
  // Row 2 last cell (rightmost) -> row 3 starts from right

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: 8,
        borderRadius: 12,
        background: 'var(--card)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Track rows */}
      {rows.map((row, rowIdx) => {
        // Determine which end of this row connects to the next row
        const isEvenRow = rowIdx % 2 === 0
        // Even rows: last cell is on the right (col 12), connector goes down-right
        // Odd rows: last cell is on the left (col 0), connector goes down-left
        const connectorCol = isEvenRow ? CELLS_PER_ROW - 1 : 0
        const isLastTrackRow = rowIdx === trackRows - 1

        return (
          <div key={`row-${rowIdx}`}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${CELLS_PER_ROW}, 1fr)`,
                gap: 2,
              }}
            >
              {row.map((cell, colIdx) => {
                if (cell.type === 'empty') {
                  return <div key={colIdx} style={{ aspectRatio: '1' }} />
                }
                const ti = cell.index
                const tokensHere = trackPieces.get(`track-${ti}`) ?? []
                const isRowEnd = colIdx === connectorCol && rowIdx < trackRows - 1

                return (
                  <BoardCell
                    key={colIdx}
                    trackIndex={ti}
                    isStart={ti === 0}
                    isObstacle={obstacleSet.has(ti)}
                    tokens={tokensHere}
                    highlightedTokens={highlightedTokens}
                    onTokenTap={onTokenTap}
                    showNumber={ti % 5 === 0 ? ti : null}
                  />
                )
              })}
            </div>
            {/* Row connector arrow */}
            {rowIdx < trackRows - 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: isEvenRow ? 'flex-end' : 'flex-start',
                  padding: isEvenRow ? '0 8px 0 0' : '0 0 0 8px',
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1 }}>↓</span>
              </div>
            )}
          </div>
        )
      })}

      {/* Connector from track to home lane */}
      {(() => {
        // Last track row is row 3 (odd), ends on the left (col 0)
        // Home lane starts on the left too
        const lastRowIsEven = (trackRows - 1) % 2 === 0
        return (
          <div
            style={{
              display: 'flex',
              justifyContent: lastRowIsEven ? 'flex-end' : 'flex-start',
              padding: lastRowIsEven ? '0 8px 0 0' : '0 0 0 8px',
            }}
          >
            <span style={{ fontSize: 10, color: TOKEN_GREEN, fontWeight: 700, lineHeight: 1 }}>↓ HOME</span>
          </div>
        )
      })()}

      {/* Home lane + finish */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${CELLS_PER_ROW}, 1fr)`,
          gap: 2,
        }}
      >
        {homeRow.map((cell, colIdx) => {
          if (cell.type === 'empty') {
            return <div key={colIdx} style={{ aspectRatio: '1' }} />
          }
          if (cell.type === 'finish') {
            const finishedTokens = trackPieces.get('finish') ?? []
            return (
              <BoardCell
                key={colIdx}
                isFinish
                tokens={finishedTokens}
                highlightedTokens={highlightedTokens}
                onTokenTap={onTokenTap}
              />
            )
          }
          // home lane cell
          const homeTokens = trackPieces.get(`home-${cell.index}`) ?? []
          return (
            <BoardCell
              key={colIdx}
              isHomeLane
              tokens={homeTokens}
              highlightedTokens={highlightedTokens}
              onTokenTap={onTokenTap}
              showNumber={null}
            />
          )
        })}
      </div>
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

  const basePieces = useMemo(() => state.pieces.filter((p) => p.zone === 'base'), [state.pieces])

  return (
    <div className="space-y-3">
      <style>{`
        @keyframes ludo-token-pulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(22,163,74,0.4), 0 0 8px rgba(22,163,74,0.3); }
          50% { box-shadow: 0 0 0 4px rgba(22,163,74,0.15), 0 0 12px rgba(22,163,74,0.1); }
        }
      `}</style>

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
                You rolled a {currentRoll}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                {highlightedPieces.size > 0 ? 'Tap a glowing token on the board' : 'No moves available — skipping...'}
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

      {/* How it works (only show at start) */}
      {state.rollIndex === 0 && (
        <div
          className="rounded-xl px-4 py-3"
          style={{ background: 'var(--bg-surface)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>How to play</div>
          <div>
            Get all 4 tokens from base → track → home lane → finish. Roll 6 to leave base.
            {state.obstacles.length > 0 && ' Land on obstacles to capture them (+50 pts).'} Fewer rolls = higher score.
            Par: {puzzleData.optimalRolls} rolls.
          </div>
        </div>
      )}

      {/* Base yard */}
      {basePieces.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BaseYard basePieces={basePieces} highlighted={highlightedPieces} onTap={handlePieceTap} />
          <span style={{ fontSize: 18, color: 'var(--text-faint)' }}>→</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Roll a 6 to enter</span>
        </div>
      )}

      {/* The winding path board */}
      <LudoPathBoard
        pieces={state.pieces}
        obstacles={state.obstacles}
        highlightedTokens={highlightedPieces}
        onTokenTap={handlePieceTap}
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
