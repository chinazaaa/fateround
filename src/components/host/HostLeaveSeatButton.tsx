'use client'

import { useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCloseGameSettings } from '@/components/GameSettingsContext'

/**
 * "Leave game (keep hosting)" — the host's in-game ⚙ gear control that drops them out of
 * play without ending the game or handing off hosting. It flips the host's own row to a
 * spectator (via {@link useHostSeat.leaveSeatKeepHosting}); the host keeps the host token
 * and stays in charge, and the shared {@link HostGameLayout} banner then offers "Join as
 * player" to take a seat back mid-game.
 *
 * Only render this when the host actually holds a live *playing* seat — for a host who's
 * already watching there's nothing to leave (the rejoin banner covers coming back).
 */
export function HostLeaveSeatButton({
  onLeave,
  className,
  label = 'Leave game (keep hosting)',
}: {
  onLeave: () => Promise<void>
  className: string
  label?: string
}) {
  const { confirm } = useConfirm()
  const close = useCloseGameSettings()
  const [leaving, setLeaving] = useState(false)

  const handleLeave = async () => {
    if (leaving) return
    const ok = await confirm({
      title: 'Leave the game?',
      message:
        "You'll stop playing and watch instead — the game keeps going and you stay the host. You can rejoin as a player at any time.",
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
