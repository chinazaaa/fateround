import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Discovery Phase C — "Your upcoming games" strip source.
 *
 * Reads the caller's RSVPs and joins to each scheduled game so the home
 * strip can render the game emoji, label, host title, and scheduled_at
 * without a second round-trip. Filters out finished/cancelled games so a
 * host_cancelled RSVP falls off the strip on the next focus refresh.
 */

export async function GET(req: NextRequest) {
  const tokenKey = req.nextUrl.searchParams.get('tokenKey')
  if (!tokenKey) return NextResponse.json({ upcoming: [] })

  const admin = getSupabaseAdmin()
  const { data: device } = await admin
    .from('notification_subscriber_devices')
    .select('id')
    .eq('token_key', tokenKey)
    .maybeSingle()
  if (!device) return NextResponse.json({ upcoming: [] })

  const { data } = await admin
    .from('game_rsvps')
    .select('id, confirmed_at, game:games(id, title, game_type, status, scheduled_at, is_public, max_players)')
    .eq('device_id', device.id)

  const rows = (data ?? []) as unknown as Array<{
    id: string
    confirmed_at: string | null
    game: {
      id: string
      title: string | null
      game_type: string
      status: string
      scheduled_at: string | null
      is_public: boolean | null
      max_players: number | null
    } | null
  }>

  // Keep only scheduled OR waiting-but-still-fresh games. finished/cancelled
  // rows are stale and should stop taking up the home strip.
  const upcoming = rows
    .map((r) => r.game)
    .filter((g): g is NonNullable<(typeof rows)[number]['game']> => !!g)
    .filter((g) => g.status === 'scheduled' || g.status === 'waiting')
    .sort((a, b) => {
      const at = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
      const bt = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
      return at - bt
    })

  return NextResponse.json({ upcoming })
}
