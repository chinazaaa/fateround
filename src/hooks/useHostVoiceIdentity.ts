'use client'

import { useEffect, useState } from 'react'
import { getPlayerSession } from '@/lib/utils'

/**
 * Stable per-tab LiveKit identity for a host so multiple host tabs in the same
 * room don't collide on the identity (which must be unique per participant).
 * Used by `PollHostView` (the poll host's top voice rail).
 */
export function useHostIdentity(gameCode: string): string {
  const [hostId] = useState(() => {
    const key = `host-audio-id:${gameCode}`
    if (typeof window === 'undefined') return `host-${gameCode}`
    const existing = window.sessionStorage.getItem(key)
    if (existing) return existing
    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `host-${crypto.randomUUID()}`
        : `host-${Math.random().toString(36).slice(2)}`
    window.sessionStorage.setItem(key, generated)
    return generated
  })
  return hostId
}

/**
 * Show the host's chosen name in voice chat when they've joined as a player
 * ("Host + play"); fall back to "Host" for host-only mode. Reacts to the
 * `kmk-player-session` event (same tab) and `storage` (other tabs) so the name
 * appears as soon as the host joins, without a refresh.
 */
export function useHostDisplayName(gameCode: string): string {
  const [name, setName] = useState('Host')
  useEffect(() => {
    if (!gameCode) return
    const sync = () => setName(getPlayerSession(gameCode)?.playerName?.trim() || 'Host')
    sync()
    window.addEventListener('kmk-player-session', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('kmk-player-session', sync)
      window.removeEventListener('storage', sync)
    }
  }, [gameCode])
  return name
}
