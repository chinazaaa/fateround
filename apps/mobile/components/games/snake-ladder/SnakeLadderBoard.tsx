import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg'
import { type SnakeLadderPlayerState } from '@fateround/shared'
import { SNAKE_LADDER_COLOR_HEX } from '@fateround/shared/snake-and-ladder'
import { cellCenter, cellToGrid, GRID, LADDER_ENTRIES, SNAKE_ENTRIES } from './board-layout'

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
    <G stroke="#a16207" strokeWidth={2.5} strokeLinecap="round" opacity={0.85}>
      <Line x1={a.x + px} y1={a.y + py} x2={b.x + px} y2={b.y + py} />
      <Line x1={a.x - px} y1={a.y - py} x2={b.x - px} y2={b.y - py} />
      {rungs.map((r, i) => (
        <Line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} strokeWidth={1.5} />
      ))}
    </G>
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
    <G>
      <Path
        d={`M ${head.x} ${head.y} Q ${cx} ${cy} ${tail.x} ${tail.y}`}
        fill="none"
        stroke="#dc2626"
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.85}
      />
      <Circle cx={head.x} cy={head.y} r={6} fill="#dc2626" />
      <Circle cx={head.x - 2} cy={head.y - 2} r={1.4} fill="#fff" />
      <Circle cx={head.x + 2} cy={head.y - 2} r={1.4} fill="#fff" />
    </G>
  )
}

export function SnakeLadderBoard({
  states,
  highlightSquare,
}: {
  states: SnakeLadderPlayerState[]
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

  const cells = useMemo(() => Array.from({ length: 100 }, (_, i) => i + 1), [])

  return (
    <View style={styles.board}>
      <Svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%" style={styles.svg}>
        {/* Cells */}
        {cells.map((n) => {
          const { col, rowFromTop } = cellToGrid(n)
          const x = col * CELL
          const y = rowFromTop * CELL
          const dark = (col + rowFromTop) % 2 === 0
          const isGoal = n === 100
          const isHighlight = highlightSquare === n
          return (
            <G key={n}>
              <Rect
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                fill={isGoal ? '#fde68a' : dark ? '#fef3c7' : '#fffbeb'}
                stroke="#e7d9b0"
                strokeWidth={0.75}
              />
              {isHighlight && (
                <Rect
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
              <SvgText x={x + 3} y={y + 10} fontSize={7} fill="#92826a" fontWeight="600">
                {n}
              </SvgText>
            </G>
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
              <Circle
                key={occ.player_id}
                cx={cx}
                cy={cy}
                r={7}
                fill={SNAKE_LADDER_COLOR_HEX[occ.color]}
                stroke="#fff"
                strokeWidth={2}
              />
            )
          })
        })}
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  board: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e7d9b0',
    backgroundColor: '#fdf6e3',
    overflow: 'hidden',
  },
  svg: { width: '100%', height: '100%' },
})
