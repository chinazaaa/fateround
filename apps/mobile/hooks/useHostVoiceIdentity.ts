import { useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { getPlayerSession } from '@/lib/secure-session'
import { subscribePlayerSession } from '@/lib/session-events'

const hostAudioKey = (gameCode: string) => `host-audio-id:${gameCode.toUpperCase()}`

async function getOrCreateHostAudioId(gameCode: string): Promise<string> {
  const key = hostAudioKey(gameCode)
  try {
    const existing = await SecureStore.getItemAsync(key)
    if (existing) return existing
    const generated = `host-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
    await SecureStore.setItemAsync(key, generated)
    return generated
  } catch {
    return `host-${gameCode}-${Math.random().toString(36).slice(2)}`
  }
}

/** Stable LiveKit identity for a host tab/device (mirrors web `useHostIdentity`). */
export function useHostVoiceIdentity(gameCode: string): string | null {
  const [identity, setIdentity] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getOrCreateHostAudioId(gameCode).then((id) => {
      if (active) setIdentity(id)
    })
    return () => {
      active = false
    }
  }, [gameCode])

  return identity
}

/** Host display name in voice — player name when host+play, else "Host". */
export function useHostVoiceDisplayName(gameCode: string): string {
  const [name, setName] = useState('Host')

  useEffect(() => {
    let active = true
    const sync = async () => {
      const session = await getPlayerSession(gameCode)
      if (active) setName(session?.playerName?.trim() || 'Host')
    }
    void sync()
    return subscribePlayerSession(gameCode, () => void sync())
  }, [gameCode])

  return name
}
