'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  TROLL_RUN_INTERNAL_HEIGHT,
  TROLL_RUN_INTERNAL_WIDTH,
  TrollRunEngine,
  type EngineCallbacks,
  type GhostPositionPayload,
  type TrollRunHudState,
  type TrollRunLevel,
} from '@/lib/troll-run-engine'
import { Glyph } from '@/components/icons/Glyph'
import type { IconSvgElement } from '@hugeicons/react'
import {
  Alert02Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  ArrowUpDownIcon,
} from '@hugeicons/core-free-icons'

/**
 * The width the whole race view lines up on — canvas, HUD strip, live feed and controls.
 *
 * The canvas is a 320×180 buffer drawn with nearest-neighbour scaling, so it can be blown up as far
 * as there is room; the old fixed 640px left a desktop with a postage stamp in the middle of the
 * screen. Height is the real constraint, because the HUD, feed and controls share the viewport with
 * it, so the cap is expressed in viewport height and converted through the 16:9 aspect before being
 * limited to 1280px — a clean 4× of the buffer. Phones are narrower than the result either way, so
 * portrait stays exactly as it was and landscape stops overflowing.
 */
export const TROLL_RUN_STAGE_MAX_WIDTH = 'min(1440px, calc(82vh * 16 / 9))'

export interface TrollRunCanvasProps {
  levels: TrollRunLevel[]
  initialLevelIndex?: number
  playerId?: string
  playerName?: string
  /** Whether the run should be simulating. False freezes the canvas without losing progress. */
  active?: boolean
  onDeath?: (levelId: string, levelName: string, deaths: number) => void
  onLevelClear?: (levelId: string, levelName: string, timeMs: number, deaths: number) => void
  onAllLevelsCleared?: (totalTimeMs: number, totalDeaths: number) => void
  onStatsChange?: (stats: ReturnType<TrollRunEngine['getCurrentStats']>) => void
  onPlayerPosition?: (pos: GhostPositionPayload) => void
  /**
   * Handed the live engine on mount and `null` on teardown. Peer positions arrive ~20 times a
   * second per runner, so they are pushed straight into the engine rather than through React
   * state, which would re-render the whole view on every frame of every opponent.
   */
  onEngineReady?: (engine: TrollRunEngine | null) => void
  showTouchControls?: boolean
  muted?: boolean
  theme?: 'dark' | 'retro' | 'neon'
  className?: string
}

interface TouchButtonProps {
  label: string
  icon: IconSvgElement
  isActive: boolean
  isAccent?: boolean
  onPressChange: (isPressed: boolean) => void
}

/**
 * Pointer-driven control pad. All three buttons need the same press/release/cancel wiring, and a
 * missed release leaves the runner walking into a spike, so the handling lives in one place.
 */
function TouchButton({ label, icon, isActive, isAccent = false, onPressChange }: TouchButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isActive}
      className="h-16 min-w-16 flex-1 rounded-2xl border flex items-center justify-center transition-transform active:scale-95"
      style={{
        touchAction: 'none',
        background: isAccent ? 'var(--primary)' : 'var(--card-strong)',
        borderColor: isActive ? 'var(--primary)' : 'var(--border-strong)',
        color: isAccent ? 'var(--background)' : 'var(--foreground)',
        boxShadow: isActive ? 'var(--card-shadow-glow)' : 'var(--card-shadow)',
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        onPressChange(true)
      }}
      onPointerUp={(event) => {
        event.preventDefault()
        onPressChange(false)
      }}
      onPointerLeave={() => onPressChange(false)}
      onPointerCancel={() => onPressChange(false)}
    >
      <Glyph icon={icon} size={26} />
    </button>
  )
}

export function TrollRunCanvas({
  levels,
  initialLevelIndex = 0,
  playerId = '',
  playerName = '',
  active = true,
  onDeath,
  onLevelClear,
  onAllLevelsCleared,
  onStatsChange,
  onPlayerPosition,
  onEngineReady,
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
  const [hud, setHud] = useState<TrollRunHudState | null>(null)
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasTouch =
        'ontouchstart' in window ||
        (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
        window.matchMedia('(pointer: coarse)').matches
      setIsTouchDevice(hasTouch)

      const handleTouchStart = () => setIsTouchDevice(true)
      window.addEventListener('touchstart', handleTouchStart, { once: true })
      return () => {
        window.removeEventListener('touchstart', handleTouchStart)
      }
    }
  }, [])

  // The engine calls back many times a second; going through a ref keeps the handlers current
  // without making a new identity a reason to tear the run down and restart it.
  const handlersRef = useRef({ onDeath, onLevelClear, onAllLevelsCleared, onStatsChange, onPlayerPosition })
  handlersRef.current = { onDeath, onLevelClear, onAllLevelsCleared, onStatsChange, onPlayerPosition }

  // Where to resume from is a starting condition, not something to react to: the server echoes
  // this value back as the player progresses, and re-reading it would restart the level. The ref
  // still tracks the latest value so a rebuild for a new round starts from that round's index.
  const initialLevelIndexRef = useRef(initialLevelIndex)
  initialLevelIndexRef.current = initialLevelIndex

  const onEngineReadyRef = useRef(onEngineReady)
  onEngineReadyRef.current = onEngineReady

  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || levels.length === 0) return

    const reportStats = (engine: TrollRunEngine) => {
      handlersRef.current.onStatsChange?.(engine.getCurrentStats())
    }

    const callbacks: EngineCallbacks = {
      onDeath: (levelId, levelName, deaths) => {
        handlersRef.current.onDeath?.(levelId, levelName, deaths)
        if (engineRef.current) reportStats(engineRef.current)
      },
      onLevelClear: (levelId, levelName, timeMs, deaths) => {
        handlersRef.current.onLevelClear?.(levelId, levelName, timeMs, deaths)
        if (engineRef.current) reportStats(engineRef.current)
      },
      onAllLevelsCleared: (totalTimeMs, totalDeaths) => {
        handlersRef.current.onAllLevelsCleared?.(totalTimeMs, totalDeaths)
        if (engineRef.current) reportStats(engineRef.current)
      },
      onPlayerPosition: (pos) => {
        handlersRef.current.onPlayerPosition?.(pos)
      },
      onHudChange: setHud,
    }

    const engine = new TrollRunEngine(levels, callbacks)
    engine.setPlayerIdentity(playerId, playerName)
    engine.attachCanvas(canvas)
    engine.setMuted(muted)
    engine.setTheme(theme)
    engine.start(initialLevelIndexRef.current)
    // A round that starts behind the countdown overlay must not tick before the flag says so.
    if (!activeRef.current) engine.pause()
    engineRef.current = engine
    onEngineReadyRef.current?.(engine)
    reportStats(engine)

    return () => {
      onEngineReadyRef.current?.(null)
      engine.destroy()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels, playerId, playerName])

  // Freeze while the round is not the player's to run — during the countdown, and once they
  // are home — so the clock and the trap timers cannot advance behind an overlay.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (active) engine.resume()
    else engine.pause()
  }, [active])

  useEffect(() => {
    engineRef.current?.setMuted(muted)
  }, [muted])

  useEffect(() => {
    engineRef.current?.setTheme(theme)
  }, [theme])

  const handleTouch = useCallback((control: 'left' | 'right' | 'jump', isPressed: boolean) => {
    setActiveTouch((previous) => ({ ...previous, [control]: isPressed }))
    engineRef.current?.setVirtualInput(control, isPressed)
  }, [])

  return (
    <div className={`flex flex-col items-center justify-center select-none w-full ${className}`}>
      <div
        className="relative w-full aspect-[16/9] rounded-2xl overflow-hidden border flex items-center justify-center"
        style={{
          maxWidth: TROLL_RUN_STAGE_MAX_WIDTH,
          background: 'var(--background-soft)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--card-shadow-strong)',
        }}
      >
        <canvas
          ref={canvasRef}
          width={TROLL_RUN_INTERNAL_WIDTH}
          height={TROLL_RUN_INTERNAL_HEIGHT}
          className="w-full h-full object-contain"
          style={{ imageRendering: 'pixelated' }}
        />

        {hud && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
            <span
              className="rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm sm:text-[11px]"
              style={{ background: 'rgba(0, 0, 0, 0.45)', color: '#f8fafc' }}
            >
              <span style={{ opacity: 0.6 }}>Lv {hud.levelIndex + 1}</span>
              {hud.levelName ? ` · ${hud.levelName}` : ''}
            </span>

            <div className="flex flex-col items-end gap-1">
              {hud.controlsInverted && (
                <span
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider backdrop-blur-sm sm:text-[11px]"
                  style={{ background: 'rgba(190, 18, 60, 0.85)', color: '#fff1f2' }}
                  role="status"
                >
                  <Glyph icon={Alert02Icon} size={13} />
                  Controls inverted
                </span>
              )}
              {hud.gravityInverted && (
                <span
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider backdrop-blur-sm sm:text-[11px]"
                  style={{ background: 'rgba(124, 58, 237, 0.85)', color: '#f5f3ff' }}
                  role="status"
                >
                  <Glyph icon={ArrowUpDownIcon} size={13} />
                  Gravity flipped
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* On-Screen Touch Controls (Mobile/Tablet or Dev Mode) */}
      {showTouchControls && (
        <div
          className={`mt-3 flex w-full items-center gap-3 ${isTouchDevice ? '' : 'md:hidden'}`}
          style={{ maxWidth: TROLL_RUN_STAGE_MAX_WIDTH }}
        >
          <TouchButton
            label="Move left"
            icon={ArrowLeft01Icon}
            isActive={activeTouch.left}
            onPressChange={(isPressed) => handleTouch('left', isPressed)}
          />
          <TouchButton
            label="Move right"
            icon={ArrowRight01Icon}
            isActive={activeTouch.right}
            onPressChange={(isPressed) => handleTouch('right', isPressed)}
          />
          <TouchButton
            label="Jump"
            icon={ArrowUp01Icon}
            isActive={activeTouch.jump}
            isAccent
            onPressChange={(isPressed) => handleTouch('jump', isPressed)}
          />
        </div>
      )}
    </div>
  )
}
