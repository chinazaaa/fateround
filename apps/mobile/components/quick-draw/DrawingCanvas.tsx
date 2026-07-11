import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import type { QuickDrawDrawingStrokeData, QuickDrawStroke } from '@fateround/shared'
import {
  QUICK_DRAW_CANVAS_HEIGHT,
  QUICK_DRAW_CANVAS_WIDTH,
  QUICK_DRAW_COLORS,
  emptyStrokeData,
  normalizeStrokeData,
  strokeRenderColor,
  strokeToSvgPath,
} from '@fateround/shared/quick-draw-strokes'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type DrawTool = 'pen' | 'eraser'

type BoardProps = {
  readOnly?: boolean
  strokeData?: QuickDrawDrawingStrokeData
  resetKey?: string
  onStrokeChange?: (data: QuickDrawDrawingStrokeData) => void
}

function useDrawingBoard({ readOnly = false, strokeData, resetKey, onStrokeChange }: BoardProps) {
  const [strokes, setStrokes] = useState<QuickDrawStroke[]>([])
  const [previewStroke, setPreviewStroke] = useState<QuickDrawStroke | null>(null)
  const strokesRef = useRef<QuickDrawStroke[]>([])
  const activeStrokeRef = useRef<QuickDrawStroke | null>(null)
  const [tool, setTool] = useState<DrawTool>('pen')
  const [color, setColor] = useState<string>(QUICK_DRAW_COLORS[0])
  const [brushWidth, setBrushWidth] = useState(4)
  const [layout, setLayout] = useState({ width: 1, height: 1 })

  const syncStrokes = useCallback(
    (next: QuickDrawStroke[]) => {
      strokesRef.current = next
      setStrokes(next)
      onStrokeChange?.({
        width: QUICK_DRAW_CANVAS_WIDTH,
        height: QUICK_DRAW_CANVAS_HEIGHT,
        strokes: next,
      })
    },
    [onStrokeChange]
  )

  useEffect(() => {
    if (readOnly) return
    strokesRef.current = []
    activeStrokeRef.current = null
    setStrokes([])
    setPreviewStroke(null)
  }, [readOnly, resetKey])

  useEffect(() => {
    if (!readOnly) return
    const external = normalizeStrokeData(strokeData).strokes
    strokesRef.current = external
    activeStrokeRef.current = null
    setPreviewStroke(null)
    setStrokes(external)
  }, [readOnly, strokeData])

  const toCanvasPoint = useCallback(
    (locationX: number, locationY: number): [number, number] => {
      const scaleX = QUICK_DRAW_CANVAS_WIDTH / layout.width
      const scaleY = QUICK_DRAW_CANVAS_HEIGHT / layout.height
      return [locationX * scaleX, locationY * scaleY]
    },
    [layout]
  )

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !readOnly,
        onMoveShouldSetPanResponder: () => !readOnly,
        onPanResponderGrant: (evt) => {
          if (readOnly) return
          const [x, y] = toCanvasPoint(evt.nativeEvent.locationX, evt.nativeEvent.locationY)
          const width = tool === 'eraser' ? 16 : brushWidth
          activeStrokeRef.current = {
            color: tool === 'eraser' ? '#ffffff' : color,
            width,
            points: [[x, y]],
            ...(tool === 'eraser' ? { tool: 'eraser' } : {}),
          }
        },
        onPanResponderMove: (evt) => {
          if (readOnly) return
          const active = activeStrokeRef.current
          if (!active) return
          const [x, y] = toCanvasPoint(evt.nativeEvent.locationX, evt.nativeEvent.locationY)
          activeStrokeRef.current = { ...active, points: [...active.points, [x, y]] }
          setPreviewStroke(activeStrokeRef.current)
        },
        onPanResponderRelease: () => {
          if (readOnly) return
          const active = activeStrokeRef.current
          activeStrokeRef.current = null
          setPreviewStroke(null)
          if (active && active.points.length >= 2) {
            syncStrokes([...strokesRef.current, active])
          } else {
            setStrokes([...strokesRef.current])
          }
        },
        onPanResponderTerminate: () => {
          activeStrokeRef.current = null
          setPreviewStroke(null)
          setStrokes([...strokesRef.current])
        },
      }),
    [readOnly, tool, color, brushWidth, syncStrokes, toCanvasPoint]
  )

  const displayStrokes = previewStroke ? [...strokes, previewStroke] : strokes

  return {
    layout,
    setLayout,
    panResponder,
    displayStrokes: readOnly ? strokes : displayStrokes,
    tool,
    setTool,
    color,
    setColor,
    brushWidth,
    setBrushWidth,
    undo: () => syncStrokes(strokesRef.current.slice(0, -1)),
    clear: () => syncStrokes([]),
    strokesEmpty: strokesRef.current.length === 0,
    getStrokeData: (): QuickDrawDrawingStrokeData => ({
      width: QUICK_DRAW_CANVAS_WIDTH,
      height: QUICK_DRAW_CANVAS_HEIGHT,
      strokes: strokesRef.current,
    }),
  }
}

function StrokePreview({ strokes }: { strokes: QuickDrawStroke[] }) {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${QUICK_DRAW_CANVAS_WIDTH} ${QUICK_DRAW_CANVAS_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <Rect x={0} y={0} width={QUICK_DRAW_CANVAS_WIDTH} height={QUICK_DRAW_CANVAS_HEIGHT} fill="#ffffff" />
      {strokes.map((stroke, index) => (
        <Path
          key={`${index}-${stroke.points.length}`}
          d={strokeToSvgPath(stroke)}
          stroke={strokeRenderColor(stroke)}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  )
}

function Toolbar({
  tool,
  setTool,
  color,
  setColor,
  brushWidth,
  setBrushWidth,
  onUndo,
  onClear,
  canEdit,
  strokesEmpty,
  extra,
}: {
  tool: DrawTool
  setTool: (t: DrawTool) => void
  color: string
  setColor: (c: string) => void
  brushWidth: number
  setBrushWidth: (n: number) => void
  onUndo: () => void
  onClear: () => void
  canEdit: boolean
  strokesEmpty: boolean
  extra?: React.ReactNode
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.toolbar}>
      <Pressable style={[styles.toolBtn, tool === 'pen' && styles.toolBtnActive]} disabled={!canEdit} onPress={() => setTool('pen')}>
        <Text style={styles.toolBtnText}>Pen</Text>
      </Pressable>
      <Pressable style={[styles.toolBtn, tool === 'eraser' && styles.toolBtnActive]} disabled={!canEdit} onPress={() => setTool('eraser')}>
        <Text style={styles.toolBtnText}>Eraser</Text>
      </Pressable>
      {tool === 'pen'
        ? QUICK_DRAW_COLORS.map((c) => (
            <Pressable
              key={c}
              disabled={!canEdit}
              onPress={() => setColor(c)}
              style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.colorSwatchActive]}
            />
          ))
        : null}
      {tool === 'pen' ? (
        <View style={styles.sizeRow}>
          {[2, 4, 8].map((size) => (
            <Pressable
              key={size}
              disabled={!canEdit}
              onPress={() => setBrushWidth(size)}
              style={[styles.sizeBtn, brushWidth === size && styles.toolBtnActive]}
            >
              <Text style={styles.toolBtnText}>{size === 2 ? 'Thin' : size === 4 ? 'Med' : 'Thick'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pressable style={styles.toolBtn} disabled={!canEdit || strokesEmpty} onPress={onUndo}>
        <Text style={styles.toolBtnText}>Undo</Text>
      </Pressable>
      <Pressable style={styles.toolBtn} disabled={!canEdit || strokesEmpty} onPress={onClear}>
        <Text style={styles.toolBtnText}>Clear</Text>
      </Pressable>
      {extra}
    </View>
  )
}

export function DrawingPreview({ strokeData }: { strokeData: QuickDrawDrawingStrokeData }) {
  const styles = useThemedStyles(makeStyles)
  const data = normalizeStrokeData(strokeData)
  return (
    <View style={styles.preview}>
      <StrokePreview strokes={data.strokes} />
    </View>
  )
}

export function DrawingCanvas({
  prompt,
  onSubmit,
  submitting = false,
}: {
  prompt: string
  onSubmit: (data: QuickDrawDrawingStrokeData) => void | Promise<void>
  submitting?: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  const board = useDrawingBoard({})

  return (
    <View style={styles.wrap}>
      <Text style={styles.prompt}>
        Draw: <Text style={styles.promptWord}>{prompt}</Text>
      </Text>
      <View
        style={styles.canvasWrap}
        onLayout={(e: LayoutChangeEvent) => {
          const { width, height } = e.nativeEvent.layout
          board.setLayout({ width, height })
        }}
        {...board.panResponder.panHandlers}
      >
        <StrokePreview strokes={board.displayStrokes} />
      </View>
      <Toolbar
        tool={board.tool}
        setTool={board.setTool}
        color={board.color}
        setColor={board.setColor}
        brushWidth={board.brushWidth}
        setBrushWidth={board.setBrushWidth}
        onUndo={board.undo}
        onClear={board.clear}
        canEdit={!submitting}
        strokesEmpty={board.strokesEmpty}
      />
      <Pressable
        style={[styles.submitBtn, (submitting || board.strokesEmpty) && styles.btnDisabled]}
        disabled={submitting || board.strokesEmpty}
        onPress={() => void onSubmit(board.getStrokeData())}
      >
        <Text style={styles.submitText}>{submitting ? 'Submitting…' : 'Submit drawing'}</Text>
      </Pressable>
    </View>
  )
}

export function LiveDrawingCanvas({
  prompt,
  strokeData,
  readOnly = false,
  onStrokeChange,
  onSkip,
  skipDisabled,
  resetKey,
}: {
  prompt?: string
  strokeData?: QuickDrawDrawingStrokeData
  readOnly?: boolean
  onStrokeChange?: (data: QuickDrawDrawingStrokeData) => void
  onSkip?: () => void
  skipDisabled?: boolean
  resetKey?: string
}) {
  const styles = useThemedStyles(makeStyles)
  const board = useDrawingBoard({ readOnly, strokeData: strokeData ?? emptyStrokeData(), resetKey, onStrokeChange })
  const data = readOnly ? normalizeStrokeData(strokeData) : null

  return (
    <View style={styles.wrap}>
      {prompt ? (
        <Text style={styles.prompt}>
          Draw: <Text style={styles.promptWord}>{prompt}</Text>
        </Text>
      ) : null}
      <View
        style={styles.canvasWrap}
        onLayout={(e: LayoutChangeEvent) => {
          const { width, height } = e.nativeEvent.layout
          board.setLayout({ width, height })
        }}
        {...(readOnly ? {} : board.panResponder.panHandlers)}
      >
        <StrokePreview strokes={readOnly ? (data?.strokes ?? []) : board.displayStrokes} />
      </View>
      {!readOnly ? (
        <Toolbar
          tool={board.tool}
          setTool={board.setTool}
          color={board.color}
          setColor={board.setColor}
          brushWidth={board.brushWidth}
          setBrushWidth={board.setBrushWidth}
          onUndo={board.undo}
          onClear={board.clear}
          canEdit
          strokesEmpty={board.strokesEmpty}
          extra={
            onSkip ? (
              <Pressable style={styles.toolBtn} disabled={skipDisabled} onPress={onSkip}>
                <Text style={styles.toolBtnText}>Skip</Text>
              </Pressable>
            ) : undefined
          }
        />
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { gap: 12 },
  prompt: { color: theme.textMuted, fontSize: 14, textAlign: 'center' },
  promptWord: { color: theme.text, fontWeight: '700' },
  canvasWrap: {
    aspectRatio: QUICK_DRAW_CANVAS_WIDTH / QUICK_DRAW_CANVAS_HEIGHT,
    borderRadius: 14,
    borderWidth: 2,
    // Purple accent frame + white drawing surface — functional, fixed.
    borderColor: '#7c3aed55',
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  preview: {
    aspectRatio: QUICK_DRAW_CANVAS_WIDTH / QUICK_DRAW_CANVAS_HEIGHT,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    // White drawing surface — functional, fixed.
    backgroundColor: '#fff',
  },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  toolBtn: {
    backgroundColor: theme.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  toolBtnActive: { borderColor: '#a78bfa' },
  toolBtnText: { color: theme.text, fontSize: 13, fontWeight: '600' },
  colorSwatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  // White selection ring around the active swatch — functional.
  colorSwatchActive: { borderColor: '#fff' },
  sizeRow: { flexDirection: 'row', gap: 6 },
  sizeBtn: {
    backgroundColor: theme.surface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  submitBtn: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  // White on the solid rose button — correct in both schemes.
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
})
