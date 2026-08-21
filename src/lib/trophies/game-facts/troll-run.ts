import type { SupabaseClient } from '@supabase/supabase-js'
import { TROLL_RUN_MIN_FINISH_SCORE, calculateTrollRunFinishScore, normalizeTrollRunWorld } from '@/lib/troll-run'
import type { FactsContext } from './index'

/**
 * Troll Run per-game facts, derived at finish from rows the race already wrote.
 *
 * THE GAME. A room runs N rounds (default 5). Each round is ten randomly-ordered levels of one
 * world, against a shared clock (default 120s). Clear all ten and you "finish" the round and
 * place by elapsed time; run out of clock and you keep partial credit for the levels you did
 * clear. Deaths are cheap individually (-5) and expensive in bulk.
 *
 * ── THE TRAP THIS BUILDER IS BUILT AROUND ────────────────────────────────────
 * `troll_run_player_states.round_finished` does NOT mean "cleared the round". The scoring pass
 * in `troll-run-advance.ts` stamps `round_finished: true` on EVERY row when the round closes,
 * DNFs included — it means "this round is over for you", not "you got out". The field that
 * actually separates a finisher from someone the clock caught is `finish_position`: a number
 * for finishers, null for a DNF. Reading the boolean instead would hand every DNF a finisher's
 * trophies, which is the single easiest way to get this file wrong.
 *
 * ONE ROW PER (PLAYER, ROUND). The round transition inserts fresh rows carrying `total_score`
 * forward, so every round's deaths, times and placements survive to finish and per-round facts
 * are honest. (`total_time_ms`, `deaths` and `levels_cleared` are per-round; `total_score` is
 * the running total.)
 *
 * ONE CALL PER GAME, NOT PER PLAYER — every player's facts fall out of two reads.
 *
 * WHY FLAGS AND NOT VALUES. Counters accumulate for life and the rule DSL only asks
 * `counter >= n`, so a per-GAME achievement ("never died all game") is emitted as a 0/1 flag
 * counted once; genuinely cumulative measures (levels cleared, deaths, round wins) are emitted
 * as real totals. See game-facts/trivia.ts for the full rationale.
 *
 * WHAT THE DATA CANNOT HONESTLY SUPPORT — omitted rather than approximated:
 *  - PER-LEVEL PAR ("beat par on the spike pit"). `troll_run_events.level_id` survives, but the
 *    par time lives on a level descriptor rebuilt from a per-round seed in
 *    `troll_run_sessions.level_order` — which is OVERWRITTEN every round. At finish only the
 *    last round's order exists, so par is unresolvable for every earlier round.
 *  - WHOLE-ROUND PAR is recoverable anyway, but indirectly — see `parBonusApplied` below.
 *  - HOST trophies. A non-playing host holds only a spectator row, which the award pass
 *    refuses, so a "host N games" counter could never fire. Omitted as in Trivia and Quick Draw.
 */

/** A clean sweep needs a series to sweep — winning the only round played is just winning. */
const SWEEP_MIN_ROUNDS = 2

/** Room-size fact, matching the game's own maximum (`TROLL_RUN_MAX_PLAYERS`). */
const FULL_LOBBY_PLAYERS = 6

type StateRow = {
  player_id: string
  current_round: number
  deaths: number
  levels_cleared: number
  finish_position: number | null
}

type EventRow = {
  player_id: string
  round: number
  level_id: string
  event_type: 'death' | 'clear'
}

function bump(facts: Map<string, Record<string, number>>, playerId: string, key: string, by = 1): void {
  if (by === 0) return
  const row = facts.get(playerId) ?? {}
  row[key] = (row[key] ?? 0) + by
  facts.set(playerId, row)
}

function flag(facts: Map<string, Record<string, number>>, playerId: string, key: string): void {
  const row = facts.get(playerId) ?? {}
  row[key] = 1
  facts.set(playerId, row)
}

/**
 * Did this finisher's round score include the under-par speed bonus?
 *
 * The bonus isn't stored — only the final `round_score` is. But the score is a pure function of
 * (placement, deaths, time, par), so we ask the REAL scoring function for the two scores this
 * player could have had and compare. That keeps the derivation honest across a rebalance: if
 * the points table or the penalty changes, this moves with it instead of quietly lying.
 *
 * Returns null when the two candidates collide — `calculateTrollRunFinishScore` clamps at
 * `TROLL_RUN_MIN_FINISH_SCORE`, so a runner with enough deaths bottoms out at the floor either
 * way and the bonus becomes genuinely unknowable. Unknown is not "no": it is not counted.
 */
export function parBonusApplied(placement: number, deaths: number, roundScore: number): boolean | null {
  // Par of 1s: a 0ms time is inside it, a 2000ms time is outside. Only the bonus differs.
  const withBonus = calculateTrollRunFinishScore(placement, deaths, 0, 1)
  const withoutBonus = calculateTrollRunFinishScore(placement, deaths, 2000, 1)
  if (withBonus === withoutBonus) return null
  if (roundScore === withBonus) return true
  if (roundScore === withoutBonus) return false
  // Neither — the row predates a scoring change, or was written by something else. Say nothing.
  return null
}

export async function trollRunFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()
  if (!ctx.seated.length) return out

  const [{ data: stateData }, { data: eventData }, { data: game }] = await Promise.all([
    supabase
      .from('troll_run_player_states')
      .select('player_id, current_round, deaths, levels_cleared, finish_position, round_score')
      .eq('game_id', gameId),
    supabase.from('troll_run_events').select('player_id, round, level_id, event_type').eq('game_id', gameId),
    supabase.from('games').select('troll_run_world').eq('id', gameId).maybeSingle(),
  ])

  const states = (stateData ?? []) as (StateRow & { round_score: number })[]
  if (!states.length) return out

  const seated = new Set(ctx.seated)

  /** Per player: totals across every round they were in. */
  type Tally = {
    rounds: number
    finished: number
    wins: number
    deaths: number
    levels: number
    deathless: number
    par: number
  }
  const tally = new Map<string, Tally>()
  const get = (id: string): Tally => {
    let t = tally.get(id)
    if (!t) {
      t = { rounds: 0, finished: 0, wins: 0, deaths: 0, levels: 0, deathless: 0, par: 0 }
      tally.set(id, t)
    }
    return t
  }

  for (const state of states) {
    if (!seated.has(state.player_id)) continue
    const t = get(state.player_id)
    const deaths = Math.max(0, state.deaths ?? 0)

    t.rounds += 1
    t.deaths += deaths
    t.levels += Math.max(0, state.levels_cleared ?? 0)

    // finish_position, NOT round_finished — see the note at the top of this file.
    const placement = state.finish_position
    if (placement == null) continue

    t.finished += 1
    if (placement === 1) t.wins += 1
    if (deaths === 0) t.deathless += 1
    if (parBonusApplied(placement, deaths, Math.max(0, state.round_score ?? 0)) === true) t.par += 1
  }

  for (const [playerId, t] of tally) {
    bump(out, playerId, 'troll_run_levels_cleared', t.levels)
    bump(out, playerId, 'troll_run_rounds_finished', t.finished)
    bump(out, playerId, 'troll_run_round_wins', t.wins)
    bump(out, playerId, 'troll_run_deaths', t.deaths)
    bump(out, playerId, 'troll_run_deathless_rounds', t.deathless)
    bump(out, playerId, 'troll_run_par_rounds', t.par)

    // Whole-game achievements. Both need every round to have been finished, so a player who
    // joined late (fewer rows) can't collect them on a short sample.
    const playedEvery = t.rounds > 0 && t.finished === t.rounds
    if (playedEvery && t.deaths === 0) flag(out, playerId, 'troll_run_flawless_games')
    if (playedEvery && t.rounds >= SWEEP_MIN_ROUNDS && t.wins === t.rounds) {
      flag(out, playerId, 'troll_run_clean_sweep_games')
    }
  }

  // First-try clears: a level cleared in a round the player never died on. The event log is the
  // only place this granularity exists — the state row knows the round's death total, not which
  // level they were spent on.
  const diedOn = new Set<string>()
  const cleared: EventRow[] = []
  for (const event of (eventData ?? []) as EventRow[]) {
    if (!seated.has(event.player_id)) continue
    const key = `${event.player_id}|${event.round}|${event.level_id}`
    if (event.event_type === 'death') diedOn.add(key)
    else cleared.push(event)
  }
  const firstTry = new Map<string, number>()
  for (const event of cleared) {
    const key = `${event.player_id}|${event.round}|${event.level_id}`
    if (diedOn.has(key)) continue
    firstTry.set(event.player_id, (firstTry.get(event.player_id) ?? 0) + 1)
  }
  for (const [playerId, count] of firstTry) bump(out, playerId, 'troll_run_first_try_clears', count)

  // Variety set. Four worlds ship (`TROLL_RUN_WORLD_IDS`), each with its own hazard vocabulary,
  // so "played all four" is a real breadth measure no summable counter can express.
  const world = normalizeTrollRunWorld((game as { troll_run_world?: string | null } | null)?.troll_run_world)
  for (const playerId of tally.keys()) {
    flag(out, playerId, `distinct:troll_run_worlds:${world}`)
  }

  // Room-size fact, as in Quick Draw: describes the table, not the run.
  if (ctx.seated.length >= FULL_LOBBY_PLAYERS) {
    for (const playerId of tally.keys()) flag(out, playerId, 'troll_run_full_lobby_games')
  }

  return out
}
