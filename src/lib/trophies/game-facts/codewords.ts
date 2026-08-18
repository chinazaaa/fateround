import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Codewords' per-game facts, derived at finish from what the game already stored.
 *
 * Codewords keeps a real record too: `codewords_guesses` holds one row per guess with the cell
 * it hit (`cell_type`), the clue it was made under (`clue_word`, `clue_number`) and the guessing
 * team, all written server-side by the atomic guess route. `codewords_boards` keeps the key card
 * and the revealed cells, and `codewords_player_roles` keeps each player's team and role. Between
 * them every counter below is an aggregation over rows that are already there. Nothing here
 * touches a gameplay route.
 *
 * ONCE PER ROUND, NOT ONCE PER PLAYER. The three tables are read a single time and every player's
 * facts are derived from those rows, because everything here is a view onto the same round: the
 * clue runs, the key and the team tallies are shared, and only the guess tallies and the two run
 * counters are sliced per player. Called per player this re-read the whole guess log once for each
 * seat and threw away all but one player's share.
 *
 * WHY FLAGS AND NOT VALUES. Counters are lifetime sums (`bump_player_stats` adds deltas) and the
 * rule DSL only asks `counter >= n`. So a per-game achievement cannot be stored as a value —
 * "my best run this game was 5" would be summed across games into nonsense. Each per-game
 * achievement is emitted as a 0/1 flag counted once, and the rule then reads `>= 1`. Only
 * genuinely cumulative measures (guess tallies, clean turns) are emitted as real totals.
 *
 * TEAM WINS ARE NOT PERSONAL WINS. `resolveWinners` returns the whole winning team, so every
 * member of it is in `ctx.winners`. Every `_wins` counter below is therefore a TEAM property
 * credited to each member of the team; that is deliberate (Codewords has no individual win) and
 * each one says so where it matters. The personal counters — the guess tallies and the run
 * counters — are the only ones that measure this player specifically. `ctx.winners` is also empty
 * for a draw and for a round whose winner the server could not determine, so absence from it is
 * never read as a loss: it only ever withholds the win counters.
 *
 * READING THE KEY. `codewords_boards.key` is deliberately not selectable by anon/authenticated
 * (migration 20260803170000). The award pass runs on the service-role admin client, which bypasses
 * column grants, so the two key-derived counters below (`clutch_wins`, `comeback_wins`) work here
 * and would silently degrade to nothing if this were ever called with a public client — a missing
 * trophy, never a leak.
 *
 * THE MISSING-TURN CAVEAT. A turn is reconstructed by grouping consecutive same-team guess rows,
 * in `created_at` order, on `(team, clue_word, clue_number)`. A clue that drew ZERO guesses — the
 * turn timed out before anyone touched a card — leaves no row at all, so it is invisible here and
 * clue runs can be UNDERCOUNTED. For the "found them all" and "run of N" counters that direction
 * is safe: an invisible turn can only ever fail to award, never award falsely. For the two "in N
 * runs or fewer" counters (`sweep_wins`, `flawless_sweep_wins`) the same undercount is generous
 * instead — a win with a timed-out clue looks one run faster than it was. That is accepted rather
 * than fixed: the board stores no per-turn history to recover the empty turn from, and the bias is
 * bounded by how many turns a team can afford to waste and still win.
 */

/** A win where the opponent was one card from taking it. */
const CLUTCH_OPPONENT_REMAINING = 1
/** "Sweep": won inside this many recorded clue runs. */
const SWEEP_RUNS = 4
/** "Flawless sweep": won inside this many recorded clue runs, with nothing wrong hit. */
const FLAWLESS_SWEEP_RUNS = 3
/** "Comeback": at some point in the game the team needed this many more words than the opponent. */
const COMEBACK_DEFICIT = 3

type GuessRow = {
  player_id: string
  cell_index: number
  cell_type: string | null
  clue_word: string | null
  clue_number: number | null
  team: string | null
  created_at: string | null
}

type RoleRow = { player_id: string; team: string | null; role: string | null }

type BoardRow = {
  key: string[] | null
  revealed_indices: number[] | null
  assassin_team: string | null
}

/** One clue's worth of guessing: consecutive rows by the same team under the same clue. */
type ClueRun = { team: string | null; clueNumber: number | null; guesses: GuessRow[] }

const stamp = (row: GuessRow): number => {
  const t = Date.parse(row.created_at ?? '')
  return Number.isNaN(t) ? 0 : t
}

/**
 * Split the game's guesses into clue runs.
 *
 * A run breaks whenever the team, the clue word or the clue number changes — the same team can
 * legitimately repeat a clue number ("TREE 2" then "OCEAN 2") and the clue word separates those.
 * A team repeating the exact same clue word AND number on a later turn would merge into one run,
 * which is why the opponent's turn in between also breaks it; back-to-back identical clues by the
 * same team are not reachable in play.
 */
function clueRuns(ordered: GuessRow[]): ClueRun[] {
  const runs: ClueRun[] = []
  let prev: GuessRow | null = null
  for (const g of ordered) {
    const sameRun =
      prev !== null && prev.team === g.team && prev.clue_word === g.clue_word && prev.clue_number === g.clue_number
    if (!sameRun) runs.push({ team: g.team, clueNumber: g.clue_number, guesses: [] })
    runs[runs.length - 1].guesses.push(g)
    prev = g
  }
  return runs
}

export async function codewordsFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: boards }, { data: roles }, { data: guesses }] = await Promise.all([
    supabase
      .from('codewords_boards')
      // `boards.winner` is deliberately not read: `ctx.winners` is the award pass's own verdict via
      // `resolveWinners`, and two sources of truth for "did you win" is one too many.
      .select('key, revealed_indices, assassin_team')
      .eq('game_id', gameId),
    supabase.from('codewords_player_roles').select('player_id, team, role').eq('game_id', gameId),
    supabase
      .from('codewords_guesses')
      .select('player_id, cell_index, cell_type, clue_word, clue_number, team, created_at')
      .eq('game_id', gameId),
  ])

  const allGuesses = (guesses ?? []) as GuessRow[]
  const allRoles = (roles ?? []) as RoleRow[]
  const board = ((boards ?? [])[0] ?? null) as BoardRow | null

  const ordered = [...allGuesses].sort((a, b) => stamp(a) - stamp(b))
  const runs = clueRuns(ordered)
  const key = board?.key ?? null

  // Won without the assassin ever being turned over by anyone. Hitting the assassin ends the game
  // instantly in the other team's favour, so "my team didn't hit it" is true of every win and
  // would be worthless; what this marks is a win that was earned rather than handed over by an
  // opponent's blunder. `assassin_team` is the board's own record of who hit it.
  const assassinHit = board?.assassin_team != null || allGuesses.some((g) => g.cell_type === 'assassin')

  const remaining = (team: string, revealed: Set<number>): number =>
    (key ?? []).filter((cell, i) => cell === team && !revealed.has(i)).length

  const finalRevealed = new Set<number>((board?.revealed_indices ?? []).map((i) => Number(i)))

  /**
   * Everything about a team that does not depend on which member is being credited: the clue-run
   * flags, the clean turns and the win shapes. Derived once per team and merged into each of its
   * members below.
   */
  const teamFacts = new Map<string, { shared: Record<string, number>; wins: Record<string, number> }>()
  const factsForTeam = (myTeam: string) => {
    const cached = teamFacts.get(myTeam)
    if (cached) return cached

    const opponentTeam = myTeam === 'red' ? 'blue' : 'red'
    const shared: Record<string, number> = {}
    const wins: Record<string, number> = {}
    const myRuns = runs.filter((r) => r.team === myTeam)

    for (const run of myRuns) {
      const found = run.guesses.filter((g) => g.cell_type === myTeam).length
      const n = run.clueNumber ?? 0
      // "Clue for N, all N found" is a TEAM achievement credited to everyone on the team: the
      // spymaster who gave the clue and the operatives who read it. The guess rows name the finder,
      // never the clue-giver, so there is no honest way to split it.
      if (n >= 2 && n <= 5 && found >= n) shared[`codewords_clue${n}_full`] = 1
    }

    // Clean turn: a recorded team turn where nothing but the team's own words was hit. Team-level —
    // the whole team is on the hook for a turn, and a spymaster has no guess rows to credit.
    // Cumulative rather than a flag: turns are a repeatable unit, so summing them across games is
    // meaningful in a way "my best turn" would not be.
    const cleanTurns = myRuns.filter(
      (r) => r.guesses.length > 0 && r.guesses.every((g) => g.cell_type === myTeam)
    ).length
    if (cleanTurns) shared.codewords_clean_turns = cleanTurns

    // ── Win shapes (all team properties, credited to every member) ────────────────────────
    if (!assassinHit) wins.codewords_assassin_dodged_wins = 1

    const myTeamGuesses = allGuesses.filter((g) => g.team === myTeam)
    const wrong = myTeamGuesses.filter((g) => g.cell_type !== myTeam).length
    if (wrong === 0) wins.codewords_perfect_wins = 1
    if (myRuns.length > 0 && myRuns.length <= SWEEP_RUNS) wins.codewords_sweep_wins = 1
    if (myRuns.length > 0 && myRuns.length <= FLAWLESS_SWEEP_RUNS && wrong === 0) wins.codewords_flawless_sweep_wins = 1

    // ── Key-derived win shapes ────────────────────────────────────────────────────────────
    if (key?.length) {
      // Clutch: won while the opponent was one card away. Measured from the board's own final
      // `revealed_indices`, so it reflects the position the players actually saw at the end.
      if (remaining(opponentTeam, finalRevealed) === CLUTCH_OPPONENT_REMAINING) wins.codewords_clutch_wins = 1

      // Comeback: at some point the team needed 3+ more words than the opponent did. Replayed from
      // the guesses rather than the final board, because the final board only shows the end state.
      // The starting team begins one card down by design, so a deficit of 1 is the normal opening
      // and the threshold sits well clear of it.
      const revealed = new Set<number>()
      let worstDeficit = remaining(myTeam, revealed) - remaining(opponentTeam, revealed)
      for (const g of ordered) {
        revealed.add(Number(g.cell_index))
        worstDeficit = Math.max(worstDeficit, remaining(myTeam, revealed) - remaining(opponentTeam, revealed))
      }
      if (worstDeficit >= COMEBACK_DEFICIT) wins.codewords_comeback_wins = 1
    }

    const entry = { shared, wins }
    teamFacts.set(myTeam, entry)
    return entry
  }

  // Everyone the round has any record of. A player with no role row and no guesses was never in
  // this game (a spectator, or a row that never got written), so they are simply not here — and
  // never a throw.
  const playerIds = new Set<string>([...allRoles.map((r) => r.player_id), ...allGuesses.map((g) => g.player_id)])
  const winners = new Set(ctx.winners)

  for (const playerId of playerIds) {
    const facts: Record<string, number> = {}

    // The role row is the player's FINAL role, not the one they started with: when a team is
    // orphaned mid-game an operative is auto-promoted to spymaster and this row is rewritten. So
    // "spymaster win" here means "finished the game as the spymaster", which is the honest reading
    // of a row that only ever holds the latest state.
    const myRole = allRoles.find((r) => r.player_id === playerId) ?? null
    const myGuesses = allGuesses.filter((g) => g.player_id === playerId)

    const myTeam = myRole?.team ?? myGuesses[0]?.team ?? null
    if (!myTeam) continue
    const opponentTeam = myTeam === 'red' ? 'blue' : 'red'

    // ── Personal guess tallies (genuinely cumulative) ───────────────────────────────────
    const ownWords = myGuesses.filter((g) => g.cell_type === myTeam).length
    const neutrals = myGuesses.filter((g) => g.cell_type === 'neutral').length
    const opponents = myGuesses.filter((g) => g.cell_type === opponentTeam).length
    const assassins = myGuesses.filter((g) => g.cell_type === 'assassin').length
    if (ownWords) facts.codewords_own_word_guesses = ownWords
    if (neutrals) facts.codewords_neutral_guesses = neutrals
    if (opponents) facts.codewords_opponent_guesses = opponents
    if (assassins) facts.codewords_assassin_guesses = assassins

    const team = factsForTeam(myTeam)
    Object.assign(facts, team.shared)

    // These two ARE personal: they count the cards THIS player turned over under one clue.
    for (const run of runs) {
      if (run.team !== myTeam) continue
      const mineFound = run.guesses.filter((g) => g.player_id === playerId && g.cell_type === myTeam).length
      if (mineFound >= 4) facts.codewords_run4_guesses = 1
      if (mineFound >= 5) facts.codewords_run5_guesses = 1
    }

    if (winners.has(playerId)) {
      if (myRole?.role === 'spymaster') facts.codewords_spymaster_wins = 1
      if (myRole?.role === 'operative') facts.codewords_operative_wins = 1
      Object.assign(facts, team.wins)
    }

    if (Object.keys(facts).length > 0) out.set(playerId, facts)
  }

  return out
}
