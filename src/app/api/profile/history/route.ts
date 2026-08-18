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
      .from('players')
      .select('id, game_id, games!players_game_id_fkey!inner(id, game_type, finished_at, created_at, sessions_played)')
      .eq('profile_id', profileId)
      .eq('games.status', 'finished')
      .not('games.finished_at', 'is', null)
      .order('finished_at', { referencedTable: 'games', ascending: false })
      .order('id', { referencedTable: 'games', ascending: false })
      .limit(limit + 1)

    if (cursor) {
      query = cursorId
        ? query.or(`finished_at.lt.${cursor},and(finished_at.eq.${cursor},id.lt.${cursorId})`, {
            referencedTable: 'games',
          })
        : query.lt('games.finished_at', cursor)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: internalErrorMessage('profile/history', error) }, { status: 500 })
    }

    const rows = (data ?? []) as unknown as Array<{
      id: string
      game_id: string
      games: { id: string; game_type: string; finished_at: string; created_at: string; sessions_played: number | null }
    }>

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    // Batch-fetch player counts for the games on this page.
    const gameIds = page.map((r) => r.games.id)
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
      page.map((r) => resolveWinners(admin, r.games.id, r.games.game_type as GameType).catch(() => null))
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
    const multiSessionIds = page.filter((r) => (r.games.sessions_played ?? 1) > 1).map((r) => r.games.id)
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
      const myPlayerId = r.id
      const sessionsPlayed = r.games.sessions_played ?? 1

      // Current session winner
      let won: boolean | null = null
      let currentWinnerName: string | null = null
      if (winners !== null) {
        won = winners.includes(myPlayerId)
        if (winners.length > 0) {
          currentWinnerName = winnerIdToName[winners[0]] ?? null
        }
      }

      // Collect all winner names across sessions (snapshots + current).
      const allWinnerNames: string[] = []
      const pastSessions = snapshotWinners[r.games.id] ?? []
      for (const sessionNames of pastSessions) {
        for (const name of sessionNames) allWinnerNames.push(name)
      }
      if (currentWinnerName) allWinnerNames.push(currentWinnerName)

      return {
        id: r.games.id,
        gameType: r.games.game_type,
        finishedAt: r.games.finished_at,
        createdAt: r.games.created_at,
        playerCount: playerCounts[r.games.id] ?? 1,
        sessionsPlayed,
        won,
        winnerName: currentWinnerName,
        allWinnerNames: sessionsPlayed > 1 ? allWinnerNames : currentWinnerName ? [currentWinnerName] : [],
      }
    })

    const lastRow = hasMore ? page[page.length - 1] : null
    const nextCursor = lastRow?.games.finished_at ?? null
    const nextCursorId = lastRow?.games.id ?? null

    return NextResponse.json({ games, nextCursor, nextCursorId })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/history', err) }, { status: 500 })
  }
}
