'use client'

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  ayoResultDetail,
  ayoScores,
  currentTurnPlayerId,
  isAyoChampion,
  legalMovesForSide,
  sideForPlayer,
} from '@/lib/ayo'
import type { AyoSession, AyoSide, Player } from '@/types'
import { AyoCard, AyoTurnBar } from '@/components/ayo/AyoChrome'
import { useAyoTurnSound } from '@/hooks/useAyoTurnSound'

const BOARD_WOOD = '#8b5e34'
const PIT_BG = '#5c3d1e'
const PIT_RING = '#3d2812'

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function AyoClockChip({ session, side }: { session: AyoSession; side: AyoSide }) {
  const [, bump] = useState(0)
  const timed = session.a_time_ms != null && session.b_time_ms != null
  const active = session.status === 'active' && session.current_turn === side

  useEffect(() => {
    if (!timed || !active) return
    const id = window.setInterval(() => bump((n) => n + 1), 250)
    return () => window.clearInterval(id)
  }, [timed, active])

  if (!timed) return null

  const base = (side === 'a' ? session.a_time_ms : session.b_time_ms) ?? 0
  const startedAt = session.turn_started_at ? Date.parse(session.turn_started_at) : null
  const ms = active && startedAt != null ? Math.max(0, base - Math.max(0, Date.now() - startedAt)) : base
  const lowTime = ms <= 30000

  return (
    <span
      className={[
        'ml-auto shrink-0 tabular-nums font-black rounded-md px-2 py-0.5 text-sm border',
        active
          ? lowTime
            ? 'bg-rose-500/20 border-rose-400 text-rose-300 animate-pulse'
            : 'bg-[var(--primary)]/15 border-[var(--primary)]/50 text-[var(--foreground)]'
          : 'bg-[var(--surface-inset-bg)] border-[var(--border)] text-muted',
      ].join(' ')}
    >
      {formatClock(ms)}
    </span>
  )
}

function ScoreTray({
  name,
  score,
  captured,
  champion,
  clock,
}: {
  name: string
  score: number
  captured: number
  champion?: boolean
  clock?: ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5 min-h-[1.75rem] px-1">
      <span className="text-xs font-bold shrink-0">
        🌰 {name}
        {champion ? <span className="ml-1 text-amber-400">Ọta champion</span> : null}
      </span>
      <span className="text-xs text-faint">
        · {score} seeds ({captured} captured)
      </span>
      {clock}
    </div>
  )
}

function PitButton({
  index,
  count,
  interactive,
  selected,
  highlighted,
  onClick,
}: {
  index: number
  count: number
  interactive: boolean
  selected: boolean
  highlighted: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-label={`Pit ${index + 1}, ${count} seeds`}
      className={[
        'relative aspect-[4/5] rounded-full flex flex-col items-center justify-center border-2 transition-transform',
        interactive ? 'cursor-pointer hover:scale-[1.03] active:scale-[0.98]' : 'cursor-default',
        selected ? 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--background)]' : '',
        highlighted ? 'brightness-110' : '',
      ].join(' ')}
      style={{ backgroundColor: PIT_BG, borderColor: PIT_RING }}
    >
      <span className="text-lg sm:text-xl font-black tabular-nums text-amber-100">{count}</span>
      <span className="text-[10px] text-amber-200/70">{'🌰'.repeat(Math.min(count, 4))}</span>
    </button>
  )
}

export function AyoGamePanel({
  session,
  players,
  myPlayerId,
  isMyTurn,
  timeControlSeconds,
  onMove,
  onResign,
  acting,
}: {
  session: AyoSession
  players: Player[]
  myPlayerId: string | null
  isMyTurn: boolean
  timeControlSeconds?: number
  onMove?: (pitIndex: number) => void
  onResign?: () => void
  acting?: boolean
}) {
  const [selected, setSelected] = useState<number | null>(null)

  useAyoTurnSound(session, myPlayerId, true)

  const mySide = myPlayerId ? sideForPlayer(session, myPlayerId) : null
  const flip = mySide === 'b'
  const finished = session.status === 'finished'
  const interactive = !!onMove && isMyTurn && !finished && !acting && !!mySide

  const legal = useMemo(() => {
    if (!interactive || !mySide) return new Set<number>()
    return new Set(legalMovesForSide(session.pits, mySide))
  }, [session.pits, interactive, mySide])

  const scores = ayoScores(session)
  const playerA = players.find((p) => p.id === session.player_a_id)
  const playerB = players.find((p) => p.id === session.player_b_id)
  const turnPlayer = players.find((p) => p.id === currentTurnPlayerId(session))
  const winnerName = players.find((p) => p.id === session.winner_player_id)?.name
  const timed = session.a_time_ms != null && session.b_time_ms != null

  const bottomIndices = flip ? [6, 7, 8, 9, 10, 11] : [0, 1, 2, 3, 4, 5]
  const topIndices = flip ? [5, 4, 3, 2, 1, 0] : [11, 10, 9, 8, 7, 6]
  const bottomSide: AyoSide = flip ? 'b' : 'a'
  const topSide: AyoSide = flip ? 'a' : 'b'

  const trayFor = (side: AyoSide) => ({
    name: (side === 'a' ? playerA : playerB)?.name ?? (side === 'a' ? 'Player A' : 'Player B'),
    score: side === 'a' ? scores.a : scores.b,
    captured: side === 'a' ? session.captured_a : session.captured_b,
    champion: isAyoChampion(side === 'a' ? session.a_win_streak : session.b_win_streak),
  })

  const handlePitClick = (pitIndex: number) => {
    if (!interactive || !mySide) return
    if (!legal.has(pitIndex)) return
    if (selected === pitIndex) {
      onMove?.(pitIndex)
      setSelected(null)
      return
    }
    setSelected(pitIndex)
    onMove?.(pitIndex)
    setSelected(null)
  }

  const renderRow = (indices: number[], side: AyoSide) => (
    <div className="grid grid-cols-6 gap-2 sm:gap-3">
      {indices.map((pitIndex) => (
        <PitButton
          key={pitIndex}
          index={pitIndex}
          count={session.pits[pitIndex]}
          interactive={interactive && legal.has(pitIndex)}
          selected={selected === pitIndex}
          highlighted={session.last_pit === pitIndex}
          onClick={() => handlePitClick(pitIndex)}
        />
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      {session.status === 'active' && <AyoTurnBar turnPlayerName={turnPlayer?.name} isMyTurn={isMyTurn} />}

      <AyoCard className="p-3 flex items-center justify-between text-sm">
        <span className="font-bold">🌰 {playerA?.name ?? 'Player A'}</span>
        <span className="text-faint">vs</span>
        <span className="font-bold">🌰 {playerB?.name ?? 'Player B'}</span>
      </AyoCard>

      {timed && timeControlSeconds ? (
        <p className="text-center text-faint text-xs -mt-2">
          ⏱ {timeControlSeconds < 60 ? `${timeControlSeconds}s` : `${Math.round(timeControlSeconds / 60)} min`} each —
          your clock only counts down on your turn
        </p>
      ) : null}

      {finished && (
        <AyoCard className="p-4 text-center space-y-1">
          <p className="text-2xl">{session.is_draw ? '🤝' : '🏆'}</p>
          <p className="text-lg font-black">
            {session.is_draw ? "It's a draw!" : winnerName ? `${winnerName} is Ọta!` : 'Game over'}
          </p>
          {!session.is_draw && winnerName && <p className="text-xs text-amber-300/90 italic">Mo ki ota, mo ki ope o</p>}
          {ayoResultDetail(session.result_reason) && (
            <p className="text-xs text-faint capitalize">{ayoResultDetail(session.result_reason)}</p>
          )}
        </AyoCard>
      )}

      <div
        className="max-w-lg mx-auto w-full space-y-2 rounded-2xl p-3 sm:p-4 border-2 border-[var(--border-strong)] shadow-lg"
        style={{ backgroundColor: BOARD_WOOD }}
      >
        <ScoreTray {...trayFor(topSide)} clock={<AyoClockChip session={session} side={topSide} />} />
        {renderRow(topIndices, topSide)}
        <div className="h-2" />
        {renderRow(bottomIndices, bottomSide)}
        <ScoreTray {...trayFor(bottomSide)} clock={<AyoClockChip session={session} side={bottomSide} />} />
      </div>

      {mySide && session.status === 'active' && (
        <div className="space-y-2">
          <p className="text-center text-faint text-xs">
            You play the {flip ? 'top' : 'bottom'} row · tap one of your houses to sow anti-clockwise
            {isMyTurn ? '' : ' · waiting for your opponent'}
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
