'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Chip, Field, PrimaryBtn } from '@/components/ui/PageShell'
import { useToast } from '@/components/ui/Toast'
import { GAME_TYPE_CONFIG, GAME_TYPE_OPTIONS } from '@/lib/game-types'

type FeedbackCategory = 'bug' | 'feature' | 'improvement' | 'other'
type FeedbackGameType = 'general' | (typeof GAME_TYPE_OPTIONS)[number]
type ButtonPos = { x: number; y: number }

const STORAGE_KEY = 'fateround-feedback-btn-pos'
const DRAG_THRESHOLD = 6
const EDGE_PADDING = 12

const CATEGORY_OPTIONS: { value: FeedbackCategory; label: string; emoji: string }[] = [
  { value: 'bug', label: 'Bug', emoji: '🐛' },
  { value: 'feature', label: 'Feature', emoji: '✨' },
  { value: 'improvement', label: 'Improvement', emoji: '💡' },
  { value: 'other', label: 'Other', emoji: '💬' },
]

const GAME_OPTIONS: { value: FeedbackGameType; label: string }[] = [
  { value: 'general', label: 'General' },
  ...GAME_TYPE_OPTIONS.map((id) => ({
    value: id,
    label: GAME_TYPE_CONFIG[id].label,
  })),
]

function defaultPos(width: number, height: number): ButtonPos {
  return {
    x: window.innerWidth - width - 16,
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

export function FeedbackButton() {
  const pathname = usePathname()
  const { success, error } = useToast()
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
  const [gameType, setGameType] = useState<FeedbackGameType>('general')
  const [category, setCategory] = useState<FeedbackCategory | null>(null)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
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

  const resetForm = () => {
    setGameType('general')
    setCategory(null)
    setMessage('')
  }

  const close = () => {
    setOpen(false)
    resetForm()
  }

  const handleSubmit = async () => {
    if (!category) {
      error('Please select a feedback type')
      return
    }
    if (message.trim().length < 10) {
      error('Please write at least 10 characters')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameType,
          category,
          message: message.trim(),
          pageUrl: window.location.href,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send feedback')

      success('Thanks for the feedback!')
      close()
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to send feedback')
    } finally {
      setSubmitting(false)
    }
  }

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

  if (pathname.startsWith('/admin')) return null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label="Send feedback — drag to move"
        title="Drag to move · click to send feedback"
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
        <FeedbackIcon />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Send feedback"
        subtitle="Help us improve FateRound — bugs, ideas, and anything else."
        size="lg"
      >
        <div className="space-y-5">
          <Field label="About which game?">
            <div className="flex flex-wrap gap-2">
              {GAME_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  active={gameType === option.value}
                  onClick={() => setGameType(option.value)}
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="What kind of feedback?">
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  active={category === option.value}
                  onClick={() => setCategory(option.value)}
                >
                  {option.emoji} {option.label}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Your feedback">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what happened, what you'd like to see, or anything else..."
              rows={4}
              maxLength={2000}
              className="input-field resize-none"
            />
            <p className="text-faint text-xs mt-1.5">{message.trim().length}/2000 · min 10 characters</p>
          </Field>

          <div className="flex gap-3 pt-1">
            <PrimaryBtn
              onClick={handleSubmit}
              disabled={submitting || !category || message.trim().length < 10}
              className="flex-1"
            >
              {submitting ? 'Sending…' : 'Send feedback'}
            </PrimaryBtn>
            <button type="button" onClick={close} className="btn-secondary px-5">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function FeedbackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
