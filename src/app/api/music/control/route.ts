import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Host-only music control. The host computes the desired playback state client-side and
 * writes it here; players receive it through Supabase Realtime on `music_sessions`.
 * Authorization mirrors the other host-authoritative routes: verify `hostToken` against
 * the game's secret `host_token` via the service role, then write as the service role.
 *
 * Body:
 *   { gameCode, hostToken,
 *     musicEnabled?: boolean,   // toggle the per-room feature flag
 *     session?: {               // desired now-playing state; null = stop/clear
 *       track_uri, track_name, artist, album_art, duration_ms, is_playing, position_ms
 *     } | null }
 */
type SessionPatch = {
  track_uri?: string | null
  track_name?: string | null
  artist?: string | null
  album_art?: string | null
  duration_ms?: number | null
  is_playing?: boolean
  position_ms?: number
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      gameCode?: string
      hostToken?: string
      musicEnabled?: boolean
      session?: SessionPatch | null
    }
    const gameCode = body.gameCode?.trim().toUpperCase()
    const hostToken = body.hostToken?.trim()
    if (!gameCode || !hostToken) {
      return NextResponse.json({ error: 'gameCode and hostToken are required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: game, error: gameErr } = await supabase
      .from('games')
      .select('id,host_token')
      .eq('id', gameCode)
      .maybeSingle()
    // A real DB failure is a 500, not a misleading "Game not found" 404.
    if (gameErr) return NextResponse.json({ error: internalErrorMessage('music/control', gameErr) }, { status: 500 })
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    if (typeof body.musicEnabled === 'boolean') {
      const { error } = await supabase.from('games').update({ music_enabled: body.musicEnabled }).eq('id', gameCode)
      if (error) return NextResponse.json({ error: internalErrorMessage('music/control', error) }, { status: 500 })
    }

    if (body.session === null) {
      // Stop music entirely — remove the row so players' now-playing bar clears.
      const { error } = await supabase.from('music_sessions').delete().eq('game_id', gameCode)
      if (error) return NextResponse.json({ error: internalErrorMessage('music/control', error) }, { status: 500 })
    } else if (body.session) {
      const s = body.session
      const row = {
        game_id: gameCode,
        track_uri: s.track_uri ?? null,
        track_name: s.track_name ?? null,
        artist: s.artist ?? null,
        album_art: s.album_art ?? null,
        duration_ms: typeof s.duration_ms === 'number' ? s.duration_ms : null,
        is_playing: Boolean(s.is_playing),
        position_ms: Math.max(0, Math.round(s.position_ms ?? 0)),
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('music_sessions').upsert(row, { onConflict: 'game_id' })
      if (error) return NextResponse.json({ error: internalErrorMessage('music/control', error) }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = internalErrorMessage('music/control', err, 'Music control failed')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
