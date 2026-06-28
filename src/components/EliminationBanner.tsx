'use client'

import type { Player } from '@/types'

interface EliminationBannerProps {
  player: Pick<Player, 'is_eliminated' | 'eliminated_at' | 'lives_remaining'>
}

export function EliminationBanner({ player }: EliminationBannerProps) {
  if (!player.is_eliminated) {
    if (player.lives_remaining != null && player.lives_remaining > 0) {
      return (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-4 py-2 text-center text-sm text-yellow-400">
          <span aria-hidden="true">{'❤️'.repeat(player.lives_remaining)}</span>
          <span className="sr-only">
            {player.lives_remaining} {player.lives_remaining === 1 ? 'life' : 'lives'} remaining
          </span>
        </div>
      )
    }
    return null
  }

  return (
    <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-center">
      <p className="text-red-400 font-semibold text-sm">You have been eliminated</p>
      <p className="text-faint text-xs mt-1">You can still watch and chat</p>
    </div>
  )
}

export function LivesDisplay({ livesRemaining }: { livesRemaining: number | null | undefined }) {
  if (livesRemaining == null || livesRemaining <= 0) return null
  return <span className="text-xs text-yellow-400">{'❤️'.repeat(livesRemaining)}</span>
}
