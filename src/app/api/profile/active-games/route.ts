import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Games this profile is currently in — on ANY device.
 *
 * The handoff endpoint. Recent-games lists on both platforms are local to the device that
 * played them (`recent-games` in SecureStore, localStorage on web), so a game started on a
 * phone is invisible on a laptop even when both are signed into the same account. This answers
 * the other question: what am I in the middle of, wherever I started it?
 *
 * Both halves of "in" count, because both are resumable and they resume to different places:
 *   - HOST — `games.host_user_id`. Resuming means taking the host token (`/reclaim-host`).
 *   - PLAYER — `players.user_id`. Resuming means continuing the seat, which rotates the resume
 *     token so control moves rather than clones.
 * The `role` on each row is what lets the client send you to the right one.
 *
 * Guests get an empty list rather than an error: without a profile there is no cross-device
 * identity to look up, and the local recent list is already the right answer for them.
 */

/** Only these are worth resuming. A finished game belongs in history, not a continue strip. */
const LIVE_STATUSES = ['waiting', 'active'] as const

export type ActiveGameRow = {
  code: string
  gameType: string
  title: string | null
  status: string
  /** How to resume: the host route, or the player route. */
  role: 'host' | 'player'
  lastActivityAt: string | null
}

export async function GET(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ games: [] })

    const admin = getSupabaseAdmin()
    const select = 'id, game_type, title, status, last_activity_at'

    const [{ data: hosted }, { data: seats }] = await Promise.all([
      admin.from('games').select(select).eq('host_user_id', profileId).in('status', LIVE_STATUSES),
      admin
        .from('players')
        .select(`game_id, games!inner(${select})`)
        .eq('user_id', profileId)
        .in('games.status', LIVE_STATUSES),
    ])

    type GameRow = {
      id: string
      game_type: string
      title: string | null
      status: string
      last_activity_at: string | null
    }

    const byCode = new Map<string, ActiveGameRow>()

    // Seats first, so the host pass can overwrite: someone who hosts a game AND plays in it
    // should be sent to the host route, which is the surface that can actually run it.
    for (const row of (seats ?? []) as unknown as { games: GameRow | GameRow[] }[]) {
      const game = Array.isArray(row.games) ? row.games[0] : row.games
      if (!game) continue
      byCode.set(game.id, {
        code: game.id,
        gameType: game.game_type,
        title: game.title,
        status: game.status,
        role: 'player',
        lastActivityAt: game.last_activity_at,
      })
    }

    for (const game of (hosted ?? []) as GameRow[]) {
      byCode.set(game.id, {
        code: game.id,
        gameType: game.game_type,
        title: game.title,
        status: game.status,
        role: 'host',
        lastActivityAt: game.last_activity_at,
      })
    }

    // Most recently touched first — the one you walked away from a minute ago is the one you
    // are most likely coming back to. Nulls sort last rather than to the top.
    const games = [...byCode.values()].sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''))

    return NextResponse.json({ games })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('active-games', err) }, { status: 500 })
  }
}
