import { useEffect, useState } from 'react'

/**
 * Returns `Date.now()` and automatically re-renders once when the nearest
 * expiry from `deadlines` is reached.  This lets components that derive
 * "in progress" / "expired" state from `Date.now()` update without the
 * user having to navigate away and back.
 *
 * Only one timer is active at a time (the soonest future deadline).
 * If no deadline is in the future the hook is idle.
 */
export function useExpiryRefresh(deadlines: number[]): number {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const current = Date.now()
    // Find the nearest future deadline.
    let nearest = Infinity
    for (const d of deadlines) {
      if (d > current && d < nearest) nearest = d
    }
    // A deadline crossed since the last `now` — sync immediately so the
    // component reflects the new state even if no future deadline remains.
    if (deadlines.some((d) => d > now && d <= current)) {
      setNow(current)
      return
    }
    if (!isFinite(nearest)) return

    const delay = nearest - current + 50 // +50 ms buffer so Date.now() has crossed the boundary
    const id = setTimeout(() => setNow(Date.now()), delay)
    return () => clearTimeout(id)
  }, [deadlines, now]) // re-evaluate after each tick

  return now
}
