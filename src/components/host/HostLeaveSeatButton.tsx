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
  canRejoin = true,
}: {
  onLeave: () => Promise<void>
  className: string
  label?: string
  variant?: 'spectate' | 'remove'
  /**
   * Whether the game lets a spectator switch back to playing mid-game (`gameAllowsLatePlayerJoin`).
   * Only meaningful for `variant="spectate"`: when false (e.g. sudoku / crossword / word-search),
   * the copy promises "play again once this game finishes" instead of "rejoin any time", since
   * there's no mid-game rejoin. Defaults to true (most spectate-path games allow it).
   */
  canRejoin?: boolean
}) {
  const { confirm } = useConfirm()
  const close = useCloseGameSettings()
  const [leaving, setLeaving] = useState(false)

  const handleLeave = async () => {
    if (leaving) return
    const spectateMessage = canRejoin
      ? "You'll stop playing and watch instead — the game keeps going and you stay the host. You can rejoin as a player any time."
      : "You'll stop playing and watch instead — the game keeps going and you stay the host. You can play again once this game finishes."
    const ok = await confirm({
      title: 'Leave the game?',
      message:
        variant === 'remove'
          ? "You'll stop playing and watch as the host — the game keeps going for everyone else. If too few players are left it ends (in a 2-player game the other player wins). You can't take your seat back in this game."
          : spectateMessage,
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
