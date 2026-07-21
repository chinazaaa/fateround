import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type GestureResponderEvent,
  PanResponder,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useNavigation } from 'expo-router'
import type { WordSearchMetadata } from '@fateround/shared'
import { selectionCells } from '@fateround/shared/word-search'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { WORD_SEARCH_MY_CELL_COLOR, wordSearchPlayerColor } from '@/components/games/word-search/standings'

const cellKey = (row: number, col: number) => `${row}-${col}`

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
  /**
   * Fires true while a drag is in progress and false when it ends. The parent uses this to
   * disable its ScrollView so a vertical/diagonal drag selects instead of scrolling the page
   * (on iOS the native scroll gesture otherwise steals the vertical part of the drag).
   */
  onDragActiveChange?: (active: boolean) => void
  /** Reports the word currently being traced (ordered letters), or null when the drag ends. */
  onPreviewChange?: (word: string | null) => void
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
  onDragActiveChange,
  onPreviewChange,
  readOnly = false,
}: Props) {
  const styles = useThemedStyles(makeStyles)
  const { width: screenWidth } = useWindowDimensions()
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
  // Use (almost) the full screen width so cells are big enough to touch accurately; cap on
  // tablets so it doesn't become huge.
  const boardWidth = Math.min(screenWidth - 24, 520)
  const cell = Math.floor(boardWidth / size)
  const boardSize = cell * size
  const letterFont = size > 11 ? Math.max(13, cell - 14) : Math.max(16, cell - 16)

  const [preview, setPreview] = useState<Set<string>>(new Set())
  const startRef = useRef<[number, number] | null>(null)
  const endRef = useRef<[number, number] | null>(null)
  // Keeps the drag highlight on screen for a beat after release so it overlaps the found/wrong
  // feedback instead of blinking off first.
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cellAtPoint = (x: number, y: number): [number, number] | null => {
    const col = Math.floor(x / cell)
    const row = Math.floor(y / cell)
    if (row < 0 || row >= size || col < 0 || col >= size) return null
    return [row, col]
  }

  const updatePreview = (start: [number, number], end: [number, number]) => {
    const cells = selectionCells(start, end)
    const next = new Set<string>()
    let word = ''
    if (cells) for (const [r, c] of cells) {
      next.add(cellKey(r, c))
      word += (metadata.grid[r]?.[c] ?? '').toUpperCase()
    }
    setPreview(next)
    onPreviewChange?.(word || null)
  }

  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current)
    },
    []
  )

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
          if (clearTimer.current) clearTimeout(clearTimer.current)
          onDragActiveChange?.(true)
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
          onDragActiveChange?.(false)
          if (start && end && (start[0] !== end[0] || start[1] !== end[1])) onSelect?.(start, end)
          // Hold the highlight for a beat so it overlaps the found/wrong feedback instead of
          // blinking off first, then clear it.
          clearTimer.current = setTimeout(() => {
            setPreview(new Set())
            onPreviewChange?.(null)
          }, 350)
        },
        onPanResponderTerminate: () => {
          startRef.current = null
          endRef.current = null
          setPreview(new Set())
          onDragActiveChange?.(false)
          onPreviewChange?.(null)
        },
      }),
    // Recreate when interactivity changes; refs cover the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readOnly, size, cell, onSelect, onDragActiveChange, onPreviewChange]
  )

  const handlers = readOnly ? {} : panResponder.panHandlers

  return (
    <View style={[styles.board, { width: boardSize, height: boardSize }]} {...handlers}>
      {Array.from({ length: size }, (_, row) => (
        <View key={row} style={styles.row}>
          {Array.from({ length: size }, (_, col) => {
            const letter = metadata.grid[row]?.[col] ?? ''
            const iFound = !!myFoundCells?.[row]?.[col]
            const owner = cellOwners?.[row]?.[col] ?? null
            const inPreview = preview.has(cellKey(row, col))

            // A player's board (myFoundCells supplied) shows ONLY their own finds — everyone
            // races their own copy, so a reveal/find never appears on another player's board.
            // The host watch board (no myFoundCells) shows every player's finds by owner colour.
            const baseBg = myFoundCells
              ? iFound
                ? withAlpha(WORD_SEARCH_MY_CELL_COLOR, '55')
                : undefined
              : owner
                ? withAlpha(owner === myPlayerId ? WORD_SEARCH_MY_CELL_COLOR : (playerColors[owner] ?? wordSearchPlayerColor(0)), '55')
                : undefined
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
    // Stretch to the full cell width and centre the glyph. Without an explicit width the
    // heavy-weight lone "I" (the narrowest glyph) measures too narrow on the New Architecture
    // and gets clipped to nothing — the same "I" renders fine inside a multi-letter string.
    letter: { color: theme.text, fontWeight: '800', alignSelf: 'stretch', textAlign: 'center' },
  })
