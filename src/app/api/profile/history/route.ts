import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { resolveWinners } from '@/lib/trophies/outcome'
import type { GameType } from '@/types'

/**
 * The player's game-by-game history — individual finished games, not aggregate stats.
 *
 * Cursor-paginated by `finished_at` (descending). Pass `?cursor=<ISO timestamp>` for the
 * next page; omit for the first page. Returns up to 20 games per page.
 */
export async function GET(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ games: [], nextCursor: null })

    const cursor = req.nextUrl.searchParams.get('cursor')
    const cursorId = req.nextUrl.searchParams.get('cursorId')
    const limit = 20

    const admin = getSupabaseAdmin()

    let query = admin
      .from('games')
      .select('id, game_type, finished_at, created_at, sessions_played, players!inner(id, profile_id)')
      .eq('players.profile_id', profileId)
      .eq('status', 'finished')
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)

    if (cursor) {
      query = cursorId
        ? query.or(`finished_at.lt.${cursor},and(finished_at.eq.${cursor},id.lt.${cursorId})`)
        : query.lt('finished_at', cursor)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: internalErrorMessage('profile/history', error) }, { status: 500 })
    }

    const rows = (data ?? []) as unknown as Array<{
      id: string
      game_type: string
      finished_at: string
      created_at: string
      sessions_played: number | null
      players: Array<{ id: string; profile_id: string }>
    }>

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    // Batch-fetch player counts for the games on this page.
    const gameIds = page.map((r) => r.id)
    const playerCounts: Record<string, number> = {}
    if (gameIds.length > 0) {
      const { data: countData } = await admin.from('players').select('game_id').in('game_id', gameIds)

      if (countData) {
        for (const row of countData) {
          playerCounts[row.game_id] = (playerCounts[row.game_id] ?? 0) + 1
        }
      }
    }

    // Resolve the CURRENT session's winner for each game.
    const winnerResults = await Promise.all(
      page.map((r) => resolveWinners(admin, r.id, r.game_type as GameType).catch(() => null))
    )

    // Map player id → name for the current session's winner.
    const allWinnerIds = new Set<string>()
    for (const winners of winnerResults) {
      if (winners) winners.forEach((id) => allWinnerIds.add(id))
    }
    const winnerIdToName: Record<string, string> = {}
    if (allWinnerIds.size > 0) {
      const { data: nameData } = await admin
        .from('players')
        .select('id, name')
        .in('id', [...allWinnerIds])
      if (nameData) {
        for (const row of nameData) winnerIdToName[row.id] = row.name
      }
    }

    // For multi-session games, fetch per-session winner names from snapshots.
    const multiSessionIds = page.filter((r) => (r.sessions_played ?? 1) > 1).map((r) => r.id)
    const snapshotWinners: Record<string, string[][]> = {}
    if (multiSessionIds.length > 0) {
      const { data: snapData } = await admin
        .from('game_snapshots')
        .select('game_id, snapshot_data')
        .in('game_id', multiSessionIds)
        .order('session_number', { ascending: true })
      if (snapData) {
        for (const snap of snapData) {
          const gid = snap.game_id as string
          const sd = snap.snapshot_data as Record<string, unknown> | null
          const names = (sd?.winnerNames ?? []) as string[]
          if (!snapshotWinners[gid]) snapshotWinners[gid] = []
          snapshotWinners[gid].push(names)
        }
      }
    }

    const games = page.map((r, i) => {
      const winners = winnerResults[i]
      const myPlayerId = r.players[0]?.id ?? null
      const sessionsPlayed = r.sessions_played ?? 1

      // Current session winner
      let won: boolean | null = null
      let currentWinnerName: string | null = null
      if (winners !== null) {
        won = myPlayerId !== null && winners.includes(myPlayerId)
        if (winners.length > 0) {
          currentWinnerName = winnerIdToName[winners[0]] ?? null
        }
      }

      // Per-session winners come from snapshots; finish-game writes one per session
      // (including the last one), so trust snapshots when we have them. Fall back to
      // the current winner for legacy games with no snapshot history.
      const sessionSnapshots = snapshotWinners[r.id] ?? []
      const snapshotNames = sessionSnapshots.flat()
      const allWinnerNames =
        sessionsPlayed > 1
          ? snapshotNames.length > 0
            ? snapshotNames
            : currentWinnerName
              ? [currentWinnerName]
              : []
          : currentWinnerName
            ? [currentWinnerName]
            : []

      return {
        id: r.id,
        gameType: r.game_type,
        finishedAt: r.finished_at,
        createdAt: r.created_at,
        playerCount: playerCounts[r.id] ?? 1,
        sessionsPlayed,
        won,
        winnerName: currentWinnerName,
        allWinnerNames,
      }
    })

    const lastRow = hasMore ? page[page.length - 1] : null
    const nextCursor = lastRow?.finished_at ?? null
    const nextCursorId = lastRow?.id ?? null

    return NextResponse.json({ games, nextCursor, nextCursorId })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/history', err) }, { status: 500 })
  }
}
