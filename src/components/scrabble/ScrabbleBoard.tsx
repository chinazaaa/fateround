'use client'

import { useMemo, useState } from 'react'
import type { Player, ScrabbleSession, ScrabblePlayerState, ScrabblePlacedTile } from '@/types'
import {
  SCRABBLE_BOARD_SIZE,
  SCRABBLE_CENTER,
  SCRABBLE_TILE_VALUES,
  scrabblePremiumAt,
  type ScrabblePremium,
} from '@/lib/scrabble-constants'
import { currentTurnPlayerId, scorePlacement } from '@/lib/scrabble-board'
import { ScrabbleCard, ScrabbleTurnBar } from '@/components/scrabble/ScrabbleChrome'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** A tile placed this turn, remembering which rack slot it came from. */
type PendingTile = ScrabblePlacedTile & { rackIndex: number }

/** Background + label for a premium square. */
function premiumStyle(prem: ScrabblePremium): { bg: string; label: string } {
  switch (prem) {
    case 'TW':
      return { bg: 'bg-rose-600/80', label: 'TW' }
    case 'DW':
      return { bg: 'bg-pink-400/70', label: 'DW' }
    case 'TL':
      return { bg: 'bg-blue-600/80', label: 'TL' }
    case 'DL':
      return { bg: 'bg-sky-400/70', label: 'DL' }
    default:
      return { bg: 'bg-[var(--surface-inset-bg)]', label: '' }
  }
}

/** A rendered letter tile (wooden style). */
function LetterTile({
  letter,
  isBlank,
  pending,
  size = 'board',
}: {
  letter: string
  isBlank: boolean
  pending?: boolean
  size?: 'board' | 'rack'
}) {
  const value = isBlank ? 0 : (SCRABBLE_TILE_VALUES[letter.toUpperCase()] ?? 0)
  return (
    <span
      className={[
        'relative flex items-center justify-center rounded-[2px] font-black leading-none w-full h-full',
        pending ? 'bg-amber-300 text-amber-950 ring-2 ring-inset ring-emerald-500' : 'bg-amber-200 text-amber-950',
        size === 'rack' ? 'text-xl sm:text-2xl rounded-md shadow' : 'text-[2.4vw] sm:text-base',
      ].join(' ')}
    >
      {letter.toUpperCase()}
      {!isBlank && (
        <span
          className={[
            'absolute font-bold text-amber-700/90',
            size === 'rack' ? 'bottom-0.5 right-1 text-[0.6rem]' : 'bottom-0 right-0.5 text-[1.1vw] sm:text-[0.5rem]',
          ].join(' ')}
        >
          {value}
        </span>
      )}
    </span>
  )
}

export function ScrabbleGamePanel({
  session,
  players,
  playerStates,
  myPlayerId,
  isMyTurn,
  onPlay,
  onExchange,
  onPass,
  acting,
}: {
  session: ScrabbleSession
  players: Player[]
  playerStates: ScrabblePlayerState[]
  myPlayerId: string | null
  isMyTurn: boolean
  onPlay?: (tiles: ScrabblePlacedTile[]) => Promise<void>
  onExchange?: (indices: number[]) => Promise<void>
  onPass?: () => Promise<void>
  acting?: boolean
}) {
  const [pending, setPending] = useState<PendingTile[]>([])
  const [selectedRackIndex, setSelectedRackIndex] = useState<number | null>(null)
  const [blankTarget, setBlankTarget] = useState<{ rackIndex: number; row: number; col: number } | null>(null)
  const [exchangeMode, setExchangeMode] = useState(false)
  const [exchangeSelection, setExchangeSelection] = useState<number[]>([])

  const finished = session.phase === 'finished'
  const interactive = !!onPlay && isMyTurn && !finished && !acting

  const myState = playerStates.find((s) => s.player_id === myPlayerId)
  const rack = myState?.rack ?? []
  const usedRackIndices = useMemo(() => new Set(pending.map((p) => p.rackIndex)), [pending])

  const turnPlayerId = currentTurnPlayerId(session)
  const turnPlayer = players.find((p) => p.id === turnPlayerId)

  const placed: ScrabblePlacedTile[] = useMemo(
    () => pending.map(({ row, col, letter, isBlank }) => ({ row, col, letter, isBlank })),
    [pending]
  )
  const preview = useMemo(() => scorePlacement(session.board, placed), [session.board, placed])

  const stateByPlayer = useMemo(() => {
    const m = new Map<string, ScrabblePlayerState>()
    for (const s of playerStates) m.set(s.player_id, s)
    return m
  }, [playerStates])
  const topScore = useMemo(() => Math.max(0, ...playerStates.map((s) => s.score)), [playerStates])

  const pendingAt = (row: number, col: number) => pending.find((p) => p.row === row && p.col === col)

  // ── Interaction ───────────────────────────────────────────────────────────
  const clearPending = () => {
    setPending([])
    setSelectedRackIndex(null)
    setBlankTarget(null)
  }

  const handleRackTap = (index: number) => {
    if (!interactive) return
    if (usedRackIndices.has(index)) return
    if (exchangeMode) {
      setExchangeSelection((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]))
      return
    }
    setSelectedRackIndex((prev) => (prev === index ? null : index))
  }

  const handleSquareTap = (row: number, col: number) => {
    if (!interactive || exchangeMode) return
    const existingPending = pendingAt(row, col)
    if (existingPending) {
      // Recall this tile back to the rack.
      setPending((prev) => prev.filter((p) => !(p.row === row && p.col === col)))
      return
    }
    if (session.board[row][col]) return // occupied by a committed tile
    if (selectedRackIndex == null) return
    const rackLetter = rack[selectedRackIndex]
    if (rackLetter == null) return
    if (rackLetter === '?') {
      setBlankTarget({ rackIndex: selectedRackIndex, row, col })
      return
    }
    setPending((prev) => [...prev, { row, col, letter: rackLetter, isBlank: false, rackIndex: selectedRackIndex }])
    setSelectedRackIndex(null)
  }

  const chooseBlankLetter = (letter: string) => {
    if (!blankTarget) return
    setPending((prev) => [
      ...prev,
      { row: blankTarget.row, col: blankTarget.col, letter, isBlank: true, rackIndex: blankTarget.rackIndex },
    ])
    setBlankTarget(null)
    setSelectedRackIndex(null)
  }

  const enterExchange = () => {
    clearPending()
    setExchangeSelection([])
    setExchangeMode(true)
  }
  const cancelExchange = () => {
    setExchangeMode(false)
    setExchangeSelection([])
  }

  const submitPlay = async () => {
    if (!onPlay || !preview.valid || placed.length === 0) return
    await onPlay(placed)
    clearPending()
  }
  const submitExchange = async () => {
    if (!onExchange || exchangeSelection.length === 0) return
    await onExchange(exchangeSelection)
    cancelExchange()
  }
  const submitPass = async () => {
    if (!onPass) return
    clearPending()
    await onPass()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const lastMove = session.last_move
  const lastMovePlayer = lastMove ? players.find((p) => p.id === lastMove.player_id) : null

  return (
    <div className="space-y-4">
      <ScrabbleTurnBar
        turnPlayerName={turnPlayer?.name}
        isMyTurn={isMyTurn && !finished}
        statusMessage={session.status_message}
      />

      {lastMove && lastMovePlayer && (
        <p className="text-center text-xs text-faint">
          {lastMove.kind === 'play'
            ? `${lastMovePlayer.name} played ${lastMove.words.join(', ')} for ${lastMove.score} pts`
            : lastMove.kind === 'exchange'
              ? `${lastMovePlayer.name} exchanged tiles`
              : `${lastMovePlayer.name} passed`}
        </p>
      )}

      {/* Board */}
      <div className="max-w-md mx-auto w-full">
        <div
          className="grid rounded-lg overflow-hidden border-2 border-[var(--border-strong)] shadow-lg gap-px bg-[var(--border)]"
          style={{ gridTemplateColumns: `repeat(${SCRABBLE_BOARD_SIZE}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: SCRABBLE_BOARD_SIZE }).map((_, row) =>
            Array.from({ length: SCRABBLE_BOARD_SIZE }).map((__, col) => {
              const committed = session.board[row][col]
              const pendingTile = pendingAt(row, col)
              const prem = scrabblePremiumAt(row, col)
              const isCenter = row === SCRABBLE_CENTER.row && col === SCRABBLE_CENTER.col
              const { bg, label } = premiumStyle(prem)
              const tile =
                committed ?? (pendingTile ? { letter: pendingTile.letter, isBlank: pendingTile.isBlank } : null)
              const isLastMoveCell = lastMove?.tiles?.some((t) => t.row === row && t.col === col)

              return (
                <button
                  key={`${row}-${col}`}
                  type="button"
                  onClick={() => handleSquareTap(row, col)}
                  disabled={!interactive || exchangeMode}
                  className={[
                    'relative aspect-square flex items-center justify-center p-0',
                    tile ? 'bg-transparent' : bg,
                    interactive && !exchangeMode ? 'cursor-pointer' : 'cursor-default',
                  ].join(' ')}
                >
                  {isLastMoveCell && !pendingTile && <span className="absolute inset-0 bg-yellow-300/30" />}
                  {tile ? (
                    <LetterTile letter={tile.letter} isBlank={tile.isBlank} pending={!!pendingTile} size="board" />
                  ) : isCenter ? (
                    <span className="text-[2.4vw] sm:text-sm leading-none text-amber-50/80">★</span>
                  ) : label ? (
                    <span className="text-[1.3vw] sm:text-[0.55rem] font-black leading-none text-white/90">
                      {label}
                    </span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Blank-letter picker */}
      {blankTarget && (
        <ScrabbleCard className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Choose a letter for the blank</p>
            <button
              type="button"
              onClick={() => setBlankTarget(null)}
              className="text-xs text-muted hover:text-[var(--foreground)]"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {ALPHABET.map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() => chooseBlankLetter(letter)}
                className="rounded-md border-2 border-[var(--border-strong)] py-1.5 text-sm font-black hover:bg-[var(--primary)]/10"
              >
                {letter}
              </button>
            ))}
          </div>
        </ScrabbleCard>
      )}

      {/* Live score preview */}
      {interactive && pending.length > 0 && !exchangeMode && (
        <div
          className={[
            'flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold border',
            preview.valid
              ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
              : 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300',
          ].join(' ')}
        >
          {preview.valid ? (
            <>
              <span className="truncate">{preview.words.join(', ')}</span>
              <span className="shrink-0 rounded-md bg-white/25 px-2 py-0.5 tabular-nums">+{preview.score} pts</span>
            </>
          ) : (
            <span>{preview.error ?? 'Incomplete word'}</span>
          )}
        </div>
      )}

      {/* Rack */}
      {(myState || interactive) && (
        <div className="space-y-2">
          <p className="text-center text-faint text-xs">
            {exchangeMode
              ? 'Tap tiles to exchange'
              : interactive
                ? selectedRackIndex != null
                  ? 'Tap an empty square to place the tile'
                  : 'Tap a tile, then tap the board'
                : 'Your rack'}
          </p>
          <div className="flex justify-center gap-1.5 sm:gap-2">
            {rack.map((letter, index) => {
              const used = usedRackIndices.has(index)
              const selected = !exchangeMode && selectedRackIndex === index
              const exchangeSelected = exchangeMode && exchangeSelection.includes(index)
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleRackTap(index)}
                  disabled={!interactive || used}
                  className={[
                    'aspect-square w-9 sm:w-11 rounded-md transition-all',
                    used ? 'opacity-25' : '',
                    selected ? '-translate-y-1.5 ring-2 ring-emerald-500' : '',
                    exchangeSelected ? '-translate-y-1.5 ring-2 ring-rose-500' : '',
                    interactive && !used ? 'cursor-pointer' : 'cursor-default',
                  ].join(' ')}
                >
                  {used ? (
                    <span className="block w-full h-full rounded-md border-2 border-dashed border-[var(--border)]" />
                  ) : (
                    <LetterTile letter={letter === '?' ? ' ' : letter} isBlank={letter === '?'} size="rack" />
                  )}
                </button>
              )
            })}
            {rack.length === 0 && <span className="text-xs text-faint py-2">No tiles</span>}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {interactive && (
        <div className="space-y-2">
          {exchangeMode ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void submitExchange()}
                disabled={exchangeSelection.length === 0 || acting}
                className="btn-primary py-2.5 text-sm font-bold disabled:opacity-50"
              >
                {acting
                  ? '…'
                  : `Swap ${exchangeSelection.length || ''} tile${exchangeSelection.length === 1 ? '' : 's'}`}
              </button>
              <button
                type="button"
                onClick={cancelExchange}
                disabled={acting}
                className="btn-secondary py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void submitPlay()}
                disabled={pending.length === 0 || !preview.valid || acting}
                className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base font-bold disabled:opacity-50"
              >
                {acting ? (
                  '…'
                ) : (
                  <>
                    <span>Submit word</span>
                    {preview.valid && pending.length > 0 && (
                      <span className="rounded-md bg-white/25 px-2 py-0.5 text-sm tabular-nums">+{preview.score}</span>
                    )}
                  </>
                )}
              </button>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={clearPending}
                  disabled={pending.length === 0 || acting}
                  className="btn-secondary py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  Recall
                </button>
                <button
                  type="button"
                  onClick={enterExchange}
                  disabled={acting || rack.length === 0}
                  className="btn-secondary py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  Exchange
                </button>
                <button
                  type="button"
                  onClick={() => void submitPass()}
                  disabled={acting}
                  className="btn-secondary py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  Pass
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Scoreboard */}
      <ScrabbleCard className="p-3 space-y-2">
        <p className="label-caps text-xs">Scores</p>
        <div className="space-y-1.5">
          {session.turn_order.map((pid) => {
            const player = players.find((p) => p.id === pid)
            const score = stateByPlayer.get(pid)?.score ?? 0
            const onTurn = pid === turnPlayerId && !finished
            const isMe = pid === myPlayerId
            const isLeader = score > 0 && score === topScore
            return (
              <div
                key={pid}
                className={[
                  'flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors',
                  onTurn
                    ? 'border-[var(--primary)]/50 bg-[var(--primary)]/15'
                    : 'border-[var(--border)] bg-[var(--surface-inset-bg)]',
                ].join(' ')}
              >
                <span className="flex min-w-0 items-center gap-1.5 font-bold text-[var(--foreground)]">
                  {onTurn && <span className="shrink-0 text-[var(--primary)]">▶</span>}
                  {isLeader && (
                    <span className="shrink-0" title="Leading">
                      👑
                    </span>
                  )}
                  <span className="truncate">{player?.name ?? 'Player'}</span>
                  {isMe && <span className="shrink-0 text-faint text-xs font-normal">you</span>}
                </span>
                <span className="shrink-0 rounded-lg bg-[var(--background)] px-2.5 py-1 text-lg font-black tabular-nums text-[var(--foreground)] shadow-sm">
                  {score}
                </span>
              </div>
            )
          })}
        </div>
      </ScrabbleCard>
    </div>
  )
}
