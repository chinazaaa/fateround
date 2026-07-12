import { apiUrl } from '@/lib/config'
import type { AudioAuth } from '@/lib/voice-types'

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  // Read the raw body first: the endpoint always returns JSON, so a non-JSON
  // response means the request never reached it (an HTML 404/500 page, a proxy
  // or deployment-protection notice, an empty body, …). Surface the status and
  // a snippet instead of a cryptic "JSON Parse error: unexpected character".
  const raw = await res.text()
  let data: (T & { error?: string }) | null = null
  try {
    data = raw ? (JSON.parse(raw) as T & { error?: string }) : null
  } catch {
    const snippet = raw.trim().replace(/\s+/g, ' ').slice(0, 120)
    throw new Error(
      res.ok
        ? 'Voice server returned an unexpected response — check the API URL.'
        : `Voice server error (${res.status})${snippet ? `: ${snippet}` : ''}`
    )
  }
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`)
  if (!data) throw new Error('Voice server returned an empty response.')
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

export function postAudioToken(body: {
  roomName: string
  identity: string
  name: string
  auth: AudioAuth
}) {
  return postJson<{ token: string }>('/api/audio-token', body)
}

export function postAudioPresence(body: { roomName: string; identity: string; auth: AudioAuth }) {
  return postJson<{ count: number }>('/api/audio-presence', body)
}
