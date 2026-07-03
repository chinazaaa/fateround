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

// Match-length choices for a school round, in seconds. Each round is one timed
// Whot match: whoever empties their hand first wins, otherwise at time-up the
// lowest hand total wins the room. Shorter than the regular Whot game-duration
// options (which start at 10 min), so School clamps its own value rather than
// going through clampWhotGameDuration.
export const SCHOOL_MATCH_SECONDS_OPTIONS = [120, 180, 240] as const
export const DEFAULT_SCHOOL_MATCH_SECONDS = 180

/** Clamp a school match length to one of the allowed options (default 3 min). */
export function clampSchoolMatchSeconds(raw: unknown): number {
  const n = Math.floor(Number(raw))
  return (SCHOOL_MATCH_SECONDS_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_SCHOOL_MATCH_SECONDS
}

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

// The most players a school Whot room holds. There's no minimum: a class with
// only two players just plays a room of two (Whot itself allows up to 6).
export const SCHOOL_MAX_ROOM = 5

export interface SchoolRooms {
  /** Groups of player ids that each play one Whot game this round. */
  rooms: string[][]
  /** Lone players with nobody left in their class and someone in a higher class —
   *  left behind, so they're eliminated. */
  eliminated: string[]
}

/** Split ids into the fewest rooms that stay ≤ max, balanced to within one each. */
function balancedChunks(ids: string[], max: number): string[][] {
  const roomCount = Math.max(1, Math.ceil(ids.length / max))
  const base = Math.floor(ids.length / roomCount)
  const remainder = ids.length % roomCount
  const out: string[][] = []
  let idx = 0
  for (let g = 0; g < roomCount; g++) {
    const size = base + (g < remainder ? 1 : 0)
    out.push(ids.slice(idx, idx + size))
    idx += size
  }
  return out
}

/**
 * Group players into rooms for one school round, matched *by class* first. Players
 * in the same class play each other: a class with 6 players makes two rooms of 3, a
 * class with just 2 makes a room of 2 (no minimum). Rooms hold at most 5.
 *
 * A player alone in their class can't play their classmates, but they're only
 * eliminated if they truly have no one to play. Lone players from different classes
 * are paired off with each other first (nearest classes together) — so a straggler
 * plays another straggler (e.g. the loser from another room) rather than being cut.
 * Only when a single lone player is left with nobody to pair with is anyone out, and
 * even then a lone player in the *top* class is the frontrunner, not a straggler:
 * they aren't eliminated, they just wait for someone to climb up to them. So the top
 * class can never be eliminated and a tournament always keeps a winner.
 *
 * The caller shuffles `players` first; the grouping preserves that order within a
 * class, so rooms vary round to round.
 */
export function computeSchoolRooms(players: SchoolPlayerLevel[]): SchoolRooms {
  if (players.length < 2) return { rooms: [], eliminated: [] }

  // Bucket by class, lowest first; same-class order stays as the caller shuffled it.
  const byLevel = new Map<number, string[]>()
  for (const p of players) {
    const arr = byLevel.get(p.level) ?? []
    arr.push(p.id)
    byLevel.set(p.level, arr)
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b)
  const topLevel = levels[levels.length - 1]

  // Classes with ≥2 players form their own rooms; lone players are set aside.
  const rooms: string[][] = []
  const singles: { id: string; level: number }[] = []
  for (const level of levels) {
    const ids = byLevel.get(level) ?? []
    if (ids.length >= 2) rooms.push(...balancedChunks(ids, SCHOOL_MAX_ROOM))
    else singles.push({ id: ids[0], level })
  }

  const eliminated: string[] = []
  if (singles.length >= 2) {
    // Two or more stragglers — pair them off with each other (nearest classes
    // first, since `singles` is already class-sorted). Nobody is left without a game.
    rooms.push(
      ...balancedChunks(
        singles.map((s) => s.id),
        SCHOOL_MAX_ROOM
      )
    )
  } else if (singles.length === 1 && singles[0].level < topLevel) {
    // The only straggler, and everyone else is locked into their own class's rooms —
    // no one left to play, and others have moved up past them. Eliminated.
    eliminated.push(singles[0].id)
  }
  // A lone player in the top class (singles[0].level === topLevel) waits — never cut.

  return { rooms, eliminated }
}

/** The single player who repeats a school room: whoever holds the most cards at
 *  the end (most cards, then highest hand value, then id for a stable pick). */
export interface SchoolHand {
  tpId: string
  cardCount: number
  handSum: number
}
function schoolRepeater(hands: SchoolHand[]): SchoolHand | null {
  if (hands.length === 0) return null
  return [...hands].sort(
    (a, b) => b.cardCount - a.cardCount || b.handSum - a.handSum || a.tpId.localeCompare(b.tpId)
  )[0]
}

/**
 * Who climbs a class after a school room, given each finisher's hand and the room's
 * winner (if known). Everyone who finished advances except the single most-cards
 * player who repeats — but:
 *   - only when at least two players actually finished the room. If the others left
 *     or were removed, the lone survivor won by walkover and advances (nobody repeats).
 *   - the winner (emptied their hand / lowest hand at time-up) always advances, so a
 *     win is never flipped into a repeat by opponents dropping out mid-room.
 * Returns the tournament-player ids that should climb a class.
 */
export function schoolAdvancers(played: SchoolHand[], winnerTpId: string | null): string[] {
  if (played.length <= 1) return played.map((p) => p.tpId)
  const repeatable = played.filter((p) => p.tpId !== winnerTpId)
  const repeater = repeatable.length > 0 ? schoolRepeater(repeatable) : null
  return played.filter((p) => p.tpId !== repeater?.tpId).map((p) => p.tpId)
}

/**
 * Resolve a finished school Whot room. Each round is one timed Whot match: a
 * player who empties their hand is done and climbs a class, and the rest keep
 * playing (the Whot engine already runs a timed game this way). When the match
 * ends — timer up, or one player left — everyone climbs a class *except* the
 * single player holding the most cards, who repeats their class. Nobody is
 * eliminated. Finishes the tournament the moment an advancer graduates past the
 * top class.
 *
 * Called from markGameFinished, so every Whot finish path funnels here; it's a
 * cheap no-op for non-school games, and idempotent via the active→finished CAS.
 */
export async function resolveSchoolMatch(supabase: SupabaseClient, gameId: string): Promise<void> {
  const { data: match } = await supabase
    .from('tournament_games')
    .select('id, tournament_id, member_ids, status, is_bye')
    .eq('game_id', gameId)
    .maybeSingle()
  if (!match || match.is_bye || match.status === 'finished') return

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('format, status, game_config')
    .eq('id', match.tournament_id)
    .maybeSingle()
  if (!tournament || tournament.format !== 'school' || tournament.status === 'finished') return

  const memberIds = ((match.member_ids ?? []) as string[]).filter((id): id is string => Boolean(id))
  const [{ data: tps }, { data: hands }, { data: gamePlayers }, { data: session }] = await Promise.all([
    supabase
      .from('tournament_players')
      .select('id, player_name, school_level')
      .in('id', memberIds.length ? memberIds : ['__none__']),
    supabase.from('whot_player_hands').select('player_id, cards').eq('game_id', gameId),
    supabase.from('players').select('id, name').eq('game_id', gameId),
    supabase.from('whot_sessions').select('winner_player_id').eq('game_id', gameId).maybeSingle(),
  ])

  const roster = tps ?? []
  const tpByName = new Map(roster.map((p) => [p.player_name.toLowerCase(), p]))
  const nameById = new Map((gamePlayers ?? []).map((p) => [p.id as string, (p.name as string).toLowerCase()]))
  const levelById = new Map(roster.map((p) => [p.id, p.school_level ?? 0]))

  // Map each seated player's final hand to its tournament roster slot by name.
  const played: SchoolHand[] = []
  for (const h of hands ?? []) {
    const name = nameById.get(h.player_id as string)
    const tp = name ? tpByName.get(name) : undefined
    if (!tp) continue
    const cards = (h.cards ?? []) as { number: number }[]
    played.push({
      tpId: tp.id,
      cardCount: cards.length,
      handSum: cards.reduce((sum, c) => sum + (c.number ?? 0), 0),
    })
  }
  if (played.length === 0) return // nobody mapped — leave it for the host to sort out

  // Claim the room (winning the active→finished race); only the request that flips
  // the row advances players. winner_player_id records the room's top finisher
  // (the Whot winner) for the results view.
  const winnerName = session?.winner_player_id ? nameById.get(session.winner_player_id as string) : undefined
  const winnerTP = winnerName ? tpByName.get(winnerName) : undefined
  const { data: claimed, error: claimError } = await supabase
    .from('tournament_games')
    .update({ status: 'finished', winner_player_id: winnerTP?.id ?? null })
    .eq('id', match.id)
    .neq('status', 'finished')
    .select('id')
  if (claimError || !claimed?.length) return

  // Everyone who played climbs a class except the single most-cards player — unless
  // the others dropped out, in which case the lone survivor (and the winner) still
  // advance rather than being stuck repeating (see schoolAdvancers).
  const advancers = schoolAdvancers(played, winnerTP?.id ?? null)

  const classCount = clampSchoolClassCount(
    (tournament.game_config as { schoolClassCount?: number } | null)?.schoolClassCount
  )
  let someoneGraduated = false
  for (const tpId of advancers) {
    const nextLevel = (levelById.get(tpId) ?? 0) + 1
    await supabase.from('tournament_players').update({ school_level: nextLevel }).eq('id', tpId)
    if (hasGraduated(nextLevel, classCount)) someoneGraduated = true
  }

  if (someoneGraduated) {
    await supabase.from('tournaments').update({ status: 'finished' }).eq('id', match.tournament_id)
  }
}
