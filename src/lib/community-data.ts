// Server-side data access for the community leaderboard. Everything here runs
// through the service-role client (getSupabaseAdmin); RLS is enabled with no
// public policies, so these tables are only reachable from this trusted boundary.

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { CommunityGame, DailyGameWinner, DailyWinner, LeaderboardStanding } from '@/types/community'

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export async function getGames(opts: { activeOnly?: boolean } = {}): Promise<CommunityGame[]> {
  const supabase = getSupabaseAdmin()
  let query = supabase.from('community_games').select('*').order('sort_order', { ascending: true }).order('name')
  if (opts.activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CommunityGame[]
}

// Find an existing canonical player by name, or create one. Returns the player id.
export async function resolvePlayerId(rawName: string): Promise<{ id: string; displayName: string }> {
  const displayName = rawName.trim().replace(/\s+/g, ' ')
  if (!displayName) throw new Error('Player name is required')
  const normalized = normalizeName(displayName)

  const supabase = getSupabaseAdmin()
  const { data: existing } = await supabase
    .from('community_players')
    .select('id, display_name')
    .eq('normalized_name', normalized)
    .maybeSingle()
  if (existing) return { id: existing.id, displayName: existing.display_name }

  const { data: inserted, error } = await supabase
    .from('community_players')
    .insert({ display_name: displayName, normalized_name: normalized })
    .select('id, display_name')
    .single()
  if (error) {
    // Lost a race to create the same name — fetch the winner.
    const { data: retry } = await supabase
      .from('community_players')
      .select('id, display_name')
      .eq('normalized_name', normalized)
      .maybeSingle()
    if (retry) return { id: retry.id, displayName: retry.display_name }
    throw error
  }
  return { id: inserted.id, displayName: inserted.display_name }
}

export async function searchPlayers(q: string, limit = 8): Promise<string[]> {
  const supabase = getSupabaseAdmin()
  const term = q.trim()
  let query = supabase.from('community_players').select('display_name').order('display_name').limit(limit)
  if (term) query = query.ilike('display_name', `%${term}%`)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((r) => r.display_name as string)
}

// Per-game winners for a single day (one row per active game; empty array if none
// recorded). A game can be played in multiple rounds, so it may have many winners.
export async function getDayWinners(dateStr: string): Promise<DailyGameWinner[]> {
  const supabase = getSupabaseAdmin()
  const games = await getGames({ activeOnly: true })

  const { data, error } = await supabase
    .from('community_results')
    .select('game_id, recorded_at, wins, player:community_players(display_name)')
    .eq('result_date', dateStr)
    .order('recorded_at', { ascending: true })
  if (error) throw error

  const winnersByGame = new Map<string, DailyWinner[]>()
  for (const row of data ?? []) {
    const player = row.player as { display_name: string } | { display_name: string }[] | null
    const name = Array.isArray(player) ? player[0]?.display_name : player?.display_name
    if (!name) continue
    const list = winnersByGame.get(row.game_id as string) ?? []
    list.push({ name, wins: (row.wins as number) ?? 1 })
    winnersByGame.set(row.game_id as string, list)
  }

  return games.map((game) => ({
    game: { id: game.id, name: game.name, slug: game.slug, accent: game.accent },
    winners: winnersByGame.get(game.id) ?? [],
  }))
}

// Record a win for a player in a game on a day. The first win creates the row;
// each subsequent call for the same player increments their win count (so a
// player who takes several of the day's rounds is tallied once with wins > 1).
export async function addResult(gameId: string, dateStr: string, playerName: string): Promise<void> {
  const supabase = getSupabaseAdmin()

  // Only active games may receive results — otherwise a crafted request could
  // record wins that never show in getDayWinners() but still count in standings.
  const { data: game } = await supabase.from('community_games').select('is_active').eq('id', gameId).maybeSingle()
  if (!game) throw new Error('Game not found')
  if (!game.is_active) throw new Error('This game is not active')

  const { id: playerId } = await resolvePlayerId(playerName)

  // Increment if the player already has a row for this game/day, else insert.
  // The manager UI is single-user, so a read-modify-write race is acceptable; the
  // unique (game_id, result_date, player_id) key still guards against duplicates.
  const { data: existing } = await supabase
    .from('community_results')
    .select('id, wins')
    .eq('game_id', gameId)
    .eq('result_date', dateStr)
    .eq('player_id', playerId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('community_results')
      .update({ wins: (existing.wins as number) + 1 })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('community_results')
      .insert({ game_id: gameId, result_date: dateStr, player_id: playerId, wins: 1, recorded_by: 'manager' })
    if (error) throw error
  }
}

// Remove wins for a player in a game/day. By default removes one win (deleting the
// row when it hits zero); with all=true removes the player entirely. With no
// playerName, clears every winner recorded for that game on that day.
export async function deleteResult(
  gameId: string,
  dateStr: string,
  playerName?: string,
  opts: { all?: boolean } = {}
): Promise<void> {
  const supabase = getSupabaseAdmin()

  if (!playerName || !playerName.trim()) {
    const { error } = await supabase.from('community_results').delete().eq('game_id', gameId).eq('result_date', dateStr)
    if (error) throw error
    return
  }

  const normalized = normalizeName(playerName)
  const { data: player } = await supabase
    .from('community_players')
    .select('id')
    .eq('normalized_name', normalized)
    .maybeSingle()
  // Unknown name => nothing recorded for that player; treat as a no-op.
  if (!player) return

  const match = { game_id: gameId, result_date: dateStr, player_id: player.id }

  if (!opts.all) {
    const { data: existing } = await supabase.from('community_results').select('id, wins').match(match).maybeSingle()
    if (existing && (existing.wins as number) > 1) {
      const { error } = await supabase
        .from('community_results')
        .update({ wins: (existing.wins as number) - 1 })
        .eq('id', existing.id)
      if (error) throw error
      return
    }
  }

  const { error } = await supabase.from('community_results').delete().match(match)
  if (error) throw error
}

// Rank players by win count over an inclusive date range. Ties on wins share a
// rank; within a tie, ordered by distinct games won then name.
export async function getStandings(startStr: string, endStr: string): Promise<LeaderboardStanding[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('community_results')
    .select('game_id, wins, player:community_players(display_name)')
    .gte('result_date', startStr)
    .lte('result_date', endStr)
  if (error) throw error

  type Agg = { playerName: string; wins: number; games: Set<string> }
  const byPlayer = new Map<string, Agg>()
  for (const row of data ?? []) {
    const player = row.player as { display_name: string } | { display_name: string }[] | null
    const name = Array.isArray(player) ? player[0]?.display_name : player?.display_name
    if (!name) continue
    const key = name.toLowerCase()
    const agg = byPlayer.get(key) ?? { playerName: name, wins: 0, games: new Set<string>() }
    agg.wins += (row.wins as number) ?? 1
    agg.games.add(row.game_id as string)
    byPlayer.set(key, agg)
  }

  const sorted = Array.from(byPlayer.values()).sort(
    (a, b) => b.wins - a.wins || b.games.size - a.games.size || a.playerName.localeCompare(b.playerName)
  )

  const standings: LeaderboardStanding[] = []
  let lastWins = -1
  let lastRank = 0
  sorted.forEach((agg, index) => {
    const rank = agg.wins === lastWins ? lastRank : index + 1
    lastWins = agg.wins
    lastRank = rank
    standings.push({ rank, playerName: agg.playerName, wins: agg.wins, gamesWon: agg.games.size })
  })
  return standings
}
