/** Matches `src/lib/audio-room-auth.ts` — proof for /api/audio-token and /api/audio-presence. */
export type AudioAuth = { kind: 'player' } | { kind: 'member' } | { kind: 'host'; token?: string }

export type VoiceParticipant = {
  id: string
  name: string
  host: boolean
  talking: boolean
  muted: boolean
}
