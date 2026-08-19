import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { gameTypeLabel } from '@/lib/game-types'
import { getProfileFromRequest } from '@/lib/identity-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildSnapshot } from '@/lib/trophies/award'
import { evaluateRaw } from '@/lib/trophies/criteria'
import { byTierDesc } from '@/lib/trophies/tier-rank'

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

    // `?game=` narrows to one game's trophies; `?game=platform` to the cross-game ones. The
    // trophy list is browsed one game at a time, so the default of "everything" is only used by
    // callers that genuinely want the lot.
    const scope = new URL(req.url).searchParams.get('game')

    const admin = getSupabaseAdmin()
    // One parallel phase: the profile, the catalog, this player's earned rows and the rarity table,
    // plus the eligible-player count and the progress snapshot — none depend on each other, so
    // firing them together turns three serial round-trips into one.
    const [
      { data: profile },
      { data: catalog, error },
      { data: earnedRows },
      { data: rarityRows },
      { count: playerCount },
      snapshot,
    ] = await Promise.all([
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
      // Eligible = people who have played anything. Good enough while the population is small, and
      // honest: it never reports a trophy as rarer than the number of people who could hold it.
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      buildSnapshot(admin, profileId),
    ])

    if (error) return NextResponse.json({ error: internalErrorMessage('profile/trophies', error) }, { status: 500 })

    const earnedAt = new Map((earnedRows ?? []).map((r) => [r.trophy_id as string, r.earned_at as string]))
    const earnerCounts = new Map<string, number>()
    for (const row of rarityRows ?? []) {
      const id = row.trophy_id as string
      earnerCounts.set(id, (earnerCounts.get(id) ?? 0) + 1)
    }
    const eligible = Math.max(1, playerCount ?? 1)
    const rarity = new Map([...earnerCounts.entries()].map(([id, n]) => [id, Math.round((n / eligible) * 100)]))
    // `longest_streak` lives on `profiles`, not `player_stats` — mirrors the award pass, or a
    // streak trophy would always read as 0% here while being earnable in reality.
    snapshot.counters.__global__ = {
      ...(snapshot.counters.__global__ ?? {}),
      longest_streak: Number(profile?.longest_streak) || 0,
    }

    // Build platinum context so platinum trophy progress displays correctly.
    const gameTrophyIds = new Map<string, string[]>()
    for (const row of catalog ?? []) {
      const gt = row.game_type as string | null
      const crit = row.criteria as Record<string, unknown> | null
      if (crit?.type === 'platinum' || !gt) continue
      const list = gameTrophyIds.get(gt) ?? []
      list.push(row.id as string)
      gameTrophyIds.set(gt, list)
    }
    const platinumCtx = { gameTrophyIds, earnedIds: new Set(earnedAt.keys()) }

    const items = (catalog ?? [])
      .filter((row) => {
        if (!scope) return true
        const gameType = (row.game_type as string | null) ?? null
        return scope === 'platform' ? gameType === null : gameType === scope
      })
      .map((row) => {
        const id = row.id as string
        const earned = earnedAt.has(id)
        const verdict = evaluateRaw(row.criteria, snapshot, platinumCtx)
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
      // Highest tier first (platinum → bronze), matching every other trophy list in the app;
      // earned trophies lead within a tier, then the catalog's own ordering.
      .sort((a, b) => byTierDesc(a, b) || Number(b.earned) - Number(a.earned))

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
    const mine = items.filter((t) => t.earned)
    const tiers = { bronze: 0, silver: 0, gold: 0, platinum: 0 }
    for (const t of mine) {
      const tier = t.tier as keyof typeof tiers
      if (tier in tiers) tiers[tier] += 1
    }
    // The one you're most likely to want to show someone. Ties break on the earlier date, so
    // it doesn't shuffle every time two trophies share a rarity.
    const rarest =
      [...mine].sort(
        (a, b) => (a.rarityPct ?? 100) - (b.rarityPct ?? 100) || (a.earnedAt ?? '').localeCompare(b.earnedAt ?? '')
      )[0] ?? null

    return NextResponse.json({
      profile: profile ?? null,
      groups,
      rarest,
      totals: {
        earned: earnedCount,
        total: items.length,
        tiers,
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
