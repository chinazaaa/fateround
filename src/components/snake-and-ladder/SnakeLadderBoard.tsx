'use client'

import { useMemo } from 'react'
import type { Player, SnakeLadderPlayerState, SnakeLadderSession } from '@/types'
import { currentPlayerId, SNAKE_LADDER_COLOR_HEX, SNAKE_LADDER_COLOR_LABELS } from '@/lib/snake-and-ladder'
import { cellCenter, cellToGrid, GRID, LADDER_ENTRIES, SNAKE_ENTRIES } from '@/lib/snake-and-ladder-board-layout'
import { SnakeLadderCard, SnakeLadderDie, SnakeLadderTurnBar } from '@/components/snake-and-ladder/SnakeLadderChrome'

const CELL = 40
const SIZE = CELL * GRID

function LadderShape({ from, to }: { from: number; to: number }) {
  const a = cellCenter(from, CELL)
  const b = cellCenter(to, CELL)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  // Perpendicular unit vector for the two rails.
  const px = (-dy / len) * 5
  const py = (dx / len) * 5
  const rungCount = Math.max(2, Math.round(len / 16))
  const rungs = Array.from({ length: rungCount + 1 }, (_, i) => {
    const t = i / rungCount
    const cx = a.x + dx * t
    const cy = a.y + dy * t
    return { x1: cx + px, y1: cy + py, x2: cx - px, y2: cy - py }
  })

  return (
    <g stroke="#a16207" strokeWidth={2.5} strokeLinecap="round" opacity={0.85}>
      <line x1={a.x + px} y1={a.y + py} x2={b.x + px} y2={b.y + py} />
      <line x1={a.x - px} y1={a.y - py} x2={b.x - px} y2={b.y - py} />
      {rungs.map((r, i) => (
        <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} strokeWidth={1.5} />
      ))}
    </g>
  )
}

function SnakeShape({ from, to }: { from: number; to: number }) {
  const head = cellCenter(from, CELL)
  const tail = cellCenter(to, CELL)
  const mx = (head.x + tail.x) / 2
  const my = (head.y + tail.y) / 2
  const dx = tail.x - head.x
  const dy = tail.y - head.y
  const len = Math.hypot(dx, dy) || 1
  // Bow the body out to one side for a serpentine feel.
  const cx = mx + (-dy / len) * 22
  const cy = my + (dx / len) * 22

  return (
    <g>
      <path
        d={`M ${head.x} ${head.y} Q ${cx} ${cy} ${tail.x} ${tail.y}`}
        fill="none"
        stroke="#dc2626"
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.85}
      />
      <circle cx={head.x} cy={head.y} r={6} fill="#dc2626" />
      <circle cx={head.x - 2} cy={head.y - 2} r={1.4} fill="#fff" />
      <circle cx={head.x + 2} cy={head.y - 2} r={1.4} fill="#fff" />
    </g>
  )
}

export function SnakeLadderBoard({
  states,
  players,
  highlightSquare,
}: {
  states: SnakeLadderPlayerState[]
  players: Player[]
  highlightSquare?: number | null
}) {
  // Group tokens by square so we can fan out several pieces sharing a cell.
  const bySquare = useMemo(() => {
    const map = new Map<number, SnakeLadderPlayerState[]>()
    for (const s of states) {
      const list = map.get(s.position) ?? []
      list.push(s)
      map.set(s.position, list)
    }
    return map
  }, [states])

  const nameFor = (id: string) => players.find((p) => p.id === id)?.name ?? 'Player'

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[#fdf6e3] shadow-inner">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-auto" role="img" aria-label="Snakes and ladders board">
        {/* Cells */}
        {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => {
          const { col, rowFromTop } = cellToGrid(n)
          const x = col * CELL
          const y = rowFromTop * CELL
          const dark = (col + rowFromTop) % 2 === 0
          const isGoal = n === 100
          const isHighlight = highlightSquare === n
          return (
            <g key={n}>
              <rect
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                fill={isGoal ? '#fde68a' : dark ? '#fef3c7' : '#fffbeb'}
                stroke="#e7d9b0"
                strokeWidth={0.75}
              />
              {isHighlight && (
                <rect
                  x={x + 1.5}
                  y={y + 1.5}
                  width={CELL - 3}
                  height={CELL - 3}
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth={2.5}
                  rx={4}
                />
              )}
              <text x={x + 3} y={y + 10} fontSize={7} fill="#92826a" fontWeight={600}>
                {n}
              </text>
            </g>
          )
        })}

        {LADDER_ENTRIES.map((l) => (
          <LadderShape key={`l-${l.from}`} from={l.from} to={l.to} />
        ))}
        {SNAKE_ENTRIES.map((s) => (
          <SnakeShape key={`s-${s.from}`} from={s.from} to={s.to} />
        ))}

        {/* Tokens */}
        {[...bySquare.entries()].flatMap(([square, occupants]) => {
          if (square < 1) return []
          const center = cellCenter(square, CELL)
          return occupants.map((occ, idx) => {
            const k = occupants.length
            const angle = (idx / k) * Math.PI * 2
            const radius = k > 1 ? 8 : 0
            const cx = center.x + Math.cos(angle) * radius
            const cy = center.y + Math.sin(angle) * radius
            return (
              <g key={occ.player_id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={7}
                  fill={SNAKE_LADDER_COLOR_HEX[occ.color]}
                  stroke="#fff"
                  strokeWidth={2}
                />
                <title>{`${nameFor(occ.player_id)} — square ${square}`}</title>
              </g>
            )
          })
        })}
      </svg>
    </div>
  )
}

export function SnakeLadderGamePanel({
  session,
  states,
  players,
  myPlayerId,
  isMyTurn,
  secondsLeft,
  hasTimer,
  urgent,
  onRoll,
  acting,
  rolling,
  displayRoll,
}: {
  session: SnakeLadderSession
  states: SnakeLadderPlayerState[]
  players: Player[]
  myPlayerId?: string | null
  isMyTurn?: boolean
  secondsLeft?: number
  hasTimer?: boolean
  urgent?: boolean
  onRoll?: () => void
  acting?: boolean
  rolling?: boolean
  displayRoll?: number | null
}) {
  const turnPlayerId = currentPlayerId(session)
  const turnPlayerName = players.find((p) => p.id === turnPlayerId)?.name
  const finished = session.phase === 'finished'
  const dieValue = displayRoll ?? session.last_roll ?? 1

  // Roster sorted by furthest along, with the player on the move first if tied.
  const roster = useMemo(() => {
    return [...states].sort((a, b) => b.position - a.position || a.player_order - b.player_order)
  }, [states])

  return (
    <SnakeLadderCard className="p-3 sm:p-4 space-y-3">
      {!finished && (
        <SnakeLadderTurnBar
          turnPlayerName={turnPlayerName}
          isMyTurn={isMyTurn}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer}
          urgent={urgent}
        />
      )}

      <SnakeLadderBoard states={states} players={players} highlightSquare={session.last_to} />

      {session.status_message && (
        <p className="text-center text-sm font-semibold text-[var(--foreground)] min-h-[1.25rem]">
          {session.status_message}
        </p>
      )}

      {!finished && (
        <div className="flex items-center justify-center gap-3">
          <SnakeLadderDie value={dieValue} rolling={rolling} />
          {onRoll && isMyTurn && (
            <button
              type="button"
              onClick={onRoll}
              disabled={acting || rolling}
              className="rounded-xl bg-amber-400 px-5 py-3 text-base font-black text-slate-900 shadow-md transition-colors hover:bg-amber-300 disabled:opacity-40"
            >
              {acting || rolling ? '…' : '🎲 Roll'}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {roster.map((s) => {
          const isTurn = s.player_id === turnPlayerId && !finished
          const isMe = s.player_id === myPlayerId
          return (
            <div
              key={s.player_id}
              className={[
                'flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm',
                isTurn
                  ? 'border-[var(--primary)]/50 bg-[var(--primary)]/10'
                  : 'border-[var(--border)] bg-[var(--surface-inset-bg)]',
              ].join(' ')}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-white/60"
                  style={{ backgroundColor: SNAKE_LADDER_COLOR_HEX[s.color] }}
                  title={SNAKE_LADDER_COLOR_LABELS[s.color]}
                />
                <span className="truncate font-medium">
                  {players.find((p) => p.id === s.player_id)?.name ?? 'Player'}
                  {isMe ? ' (you)' : ''}
                </span>
              </span>
              <span className="shrink-0 tabular-nums font-bold text-muted">{s.position}</span>
            </div>
          )
        })}
      </div>
    </SnakeLadderCard>
  )
}
