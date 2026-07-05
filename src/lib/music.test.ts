import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { livePositionMs, type MusicSession } from './music'

function session(over: Partial<MusicSession>): MusicSession {
  return {
    game_id: 'ABC123',
    track_uri: 'spotify:track:x',
    track_name: 'Song',
    artist: 'Artist',
    album_art: null,
    duration_ms: 200_000,
    is_playing: true,
    position_ms: 0,
    updated_at: new Date().toISOString(),
    ...over,
  }
}

describe('livePositionMs', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns the stored position while paused (no extrapolation)', () => {
    vi.setSystemTime(new Date('2026-07-05T00:00:10Z'))
    const s = session({ is_playing: false, position_ms: 42_000, updated_at: '2026-07-05T00:00:00Z' })
    expect(livePositionMs(s)).toBe(42_000)
  })

  it('adds elapsed time since the last host write while playing', () => {
    vi.setSystemTime(new Date('2026-07-05T00:00:05Z'))
    const s = session({ is_playing: true, position_ms: 10_000, updated_at: '2026-07-05T00:00:00Z' })
    // 10s stored + 5s elapsed = 15s
    expect(livePositionMs(s)).toBe(15_000)
  })

  it('clamps to the track duration', () => {
    vi.setSystemTime(new Date('2026-07-05T00:10:00Z'))
    const s = session({
      is_playing: true,
      position_ms: 190_000,
      updated_at: '2026-07-05T00:00:00Z',
      duration_ms: 200_000,
    })
    expect(livePositionMs(s)).toBe(200_000)
  })

  it('never returns a negative position', () => {
    vi.setSystemTime(new Date('2026-07-05T00:00:00Z'))
    const s = session({ is_playing: false, position_ms: -500, updated_at: '2026-07-05T00:00:00Z' })
    expect(livePositionMs(s)).toBe(0)
  })
})
