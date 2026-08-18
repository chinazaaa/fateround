'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  TROLL_RUN_INTERNAL_HEIGHT,
  TROLL_RUN_INTERNAL_WIDTH,
  TrollRunEngine,
  type EngineCallbacks,
  type TrollRunLevel,
} from '@/lib/troll-run-engine'

export interface TrollRunCanvasProps {
  levels: TrollRunLevel[]
  initialLevelIndex?: number
  onDeath?: (levelId: string, deaths: number) => void
  onLevelClear?: (levelId: string, timeMs: number, deaths: number) => void
  onAllLevelsCleared?: (totalTimeMs: number, totalDeaths: number) => void
  onStatsChange?: (stats: ReturnType<TrollRunEngine['getCurrentStats']>) => void
  showTouchControls?: boolean
  muted?: boolean
  theme?: 'dark' | 'retro' | 'neon'
  className?: string
}

export function TrollRunCanvas({
  levels,
  initialLevelIndex = 0,
  onDeath,
  onLevelClear,
  onAllLevelsCleared,
  onStatsChange,
  showTouchControls = false,
  muted = false,
  theme = 'dark',
  className = '',
}: TrollRunCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<TrollRunEngine | null>(null)
  const [activeTouch, setActiveTouch] = useState<{ left: boolean; right: boolean; jump: boolean }>({
    left: false,
    right: false,
    jump: false,
  })

  // Initialize engine on mount
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || levels.length === 0) return

    const callbacks: EngineCallbacks = {
      onDeath: (levelId, deaths) => {
        onDeath?.(levelId, deaths)
        if (engineRef.current && onStatsChange) {
          onStatsChange(engineRef.current.getCurrentStats())
        }
      },
      onLevelClear: (levelId, timeMs, deaths) => {
        onLevelClear?.(levelId, timeMs, deaths)
        if (engineRef.current && onStatsChange) {
          onStatsChange(engineRef.current.getCurrentStats())
        }
      },
      onAllLevelsCleared: (totalTimeMs, totalDeaths) => {
        onAllLevelsCleared?.(totalTimeMs, totalDeaths)
        if (engineRef.current && onStatsChange) {
          onStatsChange(engineRef.current.getCurrentStats())
        }
      },
    }

    const engine = new TrollRunEngine(levels, callbacks)
    engine.attachCanvas(canvas)
    engine.setMuted(muted)
    engine.setTheme(theme)
    engine.start(initialLevelIndex)
    engineRef.current = engine

    if (onStatsChange) {
      onStatsChange(engine.getCurrentStats())
    }

    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [levels, initialLevelIndex])

  // Sync mute state
  useEffect(() => {
    engineRef.current?.setMuted(muted)
  }, [muted])

  // Sync theme
  useEffect(() => {
    engineRef.current?.setTheme(theme)
  }, [theme])

  // Touch control helper
  const handleTouch = (control: 'left' | 'right' | 'jump', active: boolean) => {
    setActiveTouch((prev) => ({ ...prev, [control]: active }))
    engineRef.current?.setVirtualInput(control, active)
  }

  return (
    <div className={`flex flex-col items-center justify-center select-none ${className}`}>
      <div className="relative w-full max-w-[640px] aspect-[16/9] bg-slate-950 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={TROLL_RUN_INTERNAL_WIDTH}
          height={TROLL_RUN_INTERNAL_HEIGHT}
          className="w-full h-full object-contain"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      {/* On-Screen Touch Controls (Mobile/Tablet or Dev Mode) */}
      {showTouchControls && (
        <div className="w-full max-w-[640px] flex items-center justify-between mt-4 px-4 gap-4">
          <div className="flex gap-3">
            <button
              type="button"
              className={`w-16 h-16 rounded-2xl border border-slate-700 bg-slate-800/90 text-2xl font-bold flex items-center justify-center active:bg-slate-700 active:scale-95 transition-all text-white ${
                activeTouch.left ? 'bg-slate-700 ring-2 ring-sky-400' : ''
              }`}
              onPointerDown={(e) => {
                e.preventDefault()
                handleTouch('left', true)
              }}
              onPointerUp={(e) => {
                e.preventDefault()
                handleTouch('left', false)
              }}
              onPointerLeave={() => handleTouch('left', false)}
            >
              ←
            </button>
            <button
              type="button"
              className={`w-16 h-16 rounded-2xl border border-slate-700 bg-slate-800/90 text-2xl font-bold flex items-center justify-center active:bg-slate-700 active:scale-95 transition-all text-white ${
                activeTouch.right ? 'bg-slate-700 ring-2 ring-sky-400' : ''
              }`}
              onPointerDown={(e) => {
                e.preventDefault()
                handleTouch('right', true)
              }}
              onPointerUp={(e) => {
                e.preventDefault()
                handleTouch('right', false)
              }}
              onPointerLeave={() => handleTouch('right', false)}
            >
              →
            </button>
          </div>

          <div>
            <button
              type="button"
              className={`w-20 h-16 rounded-2xl border border-amber-600/60 bg-amber-500/90 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center active:bg-amber-400 active:scale-95 transition-all ${
                activeTouch.jump ? 'bg-amber-400 ring-2 ring-amber-300' : ''
              }`}
              onPointerDown={(e) => {
                e.preventDefault()
                handleTouch('jump', true)
              }}
              onPointerUp={(e) => {
                e.preventDefault()
                handleTouch('jump', false)
              }}
              onPointerLeave={() => handleTouch('jump', false)}
            >
              Jump
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
