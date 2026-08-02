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

/**
 * The trophy list for one game, for logged-out/public surfaces (game landing pages).
 *
 * No player context here, so "earned" doesn't exist — a hidden trophy is masked unconditionally,
 * the same secret-until-earned rule `/api/profile/trophies` applies once there's a profile to
 * check against. See src/app/api/profile/trophies/route.ts for the authenticated version.
 */
export async function getPublicTrophiesForGame(gameType: string): Promise<PublicTrophy[]> {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('trophies')
    .select('id, tier, title, description, points, hidden, sort_order')
    .eq('game_type', gameType)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error || !data) return []

  return data.map((row) => ({
    id: row.id as string,
    tier: row.tier as string,
    title: row.hidden ? 'Secret trophy' : (row.title as string),
    description: row.hidden ? 'Keep playing to uncover this one.' : (row.description as string),
    points: Number(row.points) || 0,
    hidden: Boolean(row.hidden),
    sortOrder: Number(row.sort_order) || 0,
  }))
}
