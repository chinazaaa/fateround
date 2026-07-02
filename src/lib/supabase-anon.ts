import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let anonClient: SupabaseClient | null = null

/**
 * Server-side Supabase client using the public anon key.
 *
 * This is a single shared, lazily-initialized singleton for API routes that
 * previously each constructed their own module-scope anon client. It mirrors
 * the memoized getter style of `getSupabaseAdmin()` in `supabase-admin.ts`.
 *
 * Behavior is identical to the previous per-route
 * `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)`
 * calls (default client options), just with one instance instead of many.
 *
 * Do NOT use this for the browser/client-component singleton — that lives in
 * `src/lib/supabase.ts`. For authoritative service-role writes use
 * `getSupabaseAdmin()` from `src/lib/supabase-admin.ts`.
 */
export function getSupabaseAnon(): SupabaseClient {
  if (anonClient) return anonClient

  anonClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  return anonClient
}
