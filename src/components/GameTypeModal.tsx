'use client'
import type { GameType } from '@/types'
import { GAME_TYPE_OPTIONS } from '@/lib/game-types'
import { Modal } from '@/components/ui/Modal'
import { GameTypeCard } from '@/components/GameTypeCard'

interface GameTypeModalProps {
  open: boolean
  onClose: () => void
  selected?: GameType
  onSelect: (type: GameType) => void
}

export function GameTypeModal({ open, onClose, selected, onSelect }: GameTypeModalProps) {
  const handleSelect = (type: GameType) => {
    onSelect(type)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Choose a game" subtitle="Pick the vibe for your party" size="lg">
      <div className="grid gap-3 sm:grid-cols-2 animate-stagger">
        {GAME_TYPE_OPTIONS.map((type) => (
          <GameTypeCard key={type} type={type} selected={selected === type} onClick={() => handleSelect(type)} />
        ))}
      </div>
    </Modal>
  )
}
