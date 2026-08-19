import type { SupabaseClient } from '@supabase/supabase-js'
import { clampDescribeItMode } from '@/lib/describe-it'
import type { DescribeItMode } from '@/types'
import type { FactsContext } from './index'

/**
 * Text Charades (`describe_it`) per-game facts, derived at finish from what the game already stored.
 *
 * Like Trivia, this game keeps a RECORD, not just a final position: `describe_it_words` holds one
 * row per resolved word (who described it, who guessed it, which round, guessed or skipped) and
 * `describe_it_guesses` holds one row per guess (with speed-scaled `points` in individual mode).
 * So almost every briefed trophy is an aggregation over rows already written server-side — nothing
 * here touches a gameplay route, and no new in-play counter was needed.
 *
 * ONE CALL PER ROUND, NOT PER PLAYER. All four reads happen once and every player's facts fall out
 * of that single sweep (see game-facts/index.ts for why).
 *
 * WHY FLAGS AND NOT VALUES. Counters are lifetime sums, and the rule DSL only asks `counter >= n`.
 * A per-game achievement ("10 words this game", "led every round") is therefore emitted as a 0/1
 * flag counted once; only genuinely cumulative measures (words guessed, describer turns) are
 * emitted as real totals. See game-facts/trivia.ts for the full rationale.
 *
 * WHAT THE DATA CANNOT HONESTLY SUPPORT — and is therefore omitted, not approximated:
 *  - TIMING (Quickfire "<5s guess", Speed Describer, Lightning). Per-word start time is not
 *    persisted for past turns: the only time signal is the session's LIVE `turn_deadline_at`,
 *    gone by finish. In individual mode `describe_it_guesses.points` decays with speed, but the
 *    window it decays over is the describer's half-turn whose START is not recoverable, so a real
 *    "seconds" figure can't be reconstructed; in team mode `points` is stored as 0 and carries no
 *    timing at all. `created_at` deltas measure inter-guess gaps, not time-since-clue. Omitted.
 *  - HOST trophies. A non-playing host has only a spectator row the award pass refuses, so a
 *    "host N games" counter could never fire — omitted exactly as Trivia's host trophies are.
 *  - "Both Sides" (win 5 as top describer AND 5 as top guesser). This is a conjunction of two
 *    independent lifetime counts; the single-counter DSL (`counter >= n`) cannot express it. The
 *    role leaderboards it needs are individual-mode only besides. Omitted.
 *
 * MODE MATTERS. Team mode has teams and multiple words per describer turn; individual mode has no
 * teams (`team = 0`) and exactly one word per describer turn. Team-shaped trophies (Team Player,
 * Clean Sweep, Flawless, the describer round counts) simply never fire in individual play because
 * the data can't reach their thresholds there — no special gating beyond reading the real rows.
 */

/** Perfect Round wants a describer turn worth calling perfect, not one lucky word. */
const PERFECT_ROUND_MIN_WORDS = 3

type WordRow = {
  turn_index: number
  round: number
  team: number
  status: 'guessed' | 'skipped'
  describer_player_id: string | null
  guesser_player_id: string | null
}

type GuessRow = {
  player_id: string
  turn_index: number
  correct: boolean | null
  points: number | null
}

type PlayerRow = { player_id: string; team: number }

/** A word this player correctly guessed, with the round and turn it happened in. */
type Got = { turn: number; round: number }

export async function describeItFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: wordsData }, { data: guessesData }, { data: playersData }, { data: game }] = await Promise.all([
    supabase
      .from('describe_it_words')
      .select('turn_index, round, team, status, describer_player_id, guesser_player_id')
      .eq('game_id', gameId),
    supabase.from('describe_it_guesses').select('player_id, turn_index, correct, points').eq('game_id', gameId),
    supabase.from('describe_it_players').select('player_id, team').eq('game_id', gameId),
    supabase.from('games').select('describe_it_mode').eq('id', gameId).maybeSingle(),
  ])

  const words = (wordsData ?? []) as WordRow[]
  const guesses = (guessesData ?? []) as GuessRow[]
  const players = (playersData ?? []) as PlayerRow[]
  if (!words.length && !guesses.length) return out

  const mode: DescribeItMode = clampDescribeItMode((game as { describe_it_mode?: unknown } | null)?.describe_it_mode)
  const isTeam = mode === 'team'

  // ── Turn → round and turn → describer, authoritative from the word log (both modes write it) ──
  const roundByTurn = new Map<number, number>()
  const describerByTurn = new Map<number, string>()
  let totalRounds = 0
  for (const w of words) {
    roundByTurn.set(w.turn_index, w.round)
    if (w.describer_player_id) describerByTurn.set(w.turn_index, w.describer_player_id)
    if (w.round > totalRounds) totalRounds = w.round
  }

  // ── Who correctly guessed what ────────────────────────────────────────────────────────────
  // Team mode: the word log names the single player who actually claimed each word — the atomic
  // claim guarantees one guesser per guessed word, so a late correct guess (which lands in
  // describe_it_guesses but scores nothing) is correctly not counted here.
  // Individual mode: the word log doesn't name a guesser (guesser_player_id is null), so correct
  // guesses come from describe_it_guesses, where a partial unique index keeps them one-per-turn.
  const gotByPlayer = new Map<string, Got[]>()
  const pushGot = (playerId: string, turn: number, round: number) => {
    const list = gotByPlayer.get(playerId) ?? []
    list.push({ turn, round })
    gotByPlayer.set(playerId, list)
  }
  if (isTeam) {
    for (const w of words) {
      if (w.status === 'guessed' && w.guesser_player_id) pushGot(w.guesser_player_id, w.turn_index, w.round)
    }
  } else {
    for (const g of guesses) {
      if (g.correct === true) pushGot(g.player_id, g.turn_index, roundByTurn.get(g.turn_index) ?? 0)
    }
  }

  // ── Describer turns, and words-guessed / skipped within each describer turn (team mode reaches
  //    the volume thresholds; individual mode caps at one word per turn) ──────────────────────
  const wordsByTurn = new Map<number, WordRow[]>()
  for (const w of words) {
    const list = wordsByTurn.get(w.turn_index) ?? []
    list.push(w)
    wordsByTurn.set(w.turn_index, list)
  }
  // Per describer: the set of turns they described, and their best single-turn guessed count and
  // whether any of their turns was "perfect" (>= min words, none skipped).
  const describerTurns = new Map<string, Set<number>>()
  const bestDescriberTurnWords = new Map<string, number>()
  const perfectDescriberRound = new Set<string>()
  for (const [turn, turnWords] of wordsByTurn) {
    const describer = describerByTurn.get(turn)
    if (!describer) continue
    const turns = describerTurns.get(describer) ?? new Set<number>()
    turns.add(turn)
    describerTurns.set(describer, turns)
    const guessed = turnWords.filter((w) => w.status === 'guessed').length
    const skipped = turnWords.filter((w) => w.status === 'skipped').length
    bestDescriberTurnWords.set(describer, Math.max(bestDescriberTurnWords.get(describer) ?? 0, guessed))
    if (skipped === 0 && guessed >= PERFECT_ROUND_MIN_WORDS) perfectDescriberRound.add(describer)
  }

  // ── Team sizes (team mode only; individual seeds everyone onto team 1, which is meaningless) ──
  const teamSize = new Map<number, number>()
  const teamOf = new Map<string, number>()
  for (const p of players) {
    teamOf.set(p.player_id, p.team)
    if (isTeam && p.team >= 1) teamSize.set(p.team, (teamSize.get(p.team) ?? 0) + 1)
  }

  const winners = new Set(ctx.winners)
  const seatedCount = ctx.seated.length

  // ── Win-gated, room-wide derivations computed once ────────────────────────────────────────
  const comebackWinners = computeComebackWinners(
    mode,
    words,
    guesses,
    roundByTurn,
    describerByTurn,
    teamOf,
    winners,
    ctx.seated,
    totalRounds
  )
  const cleanSweepTeams = isTeam ? teamsLeadingEveryRound(words, totalRounds) : new Set<number>()
  const flawlessTeams = isTeam ? teamsWithNoSkips(words) : new Set<number>()

  // ── Everyone we have anything to say about ────────────────────────────────────────────────
  const everyone = new Set<string>([...gotByPlayer.keys(), ...describerTurns.keys(), ...ctx.seated])

  for (const playerId of everyone) {
    const facts: Record<string, number> = {}
    const won = winners.has(playerId)

    // ── Guessing ────────────────────────────────────────────────────────────────────────────
    const got = gotByPlayer.get(playerId) ?? []
    if (got.length) facts.describe_it_words_guessed = got.length
    if (got.length >= 10) facts.describe_it_wordsmith_games = 1

    // Best guessed-in-one-round (a round can span many turns in individual mode) and best
    // guessed-in-one-describer-turn (same describer, back to back).
    const perRound = new Map<number, number>()
    const perTurn = new Map<number, number>()
    for (const g of got) {
      perRound.set(g.round, (perRound.get(g.round) ?? 0) + 1)
      perTurn.set(g.turn, (perTurn.get(g.turn) ?? 0) + 1)
    }
    const bestRound = Math.max(0, ...perRound.values())
    const bestTurnRun = Math.max(0, ...perTurn.values())
    if (bestRound >= 3) facts.describe_it_round_guess_3 = 1
    if (bestTurnRun >= 3) facts.describe_it_guess_run_3 = 1
    if (bestTurnRun >= 5) facts.describe_it_guess_run_5 = 1

    // ── Describing ────────────────────────────────────────────────────────────────────────────
    const turnsDescribed = describerTurns.get(playerId)?.size ?? 0
    if (turnsDescribed) facts.describe_it_describer_turns = turnsDescribed

    const bestAsDescriber = bestDescriberTurnWords.get(playerId) ?? 0
    if (bestAsDescriber >= 5) facts.describe_it_describer_5_round = 1
    if (bestAsDescriber >= 8) facts.describe_it_describer_8_round = 1
    if (bestAsDescriber >= 10) facts.describe_it_describer_10_round = 1
    if (bestAsDescriber >= 12) facts.describe_it_describer_12_round = 1
    if (perfectDescriberRound.has(playerId)) facts.describe_it_perfect_round_games = 1

    // ── Both roles in one game ────────────────────────────────────────────────────────────────
    if (turnsDescribed >= 1 && got.length >= 1) facts.describe_it_all_rounder_games = 1

    // ── Room and source ───────────────────────────────────────────────────────────────────────
    if (ctx.questionSource === 'custom') facts.describe_it_custom_set_games = 1
    if (seatedCount >= 12) facts.describe_it_big_room_12 = 1
    if (won && seatedCount >= 16) facts.describe_it_packed_house_wins = 1
    if (isTeam) {
      const size = teamSize.get(teamOf.get(playerId) ?? -1) ?? 0
      if (size >= 3) facts.describe_it_big_team_games = 1
    }

    // ── Win-gated ─────────────────────────────────────────────────────────────────────────────
    if (comebackWinners.has(playerId)) facts.describe_it_comeback_wins = 1
    if (won && isTeam) {
      const team = teamOf.get(playerId) ?? -1
      if (cleanSweepTeams.has(team)) facts.describe_it_clean_sweep_wins = 1
      if (flawlessTeams.has(team)) facts.describe_it_flawless_wins = 1
    }

    if (Object.keys(facts).length) out.set(playerId, facts)
  }

  return out
}

/** Cumulative guessed words per team after each round: teamCum.get(team)[r-1] = score through r. */
function teamCumulativeByRound(words: WordRow[], totalRounds: number): Map<number, number[]> {
  const perRound = new Map<number, Map<number, number>>() // round → team → guessed that round
  const teams = new Set<number>()
  for (const w of words) {
    if (w.team >= 1) teams.add(w.team)
    if (w.status !== 'guessed' || w.team < 1) continue
    const byTeam = perRound.get(w.round) ?? new Map<number, number>()
    byTeam.set(w.team, (byTeam.get(w.team) ?? 0) + 1)
    perRound.set(w.round, byTeam)
  }
  const cum = new Map<number, number[]>()
  for (const team of teams) {
    const series: number[] = []
    let running = 0
    for (let r = 1; r <= totalRounds; r += 1) {
      running += perRound.get(r)?.get(team) ?? 0
      series.push(running)
    }
    cum.set(team, series)
  }
  return cum
}

/** Teams that were at or ahead of every other team after each and every round (shared lead counts). */
function teamsLeadingEveryRound(words: WordRow[], totalRounds: number): Set<number> {
  const out = new Set<number>()
  if (totalRounds < 1) return out
  const cum = teamCumulativeByRound(words, totalRounds)
  const teams = [...cum.keys()]
  if (teams.length < 2) return out // a lone team "leading" is meaningless
  for (const team of teams) {
    const mine = cum.get(team)!
    let led = true
    for (let i = 0; i < totalRounds; i += 1) {
      const top = Math.max(...teams.map((t) => cum.get(t)![i]!))
      if (mine[i]! < top) {
        led = false
        break
      }
    }
    if (led) out.add(team)
  }
  return out
}

/** Teams that never had a word skipped all game. */
function teamsWithNoSkips(words: WordRow[]): Set<number> {
  const teams = new Set<number>()
  const skipped = new Set<number>()
  for (const w of words) {
    if (w.team < 1) continue
    teams.add(w.team)
    if (w.status === 'skipped') skipped.add(w.team)
  }
  const out = new Set<number>()
  for (const t of teams) if (!skipped.has(t)) out.add(t)
  return out
}

/**
 * Winners who were STRICTLY last at the halfway point — a real comeback, not a shared lead.
 *
 * Both modes reconstruct the same running score the standings used, up to and including the
 * halfway round (`ceil(totalRounds / 2)`):
 *  - Team mode: a team's score is its guessed-word count; the winning team must be below every
 *    other team at halfway.
 *  - Individual mode: a player's score is their own correct-guess points plus the "mirror" points
 *    they earned as describer (each turn pays its describer the sum of that turn's guess points);
 *    the winner must be below every other seated player at halfway.
 */
function computeComebackWinners(
  mode: DescribeItMode,
  words: WordRow[],
  guesses: GuessRow[],
  roundByTurn: Map<number, number>,
  describerByTurn: Map<number, string>,
  teamOf: Map<string, number>,
  winners: Set<string>,
  seated: string[],
  totalRounds: number
): Set<string> {
  const out = new Set<string>()
  if (!winners.size || totalRounds < 2) return out
  const halfway = Math.ceil(totalRounds / 2)

  if (mode === 'team') {
    const teamScore = new Map<number, number>()
    const teams = new Set<number>()
    for (const w of words) {
      if (w.team < 1) continue
      teams.add(w.team)
      if (w.status === 'guessed' && w.round <= halfway) teamScore.set(w.team, (teamScore.get(w.team) ?? 0) + 1)
    }
    if (teams.size < 2) return out
    for (const winner of winners) {
      const team = teamOf.get(winner)
      if (team === undefined) continue
      const mine = teamScore.get(team) ?? 0
      const wasLast = [...teams].every((t) => t === team || (teamScore.get(t) ?? 0) > mine)
      if (wasLast) out.add(winner)
    }
    return out
  }

  // Individual mode: rebuild each player's score at halfway from guesser points + describer mirror.
  const score = new Map<string, number>()
  for (const id of seated) score.set(id, 0)
  const turnPoints = new Map<number, number>() // turn → total correct-guess points that turn
  for (const g of guesses) {
    if (g.correct !== true) continue
    const round = roundByTurn.get(g.turn_index) ?? Infinity
    if (round > halfway) continue
    const pts = g.points ?? 0
    score.set(g.player_id, (score.get(g.player_id) ?? 0) + pts)
    turnPoints.set(g.turn_index, (turnPoints.get(g.turn_index) ?? 0) + pts)
  }
  for (const [turn, pts] of turnPoints) {
    const describer = describerByTurn.get(turn)
    if (describer) score.set(describer, (score.get(describer) ?? 0) + pts)
  }
  const ids = [...score.keys()]
  if (ids.length < 2) return out
  for (const winner of winners) {
    if (!score.has(winner)) continue
    const mine = score.get(winner) ?? 0
    const wasLast = ids.every((id) => id === winner || (score.get(id) ?? 0) > mine)
    if (wasLast) out.add(winner)
  }
  return out
}
