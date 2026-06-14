import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let adminClient: SupabaseClient | null = null

/** Server-only Supabase client. Uses service role when available, otherwise anon key. */
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  if (!serviceKey && !anonKey) throw new Error('No Supabase key configured')

  adminClient = createClient(url, serviceKey ?? anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return adminClient
}

export function hasServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}
