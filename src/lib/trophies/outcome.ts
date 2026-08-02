/**
 * Server-side "who won" — the measurement that win-based trophies rest on.
 *
 * WHY THIS EXISTS. There is no `games.winner_id` on this stack and no shared standings
 * builder. The only server-side derivation is `getCompetitiveStandings` in `room-points.ts`,
 * which is module-private and covers 12 of ~60 game types. The winner *is* already persisted
 * for a large family of games though — 17 per-game session tables carry `winner_player_id` —
 * it just isn't reachable from one place. This maps them.
 *
 * WHY NOT TRUST THE CLIENT. `PostWinToCommunity` detects the winner in the browser, and
 * `docs/trophies-and-streaks.md` §3.8 originally proposed reusing that. Trophies underpin the
 * paid tiers, so a client-reported win is a self-granted entitlement. Everything here reads
 * the server's own tables.
 *
 * THE THREE-WAY RESULT MATTERS. `resolveWinners` distinguishes:
 *   - `['<id>']`  — the server knows who won
 *   - `[]`        — the server knows there was no winner (a draw, an abandoned game)
 *   - `null`      — the server CANNOT know for this game type
 * Collapsing `null` into `[]` would quietly record "did not win" for every chess or trivia
 * game, which is worse than recording nothing: it makes a "never lost" trophy earnable by
 * playing the games we can't measure.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCompetitiveStandings, isCompetitiveRoomGame } from '@/lib/room-points'
import { unoTeammateId } from '@/lib/uno'
import type { GameType } from '@/types'

type WinnerSource = {
  /** Per-game session table holding the outcome. */
  table: string
  /** Single-winner column. */
  column: string
  /**
   * Multi-winner column, where a game can have more than one (mahjong). Read in preference to
   * `column` when present and non-empty.
   */
  arrayColumn?: string
}

/**
 * game_type → where its winner is persisted.
 *
 * Every entry here was verified against the migration that creates the table. A game type
 * ABSENT from this map is not "assumed to have no winner" — it is unresolvable, and
 * `resolveWinners` returns null for it. Adding a game is a two-line change plus a check that
 * the column is actually populated at finish, which is the part worth testing manually.
 */
const WINNER_SOURCES: Partial<Record<GameType, WinnerSource>> = {
  monopoly: { table: 'monopoly_boards', column: 'winner_player_id' },
  yahtzee: { table: 'yahtzee_sessions', column: 'winner_player_id' },
  whot: { table: 'whot_sessions', column: 'winner_player_id' },
  ludo: { table: 'ludo_sessions', column: 'winner_player_id' },
  tic_tac_toe: { table: 'tic_tac_toe_sessions', column: 'winner_player_id' },
  chess: { table: 'chess_sessions', column: 'winner_player_id' },
  scrabble: { table: 'scrabble_sessions', column: 'winner_player_id' },
  snake_and_ladder: { table: 'snake_ladder_sessions', column: 'winner_player_id' },
  crazy_eights: { table: 'crazy_eights_sessions', column: 'winner_player_id' },
  checkers: { table: 'checkers_sessions', column: 'winner_player_id' },
  // Both 10×10 variants share the draughts10 engine and therefore one table.
  checkers_international: { table: 'checkers10_sessions', column: 'winner_player_id' },
  checkers_nigeria: { table: 'checkers10_sessions', column: 'winner_player_id' },
  ayo: { table: 'ayo_sessions', column: 'winner_player_id' },
  ping_pong: { table: 'ping_pong_sessions', column: 'winner_player_id' },
  uno: { table: 'uno_sessions', column: 'winner_player_id' },
  // Mahjong can end with several winners, so prefer the array and fall back to the scalar.
  mahjong: { table: 'mahjong_sessions', column: 'winner_player_id', arrayColumn: 'winner_player_ids' },
}

/**
 * Game types with no winner BY DESIGN — not a coverage gap to close later.
 *
 * The poll family isn't competitive: everyone answers, nothing is scored, nobody comes first.
 * Recording them as "unmeasured" would imply someone should eventually go and measure them,
 * and would leave the admin UI warning about a limitation that is actually the product. They
 * carry `games_played` and streaks instead, which is the whole point of those measures.
 */
const NO_WINNER_BY_DESIGN = new Set<string>([
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'would_you_rather',
  'never_have_i_ever',
  'this_or_that',
  'most_likely_to',
  'who_said_this',
  'pick_a_number',
  'two_truths',
  'hot_seat',
  'anonymous_messages',
  'secret_message',
  'parent_approval',
  'custom',
])

/**
 * True when this game type simply has no notion of winning, so a win rule is a category error
 * rather than a missing feature. Lets the admin UI say "this game has no winner" instead of
 * "not supported yet", which are different messages.
 */
export function isWinnerlessByDesign(gameType: GameType): boolean {
  return NO_WINNER_BY_DESIGN.has(gameType)
}

/**
 * Whether a win can be measured for this game type at all.
 *
 * Exported so `/admin/trophies` can warn before someone writes a "win 10 games" rule for a
 * game whose outcome the server never learns — the rule would parse, save, and silently never
 * fire, which looks identical to a typo.
 */
export function hasWinnerSource(gameType: GameType): boolean {
  return gameType in WINNER_SOURCES || isCompetitiveRoomGame(gameType)
}

/**
 * Game types where win-based trophies work today, from the persisted-winner map. The standings
 * fallback widens this further at runtime — use {@link hasWinnerSource} for a per-type answer.
 */
export function gameTypesWithWinners(): GameType[] {
  return Object.keys(WINNER_SOURCES).sort() as GameType[]
}

/**
 * Full finishing order, best first, or null when the server can't determine it.
 *
 * Two sources, tried in order: the game's own persisted `winner_player_id` (authoritative,
 * written when the game ended), then the same standings derivation room points already uses.
 * The fallback is what brings in the competitive games that keep no winner column — trivia,
 * bingo, codewords, sudoku, word hunt.
 */
export async function resolveStandings(
  supabase: SupabaseClient,
  gameId: string,
  gameType: GameType
): Promise<string[] | null> {
  if (!isCompetitiveRoomGame(gameType)) return null
  try {
    const { data: players } = await supabase
      .from('players')
      .select('id, name, spectator, room_member_id')
      .eq('game_id', gameId)
    if (!players?.length) return null

    const standings = await getCompetitiveStandings(supabase, gameId, gameType, players)
    // `[]` here is ambiguous — unsupported type or simply no scores yet — and the two are
    // indistinguishable from outside. Report "unknown" rather than inventing a draw.
    return standings.length ? standings : null
  } catch {
    return null
  }
}

/**
 * Winners from a finishing order.
 *
 * NOT just `standings[0]`. Team games put every member of the winning side at the front — in
 * Codewords that is the whole team — so taking the first entry awards one player and records
 * their team-mates as having lost a game they won. Team games therefore take the whole leading
 * block; individual games take the single leader.
 */
function winnersFromStandings(standings: string[] | null, gameType: GameType): string[] | null {
  if (!standings?.length) return null
  return TEAM_STANDINGS_GAMES.has(gameType) ? standings : [standings[0]]
}

/**
 * Game types whose standings are ordered by TEAM, so the leading block is all winners.
 * Adding to this needs a look at how that game builds its standings, not a guess from the name.
 */
const TEAM_STANDINGS_GAMES = new Set<string>(['codewords'])

/**
 * UNO Team-Up: the partner of the player who went out also won.
 *
 * A team round ends the instant ONE member empties their hand, and `winner_player_id` records
 * only that player. Their partner won the same round — `unoPlayerSharesWin` exists for exactly
 * this and the community leaderboard already uses it — but the trophy pass read the raw column,
 * so the partner was recorded as having LOST a game they won. That is wrong twice over: no win
 * counted, and a "never lost" style rule would be broken by a victory.
 *
 * Only teams change the answer, so a normal room does no extra work beyond the flag read.
 */
async function expandUnoTeamWin(supabase: SupabaseClient, gameId: string, winners: string[]): Promise<string[]> {
  if (winners.length !== 1) return winners
  try {
    const { data: game } = await supabase.from('games').select('uno_team_mode').eq('id', gameId).maybeSingle()
    if (!game?.uno_team_mode) return winners

    const { data: session } = await supabase
      .from('uno_sessions')
      .select('turn_order')
      .eq('game_id', gameId)
      .maybeSingle()
    const teammate = unoTeammateId((session?.turn_order as string[]) ?? [], winners[0])
    return teammate ? [winners[0], teammate] : winners
  } catch {
    // Never fail the whole resolution over the partner lookup — one recorded winner beats none.
    return winners
  }
}

/**
 * Games where a player who FINISHED is flagged `spectator = true`.
 *
 * The shed-your-hand card games flip the winner (and every player who goes out) to a spectator
 * the instant they empty their hand — the flag doubles as "no longer holding cards" for the UI.
 * But those players PLAYED, and the winner literally won. The award pass and the facts snapshot
 * both treat a spectator as a non-participant, so without this the winner of a Whot/UNO/Crazy
 * Eights game earns nothing at all — no win, no games_played, no streak. `finish_order` is the
 * ordered list of everyone who went out (winner first), so it is exactly the set to rescue.
 */
const FINISH_ORDER_SOURCES: Partial<Record<GameType, string>> = {
  whot: 'whot_sessions',
  uno: 'uno_sessions',
  crazy_eights: 'crazy_eights_sessions',
}

/**
 * Player ids who genuinely participated but may now read as spectators — the game's
 * `finish_order`. `[]` for games that don't overload the spectator flag, which leaves the
 * spectator flag as the sole signal (unchanged behaviour).
 */
export async function resolveFinishers(
  supabase: SupabaseClient,
  gameId: string,
  gameType: GameType
): Promise<string[]> {
  const table = FINISH_ORDER_SOURCES[gameType]
  if (!table) return []
  try {
    const { data } = await supabase.from(table).select('finish_order').eq('game_id', gameId).maybeSingle()
    return normalizeIds(data?.finish_order)
  } catch {
    return []
  }
}

function normalizeIds(value: unknown): string[] {
  if (typeof value === 'string' && value) return [value]
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && Boolean(v))
  return []
}

/**
 * Read the winner(s) of a finished game from the server's own tables.
 *
 * @returns player ids, `[]` when there was genuinely no winner, or `null` when this game
 * type's outcome cannot be determined server-side. Never throws — an award pass must not fail
 * a request because one game's outcome was unreadable.
 */
export async function resolveWinners(
  supabase: SupabaseClient,
  gameId: string,
  gameType: GameType
): Promise<string[] | null> {
  const winners = await resolveWinnersRaw(supabase, gameId, gameType)
  // UNO partner expansion is applied to the FINAL result of every path — scalar column, standings
  // fallback, or missing session — so a team win is never recorded as a solo one no matter which
  // branch produced it. Applied exactly once, here, and only for UNO.
  if (winners === null) return null
  return gameType === 'uno' ? expandUnoTeamWin(supabase, gameId, winners) : winners
}

async function resolveWinnersRaw(
  supabase: SupabaseClient,
  gameId: string,
  gameType: GameType
): Promise<string[] | null> {
  const source = WINNER_SOURCES[gameType]
  if (!source) {
    // No persisted winner column. Derived standings cover the rest of the competitive games.
    return winnersFromStandings(await resolveStandings(supabase, gameId, gameType), gameType)
  }

  const columns = source.arrayColumn ? `${source.column}, ${source.arrayColumn}` : source.column
  try {
    const { data, error } = await supabase.from(source.table).select(columns).eq('game_id', gameId).maybeSingle()
    // An error is "we don't know", not "nobody won" — see the three-way note at the top. The
    // session row can also be legitimately absent (an old game, a schema that arrived later),
    // so fall through to derived standings before giving up.
    if (error || !data) {
      return winnersFromStandings(await resolveStandings(supabase, gameId, gameType), gameType)
    }

    const row = data as unknown as Record<string, unknown>
    if (source.arrayColumn) {
      const many = normalizeIds(row[source.arrayColumn])
      if (many.length) return many
    }
    return normalizeIds(row[source.column])
  } catch {
    return null
  }
}
