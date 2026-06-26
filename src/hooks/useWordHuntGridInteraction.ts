'use client'

import { useCallback, useRef } from 'react'
import {
  WORD_HUNT_MIN_WORD_LENGTH,
  areWordHuntCellsAdjacent,
  wordFromPath,
} from '@/lib/word-hunt'
import { canExtendWordHuntPath } from '@/lib/word-hunt-client'

/** Pixels before a pointer sequence counts as a drag (not a tap). */
const DRAG_THRESHOLD_PX = 10

type CellRect = { index: number; left: number; top: number; width: number; height: number }

/**
 * Snapshot every cell's geometry once at the start of a stroke. Reusing this for
 * the whole drag avoids calling getBoundingClientRect on all 16 cells on every
 * pointer move (forced layout reflow), which is the main source of drag jank.
 * Safe because the grid can't scroll/resize mid-stroke (touch-action: none).
 */
function snapshotCellRects(gridRoot: HTMLElement | null): CellRect[] {
  if (!gridRoot) return []
  const innerGrid = gridRoot.querySelector('[data-word-hunt-cells]')
  if (!innerGrid) return []
  const cells = innerGrid.querySelectorAll<HTMLElement>('[data-word-hunt-cell]')
  const out: CellRect[] = []
  cells.forEach((cell) => {
    const index = Number(cell.getAttribute('data-word-hunt-cell'))
    if (!Number.isFinite(index)) return
    const rect = cell.getBoundingClientRect()
    out.push({ index, left: rect.left, top: rect.top, width: rect.width, height: rect.height })
  })
  return out
}

/**
 * Cell under the pointer.
 * - `strict` (during a drag): only the cell whose central core contains the
 *   point. The gaps and outer edges are dead zones, so a diagonal drag moves
 *   cleanly from one cell's core to the next without grabbing the orthogonal
 *   neighbour it passes near.
 * - lenient (initial tap/press): nearest cell within a padded box, so a tap
 *   anywhere on or near a cell still selects it.
 */
function cellAtPoint(rects: CellRect[], x: number, y: number, strict: boolean): number | null {
  let bestIndex: number | null = null
  let bestDist = Infinity
  for (const { index, left, top, width, height } of rects) {
    const halfW = width / 2
    const halfH = height / 2
    const dx = x - (left + halfW)
    const dy = y - (top + halfH)
    const pad = Math.min(width, height) * 0.42
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

type GridInteractionOptions = {
  grid?: string[][]
  validPrefixes?: ReadonlySet<string>
}

function canStartCell(
  grid: string[][] | undefined,
  validPrefixes: ReadonlySet<string> | undefined,
  index: number
): boolean {
  if (!grid || !validPrefixes || validPrefixes.size === 0) return true
  return validPrefixes.has(wordFromPath(grid, [index]))
}

export function useWordHuntGridInteraction(
  selectedPath: number[],
  onPathChange: (path: number[]) => void,
  disabled: boolean,
  onStrokeEnd?: (path: number[]) => void,
  options?: GridInteractionOptions
) {
  const gridRef = useRef<HTMLDivElement>(null)
  const selectedPathRef = useRef(selectedPath)
  selectedPathRef.current = selectedPath
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const lastCellRef = useRef<number | null>(null)
  const activePointerRef = useRef<number | null>(null)
  const pointerStartRef = useRef({ x: 0, y: 0 })
  const cellRectsRef = useRef<CellRect[]>([])
  const optionsRef = useRef(options)
  optionsRef.current = options

  const commitPath = useCallback(
    (path: number[]) => {
      selectedPathRef.current = path
      onPathChange(path)
    },
    [onPathChange]
  )

  const applyCell = useCallback(
    (index: number) => {
      if (disabled) return
      if (lastCellRef.current === index) return

      const current = selectedPathRef.current
      const { grid, validPrefixes } = optionsRef.current ?? {}

      if (current.includes(index)) return

      if (current.length === 0) {
        if (!canStartCell(grid, validPrefixes, index)) return
        commitPath([index])
        lastCellRef.current = index
        return
      }

      const last = current[current.length - 1]

      if (!areWordHuntCellsAdjacent(last, index)) {
        if (!canStartCell(grid, validPrefixes, index)) return
        commitPath([index])
        lastCellRef.current = index
        return
      }

      if (
        grid &&
        validPrefixes &&
        validPrefixes.size > 0 &&
        !canExtendWordHuntPath(grid, current, index, validPrefixes)
      ) {
        return
      }

      commitPath([...current, index])
      lastCellRef.current = index
    },
    [commitPath, disabled]
  )

  const endStroke = useCallback(
    (target: HTMLElement, pointerId: number) => {
      const path = selectedPathRef.current
      const wasDrag = movedRef.current
      draggingRef.current = false
      movedRef.current = false
      lastCellRef.current = null
      activePointerRef.current = null
      cellRectsRef.current = []
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId)
      }
      // Drags submit on release; taps keep building until the player taps Submit.
      if (wasDrag && path.length >= WORD_HUNT_MIN_WORD_LENGTH && onStrokeEnd) {
        onStrokeEnd([...path])
      }
      if (wasDrag && path.length > 0) {
        commitPath([])
      }
    },
    [commitPath, onStrokeEnd]
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || e.button !== 0) return
      e.preventDefault()
      draggingRef.current = true
      movedRef.current = false
      lastCellRef.current = null
      activePointerRef.current = e.pointerId
      pointerStartRef.current = { x: e.clientX, y: e.clientY }
      e.currentTarget.setPointerCapture(e.pointerId)
      cellRectsRef.current = snapshotCellRects(gridRef.current)
      const index = cellAtPoint(cellRectsRef.current, e.clientX, e.clientY, false)
      if (index !== null) applyCell(index)
    },
    [applyCell, disabled]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || disabled || activePointerRef.current !== e.pointerId) return
      const dist = Math.hypot(
        e.clientX - pointerStartRef.current.x,
        e.clientY - pointerStartRef.current.y
      )
      if (dist < DRAG_THRESHOLD_PX) return
      e.preventDefault()
      movedRef.current = true
      if (!cellRectsRef.current.length) cellRectsRef.current = snapshotCellRects(gridRef.current)
      const index = cellAtPoint(cellRectsRef.current, e.clientX, e.clientY, true)
      if (index !== null) applyCell(index)
    },
    [applyCell, disabled]
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerRef.current !== e.pointerId) return
      e.preventDefault()
      endStroke(e.currentTarget, e.pointerId)
    },
    [endStroke]
  )

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerRef.current !== e.pointerId) return
      endStroke(e.currentTarget, e.pointerId)
    },
    [endStroke]
  )

  return {
    gridRef,
    gridHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  }
}
