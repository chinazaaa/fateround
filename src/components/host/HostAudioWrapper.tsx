'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { RoomVoiceRail } from '@/components/rooms/RoomVoiceRail'
import { getPlayerSession } from '@/lib/utils'
import { useHostToken } from '@/hooks/useHostToken'

/** Stable per-tab identity so multiple host tabs in the same room don't
 * collide on the LiveKit identity (which must be unique per participant). */
function useHostIdentity(gameCode: string): string {
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

/** Show the host's chosen name in voice chat when they've joined as a player
 * ("Host + play"); fall back to "Host" for host-only mode. Reacts to the
 * `kmk-player-session` event (same tab) and `storage` (other tabs) so the name
 * appears as soon as the host joins, without a refresh. */
function useHostDisplayName(gameCode: string): string {
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

export function HostAudioWrapper() {
  const { code } = useParams<{ code: string }>()
  const gameCode = code ? (Array.isArray(code) ? code[0] : code).toUpperCase() : ''
  const hostIdentity = useHostIdentity(gameCode)
  const hostName = useHostDisplayName(gameCode)
  // Clean host URL (token in storage) → resolve via the hook. The fallback is read in an
  // effect, so the server and first client render agree (AudioChat mounts post-hydration)
  // — this is what fixes the hydration mismatch we saw here.
  const { hostToken } = useHostToken(gameCode)
  if (!gameCode || !hostToken) return null
  return (
    <RoomVoiceRail
      roomCode={gameCode}
      playerName={hostName}
      identity={hostIdentity}
      auth={{ kind: 'host', token: hostToken }}
      host
      hostBadge
    />
  )
}
