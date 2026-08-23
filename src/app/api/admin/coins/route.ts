import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Admin coin adjustment (plan §"Admin coin adjustment").
 *
 * POST body: { profileId, delta, category, note }
 *
 * Guardrails:
 *   • Admins can only move the coin balance itself — never grant a specific
 *     edition/theme/frame directly. The player uses the coins to buy what
 *     they want. Keeps ownership truth in the shop, and the audit clean.
 *   • Note is required (>= 10 chars) so audit rows carry a real reason.
 *   • Negative deltas (clawbacks) must be categorised as `correction` so a
 *     "we took coins back for goodwill" row can never appear.
 *   • Per-admin daily cap of 5 000 coins (sum of absolute deltas over the
 *     last 24h). Rare corrective grants are 100–500; anything huge should
 *     require a code-side migration.
 *
 * The balance move + ledger insert run atomically inside the `admin_adjust_coins`
 * stored procedure — never in two API-side steps, which would let a
 * failure between them silently break the "ledger is truth" invariant.
 */

const DAILY_CAP_COINS = 5_000
const MIN_NOTE_LENGTH = 10
const CATEGORIES = ['bug_reimbursement', 'support_goodwill', 'promotion', 'correction', 'other'] as const
type Category = (typeof CATEGORIES)[number]

export async function POST(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { profileId?: string; delta?: number; category?: string; note?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const profileId = typeof body.profileId === 'string' ? body.profileId.trim() : ''
  const delta = Number(body.delta)
  const category = String(body.category ?? '') as Category
  const note = typeof body.note === 'string' ? body.note.trim() : ''

  if (!profileId) return NextResponse.json({ error: 'profileId is required.' }, { status: 400 })
  if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
    return NextResponse.json({ error: 'Delta must be a non-zero integer.' }, { status: 400 })
  }
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: 'Unknown category.' }, { status: 400 })
  }
  if (note.length < MIN_NOTE_LENGTH) {
    return NextResponse.json({ error: `Note must be at least ${MIN_NOTE_LENGTH} characters.` }, { status: 400 })
  }
  if (delta < 0 && category !== 'correction') {
    return NextResponse.json({ error: 'Negative adjustments must use category "correction".' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const adminEmail = session.email.toLowerCase()

  try {
    // Cap enforcement lives INSIDE the RPC under an advisory transaction
    // lock keyed on the admin — so two concurrent adjustments from the
    // same admin can't both see spentToday=0 and both post. The API layer
    // owns the policy value (5 000 coins over 24h) and hands it in.
    const { data: newBalance, error: rpcErr } = await supabase.rpc('admin_adjust_coins', {
      p_profile_id: profileId,
      p_delta: delta,
      p_admin_email: adminEmail,
      p_category: category,
      p_note: note,
      p_daily_cap_coins: DAILY_CAP_COINS,
    })
    if (rpcErr) {
      // The stored proc raises for "no such profile" and for programmer
      // errors (unknown category, note too short) — those show up here as
      // Postgres exceptions with descriptive text. Surface a generic
      // message to the client but keep the real reason server-side.
      const msg = String(rpcErr.message ?? '')
      if (msg.includes('no such profile')) {
        return NextResponse.json({ error: 'No such profile.' }, { status: 404 })
      }
      return NextResponse.json({ error: internalErrorMessage('admin/coins', rpcErr) }, { status: 500 })
    }
    if (newBalance === null) {
      // The RPC returns NULL for either "would underflow" or "would
      // breach the daily cap" — both are soft failures. Re-read the
      // recent spend so the client sees a live "spent so far" number
      // in either case.
      const spentToday = await readSpentToday(supabase, adminEmail)
      const remaining = Math.max(0, DAILY_CAP_COINS - spentToday)
      if (Math.abs(delta) > remaining) {
        return NextResponse.json(
          {
            error: `Per-admin daily cap reached (${spentToday.toLocaleString()} of ${DAILY_CAP_COINS.toLocaleString()} coins used in the last 24h). Wait for the window to roll, or use a code-side migration for a larger grant.`,
          },
          { status: 429 }
        )
      }
      return NextResponse.json({ error: 'Adjustment would take balance below zero.' }, { status: 409 })
    }

    const spentToday = await readSpentToday(supabase, adminEmail)
    return NextResponse.json({
      balance: Number(newBalance),
      delta,
      spentToday,
      cap: DAILY_CAP_COINS,
    })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('admin/coins', err) }, { status: 500 })
  }
}

async function readSpentToday(supabase: ReturnType<typeof getSupabaseAdmin>, adminEmail: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('coin_ledger')
    .select('delta')
    .eq('reason', 'admin_adjustment')
    .eq('admin_id', adminEmail)
    .gte('created_at', since)
  return (data ?? []).reduce((sum, r) => sum + Math.abs(Number(r.delta) || 0), 0)
}

/**
 * GET returns the profile's current balance and recent ledger rows so the
 * admin panel can show "before" state and history without a second call.
 * Query: ?profileId=<uuid>
 */
export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const profileId = (url.searchParams.get('profileId') ?? '').trim()
  if (!profileId) return NextResponse.json({ error: 'profileId is required.' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const adminEmail = session.email.toLowerCase()

  try {
    const [{ data: profile, error: pErr }, { data: ledger, error: lErr }, spentToday] = await Promise.all([
      supabase.from('profiles').select('id, handle, coins').eq('id', profileId).maybeSingle(),
      supabase
        .from('coin_ledger')
        .select('id, delta, balance_after, reason, admin_id, admin_category, admin_note, created_at')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(20),
      readSpentToday(supabase, adminEmail),
    ])
    if (pErr) return NextResponse.json({ error: internalErrorMessage('admin/coins', pErr) }, { status: 500 })
    if (lErr) return NextResponse.json({ error: internalErrorMessage('admin/coins', lErr) }, { status: 500 })
    if (!profile) return NextResponse.json({ error: 'No such profile.' }, { status: 404 })

    return NextResponse.json({
      profile: { id: profile.id, handle: profile.handle, coins: Number(profile.coins) || 0 },
      ledger: ledger ?? [],
      cap: DAILY_CAP_COINS,
      spentToday,
    })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('admin/coins', err) }, { status: 500 })
  }
}
