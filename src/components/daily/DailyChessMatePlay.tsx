'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DAILY_SUBMIT_CONFIRM } from '@/components/daily/daily-submit-confirm'
import { getOrCreateStartedAt, loadDailyAnswers, saveDailyAnswers, clearDailyProgress } from '@/lib/daily-progress'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DailyChessMatePlayProps {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

interface PuzzleData {
  fen: string
  mateIn: number
  toMove: 'white' | 'black'
}

/** Each solution line is an array of moves alternating attacker / defender. */
type SolutionLine = string[]

interface SavedProgress {
  moves: string[]
  wrongAttempts: number
  status: 'playing' | 'solved'
}

/* ------------------------------------------------------------------ */
/*  Piece rendering                                                    */
/* ------------------------------------------------------------------ */

const PIECE_CHAR: Record<string, string> = {
  K: '♚',
  Q: '♛',
  R: '♜',
  B: '♝',
  N: '♞',
  P: '♟',
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
}

const PIECE_NAME: Record<string, string> = {
  K: 'K',
  Q: 'Q',
  R: 'R',
  B: 'B',
  N: 'N',
  P: '',
  k: 'K',
  q: 'Q',
  r: 'R',
  b: 'B',
  n: 'N',
  p: '',
}

/* ------------------------------------------------------------------ */
/*  FEN parsing                                                        */
/* ------------------------------------------------------------------ */

type Board = (string | null)[][]

function parseFen(fen: string): Board {
  const ranks = fen.split(' ')[0].split('/')
  const board: Board = []
  for (const rank of ranks) {
    const row: (string | null)[] = []
    for (const ch of rank) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < parseInt(ch, 10); i++) row.push(null)
      } else {
        row.push(ch)
      }
    }
    board.push(row)
  }
  return board
}

function fileChar(col: number): string {
  return String.fromCharCode(97 + col) // a-h
}

function rankChar(row: number): string {
  return String(8 - row)
}

function squareName(row: number, col: number): string {
  return fileChar(col) + rankChar(row)
}

/** Strip check (+) and checkmate (#) markers from algebraic notation for comparison. */
function stripCheckMarkers(move: string): string {
  return move.replace(/[+#]/g, '')
}

/** Is the piece at (row,col) the attacker's piece? */
function isAttackerPiece(piece: string | null, toMove: 'white' | 'black'): boolean {
  if (!piece) return false
  if (toMove === 'white') return piece === piece.toUpperCase()
  return piece === piece.toLowerCase()
}

/* ------------------------------------------------------------------ */
/*  Move application (simplified — just moves the piece)              */
/* ------------------------------------------------------------------ */

function applyMoveToBoard(board: Board, moveStr: string, isWhiteMoving: boolean): Board {
  const next = board.map((r) => [...r])

  // Parse algebraic notation (simplified)
  const cleaned = moveStr.replace(/[+#!?]/g, '')

  // Castling
  if (cleaned === 'O-O' || cleaned === 'O-O-O') {
    const row = isWhiteMoving ? 7 : 0
    if (cleaned === 'O-O') {
      next[row][6] = next[row][4]
      next[row][5] = next[row][7]
      next[row][4] = null
      next[row][7] = null
    } else {
      next[row][2] = next[row][4]
      next[row][3] = next[row][0]
      next[row][4] = null
      next[row][0] = null
    }
    return next
  }

  // Destination square is always the last two characters (before promotion if any)
  let promo: string | null = null
  let dest = cleaned
  if (dest.includes('=')) {
    const parts = dest.split('=')
    dest = parts[0]
    promo = parts[1]
  }

  const destFile = dest.charCodeAt(dest.length - 2) - 97
  const destRank = 8 - parseInt(dest[dest.length - 1], 10)

  // Identify piece type
  let pieceType = 'P'
  let remaining = dest
  if (/^[KQRBN]/.test(remaining)) {
    pieceType = remaining[0]
    remaining = remaining.slice(1)
  }

  // Disambiguation
  remaining = remaining.replace('x', '').slice(0, -2) // remove capture marker and destination
  let disambigFile: number | null = null
  let disambigRank: number | null = null
  for (const ch of remaining) {
    if (/[a-h]/.test(ch)) disambigFile = ch.charCodeAt(0) - 97
    else if (/[1-8]/.test(ch)) disambigRank = 8 - parseInt(ch, 10)
  }

  // Find the source piece
  const targetPiece = isWhiteMoving ? pieceType.toUpperCase() : pieceType.toLowerCase()
  let srcRow = -1
  let srcCol = -1

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (next[r][c] !== targetPiece) continue
      if (disambigFile !== null && c !== disambigFile) continue
      if (disambigRank !== null && r !== disambigRank) continue
      // For simplicity, pick the first match (puzzles have unambiguous notation)
      srcRow = r
      srcCol = c
    }
  }

  if (srcRow >= 0 && srcCol >= 0) {
    next[srcRow][srcCol] = null
    if (promo) {
      next[destRank][destFile] = isWhiteMoving ? promo.toUpperCase() : promo.toLowerCase()
    } else {
      next[destRank][destFile] = targetPiece
    }

    // En passant detection for pawns
    if (pieceType === 'P' && destFile !== srcCol && board[destRank][destFile] === null) {
      next[srcRow][destFile] = null
    }
  }

  return next
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DailyChessMatePlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: DailyChessMatePlayProps) {
  const data = useMemo<PuzzleData>(
    () => ({
      fen: puzzle.fen as string,
      mateIn: puzzle.mateIn as number,
      toMove: puzzle.toMove as 'white' | 'black',
    }),
    [puzzle.fen, puzzle.mateIn, puzzle.toMove]
  )

  const solutionLines = useMemo<SolutionLine[]>(
    () => (puzzle.solutionLines ?? []) as SolutionLine[],
    [puzzle.solutionLines]
  )

  const [startAtMs] = useState(() => getOrCreateStartedAt(challengeId))
  const [moves, setMoves] = useState<string[]>(() => {
    const saved = loadDailyAnswers<SavedProgress>(challengeId)
    return saved?.moves ?? []
  })
  const [wrongAttempts, setWrongAttempts] = useState<number>(() => {
    const saved = loadDailyAnswers<SavedProgress>(challengeId)
    return saved?.wrongAttempts ?? 0
  })
  const [status, setStatus] = useState<'playing' | 'solved'>(() => {
    const saved = loadDailyAnswers<SavedProgress>(challengeId)
    return saved?.status ?? 'playing'
  })
  const [selectedSquare, setSelectedSquare] = useState<[number, number] | null>(null)
  const [animating, setAnimating] = useState(false)
  const [wrongFlash, setWrongFlash] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)
  const { confirm } = useConfirm()

  // Persist progress
  useEffect(() => {
    if (!submitted) saveDailyAnswers(challengeId, { moves, wrongAttempts, status })
  }, [challengeId, moves, wrongAttempts, status, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted && status === 'playing',
    startAtMs,
  })

  /* ---------------------------------------------------------------- */
  /*  Derive current board state by replaying moves on the FEN        */
  /* ---------------------------------------------------------------- */

  const currentBoard = useMemo(() => {
    let board = parseFen(data.fen)
    let whiteMoving = data.toMove === 'white'
    for (const m of moves) {
      board = applyMoveToBoard(board, m, whiteMoving)
      whiteMoving = !whiteMoving
    }
    return board
  }, [data.fen, data.toMove, moves])

  /** Number of attacker moves so far (every other move in `moves` is an attacker move). */
  const attackerMoveCount = useMemo(() => moves.filter((_, i) => i % 2 === 0).length, [moves])

  /** Which solution lines are still compatible with the moves made so far. */
  const remainingLines = useMemo(() => {
    return solutionLines.filter((line) => {
      for (let i = 0; i < moves.length && i < line.length; i++) {
        if (stripCheckMarkers(moves[i]) !== stripCheckMarkers(line[i])) return false
      }
      return true
    })
  }, [solutionLines, moves])

  /* ---------------------------------------------------------------- */
  /*  Submit                                                           */
  /* ---------------------------------------------------------------- */

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    clearDailyProgress(challengeId)
    onSubmit({
      timeSeconds: Math.min(elapsed, maxSeconds),
      submission: {
        moves: moves.filter((_, i) => i % 2 === 0), // only attacker moves
        wrongAttempts,
      },
    })
  }, [challengeId, elapsed, maxSeconds, moves, onSubmit])

  // Time-up auto-submit
  useEffect(() => {
    if (isTimeUp && !submitRef.current) handleSubmit()
  }, [isTimeUp, handleSubmit])

  // Auto-submit on solved
  useEffect(() => {
    if (status === 'solved' && !submitRef.current && !animating) {
      const timer = setTimeout(handleSubmit, 1200)
      return () => clearTimeout(timer)
    }
  }, [status, handleSubmit, animating])

  /* ---------------------------------------------------------------- */
  /*  Move handling                                                    */
  /* ---------------------------------------------------------------- */

  const isAttackerTurn = moves.length % 2 === 0

  const handleSquareClick = (row: number, col: number) => {
    if (submitted || status !== 'playing' || animating || !isAttackerTurn) return

    const piece = currentBoard[row][col]

    // If no square selected, select an attacker piece
    if (!selectedSquare) {
      if (piece && isAttackerPiece(piece, data.toMove)) {
        setSelectedSquare([row, col])
      }
      return
    }

    const [selRow, selCol] = selectedSquare

    // Clicking the same square deselects
    if (selRow === row && selCol === col) {
      setSelectedSquare(null)
      return
    }

    // Clicking another attacker piece reselects
    if (piece && isAttackerPiece(piece, data.toMove)) {
      setSelectedSquare([row, col])
      return
    }

    // Attempt a move from selectedSquare to (row, col)
    const srcPiece = currentBoard[selRow][selCol]
    if (!srcPiece) {
      setSelectedSquare(null)
      return
    }

    // Build algebraic notation for this move
    const moveNotation = buildMoveNotation(currentBoard, srcPiece, selRow, selCol, row, col, data.toMove === 'white')

    // Check if this move matches any remaining solution line at the current position.
    // Solution lines include check/checkmate markers (+, #) which we strip for comparison
    // since computing check status would require a full chess engine.
    const moveIndex = moves.length
    const stripped = stripCheckMarkers(moveNotation)
    const matching = remainingLines.filter(
      (line) => moveIndex < line.length && stripCheckMarkers(line[moveIndex]) === stripped
    )

    if (matching.length > 0) {
      // Correct move — store the solution line's notation (preserves +/# markers)
      const canonicalMove = matching[0][moveIndex]
      const newMoves = [...moves, canonicalMove]
      setMoves(newMoves)
      setSelectedSquare(null)

      // Check if this was the last attacker move (checkmate)
      const newAttackerCount = attackerMoveCount + 1
      if (newAttackerCount >= data.mateIn) {
        setStatus('solved')
      } else {
        // Auto-play defender response
        const defenderMoveIndex = moveIndex + 1
        const defenderMove = matching[0][defenderMoveIndex]
        if (defenderMove) {
          setAnimating(true)
          setTimeout(() => {
            setMoves((prev) => [...prev, defenderMove])
            setAnimating(false)
          }, 800)
        }
      }
    } else {
      // Wrong move — flash red, penalize, let them retry
      setSelectedSquare(null)
      setWrongAttempts((n) => n + 1)
      setWrongFlash(true)
      setTimeout(() => setWrongFlash(false), 800)
    }
  }

  const handleManualSubmit = async () => {
    if (submitRef.current) return
    const ok = await confirm(DAILY_SUBMIT_CONFIRM)
    if (ok) handleSubmit()
  }

  /* ---------------------------------------------------------------- */
  /*  Status text                                                      */
  /* ---------------------------------------------------------------- */

  let statusText: string
  if (status === 'solved') {
    statusText =
      wrongAttempts === 0
        ? 'Checkmate! Perfect solve!'
        : `Checkmate! (${wrongAttempts} wrong ${wrongAttempts === 1 ? 'attempt' : 'attempts'})`
  } else if (wrongFlash) {
    statusText = 'Not quite — try again'
  } else if (animating) {
    statusText = 'Correct! Opponent responds…'
  } else {
    statusText =
      wrongAttempts > 0
        ? `Your turn — find the mate! (${wrongAttempts} miss${wrongAttempts === 1 ? '' : 'es'})`
        : 'Your turn — find the mate!'
  }

  const statusColor =
    status === 'solved'
      ? 'var(--success, #22c55e)'
      : wrongFlash
        ? 'var(--error, #ef4444)'
        : animating
          ? 'var(--warning, #eab308)'
          : 'var(--text-muted)'

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-4">
      {/* Timer bar */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-2.5"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div className="font-bold" style={{ fontSize: 'var(--text-sm)' }}>
          {data.toMove === 'white' ? 'White' : 'Black'} to move &middot; Mate in {data.mateIn}
        </div>
        <div
          className="font-bold tabular-nums"
          style={{
            fontSize: 'var(--text-sm)',
            color: elapsed >= maxSeconds - 10 ? 'var(--error)' : undefined,
          }}
        >
          {formatted}
        </div>
      </div>

      {/* Instructions */}
      <p className="text-center" style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
        Tap a piece, then tap its destination to move. Find the checkmate sequence.
      </p>

      {/* Chess board with rank + file labels */}
      {(() => {
        const flipped = data.toMove === 'black'
        const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1]
        const files = flipped ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

        return (
          <div className="mx-auto w-full max-w-[400px]">
            <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: 0 }}>
              {/* Rank labels + board */}
              <div style={{ display: 'grid', gridTemplateRows: 'repeat(8, 1fr)' }}>
                {ranks.map((rank) => (
                  <div
                    key={rank}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      color: 'var(--text-faint)',
                      fontWeight: 500,
                    }}
                  >
                    {rank}
                  </div>
                ))}
              </div>
              <div className="aspect-square overflow-hidden rounded-lg" style={{ border: '2px solid var(--border)' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(8, 1fr)',
                    gridTemplateRows: 'repeat(8, 1fr)',
                    width: '100%',
                    height: '100%',
                  }}
                >
                  {Array.from({ length: 64 }, (_, idx) => {
                    const row = Math.floor(idx / 8)
                    const col = idx % 8
                    const piece = currentBoard[row]?.[col] ?? null
                    const isLight = (row + col) % 2 === 0
                    const isSelected = selectedSquare !== null && selectedSquare[0] === row && selectedSquare[1] === col

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSquareClick(row, col)}
                        disabled={submitted || status !== 'playing'}
                        aria-label={`${squareName(row, col)}${piece ? ` ${PIECE_CHAR[piece]}` : ''}`}
                        style={{
                          background: isSelected ? 'rgba(30, 144, 255, 0.5)' : isLight ? '#f0d9b5' : '#b58863',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
                          lineHeight: 1,
                          cursor: status === 'playing' && !submitted ? 'pointer' : 'default',
                          border: 'none',
                          padding: 0,
                          position: 'relative',
                          outline: isSelected ? '2px solid dodgerblue' : 'none',
                          outlineOffset: '-2px',
                        }}
                      >
                        {piece ? (
                          <span
                            style={{
                              color: piece === piece.toUpperCase() ? '#fff' : '#1a1a1a',
                              WebkitTextStroke: piece === piece.toUpperCase() ? '1px #333' : '0.5px rgba(0,0,0,0.3)',
                              userSelect: 'none',
                            }}
                          >
                            {PIECE_CHAR[piece]}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
              {/* File labels */}
              <div /> {/* empty cell under rank labels */}
              <div className="flex justify-between px-1 pt-1" style={{ color: 'var(--text-faint)', fontSize: '11px' }}>
                {files.map((f) => (
                  <span key={f}>{f}</span>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Status text */}
      <div
        className="rounded-xl px-4 py-3 text-center font-bold"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          color: statusColor,
          fontSize: 'var(--text-sm)',
        }}
      >
        {statusText}
      </div>

      {/* Move history */}
      {moves.length > 0 && (
        <div className="rounded-xl px-4 py-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div
            className="mb-1 font-medium uppercase tracking-wider"
            style={{ fontSize: '11px', color: 'var(--text-faint)' }}
          >
            Moves
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1" style={{ fontSize: 'var(--text-sm)' }}>
            {moves.map((m, i) => {
              const isAttacker = i % 2 === 0
              const moveNum = Math.floor(i / 2) + 1
              return (
                <span key={i}>
                  {isAttacker && <span style={{ color: 'var(--text-faint)' }}>{moveNum}.</span>}{' '}
                  <span className="font-bold" style={{ color: isAttacker ? 'var(--text)' : 'var(--text-muted)' }}>
                    {m}
                  </span>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Manual submit */}
      {status === 'playing' && !submitted && moves.length > 0 && (
        <button type="button" onClick={handleManualSubmit} className="fr-btn fr-btn--secondary fr-btn--sm w-full">
          Give up and submit ({attackerMoveCount}/{data.mateIn} moves)
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Algebraic notation builder                                         */
/* ------------------------------------------------------------------ */

function buildMoveNotation(
  board: Board,
  piece: string,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
  isWhite: boolean
): string {
  const pType = piece.toUpperCase()
  const target = board[toRow][toCol]
  const isCapture = target !== null

  // Castling
  if (pType === 'K' && Math.abs(toCol - fromCol) === 2) {
    return toCol > fromCol ? 'O-O' : 'O-O-O'
  }

  let notation = ''

  // Piece letter (pawns omitted)
  if (pType !== 'P') {
    notation += PIECE_NAME[piece.toUpperCase()]

    // Disambiguation: check if another piece of the same type can reach the same destination
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (r === fromRow && c === fromCol) continue
        if (board[r][c]?.toUpperCase() !== pType) continue
        // Same colour check
        const sameColour = isWhite
          ? board[r][c] === board[r][c]?.toUpperCase()
          : board[r][c] === board[r][c]?.toLowerCase()
        if (!sameColour) continue
        // Simplified: add file disambiguation
        if (c === fromCol) {
          notation += rankChar(fromRow)
        } else {
          notation += fileChar(fromCol)
        }
        break
      }
    }
  }

  // Pawn captures include the source file
  if (pType === 'P' && (isCapture || toCol !== fromCol)) {
    notation += fileChar(fromCol)
  }

  if (isCapture || (pType === 'P' && toCol !== fromCol)) {
    notation += 'x'
  }

  notation += squareName(toRow, toCol)

  // Pawn promotion (always queen for simplicity)
  if (pType === 'P' && (toRow === 0 || toRow === 7)) {
    notation += '=Q'
  }

  // Check / checkmate detection is too complex without a full engine;
  // the solution lines include these symbols, so moves won't match unless
  // we add them. We'll try matching with and without check markers in the
  // validation step — but first, try adding common suffixes.
  return notation
}
