'use client'

import { LudoDiceFace, LudoDicePair } from '@/components/ludo/LudoChrome'
import type { LudoDiceRoll } from '@/types'

export function LudoBoardCenter({
  dice,
  rolling,
  showRoll,
  onRoll,
  acting,
  consecutiveSixes,
  phase,
  lastDice,
  remainingDice,
}: {
  dice: LudoDiceRoll | null | undefined
  rolling?: boolean
  showRoll?: boolean
  onRoll?: () => void
  acting?: boolean
  consecutiveSixes?: number
  phase?: 'roll' | 'move' | 'finished'
  lastDice?: LudoDiceRoll | null
  remainingDice?: number[]
}) {
  const displayDice = phase === 'move' ? lastDice : dice
  const remaining = remainingDice ?? []

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 sm:gap-1 px-0.5 text-center">
      {phase === 'move' && remaining.length > 0 ? (
        <div className="flex items-center gap-1">
          {remaining.map((value, index) => (
            <LudoDiceFace key={`${index}-${value}`} value={value} compact />
          ))}
        </div>
      ) : (
        <LudoDicePair dice={displayDice} rolling={rolling} compact />
      )}

      {phase === 'move' && remaining.length > 0 && (
        <p className="rounded bg-white/95 px-1 py-px text-[7px] sm:text-[9px] font-bold text-slate-900 leading-none shadow-sm">
          {remaining.length === 1 ? `Use ${remaining[0]}` : `Use: ${remaining.join(' + ')}`}
        </p>
      )}

      {consecutiveSixes != null && consecutiveSixes > 0 && (
        <p className="rounded bg-white/95 px-1 py-px text-[7px] sm:text-[9px] font-bold text-slate-900 tabular-nums leading-none shadow-sm">
          Bonus: {consecutiveSixes}/3
        </p>
      )}

      {showRoll && onRoll && (
        <button
          type="button"
          onClick={onRoll}
          disabled={acting || rolling}
          className="mt-0.5 rounded-md bg-amber-400 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-slate-900 shadow-sm transition-colors hover:bg-amber-300 disabled:opacity-40 sm:px-2.5 sm:py-1"
        >
          {acting || rolling ? '…' : '🎲 Roll'}
        </button>
      )}
    </div>
  )
}
