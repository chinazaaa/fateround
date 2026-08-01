import { apiUrl } from '@/lib/config'
import type { AudioAuth } from '@/lib/voice-types'

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

export async function fetchGameRoomCode(gameCode: string): Promise<string> {
  const code = gameCode.toUpperCase()
  try {
    const res = await fetch(apiUrl(`/api/games/${encodeURIComponent(code)}/room`))
    if (!res.ok) return code
    const data = (await res.json()) as { roomCode?: string }
    return data.roomCode?.toUpperCase() ?? code
  } catch {
    return code
  }
}

export function postAudioToken(body: { roomName: string; name: string; auth: AudioAuth }) {
  return postJson<{ token: string }>('/api/audio-token', body)
}

export function postAudioPresence(body: { roomName: string; auth: AudioAuth }) {
  return postJson<{ count: number }>('/api/audio-presence', body)
}
