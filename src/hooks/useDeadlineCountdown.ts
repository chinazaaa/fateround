'use client'

import { useEffect, useState } from 'react'
import { msUntilDeadline } from '@/lib/round-timing'

/** Never re-arm tighter than this, so a timer that fires a hair early cannot spin. */
const MIN_TICK_MS = 50

export function useDeadlineCountdown(
  anchorTime: string | null | undefined,
  delaySeconds: number,
  active: boolean
): number {
  const [tickedSeconds, setTickedSeconds] = useState(() =>
    active ? Math.ceil(msUntilDeadline(anchorTime, delaySeconds) / 1000) : 0
  )

  useEffect(() => {
    if (!active) return

    let timer: number | null = null

    /**
     * Each tick re-arms for the exact moment the displayed second changes rather than running on a
     * fixed poll. Sampling on a per-client phase is what made two people watching the same deadline
     * disagree: one could still be showing a value it read 400ms ago while the other had already
     * rounded down, so a shared 3·2·1 read as off-by-one between host and player.
     */
    const tick = () => {
      const remainingMs = msUntilDeadline(anchorTime, delaySeconds)
      setTickedSeconds(Math.ceil(remainingMs / 1000))
      if (remainingMs <= 0) return

      const msUntilDigitChange = remainingMs % 1000 || 1000
      timer = window.setTimeout(tick, Math.max(MIN_TICK_MS, msUntilDigitChange))
    }

    tick()

    return () => {
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [anchorTime, delaySeconds, active])

  // Zeroed here rather than by resetting state when `active` goes false: the countdown owns no
  // deadline while it is off, and writing state from the effect would cost an extra render pass.
  return active ? tickedSeconds : 0
}
