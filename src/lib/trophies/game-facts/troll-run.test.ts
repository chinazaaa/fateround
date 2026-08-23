import { describe, expect, it } from 'vitest'
import type { FactsContext } from './index'
import { parBonusApplied, trollRunFacts } from './troll-run'
import {
  TROLL_RUN_DEATH_PENALTY,
  TROLL_RUN_FINISH_POINTS,
  TROLL_RUN_MIN_FINISH_SCORE,
  TROLL_RUN_PAR_TIME_BONUS,
  calculateTrollRunFinishScore,
} from '@/lib/troll-run'

/**
 * The builder reads two tables plus the game's world. A wrong derivation makes a trophy
 * silently unearnable — or worse, earnable by someone who didn't do the thing — which is the
 * failure mode these tests exist to catch.
 */
function db(tables: Record<string, unknown[]>, world = 'pits') {
  const client = {
    from(table: string) {
      if (table === 'games') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { troll_run_world: world } }) }) }),
        }
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: tables[table] ?? [] }) }) }
    },
  }
  return client as never
}

const CTX: FactsContext = {
  timerSeconds: 120,
  questionSource: null,
  theme: null,
  seated: ['me', 'b', 'c'],
  winners: [],
}
const ctxWith = (seated: string[]): FactsContext => ({ ...CTX, seated })

/** A finisher's real round score, so fixtures never hand-encode the scoring formula. */
const finisherScore = (placement: number, deaths: number, underPar: boolean) =>
  calculateTrollRunFinishScore(placement, deaths, underPar ? 0 : 999_000, 100)

type StateOpts = {
  player?: string
  round?: number
  deaths?: number
  levels?: number
  place?: number | null
  underPar?: boolean
}
const state = ({ player = 'me', round = 1, deaths = 0, levels = 10, place = 1, underPar = false }: StateOpts = {}) => ({
  player_id: player,
  current_round: round,
  deaths,
  levels_cleared: levels,
  finish_position: place,
  // A DNF's score comes from the DNF branch; the value is irrelevant to every assertion here.
  round_score: place == null ? 20 : finisherScore(place, deaths, underPar),
})

const facts = async (states: unknown[], events: unknown[] = [], ctx: FactsContext = CTX, world = 'pits') =>
  trollRunFacts(db({ troll_run_player_states: states, troll_run_events: events }, world), 'GAME', ctx)

describe('parBonusApplied', () => {
  it('recognises the bonus from the score alone', () => {
    expect(parBonusApplied(1, 0, finisherScore(1, 0, true))).toBe(true)
    expect(parBonusApplied(1, 0, finisherScore(1, 0, false))).toBe(false)
  })

  it('round-trips against the real scoring function at every placement', () => {
    // The derivation reverse-engineers a formula it does not own. Pinning it against the
    // function itself means a rebalance breaks this test rather than silently mislabelling
    // rounds as under par.
    for (let place = 1; place <= TROLL_RUN_FINISH_POINTS.length + 1; place++) {
      for (const deaths of [0, 1, 5]) {
        expect(parBonusApplied(place, deaths, finisherScore(place, deaths, true)), `p${place} d${deaths}`).toBe(true)
        expect(parBonusApplied(place, deaths, finisherScore(place, deaths, false)), `p${place} d${deaths}`).toBe(false)
      }
    }
  })

  it('says "unknown" rather than "no" when the score floor hides the answer', () => {
    // Enough deaths and both candidates clamp to the minimum, so the bonus is unknowable.
    // Guessing "no" here would quietly deny the trophy to the player who earned it.
    const deaths = Math.ceil(
      (TROLL_RUN_FINISH_POINTS[TROLL_RUN_FINISH_POINTS.length - 1] +
        TROLL_RUN_PAR_TIME_BONUS -
        TROLL_RUN_MIN_FINISH_SCORE) /
        TROLL_RUN_DEATH_PENALTY
    )
    expect(parBonusApplied(6, deaths, TROLL_RUN_MIN_FINISH_SCORE)).toBeNull()
  })

  it('says "unknown" for a score neither candidate explains', () => {
    expect(parBonusApplied(1, 0, 12_345)).toBeNull()
  })
})

describe('trollRunFacts', () => {
  it('emits nothing for an empty room or an empty race', async () => {
    expect((await facts([], [], ctxWith([]))).size).toBe(0)
    expect((await facts([])).size).toBe(0)
  })

  it('sums levels and deaths across every round', async () => {
    const out = await facts([
      state({ round: 1, levels: 10, deaths: 3 }),
      state({ round: 2, levels: 7, deaths: 4, place: null }),
    ])
    expect(out.get('me')?.troll_run_levels_cleared).toBe(17)
    expect(out.get('me')?.troll_run_deaths).toBe(7)
  })

  it('counts a DNF as played but never as finished', async () => {
    // THE TRAP: `round_finished` is stamped true on every row when the round closes, DNFs
    // included. `finish_position` is the only field that separates them. Reading the boolean
    // would hand every player who ran out of clock a finisher's trophies.
    const out = await facts([state({ round: 1, place: null, levels: 4 })])
    expect(out.get('me')?.troll_run_levels_cleared).toBe(4)
    expect(out.get('me')?.troll_run_rounds_finished).toBeUndefined()
    expect(out.get('me')?.troll_run_round_wins).toBeUndefined()
    expect(out.get('me')?.troll_run_deathless_rounds).toBeUndefined()
  })

  it('counts round wins only for first place', async () => {
    const out = await facts([
      state({ round: 1, place: 1 }),
      state({ round: 2, place: 2 }),
      state({ round: 3, place: 1 }),
    ])
    expect(out.get('me')?.troll_run_round_wins).toBe(2)
    expect(out.get('me')?.troll_run_rounds_finished).toBe(3)
  })

  it('counts a deathless round only when the player actually finished it', async () => {
    const out = await facts([
      state({ round: 1, deaths: 0, place: 3 }),
      state({ round: 2, deaths: 0, place: null }), // survived nothing; the clock got them
      state({ round: 3, deaths: 2, place: 1 }),
    ])
    expect(out.get('me')?.troll_run_deathless_rounds).toBe(1)
  })

  it('counts rounds finished under par', async () => {
    const out = await facts([
      state({ round: 1, place: 1, underPar: true }),
      state({ round: 2, place: 2, underPar: false }),
      state({ round: 3, place: 1, underPar: true }),
    ])
    expect(out.get('me')?.troll_run_par_rounds).toBe(2)
  })

  it('flags a flawless game only when every round was finished with no deaths', async () => {
    const clean = await facts([state({ round: 1, deaths: 0 }), state({ round: 2, deaths: 0 })])
    expect(clean.get('me')?.troll_run_flawless_games).toBe(1)

    const oneDeath = await facts([state({ round: 1, deaths: 0 }), state({ round: 2, deaths: 1 })])
    expect(oneDeath.get('me')?.troll_run_flawless_games).toBeUndefined()

    const oneDnf = await facts([state({ round: 1, deaths: 0 }), state({ round: 2, deaths: 0, place: null })])
    expect(oneDnf.get('me')?.troll_run_flawless_games).toBeUndefined()
  })

  it('flags a clean sweep only across a real series', async () => {
    const swept = await facts([state({ round: 1, place: 1 }), state({ round: 2, place: 1 })])
    expect(swept.get('me')?.troll_run_clean_sweep_games).toBe(1)

    // Winning the single round you played is just winning, not a sweep.
    const one = await facts([state({ round: 1, place: 1 })])
    expect(one.get('me')?.troll_run_clean_sweep_games).toBeUndefined()

    const dropped = await facts([state({ round: 1, place: 1 }), state({ round: 2, place: 2 })])
    expect(dropped.get('me')?.troll_run_clean_sweep_games).toBeUndefined()
  })

  it('counts a first-try clear only when the level took no deaths', async () => {
    const out = await facts(
      [state({ round: 1 })],
      [
        { player_id: 'me', round: 1, level_id: 'L1', event_type: 'clear' },
        { player_id: 'me', round: 1, level_id: 'L2', event_type: 'death' },
        { player_id: 'me', round: 1, level_id: 'L2', event_type: 'clear' },
        // Same level id, different round — a death in round 1 must not taint round 2.
        { player_id: 'me', round: 2, level_id: 'L2', event_type: 'clear' },
      ]
    )
    expect(out.get('me')?.troll_run_first_try_clears).toBe(2)
  })

  it('ignores rows for players who are not seated', async () => {
    // Spectators and removed players have rows too; crediting them would let a trophy land on
    // a profile the award pass never asked about.
    const out = await facts([state({ player: 'ghost' }), state({ player: 'me' })], [], ctxWith(['me']))
    expect(out.has('ghost')).toBe(false)
    expect(out.get('me')?.troll_run_levels_cleared).toBe(10)
  })

  it('records the world as a distinct member, for the four-world set', async () => {
    const out = await facts([state()], [], CTX, 'gravity')
    expect(out.get('me')?.['distinct:troll_run_worlds:gravity']).toBe(1)
  })

  it('normalises an unknown world instead of writing junk into the set', async () => {
    const out = await facts([state()], [], CTX, 'not-a-world')
    expect(out.get('me')?.['distinct:troll_run_worlds:pits']).toBe(1)
  })

  it('flags a full lobby only at six runners', async () => {
    const six = await facts([state()], [], ctxWith(['me', 'b', 'c', 'd', 'e', 'f']))
    expect(six.get('me')?.troll_run_full_lobby_games).toBe(1)
    const five = await facts([state()], [], ctxWith(['me', 'b', 'c', 'd', 'e']))
    expect(five.get('me')?.troll_run_full_lobby_games).toBeUndefined()
  })

  it('keeps each runner on their own facts', async () => {
    const out = await facts([
      state({ player: 'me', round: 1, place: 1, deaths: 0 }),
      state({ player: 'b', round: 1, place: 2, deaths: 6, levels: 10 }),
    ])
    expect(out.get('me')?.troll_run_round_wins).toBe(1)
    expect(out.get('b')?.troll_run_round_wins).toBeUndefined()
    expect(out.get('b')?.troll_run_deaths).toBe(6)
    expect(out.get('me')?.troll_run_deaths).toBeUndefined()
  })
})
