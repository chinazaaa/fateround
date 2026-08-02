import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type PublicTrophy = {
  id: string
  tier: string
  title: string
  description: string
  points: number
  hidden: boolean
  sortOrder: number
}

// Display order for the landing page strip: rarest/most prestigious tier first.
const TIER_RANK: Record<string, number> = { platinum: 0, gold: 1, silver: 2, bronze: 3 }

/**
 * The trophy list for one game, for logged-out/public surfaces (game landing pages).
 *
 * No player context here, so "earned" doesn't exist — a hidden trophy is masked unconditionally,
 * the same secret-until-earned rule `/api/profile/trophies` applies once there's a profile to
 * check against. See src/app/api/profile/trophies/route.ts for the authenticated version.
 *
 * NEVER THROWS. This runs during the STATIC BUILD of the game landing pages, and the build
 * environment does not carry the service-role key (`getSupabaseAdmin` fail-louds when it's
 * absent in a production build). A marketing page must not fail the whole build over an optional
 * trophy strip — so any failure, including the missing-key throw, degrades to an empty list. The
 * page is ISR (`revalidate`), so once it re-renders at runtime — where the key IS present — the
 * trophies fill in.
 */
export async function getPublicTrophiesForGame(gameType: string): Promise<PublicTrophy[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('trophies')
      .select('id, tier, title, description, points, hidden, sort_order')
      .eq('game_type', gameType)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error || !data) return []

    return data
      .map((row) => ({
        id: row.id as string,
        tier: row.tier as string,
        title: row.hidden ? 'Secret trophy' : (row.title as string),
        description: row.hidden ? 'Keep playing to uncover this one.' : (row.description as string),
        points: Number(row.points) || 0,
        hidden: Boolean(row.hidden),
        sortOrder: Number(row.sort_order) || 0,
      }))
      .sort((a, b) => (TIER_RANK[a.tier] ?? 99) - (TIER_RANK[b.tier] ?? 99) || a.sortOrder - b.sortOrder)
  } catch {
    // No service-role key (build time) or the query threw — show no trophies rather than break.
    return []
  }
}
