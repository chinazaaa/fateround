'use client'

import { useEffect } from 'react'
import { recoverPendingAttributions } from '@/lib/attribution-recovery'

/**
 * Mounted once at the app root. Retries `/api/profile/attribute` for any game this browser holds
 * a player row for that never got attributed the first time — typically because the player left
 * before the finished screen mounted (Word Search timer, others still playing, tab closed).
 *
 * Idempotent server-side and self-throttled per tab. Renders nothing.
 */
export function AttributionRecovery() {
  useEffect(() => {
    void recoverPendingAttributions()
  }, [])
  return null
}
