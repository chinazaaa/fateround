'use client'

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { chessResultDetail, colorForPlayer, currentTurnPlayerId } from '@/lib/chess'
import { type Premove, premoveNeedsPromotion, premoveTargets } from '@/lib/chess-premove'
import type { ChessColor, Player, ChessSession } from '@/types'
import { ChessCard, ChessTurnBar } from '@/components/chess/ChessChrome'
import { ChessAppearancePicker } from '@/components/chess/ChessAppearancePicker'
import {
  type ChessAppearanceDefaults,
  type ChessPieceSet,
  type ChessPieceType,
  useChessAppearance,
} from '@/lib/chess-appearance'
import { ChessPieceGlyph } from '@/components/chess/ChessPieceDetailed'
import { useChessTurnSound } from '@/hooks/useChessTurnSound'
import { useToast } from '@/components/ui/Toast'

const PIECE_NAMES: Record<ChessPieceType, string> = {
  p: 'pawn',
  r: 'rook',
  n: 'knight',
  b: 'bishop',
  q: 'queen',
  k: 'king',
}

/** Format remaining clock ms as m:ss (always reads as a clock, e.g. 10:00, 0:14, 0:05). */
function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * A single player's live clock, isolated in its own component. Only the active
 * player's chip re-renders on a tick — the board itself doesn't, so moving
 * pieces stays smooth and the countdown doesn't stutter/jump under render load.
 */
function ChessClockChip({ session, color }: { session: ChessSession; color: ChessColor }) {
  const [, bump] = useState(0)
  const timed = session.white_time_ms != null && session.black_time_ms != null
  const active = session.status === 'active' && session.current_turn === color

  useEffect(() => {
    if (!timed || !active) return
    const id = window.setInterval(() => bump((n) => n + 1), 250)
    return () => window.clearInterval(id)
  }, [timed, active])

  if (!timed) return null

  const base = (color === 'w' ? session.white_time_ms : session.black_time_ms) ?? 0
  const startedAt = session.turn_started_at ? Date.parse(session.turn_started_at) : null
  const ms = active && startedAt != null ? Math.max(0, base - Math.max(0, Date.now() - startedAt)) : base
  const lowTime = ms <= 30000

  return (
    <span
      className={[
        'shrink-0 tabular-nums font-black text-base',
        active ? (lowTime ? 'text-rose-400 animate-pulse' : 'text-[var(--primary)]') : 'text-muted',
      ].join(' ')}
    >
      {formatClock(ms)}
    </span>
  )
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const

const PROMOTION_PIECES: { piece: 'q' | 'r' | 'b' | 'n'; label: string }[] = [
  { piece: 'q', label: '♛ Queen' },
  { piece: 'r', label: '♜ Rook' },
  { piece: 'b', label: '♝ Bishop' },
  { piece: 'n', label: '♞ Knight' },
]

const CAPTURABLE_TYPES = ['q', 'r', 'b', 'n', 'p'] as const
const STARTING_COUNT: Record<string, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 }

type Material = {
  /** Black pieces removed from the board — i.e. captured by White. */
  capturedByWhite: string[]
  /** White pieces removed from the board — i.e. captured by Black. */
  capturedByBlack: string[]
}

function computeMaterial(chess: Chess): Material {
  const counts: Record<ChessColor, Record<string, number>> = {
    w: { q: 0, r: 0, b: 0, n: 0, p: 0 },
    b: { q: 0, r: 0, b: 0, n: 0, p: 0 },
  }
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.type !== 'k') counts[cell.color][cell.type] += 1
    }
  }

  const capturedByWhite: string[] = []
  const capturedByBlack: string[] = []

  for (const type of CAPTURABLE_TYPES) {
    // Promotions can leave more than the starting count; clamp at 0.
    const missingBlack = Math.max(0, STARTING_COUNT[type] - counts.b[type])
    const missingWhite = Math.max(0, STARTING_COUNT[type] - counts.w[type])
    for (let i = 0; i < missingBlack; i += 1) capturedByWhite.push(type)
    for (let i = 0; i < missingWhite; i += 1) capturedByBlack.push(type)
  }

  return { capturedByWhite, capturedByBlack }
}

/** Side indicator with fixed piece colours (plus a contrasting outline) so it
 *  never inverts with the light/dark theme. The raw ♔/♚ glyphs take the text
 *  colour, which flipped the black king to white in dark mode. */
function KingGlyph({ color }: { color: ChessColor }) {
  return (
    <span
      aria-hidden
      style={{
        color: color === 'w' ? '#f5f5f5' : '#1a1a1a',
        textShadow: color === 'w' ? '0 0 1.5px rgba(0,0,0,0.65)' : '0 0 1.5px rgba(255,255,255,0.75)',
      }}
    >
      ♚
    </span>
  )
}

/** Collapse repeated captures into type+count (e.g. 6 pawns -> one pawn glyph + "×6") so a
 *  long capture streak never grows past 5 icons (one per piece type) and can't force a wrap
 *  mid-name. Order follows {@link CAPTURABLE_TYPES} (queen down to pawn). */
function groupPieces(pieces: string[]): { type: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const type of pieces) counts.set(type, (counts.get(type) ?? 0) + 1)
  return CAPTURABLE_TYPES.filter((type) => counts.has(type)).map((type) => ({ type, count: counts.get(type)! }))
}

/** One combined captured-material line for both sides (e.g. "ADA ♟ · KOJO ♙×6"), sitting below
 *  the player cards. Each entry that has no captures yet is skipped. */
function ChessCapturedSummary({
  entries,
  set,
}: {
  entries: { name: string; pieces: string[]; glyphColor: ChessColor }[]
  set: ChessPieceSet
}) {
  const shown = entries.filter((e) => e.pieces.length > 0)
  if (shown.length === 0) return null
  return (
    <div className="flex items-center justify-center flex-wrap gap-1 px-1">
      {shown.map((e, i) => (
        <div key={e.name + i} className="flex items-center flex-wrap gap-0.5">
          {i > 0 ? <span className="text-faint text-xs mr-1">·</span> : null}
          <span className="text-muted text-[11px] font-bold tracking-wide mr-0.5">{e.name.toUpperCase()}</span>
          {groupPieces(e.pieces).map(({ type, count }) => (
            <span key={type} className="flex items-center">
              <ChessPieceGlyph
                set={set}
                color={e.glyphColor}
                type={type as ChessPieceType}
                className="h-3.5 w-3.5 sm:h-4 sm:w-4"
              />
              {count > 1 ? <span className="text-faint text-[10px] font-bold ml-px">×{count}</span> : null}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/** A player identity card: avatar, name, colour label, and (optionally) a live clock — two of
 *  these sit side by side above the board, mirroring the chess.com-style header. */
function ChessPlayerCard({
  name,
  color,
  clock,
  active,
}: {
  name: string
  color: ChessColor
  clock?: ReactNode
  active?: boolean
}) {
  return (
    <div
      className={[
        'flex-1 flex items-center gap-2 min-h-[3.25rem] px-2.5 py-2 rounded-lg border transition-colors',
        active ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] bg-[var(--surface-bg)]',
      ].join(' ')}
    >
      <span
        className={[
          'flex items-center justify-center shrink-0 h-8 w-8 rounded-full text-sm font-black',
          color === 'w' ? 'bg-[var(--primary)]/15 text-[var(--primary)]' : 'bg-[#1a1a1a] text-[#f5f5f5]',
        ].join(' ')}
        aria-hidden
      >
        {name.trim().charAt(0).toUpperCase() || '?'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold truncate">{name}</p>
        <p className="text-xs text-faint">{color === 'w' ? 'White' : 'Black'}</p>
      </div>
      {clock ? (
        <div className="flex items-center gap-1.5 shrink-0">
          {active ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> : null}
          {clock}
        </div>
      ) : null}
    </div>
  )
}

function Piece({ type, color, set }: { type: string; color: ChessColor; set: ChessPieceSet }) {
  const detailed = set.style === 'detailed'
  return (
    <ChessPieceGlyph
      set={set}
      color={color}
      type={type as ChessPieceType}
      // Detailed pieces are drawn with built-in padding, so they fill more of the square.
      className={`relative z-10 select-none ${detailed ? 'w-[92%] h-[92%]' : 'w-[82%] h-[82%]'}`}
    />
  )
}

export function ChessGamePanel({
  session,
  players,
  myPlayerId,
  isMyTurn,
  timeControlSeconds,
  appearanceDefaults,
  onMove,
  onResign,
  acting,
}: {
  session: ChessSession
  players: Player[]
  myPlayerId: string | null
  isMyTurn: boolean
  timeControlSeconds?: number
  appearanceDefaults?: ChessAppearanceDefaults
  onMove?: (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => void
  onResign?: () => void
  acting?: boolean
}) {
  const { info: toastInfo } = useToast()
  const [selected, setSelected] = useState<string | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string; isPremove?: boolean } | null>(
    null
  )
  // A move queued while waiting for the opponent; auto-played the moment it's our turn.
  const [premove, setPremove] = useState<Premove | null>(null)
  const { boardTheme, pieceSet } = useChessAppearance(appearanceDefaults)

  // Cue when it becomes the local player's turn. Only fires for the seated player
  // (a spectating host has a null myPlayerId, so it stays silent for them).
  useChessTurnSound(session, myPlayerId, true)

  const myColor = myPlayerId ? colorForPlayer(session, myPlayerId) : null
  const flip = myColor === 'b'
  const finished = session.status === 'finished'
  const interactive = !!onMove && isMyTurn && !finished && !acting && !!myColor
  // Off-turn interactivity: queue a premove. Deliberately not gated on `acting`,
  // so a player can line up their next move while their last one is still posting.
  const canPremove = !!onMove && !isMyTurn && !finished && !!myColor

  const chess = useMemo(() => {
    const c = new Chess()
    try {
      c.load(session.fen)
    } catch {
      // leave at starting position if the FEN is somehow invalid
    }
    return c
  }, [session.fen])

  const legalTargets = useMemo(() => {
    const map = new Map<string, { promotion: boolean }>()
    if (!selected) return map
    if (interactive) {
      try {
        for (const m of chess.moves({ square: selected as Square, verbose: true })) {
          const prev = map.get(m.to)
          map.set(m.to, { promotion: (prev?.promotion ?? false) || m.flags.includes('p') })
        }
      } catch {
        // invalid square — ignore
      }
    } else if (canPremove && myColor) {
      const piece = chess.get(selected as Square)
      if (piece && piece.color === myColor) {
        for (const to of premoveTargets(selected, piece.type, myColor)) {
          // Keep taps on our own pieces meaning "reselect", not "premove onto it".
          if (chess.get(to as Square)?.color === myColor) continue
          map.set(to, { promotion: premoveNeedsPromotion(to, piece.type, myColor) })
        }
      }
    }
    return map
  }, [chess, selected, interactive, canPremove, myColor])

  // Fire the queued premove as soon as it's our turn. Re-validate against the
  // position the opponent left us — if the queued move is no longer legal
  // (piece captured, king now in check, path blocked) it's silently dropped.
  const firedPremove = useRef<Premove | null>(null)
  // The session's updated_at when the premove was queued. A newer row means a genuine
  // turn advance (the opponent actually moved); an equal one means nothing real happened.
  const premoveAt = useRef<string | null>(null)
  useEffect(() => {
    if (!premove) return
    if (finished || !myColor) {
      setPremove(null)
      return
    }
    if (!isMyTurn || !onMove || acting) return
    // If our own move failed and the parent rolled the board back, isMyTurn flips true
    // again without a new row — same updated_at as when we queued. Drop the premove
    // rather than auto-firing it into the reverted position; only a strictly newer row
    // (the opponent's real move) should trigger it. Optimistic previews keep updated_at.
    if (premoveAt.current && Date.parse(session.updated_at) <= Date.parse(premoveAt.current)) {
      setPremove(null)
      return
    }
    if (firedPremove.current === premove) return // guard double-run before state settles
    firedPremove.current = premove
    const legal = (() => {
      try {
        return chess
          .moves({ square: premove.from as Square, verbose: true })
          .some((m) => m.to === premove.to && (m.promotion ?? undefined) === premove.promotion)
      } catch {
        return false
      }
    })()
    setPremove(null)
    if (legal) onMove(premove.from, premove.to, premove.promotion)
  }, [premove, isMyTurn, finished, acting, chess, onMove, myColor, session.updated_at])

  const checkSquare = useMemo(() => {
    if (!chess.inCheck()) return null
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === chess.turn()) return cell.square
      }
    }
    return null
  }, [chess])

  const material = useMemo(() => computeMaterial(chess), [chess])

  const orderedRanks = flip ? [...RANKS].reverse() : RANKS
  const orderedFiles = flip ? [...FILES].reverse() : FILES

  const turnPlayer = players.find((p) => p.id === currentTurnPlayerId(session))
  const white = players.find((p) => p.id === session.player_white_id)
  const black = players.find((p) => p.id === session.player_black_id)
  const winnerName = players.find((p) => p.id === session.winner_player_id)?.name

  // The two identity cards: your own seat leads (left), the opponent trails (right) —
  // falling back to White-then-Black for a spectator with no seat of their own.
  const cardOrder: ChessColor[] = myColor === 'b' ? ['b', 'w'] : ['w', 'b']
  const playerCardFor = (color: ChessColor) => ({
    name: (color === 'w' ? white : black)?.name ?? (color === 'w' ? 'White' : 'Black'),
    color,
    active: session.status === 'active' && session.current_turn === color,
  })
  const capturedSummaryEntries = cardOrder.map((color) => ({
    name: (color === 'w' ? white : black)?.name ?? (color === 'w' ? 'White' : 'Black'),
    pieces: color === 'w' ? material.capturedByWhite : material.capturedByBlack,
    glyphColor: (color === 'w' ? 'b' : 'w') as ChessColor,
  }))

  const timed = session.white_time_ms != null && session.black_time_ms != null

  const handleSquareClick = (square: string) => {
    if (!interactive && !canPremove) return
    const piece = chess.get(square as Square)

    // Any tap while a premove is queued cancels it; the tap then falls through,
    // so tapping one of your pieces starts lining up a fresh one.
    if (premove) setPremove(null)

    if (selected) {
      const target = legalTargets.get(square)
      if (target) {
        if (interactive) {
          if (target.promotion) {
            setPendingPromotion({ from: selected, to: square })
          } else {
            onMove?.(selected, square)
            setSelected(null)
          }
        } else {
          if (target.promotion) {
            setPendingPromotion({ from: selected, to: square, isPremove: true })
          } else {
            premoveAt.current = session.updated_at
            setPremove({ from: selected, to: square })
            setSelected(null)
            toastInfo('Premove saved — it plays automatically once it’s your turn')
          }
        }
        return
      }
    }

    if (piece && piece.color === myColor) {
      setSelected(square)
      setPendingPromotion(null)
    } else {
      setSelected(null)
    }
  }

  const confirmPromotion = (piece: 'q' | 'r' | 'b' | 'n') => {
    if (!pendingPromotion) return
    if (pendingPromotion.isPremove) {
      premoveAt.current = session.updated_at
      setPremove({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: piece })
      toastInfo('Premove saved — it plays automatically once it’s your turn')
    } else {
      onMove?.(pendingPromotion.from, pendingPromotion.to, piece)
    }
    setPendingPromotion(null)
    setSelected(null)
  }

  return (
    <div className="space-y-4">
      {session.status === 'active' && (
        <ChessTurnBar
          kicker={
            session.in_check && isMyTurn
              ? 'Check'
              : isMyTurn
                ? 'Your move'
                : premove
                  ? 'Premove queued'
                  : "Opponent's turn"
          }
          text={
            session.in_check && isMyTurn
              ? 'Check! Your move'
              : selected
                ? (() => {
                    const label = PIECE_NAMES[(chess.get(selected as Square)?.type ?? 'p') as ChessPieceType]
                    return `${label.charAt(0).toUpperCase()}${label.slice(1)} selected — tap a dot to move`
                  })()
                : isMyTurn
                  ? 'Your turn'
                  : premove
                    ? `Premove ${premove.from}→${premove.to} queued — tap the board to cancel`
                    : canPremove
                      ? `${turnPlayer?.name ?? 'Opponent'}'s turn — tap a piece to queue a premove`
                      : `${turnPlayer?.name ?? 'Opponent'}'s turn`
          }
        />
      )}

      {timed && timeControlSeconds ? (
        <p className="text-center text-faint text-xs -mt-2">
          ⏱ {Math.round(timeControlSeconds / 60)} min each — your clock only counts down on your turn
        </p>
      ) : null}

      {finished && (
        <ChessCard className="p-4 text-center space-y-1">
          <p className="text-2xl">{session.is_draw ? '🤝' : '🏆'}</p>
          <p className="text-lg font-black">{winnerName ? `${winnerName} wins!` : "It's a draw!"}</p>
          {chessResultDetail(session.result_reason) && (
            <p className="text-xs text-faint capitalize">{chessResultDetail(session.result_reason)}</p>
          )}
        </ChessCard>
      )}

      <div className="max-w-lg sm:max-w-xl lg:max-w-2xl mx-auto w-full space-y-1.5">
        <div className="flex gap-2">
          {cardOrder.map((color) => (
            <ChessPlayerCard
              key={color}
              {...playerCardFor(color)}
              clock={timed ? <ChessClockChip session={session} color={color} /> : undefined}
            />
          ))}
        </div>
        <ChessCapturedSummary entries={capturedSummaryEntries} set={pieceSet} />
        <div className="grid grid-cols-8 rounded-lg overflow-hidden border-2 border-[var(--border-strong)] shadow-lg">
          {orderedRanks.map((rank, rankIdx) =>
            orderedFiles.map((file, fileIdx) => {
              const square = `${file}${rank}`
              const piece = chess.get(square as Square)
              // A square's colour is fixed by its coordinates: a1 (file 0, rank 1) is
              // dark, and every step in file or rank flips it. So a square is light when
              // (file index + rank) is even — that puts a8 and h1 (the canonical
              // "light square on the right") on light, matching a real board.
              const isLight = (FILES.indexOf(file) + rank) % 2 === 0
              const target = legalTargets.get(square)
              const isSelected = selected === square
              const isLastMove = session.last_move_from === square || session.last_move_to === square
              const isCheck = checkSquare === square
              const isPremove = premove?.from === square || premove?.to === square
              // Coordinates hug the board's edges (chess.com style): ranks down the
              // left column, files along the bottom row. Each label is tinted with
              // the opposite square colour so it reads against its own square.
              const showRank = fileIdx === 0
              const showFile = rankIdx === orderedRanks.length - 1
              const coordColor = isLight ? boardTheme.dark : boardTheme.light

              return (
                <button
                  key={square}
                  type="button"
                  onClick={() => handleSquareClick(square)}
                  disabled={!interactive && !canPremove}
                  aria-label={
                    piece
                      ? `${square}, ${piece.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[piece.type as ChessPieceType]}`
                      : `${square}, empty`
                  }
                  style={{ backgroundColor: isLight ? boardTheme.light : boardTheme.dark }}
                  className={[
                    'relative aspect-square flex items-center justify-center',
                    interactive || canPremove ? 'cursor-pointer' : 'cursor-default',
                  ].join(' ')}
                >
                  {isLastMove && <span className="absolute inset-0 z-0 bg-yellow-300/40" />}
                  {isCheck && <span className="absolute inset-0 z-0 bg-rose-500/50" />}
                  {isPremove && <span className="absolute inset-0 z-0 bg-sky-500/45" />}
                  {showRank && (
                    <span
                      className="pointer-events-none absolute top-0.5 left-0.5 z-20 text-[9px] sm:text-[11px] font-bold leading-none select-none"
                      style={{ color: coordColor }}
                      aria-hidden
                    >
                      {rank}
                    </span>
                  )}
                  {showFile && (
                    <span
                      className="pointer-events-none absolute bottom-0.5 right-1 z-20 text-[9px] sm:text-[11px] font-bold leading-none select-none"
                      style={{ color: coordColor }}
                      aria-hidden
                    >
                      {file}
                    </span>
                  )}
                  {isSelected && <span className="absolute inset-0 z-20 ring-2 ring-inset ring-[var(--primary)]" />}
                  {piece && <Piece type={piece.type} color={piece.color} set={pieceSet} />}
                  {target && !piece && <span className="absolute z-20 w-1/4 h-1/4 rounded-full bg-black/30" />}
                  {target && piece && <span className="absolute inset-1 z-20 rounded-full ring-4 ring-black/30" />}
                </button>
              )
            })
          )}
        </div>
      </div>

      <ChessAppearancePicker defaults={appearanceDefaults} />

      {pendingPromotion && (
        <ChessCard className="p-3 space-y-2">
          <p className="text-center text-sm font-bold">Promote to…</p>
          <div className="grid grid-cols-4 gap-2">
            {PROMOTION_PIECES.map(({ piece, label }) => (
              <button
                key={piece}
                type="button"
                onClick={() => confirmPromotion(piece)}
                className="rounded-lg border-2 border-[var(--border-strong)] py-2 text-sm font-bold hover:bg-[var(--primary)]/10"
              >
                {label}
              </button>
            ))}
          </div>
        </ChessCard>
      )}

      {myColor && session.status === 'active' && (
        <div className="space-y-2">
          <p className="text-center text-faint text-xs">
            You are <KingGlyph color={myColor} />{' '}
            <span className="font-bold">{myColor === 'w' ? 'White' : 'Black'}</span>
            {isMyTurn
              ? ' · tap a piece, then its destination'
              : premove
                ? ` · premove ${premove.from}→${premove.to} queued — tap the board to cancel`
                : canPremove
                  ? ' · waiting for your opponent — tap a piece to queue a premove'
                  : ' · waiting for your opponent'}
          </p>
          {onResign && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onResign}
                disabled={!!acting}
                className="rounded-lg border-2 border-[var(--border-strong)] px-6 py-2 text-sm font-semibold text-muted hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
              >
                Resign
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
