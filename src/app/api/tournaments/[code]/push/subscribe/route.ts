import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const bodySchema = z.object({
  // Either the tournament player's resume token, OR the tournament host_token
  // — whichever secret this device is proving. Router accepts both so a device
  // that's playing + hosting can subscribe once with whichever it has.
  resumeToken: z.string().trim().min(4).max(100).optional(),
  hostToken: z.string().trim().min(4).max(100).optional(),
  subscription: z.object({
    endpoint: z.string().url().max(2000),
    keys: z.object({
      p256dh: z.string().min(1).max(200),
      auth: z.string().min(1).max(200),
    }),
  }),
})

/**
 * Register a browser to receive push reminders for a scheduled tournament.
 * Auth is either the caller's tournament resume token OR the tournament's
 * host_token — both prove the caller belongs on this tournament's roster or
 * in its host chair. The subscription itself is per-browser (each browser has
 * its own endpoint), upserted on (tournament_id, endpoint) so re-subscribing
 * doesn't accrete duplicates.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { resumeToken, hostToken, subscription } = parsed.data
  if (!resumeToken && !hostToken) {
    return NextResponse.json({ error: 'Missing resumeToken or hostToken' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  // Authorise the caller against the tournament. Host token: direct compare
  // against tournaments.host_token. Player token: lookup in tournament_player_tokens.
  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, host_token')
    .eq('id', tournamentId)
    .maybeSingle()
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })

  let roleKey: string | null = null
  if (hostToken && hostToken === tournament.host_token) {
    roleKey = `host:${hostToken}`
  } else if (resumeToken) {
    const { data: tokenRow } = await admin
      .from('tournament_player_tokens')
      .select('player_id')
      .eq('tournament_id', tournamentId)
      .ilike('token', resumeToken)
      .maybeSingle()
    if (tokenRow) roleKey = `player:${tokenRow.player_id}`
  }
  if (!roleKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { error } = await admin.from('tournament_push_subscriptions').upsert(
    {
      tournament_id: tournamentId,
      role_key: roleKey,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: 'tournament_id,endpoint' }
  )
  if (error) {
    console.error('tournament push subscribe error:', error)
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
