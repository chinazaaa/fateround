import { useEffect, useRef, useState } from 'react'
import { isSkippedExpire, nextExpireRearm } from '@fateround/shared/expire-rearm'
import { useAbsoluteDeadline } from '@/components/party/useAbsoluteDeadline'

// De-dupe window so a late realtime reload doesn't immediately re-fire the expire.
const COOLDOWN_MS = 3000

/**
 * Generic per-turn / per-phase expiry driver, mirroring web's useTurnTimer and the
 * game-specific useTicTacToeTurnTimer. Ticks down to `deadlineAt`, and once it hits
 * zero calls `onExpire` (a POST to the game's idempotent, deadline-gated expire
 * endpoint), then reloads via whatever `onExpire` does. `enabled` gates whether this
 * client drives the countdown at all — pass the game's "who fires" rule (usually
 * `status === 'active'` and non-viewer), matching web so an AFK player's turn still
 * advances on an all-mobile table instead of hanging at 0.
 *
 * Call it once per deadline: games with a break/intermission phase (Describe It,
 * Word Rush, Quick Draw) arm two instances, one per (deadline → endpoint) pair.
 * Set `deadlineAt` to null to disarm for the current phase.
 *
 * A resolved `{ skipped: true }` payload means the server did not act on the deadline (e.g. a leave committed
 * before the expiry reloaded, so a Wild colour choice stays overdue). The countdown sits at zero, so nothing
 * would fire again on its own: the hook re-arms with the same grace + bounded exponential back-off as web's
 * `useTurnTimer`. Any other outcome stays one-shot per zero-crossing. A new `deadlineAt` resets the back-off.
 */
export function useTurnExpiryTimer({
  deadlineAt,
  enabled,
  onExpire,
  cooldownMs = COOLDOWN_MS,
  graceSkips = 3,
  maxBackoffMs = 60000,
}: {
  deadlineAt: string | null | undefined
  enabled: boolean
  onExpire: () => void | Promise<unknown>
  cooldownMs?: number
  graceSkips?: number
  maxBackoffMs?: number
}) {
  const active = enabled && !!deadlineAt
  const secondsLeft = useAbsoluteDeadline(deadlineAt ?? null, active)
  const firingRef = useRef(false)
  const skipStreakRef = useRef(0)
  const mountedRef = useRef(true)
  // Bumped when a skipped expiry re-arms: the countdown is already at zero, so nothing else re-runs the effect.
  const [retryTick, setRetryTick] = useState(0)
  // Latest closure without re-arming the effect every render.
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    skipStreakRef.current = 0
  }, [deadlineAt])

  useEffect(() => {
    if (!active || secondsLeft > 0 || firingRef.current) return
    firingRef.current = true
    void Promise.resolve(onExpireRef.current())
      .then(
        (payload) => isSkippedExpire(payload),
        // Swallow: fire-and-forget. The server is idempotent + deadline-gated, so
        // the next state change (or the next zero-crossing) safely re-fires.
        () => false
      )
      .then((skipped) => {
        const rearm = nextExpireRearm({
          streak: skipStreakRef.current,
          ok: true,
          skipped,
          cooldownMs,
          graceSkips,
          maxBackoffMs,
        })
        skipStreakRef.current = rearm.streak
        setTimeout(() => {
          firingRef.current = false
          if (skipped && mountedRef.current) setRetryTick((t) => t + 1)
        }, rearm.rearmMs)
      })
  }, [active, secondsLeft, cooldownMs, graceSkips, maxBackoffMs, retryTick])
}
