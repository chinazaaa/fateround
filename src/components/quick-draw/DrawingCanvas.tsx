'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { QuickDrawDrawingStrokeData, QuickDrawStroke } from '@/types'

const COLORS = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6'] as const
const DEFAULT_WIDTH = 400
const DEFAULT_HEIGHT = 280
const ERASER_WIDTH = 16

type DrawTool = 'pen' | 'eraser'

function applyStrokeStyle(ctx: CanvasRenderingContext2D, stroke: QuickDrawStroke) {
  const isEraser = stroke.tool === 'eraser'
  ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over'
  ctx.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : stroke.color
  ctx.lineWidth = stroke.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

function drawStrokePath(ctx: CanvasRenderingContext2D, stroke: QuickDrawStroke) {
  if (stroke.points.length < 2) return
  applyStrokeStyle(ctx, stroke)
  ctx.beginPath()
  const [firstX, firstY] = stroke.points[0]!
  ctx.moveTo(firstX, firstY)
  for (let i = 1; i < stroke.points.length; i += 1) {
    const [x, y] = stroke.points[i]!
    ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.globalCompositeOperation = 'source-over'
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: QuickDrawStroke[], width: number, height: number) {
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  for (const stroke of strokes) {
    drawStrokePath(ctx, stroke)
  }
}

export function renderDrawingToCanvas(canvas: HTMLCanvasElement, data: QuickDrawDrawingStrokeData) {
  const width = data.width || DEFAULT_WIDTH
  const height = data.height || DEFAULT_HEIGHT
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  drawStrokes(ctx, data.strokes, width, height)
}

export function DrawingPreview({
  strokeData,
  className = '',
}: {
  strokeData: QuickDrawDrawingStrokeData
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    renderDrawingToCanvas(canvas, strokeData)
  }, [strokeData])

  return (
    <canvas
      ref={canvasRef}
      className={`w-full rounded-xl border border-white/10 bg-white ${className}`}
      style={{ aspectRatio: `${strokeData.width || DEFAULT_WIDTH} / ${strokeData.height || DEFAULT_HEIGHT}` }}
    />
  )
}

type DrawingBoardOptions = {
  readOnly?: boolean
  submitting?: boolean
  strokeData?: QuickDrawDrawingStrokeData
  resetKey?: string
  onStrokeChange?: (data: QuickDrawDrawingStrokeData) => void
}

function useDrawingBoard({
  readOnly = false,
  submitting = false,
  strokeData,
  resetKey,
  onStrokeChange,
}: DrawingBoardOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<QuickDrawStroke[]>([])
  const activeStrokeRef = useRef<QuickDrawStroke | null>(null)
  const drawingRef = useRef(false)
  const [strokes, setStrokes] = useState<QuickDrawStroke[]>([])
  const [tool, setTool] = useState<DrawTool>('pen')
  const [color, setColor] = useState<string>(COLORS[0])
  const [brushWidth, setBrushWidth] = useState(4)

  const syncStrokes = useCallback(
    (next: QuickDrawStroke[]) => {
      strokesRef.current = next
      setStrokes(next)
      onStrokeChange?.({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, strokes: next })
    },
    [onStrokeChange]
  )

  const fullRedraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const all = activeStrokeRef.current ? [...strokesRef.current, activeStrokeRef.current] : strokesRef.current
    drawStrokes(ctx, all, DEFAULT_WIDTH, DEFAULT_HEIGHT)
  }, [])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (canvas.width !== DEFAULT_WIDTH) canvas.width = DEFAULT_WIDTH
    if (canvas.height !== DEFAULT_HEIGHT) canvas.height = DEFAULT_HEIGHT
    fullRedraw()
  }, [fullRedraw])

  useEffect(() => {
    if (readOnly) return
    strokesRef.current = []
    activeStrokeRef.current = null
    setStrokes([])
    fullRedraw()
  }, [readOnly, resetKey, fullRedraw])

  useEffect(() => {
    if (!readOnly) return
    const external = strokeData?.strokes ?? []
    strokesRef.current = external
    activeStrokeRef.current = null
    setStrokes(external)
    fullRedraw()
  }, [readOnly, strokeData, fullRedraw])

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY]
  }

  const appendPointToCanvas = (stroke: QuickDrawStroke, point: [number, number]) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const prev = stroke.points[stroke.points.length - 1]
    if (!prev) return
    applyStrokeStyle(ctx, stroke)
    ctx.beginPath()
    ctx.moveTo(prev[0], prev[1])
    ctx.lineTo(point[0], point[1])
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }

  const startStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || submitting) return
    e.preventDefault()
    drawingRef.current = true
    canvasRef.current?.setPointerCapture(e.pointerId)
    const [x, y] = pointerPos(e)
    const width = tool === 'eraser' ? ERASER_WIDTH : brushWidth
    const next: QuickDrawStroke = {
      color: tool === 'eraser' ? '#ffffff' : color,
      width,
      points: [[x, y]],
      ...(tool === 'eraser' ? { tool: 'eraser' } : {}),
    }
    activeStrokeRef.current = next
  }

  const extendStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || submitting || !drawingRef.current) return
    e.preventDefault()
    const active = activeStrokeRef.current
    if (!active) return
    const [x, y] = pointerPos(e)
    const point: [number, number] = [x, y]
    appendPointToCanvas(active, point)
    activeStrokeRef.current = { ...active, points: [...active.points, point] }
  }

  const finishStroke = () => {
    if (!drawingRef.current || readOnly || submitting) return
    drawingRef.current = false
    const active = activeStrokeRef.current
    activeStrokeRef.current = null
    if (active && active.points.length >= 2) {
      syncStrokes([...strokesRef.current, active])
    } else {
      fullRedraw()
    }
  }

  const undo = () => {
    if (readOnly || submitting) return
    syncStrokes(strokesRef.current.slice(0, -1))
    requestAnimationFrame(fullRedraw)
  }

  const clear = () => {
    if (readOnly || submitting) return
    syncStrokes([])
    requestAnimationFrame(fullRedraw)
  }

  const getStrokeData = (): QuickDrawDrawingStrokeData => ({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    strokes: strokesRef.current,
  })

  return {
    canvasRef,
    strokes,
    tool,
    setTool,
    color,
    setColor,
    brushWidth,
    setBrushWidth,
    startStroke,
    extendStroke,
    finishStroke,
    undo,
    clear,
    getStrokeData,
  }
}

function DrawingToolbar({
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setTool('pen')}
        disabled={!canEdit}
        className={`btn-secondary text-sm ${tool === 'pen' ? 'ring-2 ring-violet-400' : ''}`}
        aria-pressed={tool === 'pen'}
      >
        Pen
      </button>
      <button
        type="button"
        onClick={() => setTool('eraser')}
        disabled={!canEdit}
        className={`btn-secondary text-sm ${tool === 'eraser' ? 'ring-2 ring-violet-400' : ''}`}
        aria-pressed={tool === 'eraser'}
      >
        Eraser
      </button>
      {tool === 'pen' &&
        COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            disabled={!canEdit}
            onClick={() => setColor(c)}
            className={`h-8 w-8 rounded-full border-2 ${color === c ? 'border-white scale-110' : 'border-transparent'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      {tool === 'pen' && (
        <select
          value={brushWidth}
          onChange={(e) => setBrushWidth(Number(e.target.value))}
          disabled={!canEdit}
          className="input-field text-sm py-1"
          aria-label="Brush size"
        >
          <option value={2}>Thin</option>
          <option value={4}>Medium</option>
          <option value={8}>Thick</option>
        </select>
      )}
      <button type="button" onClick={onUndo} disabled={!canEdit || strokesEmpty} className="btn-secondary text-sm">
        Undo
      </button>
      <button type="button" onClick={onClear} disabled={!canEdit || strokesEmpty} className="btn-secondary text-sm">
        Clear
      </button>
      {extra}
    </div>
  )
}

export function DrawingCanvas({
  onSubmit,
  submitting = false,
  prompt,
}: {
  onSubmit: (data: QuickDrawDrawingStrokeData) => void | Promise<void>
  submitting?: boolean
  prompt: string
}) {
  const board = useDrawingBoard({ submitting })

  const handleSubmit = () => {
    const data = board.getStrokeData()
    if (data.strokes.length === 0 || submitting) return
    onSubmit(data)
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-sm text-faint leading-relaxed">
        Draw: <span className="text-bright font-medium">{prompt}</span>
      </p>
      <canvas
        ref={board.canvasRef}
        className="w-full touch-none rounded-xl border-2 border-violet-500/30 bg-white cursor-crosshair"
        style={{ aspectRatio: `${DEFAULT_WIDTH} / ${DEFAULT_HEIGHT}`, touchAction: 'none' }}
        onPointerDown={board.startStroke}
        onPointerMove={board.extendStroke}
        onPointerUp={board.finishStroke}
        onPointerCancel={board.finishStroke}
        onPointerLeave={board.finishStroke}
      />
      <DrawingToolbar
        tool={board.tool}
        setTool={board.setTool}
        color={board.color}
        setColor={board.setColor}
        brushWidth={board.brushWidth}
        setBrushWidth={board.setBrushWidth}
        onUndo={board.undo}
        onClear={board.clear}
        canEdit={!submitting}
        strokesEmpty={board.strokes.length === 0}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={board.strokes.length === 0 || submitting}
        className="btn-primary w-full"
      >
        {submitting ? 'Submitting…' : 'Submit drawing'}
      </button>
    </div>
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
  const board = useDrawingBoard({ readOnly, strokeData, resetKey, onStrokeChange })

  return (
    <div className="space-y-3">
      {prompt && (
        <p className="text-center text-sm text-faint leading-relaxed">
          Draw: <span className="text-bright font-medium">{prompt}</span>
        </p>
      )}
      <canvas
        ref={board.canvasRef}
        className={`w-full touch-none rounded-xl border-2 border-violet-500/30 bg-white ${
          readOnly ? 'cursor-default' : 'cursor-crosshair'
        }`}
        style={{ aspectRatio: `${DEFAULT_WIDTH} / ${DEFAULT_HEIGHT}`, touchAction: 'none' }}
        onPointerDown={board.startStroke}
        onPointerMove={board.extendStroke}
        onPointerUp={board.finishStroke}
        onPointerCancel={board.finishStroke}
        onPointerLeave={board.finishStroke}
      />
      {!readOnly && (
        <DrawingToolbar
          tool={board.tool}
          setTool={board.setTool}
          color={board.color}
          setColor={board.setColor}
          brushWidth={board.brushWidth}
          setBrushWidth={board.setBrushWidth}
          onUndo={board.undo}
          onClear={board.clear}
          canEdit
          strokesEmpty={board.strokes.length === 0}
          extra={
            onSkip ? (
              <button type="button" onClick={onSkip} disabled={skipDisabled} className="btn-secondary text-sm ml-auto">
                Skip word
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  )
}
