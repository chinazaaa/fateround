import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/config'
export { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY')
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return client
}
