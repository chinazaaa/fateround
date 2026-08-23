import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { reasonsInFilter, type CoinHistoryFilter } from '@/lib/coins/reasons'

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
    const bucketReasons = reasonsInFilter(filter)

    // Filter MUST run in the DB, not on the fetched page — a sparse filter
    // ("show me my one refund among 500 rows") would otherwise return an
    // empty page 1 and force the user to "Load more" six times before the
    // refund appeared. `.in('reason', ...)` is the whole partition; the
    // `.range()` slices AFTER that.
    let ledgerQuery = admin
      .from('coin_ledger')
      .select('id, delta, balance_after, reason, ref_id, admin_category, admin_note, metadata, created_at')
      .eq('profile_id', profileId)
    if (bucketReasons) {
      ledgerQuery = ledgerQuery.in('reason', bucketReasons as string[])
    }
    ledgerQuery = ledgerQuery.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

    const [{ data: profile, error: profileErr }, { data: ledger, error: ledgerErr }] = await Promise.all([
      admin.from('profiles').select('id, handle, coins').eq('id', profileId).maybeSingle(),
      ledgerQuery,
    ])

    if (profileErr)
      return NextResponse.json({ error: internalErrorMessage('profile/coins', profileErr) }, { status: 500 })
    if (ledgerErr)
      return NextResponse.json({ error: internalErrorMessage('profile/coins', ledgerErr) }, { status: 500 })

    return NextResponse.json({
      profile: profile ?? null,
      ledger: ledger ?? [],
      hasMore: (ledger ?? []).length === limit,
      filter,
      offset,
      limit,
    })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/coins', err) }, { status: 500 })
  }
}
