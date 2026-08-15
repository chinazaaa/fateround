import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const bodySchema = z.object({
  endpoint: z.string().url().max(2000),
})

/**
 * Drop this device's push subscription for the tournament. Auth-free by design:
 * the endpoint itself is a per-browser secret, so knowing it is equivalent to
 * proving you own that browser — same pattern the games unsubscribe uses.
 * Idempotent — deleting an already-absent row succeeds silently.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  await admin
    .from('tournament_push_subscriptions')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('endpoint', parsed.data.endpoint)

  return NextResponse.json({ ok: true })
}
