import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import { internalErrorMessage } from '@/lib/api-errors'
import { gameTypeLabel } from '@/lib/game-types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { GLOBAL_SCOPE } from '@/lib/trophies/criteria'

/**
 * One person, in enough detail to answer a support question.
 *
 * This is the ONLY place an email is read, and only for the single profile being looked at —
 * see the note in the list route about why the list deliberately doesn't carry them.
 *
 * READ-ONLY BY DESIGN. There is no edit, ban or delete here. Deleting a profile cascades from
 * `auth.users` and would take the player's whole trophy history with it, and renaming someone
 * from an admin screen changes a name they chose without telling them. If an account action is
 * ever needed it should be its own deliberate endpoint with its own confirmation, not a button
 * that happens to be next to the stats.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const supabase = getSupabaseAdmin()

    const [{ data: profile, error }, { data: stats }, { data: earned }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('player_stats')
        .select('game_type, games_played, games_won, counters, updated_at')
        .eq('profile_id', id),
      supabase
        .from('player_trophies')
        .select('trophy_id, earned_at')
        .eq('profile_id', id)
        .order('earned_at', { ascending: false }),
    ])

    if (error) return NextResponse.json({ error: internalErrorMessage('admin/users', error) }, { status: 500 })
    if (!profile) return NextResponse.json({ error: 'No such user.' }, { status: 404 })

    // Trophy titles are a second lookup rather than a join so a retired or deleted trophy id
    // still lists (as its raw id) instead of dropping the row and under-reporting what they have.
    const trophyIds = (earned ?? []).map((r) => r.trophy_id as string)
    const { data: catalog } = trophyIds.length
      ? await supabase.from('trophies').select('id, title, tier, points, game_type, is_active').in('id', trophyIds)
      : { data: [] as Record<string, unknown>[] }
    const byId = new Map((catalog ?? []).map((t) => [t.id as string, t]))

    // `getUserById` rather than listUsers: one address for one person, no pagination over the
    // whole auth table.
    let email: string | null = null
    let emailConfirmedAt: string | null = null
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(id)
      email = authUser?.user?.email ?? null
      emailConfirmedAt = authUser?.user?.email_confirmed_at ?? null
    } catch {
      // An identity can exist in `profiles` with no reachable auth row (a merged-away account).
      // That is worth showing as "no email" rather than failing the whole page.
    }

    const global = (stats ?? []).find((r) => (r.game_type as string) === GLOBAL_SCOPE)
    const perGame = (stats ?? [])
      .filter((r) => (r.game_type as string) !== GLOBAL_SCOPE)
      .map((r) => ({
        gameType: r.game_type as string,
        label: gameTypeLabel(r.game_type as string) ?? (r.game_type as string),
        gamesPlayed: Number(r.games_played) || 0,
        gamesWon: Number(r.games_won) || 0,
        counters: (r.counters ?? {}) as Record<string, number>,
        updatedAt: r.updated_at,
      }))
      .sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.label.localeCompare(b.label))

    return NextResponse.json({
      user: {
        id: profile.id,
        handle: (profile.handle as string) || null,
        isAnonymous: Boolean(profile.is_anonymous),
        email,
        emailConfirmedAt,
        trophyPoints: Number(profile.trophy_points) || 0,
        trophyLevel: Number(profile.trophy_level) || 1,
        currentStreak: Number(profile.current_streak) || 0,
        longestStreak: Number(profile.longest_streak) || 0,
        lastActiveDate: (profile.last_active_date as string) || null,
        createdAt: profile.created_at,
        preferredTheme: (profile.preferred_theme as string) || null,
      },
      totals: {
        gamesPlayed: Number(global?.games_played) || 0,
        gamesWon: Number(global?.games_won) || 0,
        gameTypes: perGame.length,
        // The cross-game counters bag carries days_played and the other platform-wide measures
        // trophies are written against — useful when someone asks why a trophy hasn't fired.
        counters: (global?.counters ?? {}) as Record<string, number>,
      },
      perGame,
      trophies: (earned ?? []).map((r) => {
        const t = byId.get(r.trophy_id as string)
        return {
          id: r.trophy_id,
          title: (t?.title as string) ?? (r.trophy_id as string),
          tier: (t?.tier as string) ?? null,
          points: Number(t?.points) || 0,
          gameType: (t?.game_type as string) ?? null,
          gameLabel: t?.game_type ? (gameTypeLabel(t.game_type as string) ?? (t.game_type as string)) : null,
          // Titles are built from shared templates, so "First round" exists once per game and
          // once cross-game. Without the game beside it the list reads as a duplicate award.
          isActive: t ? Boolean(t.is_active) : false,
          earnedAt: r.earned_at,
        }
      }),
    })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('admin/users', err) }, { status: 500 })
  }
}
