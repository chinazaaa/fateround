'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { rowColToIndex } from '@/lib/word-hunt'
import { useWordHuntGridInteraction } from '@/hooks/useWordHuntGridInteraction'

type Props = {
  grid: string[][]
  selectedPath: number[]
  onPathChange: (path: number[]) => void
  onStrokeEnd?: (path: number[]) => void
  disabled?: boolean
  variant?: 'play' | 'host'
}

export function WordHuntGrid({
  grid,
  selectedPath,
  onPathChange,
  onStrokeEnd,
  disabled = false,
  variant = 'play',
}: Props) {
  const cellRefs = useRef<(HTMLDivElement | null)[]>([])
  const [linePoints, setLinePoints] = useState<{ x: number; y: number }[]>([])
  const { gridRef, gridHandlers } = useWordHuntGridInteraction(
    selectedPath,
    onPathChange,
    disabled,
    onStrokeEnd
  )

  useLayoutEffect(() => {
    const root = gridRef.current
    if (!root || selectedPath.length < 2) {
      setLinePoints([])
      return
    }

    function updateLine() {
      const container = gridRef.current
      if (!container || selectedPath.length < 2) {
        setLinePoints([])
        return
      }
      const rootRect = container.getBoundingClientRect()
      const points = selectedPath
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
  }, [grid, gridRef, selectedPath])

  const frameClass =
    variant === 'play'
      ? 'surface-inset rounded-2xl p-2.5 sm:p-3 ring-1 ring-[color-mix(in_srgb,var(--primary)_12%,transparent)]'
      : 'rounded-2xl p-3 border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_5%,var(--card-strong))] shadow-[var(--card-shadow)]'

  const cellBase =
    variant === 'play'
      ? 'aspect-square rounded-xl font-black text-lg sm:text-2xl flex items-center justify-center select-none transition-[transform,box-shadow,background-color] duration-100'
      : 'aspect-square rounded-lg font-black text-xl sm:text-2xl flex items-center justify-center select-none transition-all duration-100'

  const showPathLine = variant === 'play' && linePoints.length >= 2

  return (
    <div
      ref={gridRef}
      className={[frameClass, 'touch-none relative'].join(' ')}
      style={{ touchAction: 'none' }}
      {...gridHandlers}
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
            const inPath = selectedPath.includes(index)
            const pathOrder = selectedPath.indexOf(index)
            return (
              <div
                key={index}
                ref={(el) => {
                  cellRefs.current[index] = el
                }}
                data-word-hunt-cell={index}
                aria-disabled={disabled}
                className={[
                  cellBase,
                  inPath
                    ? 'bg-[color-mix(in_srgb,var(--primary)_72%,#22c55e)] text-white shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_55%,#16a34a),0_8px_20px_-6px_color-mix(in_srgb,var(--primary)_45%,transparent)] scale-[1.04] z-[1]'
                    : variant === 'play'
                      ? 'bg-[var(--card-strong)] text-[var(--foreground)] border border-[var(--border-strong)] shadow-[var(--card-shadow)]'
                      : 'bg-[var(--card-strong)] text-[var(--foreground)] border border-[var(--border-strong)] shadow-[var(--card-shadow)]',
                  disabled ? 'opacity-50' : '',
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
                  {inPath && pathOrder >= 0 && variant !== 'play' && (
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
