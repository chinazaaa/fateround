import type { QuickDrawDrawingStrokeData, QuickDrawStroke } from './types'

export const QUICK_DRAW_CANVAS_WIDTH = 400
export const QUICK_DRAW_CANVAS_HEIGHT = 280
export const QUICK_DRAW_MAX_STROKES = 200
export const QUICK_DRAW_MAX_POINTS_PER_STROKE = 500

export const QUICK_DRAW_COLORS = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6'] as const

export function emptyStrokeData(): QuickDrawDrawingStrokeData {
  return { width: QUICK_DRAW_CANVAS_WIDTH, height: QUICK_DRAW_CANVAS_HEIGHT, strokes: [] }
}

export function normalizeStrokeData(raw: unknown): QuickDrawDrawingStrokeData {
  if (!raw || typeof raw !== 'object') return emptyStrokeData()
  const data = raw as Record<string, unknown>
  const width = typeof data.width === 'number' ? data.width : QUICK_DRAW_CANVAS_WIDTH
  const height = typeof data.height === 'number' ? data.height : QUICK_DRAW_CANVAS_HEIGHT
  if (!Array.isArray(data.strokes)) return { width, height, strokes: [] }

  const strokes: QuickDrawStroke[] = []
  for (const stroke of data.strokes.slice(0, QUICK_DRAW_MAX_STROKES)) {
    if (!stroke || typeof stroke !== 'object') continue
    const s = stroke as Record<string, unknown>
    if (!Array.isArray(s.points)) continue
    const points: [number, number][] = []
    for (const pt of s.points.slice(0, QUICK_DRAW_MAX_POINTS_PER_STROKE)) {
      if (!Array.isArray(pt) || pt.length < 2) continue
      const x = Number(pt[0])
      const y = Number(pt[1])
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      points.push([x, y])
    }
    if (points.length < 2) continue
    strokes.push({
      color: typeof s.color === 'string' ? s.color.slice(0, 20) : '#000000',
      width: typeof s.width === 'number' ? Math.min(Math.max(s.width, 1), 20) : 3,
      points,
      ...(s.tool === 'eraser' ? { tool: 'eraser' as const } : {}),
    })
  }
  return { width, height, strokes }
}

export function strokeToSvgPath(stroke: QuickDrawStroke): string {
  if (stroke.points.length < 2) return ''
  const [first, ...rest] = stroke.points
  let d = `M ${first![0]} ${first![1]}`
  for (const [x, y] of rest) d += ` L ${x} ${y}`
  return d
}

export function strokeRenderColor(stroke: QuickDrawStroke): string {
  return stroke.tool === 'eraser' ? '#ffffff' : stroke.color
}
