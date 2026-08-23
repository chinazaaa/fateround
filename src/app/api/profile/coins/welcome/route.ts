import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Read the caller's `launch_grant_v1` ledger row, if any. The itemization
 * lives in the row's `metadata` jsonb (written by `grant_launch_v1()` — see
 * the Phase 1 RPC migration). The client shows the itemized welcome screen
 * once and marks it seen in localStorage, so this endpoint is read-only.
 *
 * Also surfaces the welcome_v1 credit + any guest_migration credit so the
 * "first-signup" welcome screen can quote real totals from server-truth data
 * (see plan §"Guest earnings & migration").
 *
 * A guest gets `{ hasGrant: false }` and 200.
 */
export async function GET(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ hasGrant: false, welcome: null, migration: null, launch: null })

    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('coin_ledger')
      .select('id, delta, balance_after, reason, ref_id, metadata, created_at')
      .eq('profile_id', profileId)
      .in('reason', ['launch_grant_v1', 'welcome_v1', 'guest_migration'])
      .order('created_at', { ascending: true })

    if (error)
      return NextResponse.json({ error: internalErrorMessage('profile/coins/welcome', error) }, { status: 500 })

    const launch = (data ?? []).find((r) => r.reason === 'launch_grant_v1') ?? null
    const welcome = (data ?? []).find((r) => r.reason === 'welcome_v1') ?? null
    const migration = (data ?? []).find((r) => r.reason === 'guest_migration') ?? null

    return NextResponse.json({
      hasGrant: Boolean(launch || welcome || migration),
      launch,
      welcome,
      migration,
    })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/coins/welcome', err) }, { status: 500 })
  }
}
