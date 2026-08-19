import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { notifyGameEvent } from '@/lib/push'

/**
 * Client-side fallback for the T-13 idle-warning push.
 *
 * The pg_cron job in 20261015120000_warn_idle_waiting_lobbies_cron.sql is
 * the primary path, but it requires operator setup (CRON_SECRET + app.*
 * GUCs). Until that's in place, the host's IdleWarningBanner also POSTs
 * here so the push still goes out whenever the host has the tab open at
 * the threshold — same atomic guard as the cron endpoint, so if both fire
 * only one push lands.
 *
 * Auth: hostToken (not CRON_SECRET) since this is a browser-initiated call
 * from the host's device.
 */

const schema = z.object({ hostToken: z.string().min(1) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameCode = code.toUpperCase()
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  // Authenticate + confirm the game is still in the waiting state that the
  // warning is meaningful for. Do not enforce the 13-min threshold here —
  // the banner already only fires past it; a slightly early call is
  // harmless once the stamp guard below has run.
  const { data: game } = await admin
    .from('games')
    .select('id, status, host_token, host_idle_warning_sent_at')
    .eq('id', gameCode)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== parsed.data.hostToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (game.status !== 'waiting') return NextResponse.json({ ok: true, warned: false })
  if (game.host_idle_warning_sent_at) return NextResponse.json({ ok: true, warned: false })

  // Atomic stamp — matches the cron endpoint's guard, so a race between
  // this call and a cron tick only sends one push (whichever writes the
  // NOT NULL first wins; the loser sees a zero-row update and skips).
  const now = new Date().toISOString()
  const { data: stamped } = await admin
    .from('games')
    .update({ host_idle_warning_sent_at: now })
    .eq('id', gameCode)
    .is('host_idle_warning_sent_at', null)
    .select('id')
  if (!stamped || stamped.length === 0) return NextResponse.json({ ok: true, warned: false })

  try {
    await notifyGameEvent(gameCode, 'host_idle_warning')
  } catch {
    // Non-fatal — the stamp stays so a next tick doesn't retry+spam.
  }
  return NextResponse.json({ ok: true, warned: true })
}
