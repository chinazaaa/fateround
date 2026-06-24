'use client'

import { usePathname } from 'next/navigation'
import { isRoomLobbyPath } from '@/lib/room-routes'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { PrimaryBtn } from '@/components/ui/PageShell'
import { supportUrl } from '@/lib/site'

type ButtonPos = { x: number; y: number }

const STORAGE_KEY = 'fateround-support-btn-pos'
const DRAG_THRESHOLD = 6
const EDGE_PADDING = 12

function defaultPos(width: number, height: number): ButtonPos {
  return {
    x: EDGE_PADDING,
    y: window.innerHeight - height - 16,
  }
}

function clampPos(x: number, y: number, width: number, height: number): ButtonPos {
  const maxX = Math.max(EDGE_PADDING, window.innerWidth - width - EDGE_PADDING)
  const maxY = Math.max(EDGE_PADDING, window.innerHeight - height - EDGE_PADDING)
  return {
    x: Math.min(Math.max(EDGE_PADDING, x), maxX),
    y: Math.min(Math.max(EDGE_PADDING, y), maxY),
  }
}

function readStoredPos(): ButtonPos | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ButtonPos
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed
  } catch {
    // ignore corrupt storage
  }
  return null
}

export function SupportButton() {
  const pathname = usePathname()
  const url = supportUrl()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  })

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<ButtonPos | null>(null)
  const [dragging, setDragging] = useState(false)

  const measureAndSetPos = useCallback((stored?: ButtonPos | null) => {
    const el = buttonRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const base = stored ?? readStoredPos() ?? defaultPos(width, height)
    setPos(clampPos(base.x, base.y, width, height))
  }, [])

  useEffect(() => {
    measureAndSetPos()
    const onResize = () => measureAndSetPos()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measureAndSetPos])

  const persistPos = useCallback((next: ButtonPos) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore quota / private mode
    }
  }, [])

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!pos) return
    dragRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current.active || !buttonRef.current) return

    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      dragRef.current.moved = true
    }

    const { width, height } = buttonRef.current.getBoundingClientRect()
    setPos(clampPos(dragRef.current.originX + dx, dragRef.current.originY + dy, width, height))
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current.active) return

    const el = buttonRef.current
    if (el) {
      const { width, height } = el.getBoundingClientRect()
      const next = clampPos(pos?.x ?? 0, pos?.y ?? 0, width, height)
      setPos(next)
      if (dragRef.current.moved) persistPos(next)
    }

    if (!dragRef.current.moved) setOpen(true)

    dragRef.current.active = false
    setDragging(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  if (!url || pathname.startsWith('/admin') || isRoomLobbyPath(pathname)) return null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label="Support FateRound — drag to move"
        title="Drag to move · click to support"
        className={`fixed z-50 flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium glass-card select-none touch-none ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        } ${dragging ? '' : 'transition-shadow duration-200'}`}
        style={{
          color: 'var(--muted)',
          left: pos?.x ?? undefined,
          top: pos?.y ?? undefined,
          visibility: pos ? 'visible' : 'hidden',
        }}
      >
        <span className="text-base leading-none" aria-hidden>
          ☕
        </span>
        <span className="hidden sm:inline">Buy us a coffee</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Buy us a coffee"
        subtitle="Enjoying FateRound? A small tip helps keep the games free for everyone."
        size="md"
      >
        <div className="space-y-4">
          <p className="text-muted text-sm leading-relaxed">
            FateRound is free with no sign-up — your support covers hosting and helps us ship more game modes.
          </p>
          <div className="flex gap-3">
            <PrimaryBtn
              onClick={() => {
                window.open(url, '_blank', 'noopener,noreferrer')
                setOpen(false)
              }}
              className="flex-1"
            >
              ☕ Support via PayPal
            </PrimaryBtn>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary px-5">
              Later
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
