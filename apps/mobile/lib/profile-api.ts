/**
 * Mobile profile / trophy API client.
 *
 * Wraps the three GET endpoints web already ships: `/api/profile/me`,
 * `/api/profile/games`, `/api/profile/trophies`. Types mirror the server
 * responses closely enough that a screen author reads the same field
 * names as the endpoint author wrote — no wrapping layer to drift.
 *
 * Everything null-safe. A signed-out user reading their own profile just
 * gets `null` profile + empty lists, not an error.
 */

import { apiUrl } from '@/lib/config'
import { authHeaders } from '@/lib/identity'

// ── Shapes ──────────────────────────────────────────────────────────────────

export type ProfileMe = {
  id: string
  handle: string | null
  avatar_url: string | null
  is_anonymous: boolean
  trophy_points: number
  trophy_level: number
  current_streak: number
  longest_streak: number
  last_active_date: string | null
  streak_freezes: number
  default_voice_on: boolean
  preferred_theme: string | null
  username: string | null
}

export type ProfileGameRow = {
  gameType: string
  label: string
  emoji: string
  category: string
  gamesPlayed: number
  gamesWon: number
  earned: number
  total: number
  points: number
  tiers: { bronze: number; silver: number; gold: number; platinum: number }
  pct: number
}

export type TrophyItem = {
  id: string
  gameType: string | null
  gameLabel: string | null
  tier: string
  title: string
  description: string
  points: number
  earned: boolean
  earnedAt: string | null
  progress: number
  rarityPct: number | null
}

export type TrophyGroup = {
  gameType: string | null
  label: string
  earned: number
  total: number
  trophies: TrophyItem[]
}

export type TrophyTotals = {
  earned: number
  total: number
  tiers: { bronze: number; silver: number; gold: number; platinum: number }
  pct: number
  points: number
  level: number
}

// ── Fetchers ────────────────────────────────────────────────────────────────

/**
 * `/api/profile/games` — the per-game roll-up the profile home shows.
 * Games the player has actually played, most-played first.
 */
export async function fetchProfileGames(): Promise<{ profile: ProfileMe | null; games: ProfileGameRow[] }> {
  const headers = await authHeaders()
  if (!headers) return { profile: null, games: [] }
  try {
    const res = await fetch(apiUrl('/api/profile/games'), { headers })
    if (!res.ok) return { profile: null, games: [] }
    return (await res.json()) as { profile: ProfileMe | null; games: ProfileGameRow[] }
  } catch {
    return { profile: null, games: [] }
  }
}

/**
 * `/api/profile/trophies?game=<slug>` — the trophy grid for one game.
 * `game` = null → all games; 'platform' → cross-game trophies only.
 * The route also returns `groups` and `rarest` we may want later.
 */
export async function fetchProfileTrophies(
  game?: string | null
): Promise<{ groups: TrophyGroup[]; totals: TrophyTotals | null; rarest: TrophyItem | null }> {
  const headers = await authHeaders()
  if (!headers) return { groups: [], totals: null, rarest: null }
  try {
    const url =
      game != null ? apiUrl(`/api/profile/trophies?game=${encodeURIComponent(game)}`) : apiUrl('/api/profile/trophies')
    const res = await fetch(url, { headers })
    if (!res.ok) return { groups: [], totals: null, rarest: null }
    const data = (await res.json()) as {
      groups: TrophyGroup[]
      totals: TrophyTotals | null
      rarest: TrophyItem | null
    }
    return { groups: data.groups ?? [], totals: data.totals ?? null, rarest: data.rarest ?? null }
  } catch {
    return { groups: [], totals: null, rarest: null }
  }
}

/**
 * `/api/profile/me` PATCH — rename the profile. Returns the saved handle, or an error
 * message the caller can surface.
 *
 * NOTE ON THE RESPONSE SHAPE. The route answers `{ handle }`, NOT `{ profile }`. This
 * client used to read `data.profile` and so returned null on every SUCCESSFUL save, which
 * made the one place mobile lets you rename (`DailyNamePrompt`) pop "Could not save name —
 * please try again" after a rename that had in fact gone through. Read what the route
 * actually returns, and let the caller merge it into the profile it already holds rather
 * than inventing a `ProfileMe` the server never sent.
 */
export async function updateProfileHandle(handle: string): Promise<{ handle: string } | { error: string }> {
  const headers = await authHeaders()
  if (!headers) return { error: 'Sign in to change your name' }
  try {
    const res = await fetch(apiUrl('/api/profile/me'), {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ handle }),
    })
    const data = (await res.json().catch(() => ({}))) as { handle?: string; error?: string }
    if (!res.ok) return { error: data.error ?? 'Could not save your name.' }
    return { handle: data.handle ?? handle }
  } catch {
    return { error: 'Could not save your name.' }
  }
}

/**
 * `/api/profile/settings` PATCH — the account preferences that live on the profile row
 * rather than on the device: the voice-chat default today, `preferred_theme` if mobile ever
 * stops keeping theme in SecureStore. Device-local prefs (sound, notifications, appearance)
 * stay in `constants/preferences-context` — they are per-install, not per-account.
 */
export async function updateProfileSettings(patch: {
  default_voice_on?: boolean
  preferred_theme?: 'light' | 'dark' | 'system'
}): Promise<{ ok: true } | { error: string }> {
  const headers = await authHeaders()
  if (!headers) return { error: 'Sign in to change this' }
  try {
    const res = await fetch(apiUrl('/api/profile/settings'), {
      method: 'PATCH',
      headers,
      body: JSON.stringify(patch),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) return { error: data.error ?? 'Could not save that setting.' }
    return { ok: true }
  } catch {
    return { error: 'Could not save that setting.' }
  }
}
