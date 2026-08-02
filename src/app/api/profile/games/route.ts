import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { GAME_TYPE_CONFIG, gameTypeCategory, gameTypeLabel } from '@/lib/game-types'
import { getProfileFromRequest } from '@/lib/identity-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { GLOBAL_SCOPE } from '@/lib/trophies/criteria'
import type { GameType } from '@/types'

/**
 * The trophy list: the games THIS PLAYER has played, with their progress in each.
 *
 * Modelled on a console trophy list rather than a catalogue. You don't browse every game that
 * exists — you see the ones you've played, and open one to see its trophies. Listing all 47
 * would bury the two you actually play, and would make an empty list the first thing a new
 * player sees.
 *
 * A game enters the list by being PLAYED, which is recorded in `player_stats`. Nothing is added
 * by admin creating a trophy for it — a Monopoly trophy existing is not a reason to show
 * Monopoly to someone who only plays Ayo.
 *
 * There is no cross-game bucket. Trophies are strictly per game: a player wants to know what
 * they can earn in the game they're playing, and a platform-wide pile is the thing they'd have
 * to scroll past to get there. `GLOBAL_SCOPE` still exists in `player_stats` because streaks and
 * days-played are measured across games — it just isn't a row anyone browses.
 */
export async function GET(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ profile: null, games: [] })

    const admin = getSupabaseAdmin()
    const [{ data: profile }, { data: stats }, { data: catalog, error }, { data: earnedRows }] = await Promise.all([
      admin
        .from('profiles')
        .select('handle, trophy_points, trophy_level, current_streak, longest_streak, last_active_date')
        .eq('id', profileId)
        .maybeSingle(),
      admin.from('player_stats').select('game_type, games_played, games_won').eq('profile_id', profileId),
      admin.from('trophies').select('id, game_type, points, tier').eq('is_active', true),
      admin.from('player_trophies').select('trophy_id').eq('profile_id', profileId),
    ])

    if (error) return NextResponse.json({ error: internalErrorMessage('profile/games', error) }, { status: 500 })

    const earned = new Set((earnedRows ?? []).map((r) => r.trophy_id as string))

    // Trophy totals per game type, so each row can show "3 / 11" plus the per-tier tally a
    // trophy list is usually scanned by, without loading every trophy.
    const totalsFor = (gameType: string | null) => {
      const list = (catalog ?? []).filter((t) => (t.game_type as string | null) === gameType)
      const mine = list.filter((t) => earned.has(t.id as string))
      const tiers = { bronze: 0, silver: 0, gold: 0, platinum: 0 }
      for (const t of mine) {
        const tier = t.tier as keyof typeof tiers
        if (tier in tiers) tiers[tier] += 1
      }
      return {
        earned: mine.length,
        total: list.length,
        points: mine.reduce((sum, t) => sum + (Number(t.points) || 0), 0),
        tiers,
      }
    }

    const games = (stats ?? [])
      .filter((row) => (row.game_type as string) !== GLOBAL_SCOPE)
      .map((row) => {
        const gameType = row.game_type as GameType
        const config = GAME_TYPE_CONFIG[gameType]
        const totals = totalsFor(gameType)
        return {
          gameType,
          label: gameTypeLabel(gameType) ?? gameType,
          emoji: config?.card?.emoji ?? '🎮',
          category: config ? gameTypeCategory(gameType) : 'party',
          gamesPlayed: Number(row.games_played) || 0,
          gamesWon: Number(row.games_won) || 0,
          ...totals,
          pct: totals.total ? Math.round((totals.earned / totals.total) * 100) : 0,
        }
      })
      // Most-played first: the list should open on what this person actually plays.
      .sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.label.localeCompare(b.label))

    return NextResponse.json({
      profile: profile ?? null,
      games,
    })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/games', err) }, { status: 500 })
  }
}
