import { GAME_TYPE_CONFIG, gameTypeLabel } from '@/lib/game-types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { GLOBAL_SCOPE } from '@/lib/trophies/criteria'
import { hasWinnerSource } from '@/lib/trophies/outcome'
import { normalizeUsername } from '@/lib/profile/username'
import type { GameType } from '@/types'

/**
 * Public, read-only views of a profile keyed by its claimed username — the data behind
 * /u/<username> and /u/<username>/trophies.
 *
 * SERVICE ROLE, always. `profiles` is owner-only-readable and `player_stats` / `trophies` are
 * service-role-only (see 20260804000000_trophies_streaks.sql). A public page therefore cannot read
 * any of this from the browser; the server selects an explicit, narrow set of columns and ships
 * only those. There is no auth here — this is deliberately public — so the guard is "what columns
 * leave this function", never RLS.
 *
 * EARNED ONLY. A public profile is a trophy cabinet, not someone's to-do list: it shows what a
 * player has won, never their locked trophies or partial progress. Because every trophy here has
 * been earned, hidden trophies are already revealed — the secret-until-earned rule has been met —
 * so no masking is needed (unlike the authenticated /api/profile/trophies path).
 */

export type PublicTopTrophy = {
  id: string
  title: string
  tier: string
  gameLabel: string
  rarityPct: number | null
}

export type PublicProfileSummary = {
  username: string
  handle: string
  avatarUrl: string | null
  level: number
  points: number
  currentStreak: number
  longestStreak: number
  trophyCount: number
  gamesPlayed: number
  /** Percentage over games with a resolvable winner only; null when none, card shows "—". */
  winRate: number | null
  topTrophies: PublicTopTrophy[]
}

export type PublicCabinetTrophy = {
  id: string
  tier: string
  title: string
  description: string
  points: number
  rarityPct: number | null
  earnedAt: string | null
}

export type PublicCabinetGroup = {
  gameType: string
  label: string
  emoji: string
  gamesPlayed: number
  gamesWon: number
  trophies: PublicCabinetTrophy[]
}

export type PublicProfileCabinet = {
  username: string
  handle: string
  avatarUrl: string | null
  level: number
  points: number
  trophyCount: number
  groups: PublicCabinetGroup[]
}

type LoadedProfile = {
  profile: {
    handle: string | null
    avatar_url: string | null
    username: string
    trophy_points: number
    trophy_level: number
    current_streak: number
    longest_streak: number
  }
  earned: {
    trophyId: string
    earnedAt: string | null
    gameType: string | null
    tier: string
    title: string
    description: string
    points: number
  }[]
  rarityById: Map<string, number>
  statsByGame: Map<string, { gamesPlayed: number; gamesWon: number }>
}

/** The one query pass both shapers share. Returns null when no profile has claimed that username. */
async function loadProfile(username: string): Promise<LoadedProfile | null> {
  const canonical = normalizeUsername(username)
  if (!canonical) return null

  const admin = getSupabaseAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, handle, avatar_url, username, trophy_points, trophy_level, current_streak, longest_streak')
    .eq('username', canonical)
    .maybeSingle()

  if (!profile) return null
  const id = profile.id as string

  const [{ data: earnedRows }, { data: rarityRows }, { data: statRows }] = await Promise.all([
    admin
      .from('player_trophies')
      .select('trophy_id, earned_at, trophies(id, game_type, tier, title, description, points)')
      .eq('profile_id', id),
    admin.from('trophy_rarity').select('trophy_id, pct'),
    admin.from('player_stats').select('game_type, games_played, games_won').eq('profile_id', id),
  ])

  const rarityById = new Map<string, number>()
  for (const r of rarityRows ?? []) rarityById.set(r.trophy_id as string, Number(r.pct))

  const statsByGame = new Map<string, { gamesPlayed: number; gamesWon: number }>()
  for (const s of statRows ?? []) {
    statsByGame.set(s.game_type as string, {
      gamesPlayed: Number(s.games_played) || 0,
      gamesWon: Number(s.games_won) || 0,
    })
  }

  const earned = (earnedRows ?? [])
    .map((row) => {
      // supabase-js types the embedded relation as an array; it's a to-one join, so take [0].
      const t = (Array.isArray(row.trophies) ? row.trophies[0] : row.trophies) as
        | { id: string; game_type: string | null; tier: string; title: string; description: string; points: number }
        | undefined
      if (!t) return null
      return {
        trophyId: row.trophy_id as string,
        earnedAt: (row.earned_at as string | null) ?? null,
        gameType: (t.game_type as string | null) ?? null,
        tier: t.tier,
        title: t.title,
        description: t.description,
        points: Number(t.points) || 0,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  return {
    profile: {
      handle: profile.handle as string | null,
      avatar_url: profile.avatar_url as string | null,
      username: profile.username as string,
      trophy_points: Number(profile.trophy_points) || 0,
      trophy_level: Number(profile.trophy_level) || 1,
      current_streak: Number(profile.current_streak) || 0,
      longest_streak: Number(profile.longest_streak) || 0,
    },
    earned,
    rarityById,
    statsByGame,
  }
}

/** Total games played across every game the player has stats in. The global row is a counters bucket. */
function totalPlayed(statsByGame: Map<string, { gamesPlayed: number; gamesWon: number }>) {
  let played = 0
  for (const [gameType, s] of statsByGame) {
    if (gameType === GLOBAL_SCOPE) continue
    played += s.gamesPlayed
  }
  return played
}

/**
 * Win rate over ONLY the games whose winner the server can actually resolve.
 *
 * A winner-less game (polls, most party games) increments games_played but never games_won, so
 * folding those into the denominator drags the rate down for something you can't even "win". This
 * counts wins and plays from the same resolvable-winner set, so the percentage means what it says.
 * Returns null when the player has played nothing with a resolvable winner (card shows "—").
 */
function winRate(statsByGame: Map<string, { gamesPlayed: number; gamesWon: number }>): number | null {
  let played = 0
  let won = 0
  for (const [gameType, s] of statsByGame) {
    if (gameType === GLOBAL_SCOPE) continue
    if (!hasWinnerSource(gameType as GameType)) continue
    played += s.gamesPlayed
    won += s.gamesWon
  }
  return played > 0 ? Math.round((won / played) * 100) : null
}

export async function getPublicProfileSummary(username: string): Promise<PublicProfileSummary | null> {
  const loaded = await loadProfile(username)
  if (!loaded) return null
  const { profile, earned, rarityById, statsByGame } = loaded

  const played = totalPlayed(statsByGame)

  const topTrophies: PublicTopTrophy[] = earned
    .map((t) => ({
      id: t.trophyId,
      title: t.title,
      tier: t.tier,
      gameLabel: gameTypeLabel(t.gameType) ?? 'All games',
      rarityPct: rarityById.has(t.trophyId) ? Math.round(rarityById.get(t.trophyId)!) : null,
    }))
    // Rarest first — a public profile leads with the trophy worth bragging about. A trophy with no
    // rarity row yet sorts last rather than pretending to be common.
    .sort((a, b) => (a.rarityPct ?? 101) - (b.rarityPct ?? 101))
    .slice(0, 3)

  return {
    username: profile.username,
    handle: profile.handle || 'Player',
    avatarUrl: profile.avatar_url,
    level: profile.trophy_level,
    points: profile.trophy_points,
    currentStreak: profile.current_streak,
    longestStreak: profile.longest_streak,
    trophyCount: earned.length,
    // "Games played" is the honest total across everything; win rate below is scoped to games
    // that can actually be won (see winRate()).
    gamesPlayed: played,
    winRate: winRate(statsByGame),
    topTrophies,
  }
}

export async function getPublicProfileCabinet(username: string): Promise<PublicProfileCabinet | null> {
  const loaded = await loadProfile(username)
  if (!loaded) return null
  const { profile, earned, rarityById, statsByGame } = loaded

  const byGame = new Map<string, PublicCabinetGroup>()
  for (const t of earned) {
    const gameType = t.gameType ?? GLOBAL_SCOPE
    if (!byGame.has(gameType)) {
      const config = gameType === GLOBAL_SCOPE ? undefined : GAME_TYPE_CONFIG[gameType as keyof typeof GAME_TYPE_CONFIG]
      const stat = statsByGame.get(gameType)
      byGame.set(gameType, {
        gameType,
        label: gameType === GLOBAL_SCOPE ? 'All games' : (gameTypeLabel(gameType) ?? gameType),
        emoji: config?.card?.emoji ?? '🏆',
        gamesPlayed: stat?.gamesPlayed ?? 0,
        gamesWon: stat?.gamesWon ?? 0,
        trophies: [],
      })
    }
    byGame.get(gameType)!.trophies.push({
      id: t.trophyId,
      tier: t.tier,
      title: t.title,
      description: t.description,
      points: t.points,
      rarityPct: rarityById.has(t.trophyId) ? Math.round(rarityById.get(t.trophyId)!) : null,
      earnedAt: t.earnedAt,
    })
  }

  const groups = [...byGame.values()].sort(
    (a, b) => b.trophies.length - a.trophies.length || a.label.localeCompare(b.label)
  )

  return {
    username: profile.username,
    handle: profile.handle || 'Player',
    avatarUrl: profile.avatar_url,
    level: profile.trophy_level,
    points: profile.trophy_points,
    trophyCount: earned.length,
    groups,
  }
}
