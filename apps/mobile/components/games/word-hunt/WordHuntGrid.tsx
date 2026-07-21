import { useMemo, useRef, useState } from 'react'
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Polyline } from 'react-native-svg'
import {
  WORD_HUNT_GRID_SIZE,
  areWordHuntCellsAdjacent,
  rowColToIndex,
  wordFromPath,
} from '@fateround/shared/word-hunt'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { canExtendWordHuntPath } from './word-hunt-preview'

/** Pixels before a touch sequence counts as a drag (not a tap). */
const DRAG_THRESHOLD_PX = 10

type CellFrame = { x: number; y: number; width: number; height: number }

type Props = {
  grid: string[][]
  selectedPath?: number[]
  /** Read-only highlight (viewer / review) — takes precedence over selectedPath when set. */
  highlightPath?: number[]
  onPathChange?: (path: number[]) => void
  onStrokeEnd?: (path: number[]) => void
  disabled?: boolean
  validPrefixes?: ReadonlySet<string>
}

/** Nearest cell under a point. `strict` (during a drag) only hits a cell's central
 *  core so a diagonal drag moves cleanly; lenient (initial tap) uses a padded box. */
function cellAtPoint(frames: CellFrame[], x: number, y: number, strict: boolean): number | null {
  let bestIndex: number | null = null
  let bestDist = Infinity
  for (let index = 0; index < frames.length; index++) {
    const f = frames[index]
    if (!f) continue
    const halfW = f.width / 2
    const halfH = f.height / 2
    const dx = x - (f.x + halfW)
    const dy = y - (f.y + halfH)
    const pad = Math.min(f.width, f.height) * 0.42
    const boundX = strict ? halfW * 0.72 : halfW + pad
    const boundY = strict ? halfH * 0.72 : halfH + pad
    if (Math.abs(dx) <= boundX && Math.abs(dy) <= boundY) {
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        bestIndex = index
      }
    }
  }
  return bestIndex
}

export function WordHuntGrid({
  grid,
  selectedPath = [],
  highlightPath,
  onPathChange = () => {},
  onStrokeEnd,
  disabled = false,
  validPrefixes,
}: Props) {
  const styles = useThemedStyles(makeStyles)
  const [size, setSize] = useState({ width: 0, height: 0 })

  const framesRef = useRef<CellFrame[]>([])
  const pathRef = useRef<number[]>(selectedPath)
  pathRef.current = selectedPath
  const movedRef = useRef(false)
  const lastCellRef = useRef<number | null>(null)
  const gridRef = useRef(grid)
  gridRef.current = grid
  const prefixRef = useRef<ReadonlySet<string> | undefined>(validPrefixes)
  prefixRef.current = validPrefixes

  const displayPath = highlightPath ?? selectedPath

  const applyCell = (index: number) => {
    if (lastCellRef.current === index) return
    const current = pathRef.current
    if (current.includes(index)) return
    const prefixes = prefixRef.current
    const g = gridRef.current

    if (current.length === 0) {
      if (prefixes && prefixes.size > 0 && !prefixes.has(wordFromPath(g, [index]))) return
      commit([index])
      lastCellRef.current = index
      return
    }
    const last = current[current.length - 1]!
    if (!areWordHuntCellsAdjacent(last, index)) {
      if (prefixes && prefixes.size > 0 && !prefixes.has(wordFromPath(g, [index]))) return
      commit([index])
      lastCellRef.current = index
      return
    }
    if (prefixes && prefixes.size > 0 && !canExtendWordHuntPath(g, current, index, prefixes)) return
    commit([...current, index])
    lastCellRef.current = index
  }

  const commit = (path: number[]) => {
    pathRef.current = path
    onPathChange(path)
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          if (disabled) return
          movedRef.current = false
          lastCellRef.current = null
          const { locationX, locationY } = evt.nativeEvent
          const index = cellAtPoint(framesRef.current, locationX, locationY, false)
          if (index !== null) applyCell(index)
        },
        onPanResponderMove: (evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
          if (disabled) return
          if (Math.hypot(gesture.dx, gesture.dy) < DRAG_THRESHOLD_PX) return
          movedRef.current = true
          const { locationX, locationY } = evt.nativeEvent
          const index = cellAtPoint(framesRef.current, locationX, locationY, true)
          if (index !== null) applyCell(index)
        },
        onPanResponderRelease: () => {
          const path = pathRef.current
          const wasDrag = movedRef.current
          movedRef.current = false
          lastCellRef.current = null
          // Drags submit on release; taps keep building until the player taps Submit.
          if (wasDrag && path.length >= 3 && onStrokeEnd) onStrokeEnd([...path])
          if (wasDrag && path.length > 0) commit([])
        },
        onPanResponderTerminate: () => {
          movedRef.current = false
          lastCellRef.current = null
        },
      }),
    // Recreate when interactivity changes; the refs cover the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, onStrokeEnd]
  )

  const linePoints = useMemo(() => {
    if (displayPath.length < 2) return ''
    return displayPath
      .map((index) => {
        const f = framesRef.current[index]
        if (!f) return null
        return `${f.x + f.width / 2},${f.y + f.height / 2}`
      })
      .filter((p): p is string => p !== null)
      .join(' ')
    // size drives recompute once cells have measured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayPath, size])

  const handlers = highlightPath !== undefined || disabled ? {} : panResponder.panHandlers

  return (
    <View
      style={styles.frame}
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout
        setSize({ width, height })
      }}
      {...handlers}
    >
      {linePoints ? (
        <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height} pointerEvents="none">
          <Polyline
            points={linePoints}
            fill="none"
            stroke="#ffffff"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
      {grid.map((row, r) =>
        row.map((letter, c) => {
          const index = rowColToIndex(r, c)
          const inPath = displayPath.includes(index)
          return (
            <View
              key={index}
              pointerEvents="none"
              onLayout={(e: LayoutChangeEvent) => {
                const { x, y, width, height } = e.nativeEvent.layout
                framesRef.current[index] = { x, y, width, height }
                if (index === WORD_HUNT_GRID_SIZE * WORD_HUNT_GRID_SIZE - 1) {
                  // Nudge a re-render so the path line can resolve once all cells measured.
                  setSize((s) => ({ ...s }))
                }
              }}
              style={[styles.cell, inPath && styles.cellSelected, disabled && !inPath && styles.cellDisabled]}
            >
              <Text style={[styles.cellText, inPath && styles.cellTextSelected]}>{letter}</Text>
            </View>
          )
        })
      )}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    frame: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'center',
      position: 'relative',
    },
    cell: {
      width: '22%',
      aspectRatio: 1,
      backgroundColor: theme.surface,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    cellSelected: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    cellDisabled: { opacity: 0.6 },
    // Stretch to the full cell width and centre the glyph so the heavy-weight lone "I" (the
    // narrowest glyph) isn't clipped to nothing by the New Architecture's text measurement.
    cellText: { color: theme.text, fontSize: 22, fontWeight: '800', alignSelf: 'stretch', textAlign: 'center' },
    // White letter on the solid primary tile — correct in both schemes.
    cellTextSelected: { color: '#fff' },
  })
