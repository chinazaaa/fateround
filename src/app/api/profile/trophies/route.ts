import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { gameTypeLabel } from '@/lib/game-types'
import { getProfileFromRequest } from '@/lib/identity-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildSnapshot } from '@/lib/trophies/award'
import { evaluateRaw } from '@/lib/trophies/criteria'

/**
 * Everything the trophy case needs: the catalog, what this profile has earned, and how far
 * along the rest are.
 *
 * WHY THIS IS SERVER-SIDE. The catalog table is not client-readable, deliberately — that is
 * what lets `hidden` mean something. A hidden trophy the player hasn't earned must not be
 * discoverable, and the only way to guarantee that is for the server to decide what to send,
 * rather than shipping the lot and trusting the client not to look.
 *
 * Progress is computed from the same snapshot the award pass uses, so the bar on the screen and
 * the rule that grants the trophy can never disagree.
 */
export async function GET(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ profile: null, groups: [], totals: null })

    const admin = getSupabaseAdmin()
    const [{ data: profile }, { data: catalog, error }, { data: earnedRows }, { data: rarityRows }] = await Promise.all(
      [
        admin
          .from('profiles')
          .select('handle, trophy_points, trophy_level, current_streak, longest_streak, last_active_date')
          .eq('id', profileId)
          .maybeSingle(),
        admin
          .from('trophies')
          .select('id, game_type, tier, title, description, criteria, points, hidden, sort_order')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        admin.from('player_trophies').select('trophy_id, earned_at').eq('profile_id', profileId),
        admin.from('trophy_rarity').select('trophy_id, pct'),
      ]
    )

    if (error) return NextResponse.json({ error: internalErrorMessage('profile/trophies', error) }, { status: 500 })

    const earnedAt = new Map((earnedRows ?? []).map((r) => [r.trophy_id as string, r.earned_at as string]))
    const rarity = new Map((rarityRows ?? []).map((r) => [r.trophy_id as string, Number(r.pct) || 0]))
    const snapshot = await buildSnapshot(admin, profileId)
    // `longest_streak` lives on `profiles`, not `player_stats` — mirrors the award pass, or a
    // streak trophy would always read as 0% here while being earnable in reality.
    snapshot.counters.__global__ = {
      ...(snapshot.counters.__global__ ?? {}),
      longest_streak: Number(profile?.longest_streak) || 0,
    }

    const items = (catalog ?? [])
      .map((row) => {
        const id = row.id as string
        const earned = earnedAt.has(id)
        const verdict = evaluateRaw(row.criteria, snapshot)
        return {
          id,
          gameType: (row.game_type as string | null) ?? null,
          gameLabel: gameTypeLabel(row.game_type as string | null),
          tier: row.tier as string,
          // A hidden trophy keeps its secret until it is earned: the player sees that something
          // exists and what it's worth, but not how to get it. Sending the real title and rule
          // and hiding them in CSS would not be hiding them at all.
          title: earned || !row.hidden ? (row.title as string) : 'Secret trophy',
          description: earned || !row.hidden ? (row.description as string) : 'Keep playing to uncover this one.',
          points: Number(row.points) || 0,
          earned,
          earnedAt: earnedAt.get(id) ?? null,
          progress: earned ? 1 : row.hidden ? 0 : verdict.progress,
          rarityPct: rarity.get(id) ?? null,
        }
      })
      // Earned first within each group, then by the catalog's own ordering.
      .sort((a, b) => Number(b.earned) - Number(a.earned))

    // Grouped by game so the case reads as "your Whot trophies", with cross-game ones first.
    const byGame = new Map<string | null, typeof items>()
    for (const item of items) {
      const key = item.gameType
      if (!byGame.has(key)) byGame.set(key, [])
      byGame.get(key)!.push(item)
    }

    const groups = [...byGame.entries()]
      .map(([gameType, list]) => ({
        gameType,
        label: gameType ? (gameTypeLabel(gameType) ?? gameType) : 'All games',
        earned: list.filter((t) => t.earned).length,
        total: list.length,
        trophies: list,
      }))
      .sort((a, b) => (a.gameType === null ? -1 : b.gameType === null ? 1 : a.label.localeCompare(b.label)))

    const earnedCount = items.filter((t) => t.earned).length
    return NextResponse.json({
      profile: profile ?? null,
      groups,
      totals: {
        earned: earnedCount,
        total: items.length,
        // Guard the divide: an empty catalog is a valid state before the seed has been run.
        pct: items.length ? Math.round((earnedCount / items.length) * 100) : 0,
        points: Number(profile?.trophy_points) || 0,
        level: Number(profile?.trophy_level) || 1,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/trophies', err) }, { status: 500 })
  }
}
