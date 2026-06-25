'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { rowColToIndex } from '@/lib/word-hunt'
import { useWordHuntGridInteraction } from '@/hooks/useWordHuntGridInteraction'

type Props = {
  grid: string[][]
  selectedPath?: number[]
  highlightPath?: number[]
  onPathChange?: (path: number[]) => void
  onStrokeEnd?: (path: number[]) => void
  disabled?: boolean
  variant?: 'play' | 'host' | 'review'
  validPrefixes?: ReadonlySet<string>
}

export function WordHuntGrid({
  grid,
  selectedPath = [],
  highlightPath = [],
  onPathChange = () => {},
  onStrokeEnd,
  disabled = false,
  variant = 'play',
  validPrefixes,
}: Props) {
  const cellRefs = useRef<(HTMLDivElement | null)[]>([])
  const [linePoints, setLinePoints] = useState<{ x: number; y: number }[]>([])
  const isReview = variant === 'review'
  const interactionDisabled = disabled || isReview

  const interactionOptions = useMemo(
    () => (validPrefixes ? { grid, validPrefixes } : undefined),
    [grid, validPrefixes]
  )

  const { gridRef, gridHandlers } = useWordHuntGridInteraction(
    selectedPath,
    onPathChange,
    interactionDisabled,
    onStrokeEnd,
    interactionOptions
  )

  const displayPath = isReview ? highlightPath : selectedPath

  useLayoutEffect(() => {
    const root = gridRef.current
    if (!root || displayPath.length < 2) {
      setLinePoints([])
      return
    }

    function updateLine() {
      const container = gridRef.current
      if (!container || displayPath.length < 2) {
        setLinePoints([])
        return
      }
      const rootRect = container.getBoundingClientRect()
      const points = displayPath
        .map((index) => {
          const el = cellRefs.current[index]
          if (!el) return null
          const rect = el.getBoundingClientRect()
          return {
            x: rect.left + rect.width / 2 - rootRect.left,
            y: rect.top + rect.height / 2 - rootRect.top,
          }
        })
        .filter((point): point is { x: number; y: number } => point !== null)
      setLinePoints(points)
    }

    updateLine()
    const observer = new ResizeObserver(updateLine)
    observer.observe(root)
    return () => observer.disconnect()
  }, [displayPath, grid, gridRef])

  const frameClass =
    variant === 'play'
      ? 'surface-inset rounded-2xl p-2.5 sm:p-3 ring-1 ring-[color-mix(in_srgb,var(--primary)_12%,transparent)]'
      : 'rounded-2xl p-3 border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_5%,var(--card-strong))] shadow-[var(--card-shadow)]'

  const cellBase =
    variant === 'play'
      ? 'aspect-square rounded-xl font-black text-lg sm:text-2xl flex items-center justify-center select-none transition-[transform,box-shadow,background-color] duration-100'
      : 'aspect-square rounded-lg font-black text-xl sm:text-2xl flex items-center justify-center select-none transition-all duration-100'

  const showPathLine = linePoints.length >= 2

  return (
    <div
      ref={gridRef}
      className={[frameClass, 'touch-none relative', isReview ? '' : ''].join(' ')}
      style={{ touchAction: isReview ? undefined : 'none' }}
      {...(isReview ? {} : gridHandlers)}
    >
      {showPathLine && (
        <svg
          className="absolute inset-0 pointer-events-none z-[2]"
          width="100%"
          height="100%"
          aria-hidden
        >
          <polyline
            points={linePoints.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke="white"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          />
        </svg>
      )}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 relative z-[1]">
        {grid.map((row, r) =>
          row.map((letter, c) => {
            const index = rowColToIndex(r, c)
            const inPath = displayPath.includes(index)
            const pathOrder = displayPath.indexOf(index)
            return (
              <div
                key={index}
                ref={(el) => {
                  cellRefs.current[index] = el
                }}
                data-word-hunt-cell={isReview ? undefined : index}
                aria-disabled={interactionDisabled}
                className={[
                  cellBase,
                  inPath
                    ? 'bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-strong)_100%)] text-white shadow-[0_0_0_2px_var(--primary),0_8px_20px_-6px_var(--primary-glow)] scale-[1.04] z-[1]'
                    : variant === 'play'
                      ? 'bg-[var(--card-strong)] text-[var(--foreground)] border border-[var(--border-strong)] shadow-[var(--card-shadow)]'
                      : 'bg-[var(--card-strong)] text-[var(--foreground)] border border-[var(--border-strong)] shadow-[var(--card-shadow)]',
                  interactionDisabled && !isReview ? 'opacity-50' : '',
                ].join(' ')}
                style={
                  inPath
                    ? undefined
                    : {
                        backgroundImage:
                          'linear-gradient(145deg, color-mix(in srgb, var(--primary) 4%, transparent) 0%, transparent 55%)',
                      }
                }
              >
                <span className="relative pointer-events-none">
                  {letter}
                  {inPath && pathOrder >= 0 && variant === 'host' && (
                    <span className="absolute -top-2.5 -right-3 text-[8px] font-black text-[var(--marry)]">
                      {pathOrder + 1}
                    </span>
                  )}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
