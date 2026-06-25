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

/** Nearest cell under the pointer — works across gaps for diagonal drags. */
function cellIndexFromPoint(x: number, y: number, gridRoot: HTMLElement | null): number | null {
  if (!gridRoot) return null

  const innerGrid = gridRoot.querySelector('[data-word-hunt-cells]')
  if (!innerGrid) return null

  const cells = innerGrid.querySelectorAll<HTMLElement>('[data-word-hunt-cell]')
  if (!cells.length) return null

  let bestIndex: number | null = null
  let bestDist = Infinity

  for (const cell of cells) {
    const raw = cell.getAttribute('data-word-hunt-cell')
    if (raw == null) continue
    const index = Number(raw)
    if (!Number.isFinite(index)) continue

    const rect = cell.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = x - cx
    const dy = y - cy
    const dist = Math.hypot(dx, dy)
    const pad = Math.min(rect.width, rect.height) * 0.42
    if (
      Math.abs(dx) <= rect.width / 2 + pad &&
      Math.abs(dy) <= rect.height / 2 + pad &&
      dist < bestDist
    ) {
      bestDist = dist
      bestIndex = index
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
  const optionsRef = useRef(options)
  optionsRef.current = options

  const applyCell = useCallback(
    (index: number) => {
      if (disabled) return
      if (lastCellRef.current === index) return

      const current = selectedPathRef.current
      const { grid, validPrefixes } = optionsRef.current ?? {}

      const existingIdx = current.indexOf(index)
      if (existingIdx >= 0) {
        if (draggingRef.current && movedRef.current) return
        if (existingIdx === current.length - 1) {
          const next = current.slice(0, -1)
          onPathChange(next)
          lastCellRef.current = next.length > 0 ? next[next.length - 1]! : null
        } else {
          onPathChange(current.slice(0, existingIdx + 1))
          lastCellRef.current = index
        }
        return
      }

      if (current.length === 0) {
        if (!canStartCell(grid, validPrefixes, index)) return
        onPathChange([index])
        lastCellRef.current = index
        return
      }

      const last = current[current.length - 1]

      if (!areWordHuntCellsAdjacent(last, index)) {
        if (!canStartCell(grid, validPrefixes, index)) return
        onPathChange([index])
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

      onPathChange([...current, index])
      lastCellRef.current = index
    },
    [disabled, onPathChange]
  )

  const endStroke = useCallback(
    (target: HTMLElement, pointerId: number) => {
      const path = selectedPathRef.current
      const wasDrag = movedRef.current
      draggingRef.current = false
      movedRef.current = false
      lastCellRef.current = null
      activePointerRef.current = null
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId)
      }
      if (path.length >= WORD_HUNT_MIN_WORD_LENGTH && onStrokeEnd) {
        onStrokeEnd([...path])
      }
      // Only drags reset the path — taps keep letters selected for the next tap.
      if (wasDrag && path.length > 0) {
        onPathChange([])
      }
    },
    [onPathChange, onStrokeEnd]
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
      const index = cellIndexFromPoint(e.clientX, e.clientY, gridRef.current)
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
      const index = cellIndexFromPoint(e.clientX, e.clientY, gridRef.current)
      if (index !== null) applyCell(index)
    },
    [applyCell, disabled]
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerRef.current !== e.pointerId) return
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
