'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: React.ReactNode
  size?: 'md' | 'lg'
}

export function Modal({ open, onClose, title, subtitle, children, size = 'md' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // The sheet is anchored to the bottom of the screen. On mobile the on-screen
  // keyboard overlays the bottom (vh / fixed positioning don't shrink for it), so
  // search results and inputs end up hidden behind it. Track the visual viewport
  // and shrink the backdrop to the area above the keyboard so the sheet sits on top.
  useEffect(() => {
    // Depend on `mounted` too: the backdrop only renders once mounted is true, so
    // a Modal that first mounts already-open needs this to re-run to grab the ref.
    if (!open || !mounted) return
    const vv = window.visualViewport
    const el = backdropRef.current
    if (!vv || !el) return
    const apply = () => {
      const h = vv.height
      // Only intervene when the keyboard meaningfully shrinks the viewport. Guard
      // against bogus/zero readings that would otherwise collapse the sheet.
      if (h && window.innerHeight - h > 120) {
        el.style.height = `${h}px`
        el.style.top = `${vv.offsetTop}px`
        el.style.bottom = 'auto'
      } else {
        el.style.height = ''
        el.style.top = ''
        el.style.bottom = ''
      }
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      el.style.height = ''
      el.style.top = ''
      el.style.bottom = ''
    }
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !mounted) return null

  return createPortal(
    <div
      ref={backdropRef}
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        ref={panelRef}
        className={`modal-panel ${size === 'lg' ? 'max-w-2xl' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--card-strong)] px-6 py-5">
            <div>
              {title && (
                <h2 id="modal-title" className="text-xl font-bold tracking-tight">
                  {title}
                </h2>
              )}
              {subtitle && <p className="text-muted text-sm mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost shrink-0 -mr-1 text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body
  )
}
