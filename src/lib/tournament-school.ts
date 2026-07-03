import type { SupabaseClient } from '@supabase/supabase-js'

// School (School Whot) format helpers: the class ladder, by-class pairing, and
// the finished-match resolution that climbs the winner a class. Pure helpers are
// kept side-effect-free so the pairing/label math can be unit-tested apart from
// the round-spawn and game-finish I/O.

// The full class ladder, lowest first. A player sits in one of these classes
// while playing; graduating past the last one wins. The host can run a shorter
// ladder (a prefix of this list) via schoolClassCount — see SCHOOL_LADDER_OPTIONS.
export const SCHOOL_CLASSES = [
  'Primary 1',
  'Primary 2',
  'Primary 3',
  'Primary 4',
  'Primary 5',
  'Primary 6',
  'JSS1',
  'JSS2',
  'JSS3',
  'SS1',
  'SS2',
  'SS3',
  'University 100L',
  'University 200L',
  'University 300L',
  'University 400L',
] as const

// Label for a player who has climbed past the top class — the winning state.
export const GRADUATE_LABEL = 'Graduate 🎓'

// The most classes a ladder can hold (the full list above).
export const MAX_SCHOOL_CLASSES = SCHOOL_CLASSES.length

// Ladder-length presets offered at creation. Each `count` is a prefix of
// SCHOOL_CLASSES; the player graduates after winning in the last class of it.
export const SCHOOL_LADDER_OPTIONS = [
  { count: 6, label: 'Primary only', hint: 'Primary 1 → Primary 6 → Graduate' },
  { count: 12, label: 'Primary + Secondary', hint: 'Primary 1 → SS3 → Graduate' },
  { count: MAX_SCHOOL_CLASSES, label: 'Full ladder', hint: 'Primary 1 → University 400L → Graduate' },
] as const

/** Clamp an arbitrary class-count input to a valid ladder length (2…max). */
export function clampSchoolClassCount(value: unknown): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return MAX_SCHOOL_CLASSES
  return Math.max(2, Math.min(MAX_SCHOOL_CLASSES, n))
}

/** The active ladder (class names, lowest first) for a given class count. */
export function schoolLadder(classCount: number): string[] {
  return SCHOOL_CLASSES.slice(0, clampSchoolClassCount(classCount))
}

/**
 * The class label for a player's level within a ladder of `classCount` classes.
 * A level at or beyond the count means the player has graduated.
 */
export function schoolClassLabel(level: number, classCount: number): string {
  const count = clampSchoolClassCount(classCount)
  if (level >= count) return GRADUATE_LABEL
  return SCHOOL_CLASSES[Math.max(0, level)] ?? GRADUATE_LABEL
}

/** Whether a level has graduated past the top class of a ladder. */
export function hasGraduated(level: number, classCount: number): boolean {
  return level >= clampSchoolClassCount(classCount)
}

export interface SchoolPlayerLevel {
  id: string
  level: number
}

export interface SchoolPairing {
  /** Pairs of player ids that play a Whot match this round. */
  matches: [string, string][]
  /** Player ids with no match this round — they sit out and keep their class. */
  sitOut: string[]
}

/**
 * Pair players for one school round. Players are matched by class: the list is
 * sorted by level so each pair is between players in the same class or the
 * nearest ones, then paired adjacently. When the count is odd exactly one player
 * sits out (no match, no class change) — chosen to avoid whoever sat out last
 * round when possible, so nobody is benched twice running.
 *
 * The caller shuffles `players` first; the sort here is stable, so players in the
 * same class keep that shuffled (random) order and pairings vary round to round.
 * Unlike an elimination bye, a sit-out does NOT advance — it produces no game row.
 */
export function computeSchoolPairings(players: SchoolPlayerLevel[], avoidSitOutIds: string[] = []): SchoolPairing {
  if (players.length < 2) return { matches: [], sitOut: players.map((p) => p.id) }

  const sorted = [...players].sort((a, b) => a.level - b.level)

  let benched: SchoolPlayerLevel[] = []
  if (sorted.length % 2 === 1) {
    const avoid = new Set(avoidSitOutIds)
    // Prefer to bench someone who didn't sit out last round; the same-class order
    // is already shuffled, so scanning from the end is an effectively random pick
    // among the highest eligible class.
    let idx = sorted.length - 1
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (!avoid.has(sorted[i].id)) {
        idx = i
        break
      }
    }
    benched = [sorted[idx]]
    sorted.splice(idx, 1)
  }

  const matches: [string, string][] = []
  for (let i = 0; i + 1 < sorted.length; i += 2) {
    matches.push([sorted[i].id, sorted[i + 1].id])
  }
  return { matches, sitOut: benched.map((p) => p.id) }
}

/**
 * Resolve a finished school Whot match: record the winner, climb them one class,
 * and finish the tournament if that graduates them. The loser is left in place
 * (never eliminated). Called from markGameFinished, so every Whot finish path
 * funnels here; it's a cheap no-op for games that aren't part of a school
 * tournament, and idempotent via the same active→finished CAS the bracket uses.
 */
export async function resolveSchoolMatch(supabase: SupabaseClient, gameId: string): Promise<void> {
  const { data: match } = await supabase
    .from('tournament_games')
    .select('id, tournament_id, player_a_id, player_b_id, status, is_bye')
    .eq('game_id', gameId)
    .maybeSingle()
  if (!match || match.is_bye || match.status === 'finished') return

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('format, status, game_config')
    .eq('id', match.tournament_id)
    .maybeSingle()
  if (!tournament || tournament.format !== 'school' || tournament.status === 'finished') return

  // Whot always names a winner (first to empty hand, tiebroken by hand value).
  const { data: session } = await supabase
    .from('whot_sessions')
    .select('winner_player_id')
    .eq('game_id', gameId)
    .maybeSingle()
  if (!session?.winner_player_id) return // undecided — leave it for the host to sort out

  // Map the winning game player (a players.id) to its tournament roster slot by
  // name (unique per tournament), restricted to this match's two players.
  const { data: winnerRow } = await supabase
    .from('players')
    .select('name')
    .eq('id', session.winner_player_id)
    .maybeSingle()
  const winnerName = winnerRow?.name?.toLowerCase() ?? null

  const rosterIds = [match.player_a_id, match.player_b_id].filter((id): id is string => Boolean(id))
  const { data: tps } = await supabase
    .from('tournament_players')
    .select('id, player_name, school_level')
    .in('id', rosterIds.length ? rosterIds : ['__none__'])
  const roster = tps ?? []
  const winnerTP = roster.find((p) => p.player_name.toLowerCase() === winnerName)
  if (!winnerTP) return // couldn't map the winner — don't advance the wrong player

  // Claim the match (winning the active→finished race); only the request that
  // flips the row goes on to climb the winner and check for a graduation.
  const { data: claimed, error: claimError } = await supabase
    .from('tournament_games')
    .update({ status: 'finished', winner_player_id: winnerTP.id })
    .eq('id', match.id)
    .neq('status', 'finished')
    .select('id')
  if (claimError || !claimed?.length) return

  const nextLevel = (winnerTP.school_level ?? 0) + 1
  await supabase.from('tournament_players').update({ school_level: nextLevel }).eq('id', winnerTP.id)

  const classCount = clampSchoolClassCount(
    (tournament.game_config as { schoolClassCount?: number } | null)?.schoolClassCount
  )
  if (hasGraduated(nextLevel, classCount)) {
    await supabase.from('tournaments').update({ status: 'finished' }).eq('id', match.tournament_id)
  }
}
