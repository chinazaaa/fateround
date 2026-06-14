'use client'

import { useEffect, useState } from 'react'
import { banSecondsLeft, formatBanCountdown } from '@/lib/anonymous-messages'

export function AnonymousBanCountdownBar({ bannedUntil }: { bannedUntil: string }) {
  const [secondsLeft, setSecondsLeft] = useState(() => banSecondsLeft(bannedUntil))

  useEffect(() => {
    const tick = () => setSecondsLeft(banSecondsLeft(bannedUntil))
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [bannedUntil])

  if (secondsLeft <= 0) return null

  return (
    <div className="glass-card px-4 py-3 text-center border border-red-500/30">
      <p className="text-faint text-xs uppercase tracking-wider">You are muted</p>
      <p className="text-2xl font-black tabular-nums mt-1 text-red-300">{formatBanCountdown(secondsLeft)}</p>
      <p className="text-faint text-xs mt-1">You can read messages but cannot send or reply until the mute ends.</p>
    </div>
  )
}
