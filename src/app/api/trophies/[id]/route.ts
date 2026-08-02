import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * One trophy's display details, for the mid-game unlock toast.
 *
 * The `round_unlocks` row carries only an id, because that is all a game route should have to
 * know. The toast needs a title and a tier to show, and the `trophies` table is not
 * client-readable by design (hidden trophies must not be discoverable before they are earned),
 * so this is the narrow read that bridges the two.
 *
 * DELIBERATELY UNAUTHENTICATED, and safe to be: it returns a title, tier and points for a single
 * id the caller already has to know. There is nothing here a player couldn't see on the game's
 * landing page — which reads the same catalog.
 *
 * A HIDDEN TROPHY IS STILL MASKED. Same rule the profile and landing pages apply: hidden means
 * secret until earned, so the title is withheld rather than leaked through this endpoint. The
 * toast then shows nothing, which is the right outcome — a hidden trophy that announces itself
 * mid-game is not hidden.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data, error } = await getSupabaseAdmin()
      .from('trophies')
      .select('id, title, tier, points, hidden')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle()

    if (error) return NextResponse.json({ error: internalErrorMessage('trophies/id', error) }, { status: 500 })
    if (!data || data.hidden) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ id: data.id, title: data.title, tier: data.tier, points: data.points })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('trophies/id', err) }, { status: 500 })
  }
}
