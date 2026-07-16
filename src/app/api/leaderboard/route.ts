import { NextRequest, NextResponse } from 'next/server'
import {
  getDayWinners,
  getGameBySlug,
  getGames,
  getSetting,
  getStandings,
  WHATSAPP_INVITE_URL_KEY,
} from '@/lib/community-data'
import {
  formatDayLabel,
  formatMonthLabel,
  formatRangeLabel,
  isValidDateStr,
  monthBounds,
  watToday,
  weekBounds,
} from '@/lib/community-dates'
import type { LeaderboardResponse, LeaderboardWindow } from '@/types/community'

const WINDOWS: LeaderboardWindow[] = ['today', 'week', 'month']

// Public, no auth. Aggregates the manually-entered daily winners into the
// requested calendar window (WAT). Read-only; safe to expose.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const windowParam = params.get('window')
  const window: LeaderboardWindow = WINDOWS.includes(windowParam as LeaderboardWindow)
    ? (windowParam as LeaderboardWindow)
    : 'today'

  const dateParam = params.get('date')
  const date = isValidDateStr(dateParam) ? dateParam : watToday()

  const gameParam = params.get('game')

  try {
    const whatsappInviteUrl = await getSetting(WHATSAPP_INVITE_URL_KEY)

    // An unknown or inactive slug falls back to all games rather than erroring —
    // a stale bookmark should still show a leaderboard.
    const selected = gameParam ? await getGameBySlug(gameParam, { activeOnly: true }) : null
    const gameId = selected?.id
    const games = (await getGames({ activeOnly: true })).map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      accent: g.accent,
    }))

    let response: LeaderboardResponse

    if (window === 'today') {
      response = {
        window,
        label: formatDayLabel(date),
        rangeStart: date,
        rangeEnd: date,
        today: await getDayWinners(date, { gameId }),
        standings: [],
        whatsappInviteUrl,
        game: selected?.slug ?? null,
        games,
      }
    } else {
      const { start, end } = window === 'week' ? weekBounds(date) : monthBounds(date)
      response = {
        window,
        label: window === 'week' ? formatRangeLabel(start, end) : formatMonthLabel(date),
        rangeStart: start,
        rangeEnd: end,
        today: [],
        standings: await getStandings(start, end, { gameId }),
        whatsappInviteUrl,
        game: selected?.slug ?? null,
        games,
      }
    }

    return NextResponse.json(response)
  } catch (err) {
    // Public route — log details server-side but return a generic message so we
    // don't leak database/internal errors to anonymous callers.
    console.error('[leaderboard] failed to load', err)
    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 })
  }
}
