import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { searchTracks } from '@/lib/spotify'

/**
 * Track search for the host's music picker. Uses the Client Credentials flow (server-only,
 * no user auth) so the host can find tracks without connecting their own Spotify account.
 */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get('q')?.trim()
    if (!q) return NextResponse.json({ tracks: [] })

    const tracks = await searchTracks(q)
    return NextResponse.json({ tracks })
  } catch (err) {
    const message = internalErrorMessage('spotify/search', err, 'Spotify search failed')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
