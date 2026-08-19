import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Discovery Phase C follow-up — RSVP roster for the "Transfer host" picker.
 *
 * Returns every device that has RSVP'd to a scheduled game, along with the
 * display name they supplied (or "Anon" as a fallback). Only useful while
 * the game is still `status='scheduled'` — after transition to waiting the
 * seated-player flow takes over.
 *
 * Read-only, no auth beyond knowing the game code — the roster is public
 * information about a public game. Nothing sensitive (raw device tokens,
 * emails, etc.) is exposed.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameCode = code.toUpperCase()

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('game_rsvps')
    .select('device_id, display_name, confirmed_at')
    .eq('game_id', gameCode)
    .order('rsvped_at', { ascending: true })

  if (error) return NextResponse.json({ rsvpers: [] })
  const rsvpers = (data ?? []).map((r) => ({
    deviceId: r.device_id as string,
    name: (r.display_name as string | null) || 'Anon',
    confirmed: !!r.confirmed_at,
  }))
  return NextResponse.json({ rsvpers })
}
