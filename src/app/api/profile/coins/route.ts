import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { reasonInFilter, type CoinHistoryFilter } from '@/lib/coins/reasons'

/**
 * The caller's own coin balance + a page of their ledger history.
 *
 * A guest gets `{ profile: null }` and 200, not 401 — same posture as
 * `/api/profile/me`: having no identity is a supported state, and the UI
 * shows nothing rather than an error.
 *
 * `?limit=50&offset=0&filter=all|earned|spent|refund|admin` — filter is applied
 * SERVER-SIDE against the reason string. Filter buckets live in
 * `src/lib/coins/reasons.ts` so client and server share the same partition.
 */
const PAGE_MAX = 50

function parseFilter(v: string | null): CoinHistoryFilter {
  switch (v) {
    case 'earned':
    case 'spent':
    case 'refund':
    case 'admin':
      return v
    default:
      return 'all'
  }
}

export async function GET(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ profile: null, ledger: [] })

    const url = new URL(req.url)
    const rawLimit = Number(url.searchParams.get('limit') ?? PAGE_MAX)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, Math.floor(rawLimit)), PAGE_MAX) : PAGE_MAX
    const rawOffset = Number(url.searchParams.get('offset') ?? 0)
    const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0
    const filter = parseFilter(url.searchParams.get('filter'))

    const admin = getSupabaseAdmin()

    const [{ data: profile, error: profileErr }, { data: ledger, error: ledgerErr }] = await Promise.all([
      admin.from('profiles').select('id, handle, coins').eq('id', profileId).maybeSingle(),
      admin
        .from('coin_ledger')
        .select('id, delta, balance_after, reason, ref_id, admin_category, admin_note, metadata, created_at')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),
    ])

    if (profileErr) return NextResponse.json({ error: internalErrorMessage('profile/coins', profileErr) }, { status: 500 })
    if (ledgerErr) return NextResponse.json({ error: internalErrorMessage('profile/coins', ledgerErr) }, { status: 500 })

    // Apply the filter server-side against the reason bucket. Filter is on
    // the RAW row, before pagination re-slicing: a "spent-only" view of a
    // 200-row ledger should return every spent row, not just the ones that
    // happened to fall in the current page.
    const filtered = (ledger ?? []).filter((r) => reasonInFilter(r.reason as string, filter))

    return NextResponse.json({
      profile: profile ?? null,
      ledger: filtered,
      hasMore: (ledger ?? []).length === limit,
      filter,
      offset,
      limit,
    })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/coins', err) }, { status: 500 })
  }
}
