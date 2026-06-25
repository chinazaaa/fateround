'use client'

import { useCallback, useRef } from 'react'
import { WORD_HUNT_MIN_WORD_LENGTH } from '@/lib/word-hunt'

function cellIndexFromPoint(x: number, y: number, gridRoot: HTMLElement | null): number | null {
  if (!gridRoot) return null
  const el = document.elementFromPoint(x, y)
  const cell = el?.closest('[data-word-hunt-cell]')
  if (!cell || !gridRoot.contains(cell)) return null
  const raw = cell.getAttribute('data-word-hunt-cell')
  if (raw == null) return null
  const index = Number(raw)
  return Number.isFinite(index) ? index : null
}

export function useWordHuntGridInteraction(
  selectedPath: number[],
  onPathChange: (path: number[]) => void,
  disabled: boolean,
  onStrokeEnd?: (path: number[]) => void
) {
  const gridRef = useRef<HTMLDivElement>(null)
  const selectedPathRef = useRef(selectedPath)
  selectedPathRef.current = selectedPath
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const lastCellRef = useRef<number | null>(null)
  const activePointerRef = useRef<number | null>(null)

  const applyCell = useCallback(
    (index: number, fromMove: boolean) => {
      if (disabled) return
      if (lastCellRef.current === index) return

      const current = selectedPathRef.current
      const existingIdx = current.indexOf(index)

      if (existingIdx >= 0) {
        if (!fromMove && existingIdx === current.length - 1) {
          onPathChange(current.slice(0, -1))
          lastCellRef.current = index
        } else if (fromMove && existingIdx === current.length - 2) {
          onPathChange(current.slice(0, -1))
          lastCellRef.current = index
        }
        return
      }

      if (current.length === 0) {
        onPathChange([index])
        lastCellRef.current = index
        return
      }

      const last = current[current.length - 1]
      const [lr, lc] = [Math.floor(last / 4), last % 4]
      const [r, c] = [Math.floor(index / 4), index % 4]
      if (Math.abs(lr - r) <= 1 && Math.abs(lc - c) <= 1) {
        onPathChange([...current, index])
        lastCellRef.current = index
      }
    },
    [disabled, onPathChange]
  )

  const endStroke = useCallback(
    (target: HTMLElement, pointerId: number) => {
      const path = selectedPathRef.current
      const didMove = movedRef.current
      draggingRef.current = false
      movedRef.current = false
      lastCellRef.current = null
      activePointerRef.current = null
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId)
      }
      if (didMove && path.length >= WORD_HUNT_MIN_WORD_LENGTH && onStrokeEnd) {
        onStrokeEnd([...path])
      }
    },
    [onStrokeEnd]
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || e.button !== 0) return
      e.preventDefault()
      draggingRef.current = true
      movedRef.current = false
      lastCellRef.current = null
      activePointerRef.current = e.pointerId
      e.currentTarget.setPointerCapture(e.pointerId)
      const index = cellIndexFromPoint(e.clientX, e.clientY, gridRef.current)
      if (index !== null) applyCell(index, false)
    },
    [applyCell, disabled]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || disabled || activePointerRef.current !== e.pointerId) return
      e.preventDefault()
      movedRef.current = true
      const index = cellIndexFromPoint(e.clientX, e.clientY, gridRef.current)
      if (index !== null) applyCell(index, true)
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
