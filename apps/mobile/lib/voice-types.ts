/** Matches `src/lib/audio-room-auth.ts` — proof for /api/audio-token and /api/audio-presence.
 *
 * Every variant carries a SECRET. `player` used to be authorized on the bare playerId, but that
 * value is public (anon can read the roster), so anyone could mint a voice token for any game —
 * see the note in src/lib/audio-room-auth.ts. The LiveKit identity is derived server-side from
 * the row the secret resolves to and is no longer sent by the client. */
export type AudioAuth =
  { kind: 'player'; resumeToken: string } | { kind: 'member'; memberCode: string } | { kind: 'host'; token?: string }

export type VoiceParticipant = {
  id: string
  name: string
  host: boolean
  talking: boolean
  muted: boolean
}
