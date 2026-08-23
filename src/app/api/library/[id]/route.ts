import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getProfileFromRequest } from '@/lib/identity-server'

/**
 * Fetch one library pack's questions.
 *
 * Phase 3 gate: a pack with `price_coins > 0` (a premium pack) only
 * hands back its questions to a caller who owns it. Grandfathered
 * free packs (price_coins=0) stay open to everyone, matching the
 * pre-Phase-3 behavior. Without this gate, a signed-out user could
 * hit `/api/library/<uuid>` directly and read every question in a
 * premium pack without ever spending a coin.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = getSupabaseAnon()

  const { data, error } = await supabase
    .from('question_packs')
    .select('id, title, game_type, author_name, description, question_count, questions, approved_at, price_coins')
    .eq('id', id)
    .eq('status', 'approved')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const price = Number((data as { price_coins?: number }).price_coins ?? 0)
  if (price > 0) {
    const profileId = await getProfileFromRequest(req).catch(() => null)
    if (!profileId) {
      return NextResponse.json({ error: 'Sign in to unlock this pack' }, { status: 401 })
    }
    const admin = getSupabaseAdmin()
    const { data: owned, error: ownedErr } = await admin
      .from('profile_owned_packs')
      .select('pack_id')
      .eq('profile_id', profileId)
      .eq('pack_id', id)
      .maybeSingle()
    if (ownedErr) return NextResponse.json({ error: 'Could not check ownership' }, { status: 500 })
    if (!owned) {
      // Deliberately return a 402 with a small preview slice (first 2
      // items) — matches the plan's "Tap to preview 1–2 items, tap
      // again to unlock" copy so the client can render the paywall
      // without a second round-trip.
      const preview = Array.isArray((data as { questions?: unknown[] }).questions)
        ? ((data as { questions: unknown[] }).questions ?? []).slice(0, 2)
        : []
      const { questions: _q, ...meta } = data as Record<string, unknown>
      void _q
      return NextResponse.json({ error: 'Locked', pack: { ...meta, preview, locked: true } }, { status: 402 })
    }
  }

  return NextResponse.json({ pack: data })
}
