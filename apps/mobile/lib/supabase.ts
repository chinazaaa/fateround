import { AppState } from 'react-native'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/config'
import { secureStoreAdapter } from '@/lib/identity-storage'
export { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'

let client: SupabaseClient | null = null
let autoRefreshBound = false

/**
 * Keep the session fresh across backgrounding.
 *
 * supabase-js runs its token-refresh on a timer, and React Native suspends timers while the app
 * is backgrounded — so without this the session goes stale after a spell in the background and
 * the player looks spontaneously signed out. This is the documented RN pattern and the single
 * most common cause of "logged out on mobile for no reason"
 * (see `docs/accounts-and-identity-plan.md` §4A).
 */
function bindAutoRefresh(supabase: SupabaseClient): void {
  if (autoRefreshBound) return
  autoRefreshBound = true
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh()
    else void supabase.auth.stopAutoRefresh()
  })
}

export function getSupabase(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY')
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // React Native has no localStorage; without an explicit adapter supabase-js keeps the
        // session in memory only and a player loses their identity on every cold start.
        storage: secureStoreAdapter,
        persistSession: true,
        autoRefreshToken: true,
        // Sessions are never delivered via a URL fragment on native, and leaving this on makes
        // supabase-js poke at browser globals that don't exist here.
        detectSessionInUrl: false,
      },
    })
    bindAutoRefresh(client)
  }
  return client
}
