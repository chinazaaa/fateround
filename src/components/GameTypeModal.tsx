'use client'
import { useEffect, useMemo, useState } from 'react'
import type { GameType } from '@/types'
import {
  GAME_TYPE_DISPLAY_ORDER,
  GAME_CATEGORIES,
  gameTypeCategory,
  gameTypeConfig,
  type GameCategory,
} from '@/lib/game-types'
import { Modal } from '@/components/ui/Modal'
import { GameTypeCard } from '@/components/GameTypeCard'

interface GameTypeModalProps {
  open: boolean
  onClose: () => void
  selected?: GameType
  onSelect: (type: GameType) => void
}

type CategoryFilter = GameCategory | 'all'

function matchesGameSearch(type: GameType, query: string): boolean {
  const cfg = gameTypeConfig(type)
  const haystack = [cfg.label, cfg.tagline, cfg.card.vibe, cfg.card.players, type.replace(/_/g, ' ')]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export function GameTypeModal({ open, onClose, selected, onSelect }: GameTypeModalProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')

  useEffect(() => {
    if (!open) {
      setSearch('')
      setCategory('all')
    }
  }, [open])

  // Searching spans every category, so drop the category filter while a query is active.
  const searching = search.trim().length > 0

  const filteredTypes = useMemo(() => {
    const query = search.trim().toLowerCase()
    return GAME_TYPE_DISPLAY_ORDER.filter((type) => {
      if (query) return matchesGameSearch(type, query)
      if (category === 'all') return true
      return gameTypeCategory(type) === category
    })
  }, [search, category])

  const handleSelect = (type: GameType) => {
    onSelect(type)
    onClose()
  }

  const tabs: { key: CategoryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    ...GAME_CATEGORIES.map((c) => ({ key: c.key as CategoryFilter, label: c.label })),
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose a game"
      subtitle="Pick the vibe for your party"
      size="lg"
      fillHeight
    >
      <div className="space-y-4">
        {/* Pinned so the search + category tabs stay visible above the on-screen keyboard
            while results scroll. Negative margins pull it over the body padding so no
            cards peek through above the bar. */}
        <div className="sticky top-0 z-10 -mx-6 -mt-6 bg-[var(--card-strong)] px-6 pt-6 pb-3 space-y-3">
          <div className="relative">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search games…"
              autoFocus
              className="input-field w-full pr-9"
              aria-label="Search games"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-body text-lg leading-none"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {!searching && (
            <div
              className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Game categories"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={category === tab.key}
                  onClick={() => setCategory(tab.key)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                    category === tab.key
                      ? 'bg-[var(--chip-active-bg)] text-[var(--chip-active-text)] border border-[var(--chip-active-border)]'
                      : 'chip'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {filteredTypes.length === 0 ? (
          <p className="text-muted text-sm text-center py-8">
            {searching ? <>No games match &ldquo;{search.trim()}&rdquo;</> : 'No games in this category yet'}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 animate-stagger">
            {filteredTypes.map((type) => (
              <GameTypeCard key={type} type={type} selected={selected === type} onClick={() => handleSelect(type)} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
