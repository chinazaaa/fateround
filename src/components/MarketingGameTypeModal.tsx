'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GameType } from '@/types'
import { GAME_TYPE_DISPLAY_ORDER, gameTypeConfig } from '@/lib/game-types'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (type: GameType) => void
}

function matches(type: GameType, query: string): boolean {
  const cfg = gameTypeConfig(type)
  return [cfg.label, cfg.tagline, cfg.card.vibe, cfg.card.players, type.replace(/_/g, ' ')]
    .join(' ')
    .toLowerCase()
    .includes(query)
}

/**
 * Homepage game picker, styled with the Fate Round design system (`.fr-modal`).
 * Kept separate from the shared `GameTypeModal` (used on /create) so the app
 * pages are untouched by the public-page overhaul.
 */
export function MarketingGameTypeModal({ open, onClose, onSelect }: Props) {
  const [mounted, setMounted] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return GAME_TYPE_DISPLAY_ORDER
    return GAME_TYPE_DISPLAY_ORDER.filter((type) => matches(type, q))
  }, [search])

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="fr-portal fr-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fr-picker-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="fr-modal fr-modal--lg">
        <div className="fr-modal__header">
          <div>
            <h2 id="fr-picker-title" className="fr-modal__title">
              Choose a game
            </h2>
            <p className="fr-modal__subtitle">Pick the vibe for your party</p>
          </div>
          <button type="button" className="fr-modal__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="fr-modal__body">
          <div className="relative mb-4">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search games…"
              autoFocus
              aria-label="Search games"
              className="fr-input pr-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-lg leading-none"
                style={{ color: 'var(--text-faint)' }}
              >
                ×
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No games match &ldquo;{search.trim()}&rdquo;
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((type) => {
                const cfg = gameTypeConfig(type)
                return (
                  <button
                    key={type}
                    type="button"
                    className="fr-gamecard"
                    style={{ '--accent': cfg.card.accent } as React.CSSProperties}
                    onClick={() => {
                      onSelect(type)
                      onClose()
                    }}
                  >
                    <span className="fr-gamecard__emoji">{cfg.card.emoji}</span>
                    <h3 className="fr-gamecard__title">{cfg.label}</h3>
                    <p className="fr-gamecard__tagline line-clamp-2">{cfg.tagline}</p>
                    <div className="fr-gamecard__meta">
                      <span className="fr-gamecard__players">{cfg.card.players}</span>
                      <span className="fr-gamecard__vibe">{cfg.card.vibe}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
