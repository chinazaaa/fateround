'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GameType } from '@/types'
import {
  GAME_TYPE_DISPLAY_ORDER,
  GAME_CATEGORIES,
  gameTypeCategory,
  gameTypeConfig,
  type GameCategory,
} from '@/lib/game-types'
import { matchesGameSearch } from '@/lib/game-search'
import { isMatureGame, MATURE_BADGE_LABEL } from '@/lib/game-maturity'
import { gameIcon } from '@/lib/game-glyphs'
import { Glyph } from '@/components/icons/Glyph'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (type: GameType) => void
}

type CategoryFilter = GameCategory | 'all'

/**
 * Homepage game picker, styled with the FateRound design system (`.fr-modal`).
 * Kept separate from the shared `GameTypeModal` (used on /create) so the app
 * pages are untouched by the public-page overhaul.
 */
export function MarketingGameTypeModal({ open, onClose, onSelect }: Props) {
  const [mounted, setMounted] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!open) {
      setSearch('')
      setCategory('all')
    }
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

  // The sheet is anchored to the bottom of the screen. On mobile the on-screen
  // keyboard overlays the bottom (vh / fixed positioning don't shrink for it), so
  // shrink the backdrop to the area above the keyboard and let the sheet fill it.
  useEffect(() => {
    if (!open || !mounted) return
    const vv = window.visualViewport
    const el = backdropRef.current
    if (!vv || !el) return
    const apply = () => {
      const h = vv.height
      // Only intervene when the keyboard meaningfully shrinks the viewport.
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

  // Searching spans every category, so drop the category filter while a query is active.
  const searching = search.trim().length > 0

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return GAME_TYPE_DISPLAY_ORDER.filter((type) => {
      if (q) return matchesGameSearch(type, q)
      if (category === 'all') return true
      return gameTypeCategory(type) === category
    })
  }, [search, category])

  const tabs: { key: CategoryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    ...GAME_CATEGORIES.map((c) => ({ key: c.key as CategoryFilter, label: c.label })),
  ]

  if (!open || !mounted) return null

  return createPortal(
    <div
      ref={backdropRef}
      className="fr-portal fr-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fr-picker-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="fr-modal fr-modal--lg fr-modal--fill">
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
          {/* Pinned so the search stays visible above the on-screen keyboard while
              results scroll. Negative margins pull it over the body padding so no
              cards peek through above the bar. */}
          <div
            className="sticky top-0 z-10"
            style={{
              background: 'var(--surface)',
              margin: 'calc(var(--space-5) * -1) calc(var(--space-5) * -1) var(--space-4)',
              padding: 'var(--space-5) var(--space-5) var(--space-3)',
            }}
          >
            <div className="relative">
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

            {!searching && (
              <div
                className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="tablist"
                aria-label="Game categories"
              >
                {tabs.map((tab) => {
                  const active = category === tab.key
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setCategory(tab.key)}
                      className="fr-chip fr-chip--control shrink-0"
                      style={
                        active
                          ? {
                              background: 'var(--primary)',
                              borderColor: 'var(--primary)',
                              color: 'var(--primary-contrast)',
                            }
                          : undefined
                      }
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              {searching ? <>No games match &ldquo;{search.trim()}&rdquo;</> : 'No games in this category yet'}
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
                    <span className="fr-glyph">
                      <Glyph icon={gameIcon(type)} size={28} />
                    </span>
                    <h3 className="fr-gamecard__title">
                      {cfg.label}
                      {isMatureGame(type) && (
                        <span
                          className="ml-1.5 inline-block rounded-full px-1.5 py-px align-middle text-[10px] font-bold tracking-wide"
                          style={{
                            background: 'color-mix(in srgb, var(--danger, #dc2626) 14%, transparent)',
                            color: 'var(--danger, #dc2626)',
                          }}
                        >
                          {MATURE_BADGE_LABEL}
                        </span>
                      )}
                    </h3>
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
