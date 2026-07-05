/** Client-safe music types + helpers (no server imports — safe to use in components). */

/** A track as surfaced by /api/spotify/search and stored on the host's picker. */
export type SpotifyTrackInfo = {
  uri: string
  name: string
  artist: string
  albumArt: string | null
  durationMs: number
}

/** The `music_sessions` row shape delivered by Supabase Realtime. */
export type MusicSession = {
  game_id: string
  track_uri: string | null
  track_name: string | null
  artist: string | null
  album_art: string | null
  duration_ms: number | null
  is_playing: boolean
  position_ms: number
  updated_at: string
}

/**
 * The live playback position, extrapolated from the host's last write. While playing, add
 * the time elapsed since `updated_at`; while paused, the stored position is authoritative.
 * Clamped to the track duration so we never seek past the end.
 */
export function livePositionMs(session: Pick<MusicSession, 'is_playing' | 'position_ms' | 'updated_at' | 'duration_ms'>): number {
  if (!session.is_playing) return Math.max(0, session.position_ms)
  const elapsed = Date.now() - new Date(session.updated_at).getTime()
  const pos = session.position_ms + Math.max(0, elapsed)
  return session.duration_ms ? Math.min(pos, session.duration_ms) : pos
}
