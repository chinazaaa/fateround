import type { SupabaseClient } from '@supabase/supabase-js'
import type { MafiaRole } from '@/types'
import { mafiaRoleTeam } from '@/lib/mafia'
import type { FactsContext } from './index'

/**
 * Mafia's per-game facts, derived at finish from the roles/teams/outcome the game already stored.
 *
 * Two persisted tables carry everything these counters need. `mafia_player_states` holds one row
 * per seated player — `role`, `is_alive`, `death_cause`, `is_lover`, and the `bodyguard_hits_taken`
 * accumulator — and it survives to `game_over` (role reveal on the finished screen depends on it),
 * so at award time every player's final role and fate is readable. `mafia_sessions.winning_team`
 * is the single source of truth for who won, exactly as `resolveMafiaWinners` reads it: a team win
 * ('village'/'mafia') credits the whole side, the solo roles ('jester'/'serial_killer'/'arsonist')
 * credit their one player, and the 'lovers' overlay credits the two linked players regardless of
 * their roles. Nothing here touches a gameplay route or the night-resolution engine; no new
 * in-play tracking is added.
 *
 * WHY WIN CLASSIFICATION READS `winning_team`, NOT `ctx.winners`. `ctx.winners` answers "did this
 * player win" and is correct for that. But the per-role win trophies need to know WHICH team won,
 * and that distinction is only unambiguous from `winning_team` — a Villager who happens to be a
 * Lover is in `ctx.winners` on an ordinary Village win, so "won && is_lover" would misfire as a
 * Lovers win. Classifying off `winning_team` (the same value the winner resolver keys on) keeps
 * every role/team trophy self-consistent with what the game actually recorded. A null team means
 * "no recorded winner" (e.g. host ended the game with no side in control), and every win counter
 * is simply withheld — never counted as a loss.
 *
 * WHY FLAGS, NOT VALUES. Counters are lifetime sums (`bump_player_stats` adds deltas) and the rule
 * DSL only asks `counter >= n`. Each per-game achievement is emitted as a 0/1 flag counted once
 * ("did it in a round"), so it stays meaningful when summed across games.
 *
 * ONCE PER ROUND. One `mafia_player_states` read plus one `mafia_sessions` read decide every
 * player's facts; the builder returns a map keyed by player id. A player with no state row simply
 * gets no entry, which is not an error (see the contract in ./index).
 *
 * OMITTED HERE, BY DESIGN (see the branch report for the full list):
 *  - Role Player (5 distinct roles) / Solo Artist (win as all three solo roles): these count
 *    DISTINCT roles across games, which needs `player_distinct` membership. A facts builder can
 *    only emit summable counters, and a SystemTrophySpec only supports `counter` rules — neither
 *    can express a distinct set — so these are omitted rather than shipped unearnable.
 *  - The night-OUTCOME counters (Doctor save, Aura Seer read, Tracker, etc.) are omitted: their
 *    data is computed transiently during night resolution and never persisted, so deriving them at
 *    finish is impossible, and instrumenting them would mean writing new columns inside the atomic
 *    night engine — deliberately not done here.
 */

/** A "big" table; the max is 16, so 12+ is comfortably over three-quarters full. */
const BIG_GAME_PLAYERS = 12
/** Every seat filled. */
const FULL_HOUSE_PLAYERS = 16

type StateRow = {
  player_id: string
  role: MafiaRole
  is_alive: boolean
  death_cause: string | null
  is_lover: boolean | null
  bodyguard_hits_taken: number | null
}

export async function mafiaFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: statesData }, { data: session }] = await Promise.all([
    supabase
      .from('mafia_player_states')
      .select('player_id, role, is_alive, death_cause, is_lover, bodyguard_hits_taken')
      .eq('game_id', gameId),
    supabase.from('mafia_sessions').select('winning_team').eq('game_id', gameId).maybeSingle(),
  ])

  const rows = (statesData ?? []) as StateRow[]
  if (rows.length === 0) return out

  const winningTeam = (session?.winning_team as string | null) ?? null

  // Cross-player facts, computed once from all the rows.
  const aliveVillagers = rows.filter((r) => r.is_alive && mafiaRoleTeam(r.role) === 'village').length
  const allMafiaAlive = rows.filter((r) => mafiaRoleTeam(r.role) === 'mafia').every((r) => r.is_alive)

  const tableSize = ctx.seated.length

  for (const row of rows) {
    out.set(row.player_id, playerFacts(row, { winningTeam, aliveVillagers, allMafiaAlive, tableSize }))
  }

  return out
}

/** One player's counters, from that player's own final state plus the round-level context. */
function playerFacts(
  row: StateRow,
  round: { winningTeam: string | null; aliveVillagers: number; allMafiaAlive: boolean; tableSize: number }
): Record<string, number> {
  const facts: Record<string, number> = {}
  const team = mafiaRoleTeam(row.role)
  const { winningTeam } = round

  // ── Participation / fate (independent of who won) ─────────────────────────────────────────
  // "Made Man": you were part of the Mafia's side this game.
  if (team === 'mafia') facts.mafia_mafia_games = 1
  // "Survivor": still breathing when the game ended (a Medium revive clears death_cause and
  // restores is_alive, so a revived player correctly counts as a survivor).
  if (row.is_alive) facts.mafia_survivor_games = 1
  // "Strung Up": the village voted you out at day.
  if (row.death_cause === 'village_vote') facts.mafia_lynched_games = 1
  // "Took the Bullet": as the Bodyguard, you absorbed at least one attack protecting someone.
  // The role guard matters — only the Bodyguard row ever accumulates this column.
  if (row.role === 'bodyguard' && (row.bodyguard_hits_taken ?? 0) > 0) facts.mafia_bodyguard_hits = 1
  // "Last One Standing": you're a living Villager and the only one left on the town's side.
  if (row.is_alive && team === 'village' && round.aliveVillagers === 1) facts.mafia_last_villager = 1

  // ── Table size ────────────────────────────────────────────────────────────────────────────
  if (round.tableSize >= BIG_GAME_PLAYERS) facts.mafia_big_game_12 = 1
  if (round.tableSize >= FULL_HOUSE_PLAYERS) facts.mafia_full_house_16 = 1

  // ── Wins, classified off the recorded winning team ────────────────────────────────────────
  // A null winning team withholds every win counter (never a loss). Team wins credit the whole
  // side — matching the winner resolver — so a fallen Villager on a winning town still earns the
  // Village win, exactly as `games_won` does.
  if (winningTeam === 'village' && team === 'village') facts.mafia_village_wins = 1
  if (winningTeam === 'mafia' && team === 'mafia') facts.mafia_mafia_wins = 1
  if (winningTeam === 'jester' && row.role === 'jester') facts.mafia_jester_wins = 1
  if (winningTeam === 'serial_killer' && row.role === 'serial_killer') facts.mafia_serial_killer_wins = 1
  if (winningTeam === 'arsonist' && row.role === 'arsonist') facts.mafia_arsonist_wins = 1
  // "Cupid's Arrow": the Lovers overlay win — the two linked players, whatever their roles.
  if (winningTeam === 'lovers' && row.is_lover === true) facts.mafia_lovers_wins = 1
  // "Clean Sweep": the Mafia won and not one of them died all game.
  if (winningTeam === 'mafia' && team === 'mafia' && round.allMafiaAlive) facts.mafia_clean_sweep_wins = 1

  return facts
}
