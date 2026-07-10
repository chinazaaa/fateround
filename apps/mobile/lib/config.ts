import Constants from 'expo-constants'

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined

/** Production API origin — override with EXPO_PUBLIC_API_URL for local dev. */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'https://fateround.com'

export const WEB_BASE_URL =
  process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, '') ?? API_BASE_URL

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabaseUrl ?? ''
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra?.supabaseAnonKey ?? ''

export const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0'

/** LiveKit wss URL — same host as web (`NEXT_PUBLIC_LIVEKIT_URL`). */
export const LIVEKIT_URL = process.env.EXPO_PUBLIC_LIVEKIT_URL?.replace(/\/$/, '') ?? ''

export function gameWebUrl(gameCode: string): string {
  return `${WEB_BASE_URL}/game/${encodeURIComponent(gameCode.toUpperCase())}`
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalized}`
}
