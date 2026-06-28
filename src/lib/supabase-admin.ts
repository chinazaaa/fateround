import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let adminClient: SupabaseClient | null = null
let warnedAnonFallback = false

/**
 * Server-only Supabase client for authoritative writes.
 *
 * Uses the service role key, which bypasses RLS. This is the trusted boundary
 * for the RLS-hardening work (Option A): all writes flow through server routes
 * that authorize the caller via secret tokens (host_token / resume_token) and
 * then write as the service role.
 *
 * Fail-loud: in a production runtime the service role key is REQUIRED. We must
 * not silently fall back to the anon key there — once anon RLS is locked down,
 * an anon-key fallback would make "secured" writes fail (or, before lockdown,
 * silently keep bypassing the intended boundary). In local development we allow
 * an anon fallback (with a warning) so the app still runs without the key.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')

  // NODE_ENV is 'production' for both production and preview/staging deployments
  // (anything built with `next build`), and 'development' for local `next dev`.
  const isProductionRuntime = process.env.NODE_ENV === 'production'

  let key = serviceKey
  if (!key) {
    if (isProductionRuntime) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY is required for server-authoritative writes. ' +
          'Set it in this environment (production/preview). Refusing to fall back to the anon key.'
      )
    }
    if (!anonKey) {
      throw new Error('No Supabase key configured (need SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)')
    }
    if (!warnedAnonFallback) {
      warnedAnonFallback = true
      console.warn(
        '[supabase-admin] SUPABASE_SERVICE_ROLE_KEY not set — falling back to the anon key (development only). ' +
          'Writes will be subject to RLS; set the service role key to mirror production behavior.'
      )
    }
    key = anonKey
  }

  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return adminClient
}

export function hasServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}
