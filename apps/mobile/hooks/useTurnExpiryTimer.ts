import { useEffect, useRef } from 'react'
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
 */
export function useTurnExpiryTimer({
  deadlineAt,
  enabled,
  onExpire,
  cooldownMs = COOLDOWN_MS,
}: {
  deadlineAt: string | null | undefined
  enabled: boolean
  onExpire: () => void | Promise<unknown>
  cooldownMs?: number
}) {
  const active = enabled && !!deadlineAt
  const secondsLeft = useAbsoluteDeadline(deadlineAt ?? null, active)
  const firingRef = useRef(false)
  // Latest closure without re-arming the effect every render.
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    if (!active || secondsLeft > 0 || firingRef.current) return
    firingRef.current = true
    void Promise.resolve(onExpireRef.current())
      .catch(() => {
        // Swallow: fire-and-forget. The server is idempotent + deadline-gated, so
        // the next state change (or the next zero-crossing) safely re-fires.
      })
      .finally(() => {
        setTimeout(() => {
          firingRef.current = false
        }, cooldownMs)
      })
  }, [active, secondsLeft, cooldownMs])
}
