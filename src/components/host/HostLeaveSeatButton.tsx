'use client'

import { useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCloseGameSettings } from '@/components/GameSettingsContext'

/**
 * "Leave game (keep hosting)" — the host's in-game ⚙ gear control that drops them out of
 * play without ending the game or handing off hosting. The host always keeps the host
 * token and stays in charge; how they leave play depends on the game (set via `variant`):
 *
 *  - `variant="spectate"` (default) — independent/simultaneous games (trivia, word games…):
 *    the host's row flips to spectator in place ({@link useHostSeat.leaveSeatKeepHosting}),
 *    non-destructive, so their score survives and the {@link HostGameLayout} banner offers
 *    "Join as player" to take the *same* seat back mid-game.
 *  - `variant="remove"` — turn-based / seat / role games (whot, monopoly, chess…): a bare
 *    spectate flip would strand the host in turn_order, so this goes through the normal
 *    destructive player-removal ({@link useHostSeat.leaveGameRemovePlayer}) which cleans up
 *    turn order / roles and, in a 2-player game, hands the other player the win. There's no
 *    seat to take back mid-game.
 *
 * Only render this when the host actually holds a live *playing* seat.
 */
export function HostLeaveSeatButton({
  onLeave,
  className,
  label = 'Leave game (keep hosting)',
  variant = 'spectate',
}: {
  onLeave: () => Promise<void>
  className: string
  label?: string
  variant?: 'spectate' | 'remove'
}) {
  const { confirm } = useConfirm()
  const close = useCloseGameSettings()
  const [leaving, setLeaving] = useState(false)

  const handleLeave = async () => {
    if (leaving) return
    const ok = await confirm({
      title: 'Leave the game?',
      message:
        variant === 'remove'
          ? "You'll stop playing and watch as the host — the game keeps going for everyone else. If too few players are left it ends (in a 2-player game the other player wins). You can't take your seat back in this game."
          : "You'll stop playing and watch instead — the game keeps going and you stay the host. You can rejoin as a player at any time.",
      confirmLabel: 'Leave game',
      destructive: true,
    })
    if (!ok) return
    setLeaving(true)
    try {
      await onLeave()
      close()
    } finally {
      setLeaving(false)
    }
  }

  return (
    <button type="button" onClick={() => void handleLeave()} disabled={leaving} className={className}>
      {leaving ? 'Leaving…' : label}
    </button>
  )
}
