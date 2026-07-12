import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type GestureResponderEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useNavigation } from 'expo-router'
import type { WordSearchMetadata } from '@fateround/shared'
import { selectionCells } from '@fateround/shared/word-search'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { WORD_SEARCH_MY_CELL_COLOR, wordSearchPlayerColor } from '@/components/games/word-search/standings'

const cellKey = (row: number, col: number) => `${row}-${col}`

/** Board fits inside this width; cell size scales down for bigger grids. */
const BOARD_MAX_WIDTH = 340

/** tan(22.5°) ≈ 0.414, tan(67.5°) ≈ 2.414 — used to snap a drag to the nearest of the 8 rays. */
const AXIS_SNAP_RATIO = 2.414

type Props = {
  metadata: WordSearchMetadata
  /** First finder per cell, for ownership colouring. */
  cellOwners?: (string | null)[][]
  /** Cells the current (or watched) player has found — stronger own-colour fill. */
  myFoundCells?: boolean[][]
  playerColors?: Record<string, string>
  myPlayerId?: string | null
  /** Called on drag release with the snapped start→end endpoints. */
  onSelect?: (start: [number, number], end: [number, number]) => void
  readOnly?: boolean
}

/** Hex colour + two-digit alpha suffix (e.g. '#6366f1' + '33'). */
function withAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`
}

/**
 * Snap the drag's current cell to a straight line from `start` — horizontal, vertical, or a
 * 45° diagonal — so the selection always forms a legal word run.
 */
function snapEnd(start: [number, number], target: [number, number], size: number): [number, number] {
  const [r0, c0] = start
  const [r1, c1] = target
  const dr = r1 - r0
  const dc = c1 - c0
  if (dr === 0 && dc === 0) return start
  const adr = Math.abs(dr)
  const adc = Math.abs(dc)
  const sr = Math.sign(dr)
  const sc = Math.sign(dc)
  // Dominant vertical or horizontal → snap to that axis.
  if (adc === 0 || adr / adc > AXIS_SNAP_RATIO) return [r1, c0]
  if (adr === 0 || adc / adr > AXIS_SNAP_RATIO) return [r0, c1]
  // Otherwise a 45° diagonal, clamped to stay on the board.
  let len = Math.round((adr + adc) / 2)
  const maxR = sr > 0 ? size - 1 - r0 : sr < 0 ? r0 : len
  const maxC = sc > 0 ? size - 1 - c0 : sc < 0 ? c0 : len
  len = Math.min(len, maxR, maxC)
  return [r0 + sr * len, c0 + sc * len]
}

export function WordSearchBoardView({
  metadata,
  cellOwners,
  myFoundCells,
  playerColors = {},
  myPlayerId,
  onSelect,
  readOnly = false,
}: Props) {
  const styles = useThemedStyles(makeStyles)
  // Disable the stack's swipe-back gesture while the interactive board is mounted, so a
  // drag on the grid selects a word instead of navigating back (same fix as the Quick Draw
  // canvas — a JS PanResponder can't reliably out-prioritise the native back gesture).
  const navigation = useNavigation()
  useEffect(() => {
    if (readOnly) return
    navigation.setOptions({ gestureEnabled: false })
    return () => navigation.setOptions({ gestureEnabled: true })
  }, [navigation, readOnly])
  const size = metadata.size
  const cell = Math.floor(BOARD_MAX_WIDTH / size)
  const boardSize = cell * size
  const letterFont = size > 11 ? Math.max(11, cell - 12) : Math.max(14, cell - 14)

  const [preview, setPreview] = useState<Set<string>>(new Set())
  const startRef = useRef<[number, number] | null>(null)
  const endRef = useRef<[number, number] | null>(null)

  const cellAtPoint = (x: number, y: number): [number, number] | null => {
    const col = Math.floor(x / cell)
    const row = Math.floor(y / cell)
    if (row < 0 || row >= size || col < 0 || col >= size) return null
    return [row, col]
  }

  const updatePreview = (start: [number, number], end: [number, number]) => {
    const cells = selectionCells(start, end)
    const next = new Set<string>()
    if (cells) for (const [r, c] of cells) next.add(cellKey(r, c))
    setPreview(next)
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !readOnly,
        onMoveShouldSetPanResponder: () => !readOnly,
        // Claim the touch during the capture phase and refuse to hand it back, so a drag on
        // the grid isn't stolen by the navigator's edge/swipe-back gesture (which otherwise
        // pulls the screen back to the previous page instead of selecting a word).
        onStartShouldSetPanResponderCapture: () => !readOnly,
        onMoveShouldSetPanResponderCapture: () => !readOnly,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          if (readOnly) return
          const { locationX, locationY } = evt.nativeEvent
          const start = cellAtPoint(locationX, locationY)
          startRef.current = start
          endRef.current = start
          if (start) updatePreview(start, start)
        },
        onPanResponderMove: (evt: GestureResponderEvent) => {
          if (readOnly || !startRef.current) return
          const { locationX, locationY } = evt.nativeEvent
          const target = cellAtPoint(locationX, locationY)
          if (!target) return
          const end = snapEnd(startRef.current, target, size)
          endRef.current = end
          updatePreview(startRef.current, end)
        },
        onPanResponderRelease: () => {
          const start = startRef.current
          const end = endRef.current
          startRef.current = null
          endRef.current = null
          setPreview(new Set())
          if (start && end && (start[0] !== end[0] || start[1] !== end[1])) onSelect?.(start, end)
        },
        onPanResponderTerminate: () => {
          startRef.current = null
          endRef.current = null
          setPreview(new Set())
        },
      }),
    // Recreate when interactivity changes; refs cover the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readOnly, size, cell, onSelect]
  )

  const handlers = readOnly ? {} : panResponder.panHandlers

  return (
    <View style={[styles.board, { width: boardSize, height: boardSize }]} {...handlers}>
      {Array.from({ length: size }, (_, row) => (
        <View key={row} style={styles.row}>
          {Array.from({ length: size }, (_, col) => {
            const letter = metadata.grid[row]?.[col] ?? ''
            const owner = cellOwners?.[row]?.[col] ?? null
            const iFound = !!myFoundCells?.[row]?.[col]
            const inPreview = preview.has(cellKey(row, col))

            const ownerColor = owner
              ? owner === myPlayerId
                ? WORD_SEARCH_MY_CELL_COLOR
                : playerColors[owner] ?? wordSearchPlayerColor(0)
              : null
            const baseBg = ownerColor ? withAlpha(ownerColor, iFound ? '55' : '33') : undefined
            const bg = inPreview ? 'rgba(99,102,241,0.35)' : baseBg

            return (
              <View
                key={cellKey(row, col)}
                pointerEvents="none"
                style={[
                  styles.cell,
                  { width: cell, height: cell },
                  bg ? { backgroundColor: bg } : null,
                  inPreview && styles.cellPreview,
                ]}
              >
                <Text style={[styles.letter, { fontSize: letterFont }]}>{letter ? letter.toUpperCase() : ''}</Text>
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Functional puzzle board — frame + cell state colors kept fixed across themes,
    // matching the Sudoku / Crossword board treatment.
    board: { alignSelf: 'center', borderWidth: 2, borderColor: '#64748b', borderRadius: 2, overflow: 'hidden' },
    row: { flexDirection: 'row' },
    cell: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(100,116,139,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    cellPreview: { borderColor: '#6366f1' },
    letter: { color: theme.text, fontWeight: '800' },
  })
