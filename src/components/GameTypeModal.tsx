'use client'
import { useEffect, useMemo, useState } from 'react'
import type { GameType } from '@/types'
import { GAME_TYPE_OPTIONS, gameTypeConfig } from '@/lib/game-types'
import { Modal } from '@/components/ui/Modal'
import { GameTypeCard } from '@/components/GameTypeCard'

interface GameTypeModalProps {
  open: boolean
  onClose: () => void
  selected?: GameType
  onSelect: (type: GameType) => void
}

function matchesGameSearch(type: GameType, query: string): boolean {
  const cfg = gameTypeConfig(type)
  const haystack = [cfg.label, cfg.tagline, cfg.card.vibe, cfg.card.players, type.replace(/_/g, ' ')]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export function GameTypeModal({ open, onClose, selected, onSelect }: GameTypeModalProps) {
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const filteredTypes = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return GAME_TYPE_OPTIONS
    return GAME_TYPE_OPTIONS.filter((type) => matchesGameSearch(type, query))
  }, [search])

  const handleSelect = (type: GameType) => {
    onSelect(type)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Choose a game" subtitle="Pick the vibe for your party" size="lg">
      <div className="space-y-4">
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

        {filteredTypes.length === 0 ? (
          <p className="text-muted text-sm text-center py-8">No games match &ldquo;{search.trim()}&rdquo;</p>
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
