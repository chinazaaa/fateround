import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { GLOBAL_SCOPE } from '@/lib/trophies/criteria'

/**
 * The people list.
 *
 * A "user" here is a `profiles` row, which is created at a player's FIRST GAME FINISH — not at
 * join. So this is a list of people who have finished at least one game, which is deliberately
 * not the same as "everyone who has ever played": most players never create an identity at all,
 * and counting them is what `/admin` game stats are for. Reading this as total reach would
 * undercount the platform badly.
 *
 * NO EMAILS IN THE LIST. Emails live in `auth.users`, not `profiles`, and are fetched one at a
 * time on the detail view. Making the list carry them would turn a support tool into a
 * one-request export of every address we hold, which is a much bigger thing to leave behind an
 * admin session than a page of display names.
 *
 * Auth is asserted in the handler, not middleware — one matcher edit from being skipped.
 */

/** Page size. Big enough to scan, small enough that the per-profile roll-ups stay cheap. */
const PAGE_SIZE = 50

type Cohort = 'all' | 'account' | 'guest' | 'active'

export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = getSupabaseAdmin()
    const url = new URL(req.url)
    const search = (url.searchParams.get('q') ?? '').trim()
    const cohort = (url.searchParams.get('cohort') ?? 'all') as Cohort
    const page = Math.max(0, Number(url.searchParams.get('page')) || 0)

    // "Active" is last 30 days. `last_active_date` is the streak's own WAT-day stamp, so this
    // agrees with what the player sees on their streak rather than being a second definition.
    const activeSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    let hasCountryColumn = true
    let query = supabase
      .from('profiles')
      .select(
        'id, handle, is_anonymous, trophy_points, trophy_level, current_streak, longest_streak, last_active_date, created_at, country',
        { count: 'exact' }
      )

    if (search) query = query.ilike('handle', `%${search}%`)
    if (cohort === 'account') query = query.eq('is_anonymous', false)
    if (cohort === 'guest') query = query.eq('is_anonymous', true)
    if (cohort === 'active') query = query.gte('last_active_date', activeSince)

    let result = await query
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (result.error?.message?.includes('country')) {
      hasCountryColumn = false
      let retryQuery = supabase
        .from('profiles')
        .select(
          'id, handle, is_anonymous, trophy_points, trophy_level, current_streak, longest_streak, last_active_date, created_at',
          { count: 'exact' }
        )
      if (search) retryQuery = retryQuery.ilike('handle', `%${search}%`)
      if (cohort === 'account') retryQuery = retryQuery.eq('is_anonymous', false)
      if (cohort === 'guest') retryQuery = retryQuery.eq('is_anonymous', true)
      if (cohort === 'active') retryQuery = retryQuery.gte('last_active_date', activeSince)
      result = (await retryQuery
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)) as typeof result
    }

    const { data: profiles, count, error } = result
    if (error) return NextResponse.json({ error: internalErrorMessage('admin/users', error) }, { status: 500 })

    const ids = (profiles ?? []).map((p) => p.id as string)

    // Roll-ups for THIS PAGE only. Loading every player_stats row to compute totals for 50
    // people would grow with the whole table rather than with the page.
    const [{ data: stats }, { data: trophies }] = await Promise.all([
      ids.length
        ? supabase.from('player_stats').select('profile_id, game_type, games_played, games_won').in('profile_id', ids)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      ids.length
        ? supabase.from('player_trophies').select('profile_id').in('profile_id', ids)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ])

    const rollup = new Map<string, { played: number; won: number; gameTypes: number }>()
    for (const row of stats ?? []) {
      const id = row.profile_id as string
      const entry = rollup.get(id) ?? { played: 0, won: 0, gameTypes: 0 }
      // The GLOBAL_SCOPE row is the cross-game total, so counting it alongside the per-game
      // rows would double every number.
      if ((row.game_type as string) === GLOBAL_SCOPE) {
        entry.played = Number(row.games_played) || 0
        entry.won = Number(row.games_won) || 0
      } else {
        entry.gameTypes += 1
      }
      rollup.set(id, entry)
    }

    const trophyCounts = new Map<string, number>()
    for (const row of trophies ?? []) {
      const id = row.profile_id as string
      trophyCounts.set(id, (trophyCounts.get(id) ?? 0) + 1)
    }

    const users = (profiles ?? []).map((p) => {
      const roll = rollup.get(p.id as string) ?? { played: 0, won: 0, gameTypes: 0 }
      return {
        id: p.id,
        handle: (p.handle as string) || null,
        isAnonymous: Boolean(p.is_anonymous),
        trophyPoints: Number(p.trophy_points) || 0,
        trophyLevel: Number(p.trophy_level) || 1,
        currentStreak: Number(p.current_streak) || 0,
        longestStreak: Number(p.longest_streak) || 0,
        lastActiveDate: (p.last_active_date as string) || null,
        createdAt: p.created_at,
        gamesPlayed: roll.played,
        gamesWon: roll.won,
        gameTypes: roll.gameTypes,
        trophies: trophyCounts.get(p.id as string) ?? 0,
        country: hasCountryColumn ? (p.country as string) || null : null,
      }
    })

    // Cohort sizes come from head-only counts so the totals describe the WHOLE table, not the
    // 50 rows on screen — a filtered page showing "12 accounts" would read as the real number.
    const countOnly = async (build: (q: ReturnType<typeof buildBase>) => ReturnType<typeof buildBase>) => {
      const { count: n } = await build(buildBase())
      return n ?? 0
    }
    function buildBase() {
      return supabase.from('profiles').select('id', { count: 'exact', head: true })
    }

    const [totalProfiles, withAccount, activeRecently] = await Promise.all([
      countOnly((q) => q),
      countOnly((q) => q.eq('is_anonymous', false)),
      countOnly((q) => q.gte('last_active_date', activeSince)),
    ])

    return NextResponse.json({
      users,
      page,
      pageSize: PAGE_SIZE,
      matching: count ?? 0,
      totals: {
        profiles: totalProfiles,
        withAccount,
        guests: Math.max(0, totalProfiles - withAccount),
        activeRecently,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('admin/users', err) }, { status: 500 })
  }
}
