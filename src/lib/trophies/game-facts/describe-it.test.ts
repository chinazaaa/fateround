import { describe, expect, it } from 'vitest'
import type { FactsContext } from './index'
import { describeItFacts } from './describe-it'

/**
 * The builder reads four sources: the word log, the guess log, the player rows (for teams), and
 * the game's mode. The mock is those four, each a plain array/object. Every case here is a rule
 * an admin could write — a wrong derivation is a silently unearnable trophy.
 */
function db(opts: {
  words?: Record<string, unknown>[]
  guesses?: Record<string, unknown>[]
  players?: Record<string, unknown>[]
  mode?: 'team' | 'individual'
}) {
  const table = (rows: Record<string, unknown>[]) => ({
    select: () => ({ eq: () => Promise.resolve({ data: rows }) }),
  })
  return {
    from(name: string) {
      if (name === 'describe_it_words') return table(opts.words ?? [])
      if (name === 'describe_it_guesses') return table(opts.guesses ?? [])
      if (name === 'describe_it_players') return table(opts.players ?? [])
      // games — reached via .select().eq().maybeSingle()
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: { describe_it_mode: opts.mode ?? 'team' } }) }),
        }),
      }
    },
  } as never
}

const CTX: FactsContext = {
  timerSeconds: 90,
  questionSource: 'platform',
  theme: null,
  seated: ['a', 'b', 'c', 'd'],
  winners: [],
}

const word = (o: Partial<Record<string, unknown>>) => ({
  turn_index: 0,
  round: 1,
  team: 1,
  status: 'guessed',
  describer_player_id: 'a',
  guesser_player_id: 'b',
  ...o,
})

const factsFor = async (opts: Parameters<typeof db>[0], playerId: string, ctx: FactsContext = CTX) =>
  (await describeItFacts(db(opts), 'G', ctx)).get(playerId) ?? {}

describe('describeItFacts — team mode', () => {
  it('counts words guessed from the word log, crediting the actual guesser only', async () => {
    const words = [
      word({ turn_index: 0, round: 1, guesser_player_id: 'b' }),
      word({ turn_index: 0, round: 1, guesser_player_id: 'b' }),
      word({ turn_index: 0, round: 1, guesser_player_id: 'c' }),
    ]
    const b = await factsFor({ words, mode: 'team' }, 'b')
    const c = await factsFor({ words, mode: 'team' }, 'c')
    expect(b.describe_it_words_guessed).toBe(2)
    expect(c.describe_it_words_guessed).toBe(1)
  })

  it('counts describer turns (not words) and flags the describer round-count thresholds', async () => {
    // 'a' describes turn 0 (round 1) getting 5 words, and turn 2 (round 2) getting 1 word.
    const words = [
      ...Array.from({ length: 5 }, () =>
        word({ turn_index: 0, round: 1, describer_player_id: 'a', guesser_player_id: 'b' })
      ),
      word({ turn_index: 2, round: 2, describer_player_id: 'a', guesser_player_id: 'c' }),
    ]
    const a = await factsFor({ words, mode: 'team' }, 'a')
    expect(a.describe_it_describer_turns).toBe(2)
    expect(a.describe_it_describer_5_round).toBe(1)
    expect(a.describe_it_describer_8_round).toBeUndefined()
  })

  it('flags a perfect describer round only with enough words and no skips', async () => {
    const perfect = Array.from({ length: 3 }, () =>
      word({ turn_index: 0, describer_player_id: 'a', status: 'guessed' })
    )
    const withSkip = [
      word({ turn_index: 0, describer_player_id: 'a', status: 'guessed' }),
      word({ turn_index: 0, describer_player_id: 'a', status: 'guessed' }),
      word({ turn_index: 0, describer_player_id: 'a', status: 'guessed' }),
      word({ turn_index: 0, describer_player_id: 'a', status: 'skipped', guesser_player_id: null }),
    ]
    expect((await factsFor({ words: perfect, mode: 'team' }, 'a')).describe_it_perfect_round_games).toBe(1)
    expect((await factsFor({ words: withSkip, mode: 'team' }, 'a')).describe_it_perfect_round_games).toBeUndefined()
  })

  it('flags All Rounder only when the player both described and guessed', async () => {
    // 'a' describes and also guesses (on someone else's turn); 'x' only describes.
    const words = [
      word({ turn_index: 0, describer_player_id: 'x', guesser_player_id: 'a' }),
      word({ turn_index: 1, describer_player_id: 'a', guesser_player_id: 'b' }),
    ]
    const a = await factsFor({ words, mode: 'team' }, 'a')
    const x = await factsFor({ words, mode: 'team' }, 'x')
    expect(a.describe_it_all_rounder_games).toBe(1)
    expect(x.describe_it_all_rounder_games).toBeUndefined()
  })

  it('flags Team Player for a team of three or more', async () => {
    const players = [
      { player_id: 'a', team: 1 },
      { player_id: 'b', team: 1 },
      { player_id: 'c', team: 1 },
      { player_id: 'd', team: 2 },
    ]
    const words = [word({ describer_player_id: 'a', guesser_player_id: 'b' })]
    const a = await factsFor({ words, players, mode: 'team' }, 'a')
    const d = await factsFor({ words, players, mode: 'team' }, 'd')
    expect(a.describe_it_big_team_games).toBe(1)
    expect(d.describe_it_big_team_games).toBeUndefined()
  })

  it('awards Clean Sweep and Flawless only to a winning team that led every round with no skips', async () => {
    // Team 1 leads round 1 (2-0) and round 2 (3-1), never skips → clean sweep + flawless.
    const words = [
      word({ turn_index: 0, round: 1, team: 1, describer_player_id: 'a', guesser_player_id: 'b', status: 'guessed' }),
      word({ turn_index: 0, round: 1, team: 1, describer_player_id: 'a', guesser_player_id: 'b', status: 'guessed' }),
      word({ turn_index: 2, round: 2, team: 1, describer_player_id: 'b', guesser_player_id: 'a', status: 'guessed' }),
      word({ turn_index: 3, round: 2, team: 2, describer_player_id: 'c', guesser_player_id: 'd', status: 'guessed' }),
    ]
    const players = [
      { player_id: 'a', team: 1 },
      { player_id: 'b', team: 1 },
      { player_id: 'c', team: 2 },
      { player_id: 'd', team: 2 },
    ]
    const ctx = { ...CTX, winners: ['a', 'b'] }
    const a = await factsFor({ words, players, mode: 'team' }, 'a', ctx)
    expect(a.describe_it_clean_sweep_wins).toBe(1)
    expect(a.describe_it_flawless_wins).toBe(1)
    // The losing team gets neither.
    const c = await factsFor({ words, players, mode: 'team' }, 'c', ctx)
    expect(c.describe_it_clean_sweep_wins).toBeUndefined()
  })

  it('does not award Flawless to a team that skipped a word', async () => {
    const words = [
      word({ round: 1, team: 1, guesser_player_id: 'b', status: 'guessed' }),
      word({ turn_index: 1, round: 2, team: 1, describer_player_id: 'b', status: 'skipped', guesser_player_id: null }),
    ]
    const players = [
      { player_id: 'a', team: 1 },
      { player_id: 'b', team: 1 },
      { player_id: 'c', team: 2 },
    ]
    const a = await factsFor({ words, players, mode: 'team' }, 'a', { ...CTX, winners: ['a', 'b'] })
    expect(a.describe_it_flawless_wins).toBeUndefined()
  })

  it('records a team comeback: winner was strictly last at halfway', async () => {
    // 4 rounds, halfway = round 2. Through round 2: team 1 has 1, team 2 has 3 → team 1 last.
    // Team 1 then wins overall (winners passed in).
    const words = [
      word({ turn_index: 1, round: 1, team: 2, describer_player_id: 'c', guesser_player_id: 'd', status: 'guessed' }),
      word({ turn_index: 3, round: 2, team: 2, describer_player_id: 'c', guesser_player_id: 'd', status: 'guessed' }),
      word({ turn_index: 3, round: 2, team: 2, describer_player_id: 'c', guesser_player_id: 'd', status: 'guessed' }),
      word({ turn_index: 2, round: 2, team: 1, describer_player_id: 'a', guesser_player_id: 'b', status: 'guessed' }),
      // Rounds 3-4: team 1 surges (rounds only need to exist to set totalRounds=4).
      word({ turn_index: 6, round: 4, team: 1, describer_player_id: 'a', guesser_player_id: 'b', status: 'guessed' }),
    ]
    const players = [
      { player_id: 'a', team: 1 },
      { player_id: 'b', team: 1 },
      { player_id: 'c', team: 2 },
      { player_id: 'd', team: 2 },
    ]
    const a = await factsFor({ words, players, mode: 'team' }, 'a', { ...CTX, winners: ['a', 'b'] })
    expect(a.describe_it_comeback_wins).toBe(1)
  })
})

describe('describeItFacts — individual mode', () => {
  it('counts correct guesses from the guess log and flags Wordsmith at ten', async () => {
    const guesses = Array.from({ length: 10 }, (_, i) => ({
      player_id: 'a',
      turn_index: i,
      correct: true,
      points: 30,
    }))
    // A word-log row per turn supplies the round mapping (and one skipped/other row is ignored).
    const words = guesses.map((g) =>
      word({ turn_index: g.turn_index as number, round: 1, team: 0, guesser_player_id: null, describer_player_id: 'b' })
    )
    const a = await factsFor({ words, guesses, mode: 'individual' }, 'a')
    expect(a.describe_it_words_guessed).toBe(10)
    expect(a.describe_it_wordsmith_games).toBe(1)
  })

  it('ignores incorrect guesses', async () => {
    const guesses = [
      { player_id: 'a', turn_index: 0, correct: false, points: 0 },
      { player_id: 'a', turn_index: 1, correct: true, points: 40 },
    ]
    const words = [
      word({ turn_index: 0, team: 0, guesser_player_id: null, describer_player_id: 'b' }),
      word({ turn_index: 1, team: 0, guesser_player_id: null, describer_player_id: 'b' }),
    ]
    const a = await factsFor({ words, guesses, mode: 'individual' }, 'a')
    expect(a.describe_it_words_guessed).toBe(1)
  })

  it('flags Hat Trick from per-round guesses spanning several turns of one round', async () => {
    // Round 1 has three turns; 'a' guesses in all three → 3 in one round.
    const guesses = [0, 1, 2].map((t) => ({ player_id: 'a', turn_index: t, correct: true, points: 20 }))
    const words = [0, 1, 2].map((t) =>
      word({ turn_index: t, round: 1, team: 0, guesser_player_id: null, describer_player_id: 'z' })
    )
    const a = await factsFor({ words, guesses, mode: 'individual' }, 'a')
    expect(a.describe_it_round_guess_3).toBe(1)
    // But only one guess per turn, so no same-describer turn run.
    expect(a.describe_it_guess_run_3).toBeUndefined()
  })

  it('records an individual comeback from the reconstructed halfway standings', async () => {
    // 2 rounds (roster of 4 → 8 turns), halfway = round 1. Through round 1, 'a' scores nothing
    // while rivals score; 'a' then wins overall. Describer mirror is included but 'a' describes
    // only in round 2, so 'a' is last at halfway.
    const guesses = [
      { player_id: 'b', turn_index: 0, correct: true, points: 30 },
      { player_id: 'c', turn_index: 1, correct: true, points: 30 },
      { player_id: 'd', turn_index: 2, correct: true, points: 10 },
    ]
    const words = [
      word({ turn_index: 0, round: 1, team: 0, guesser_player_id: null, describer_player_id: 'x' }),
      word({ turn_index: 1, round: 1, team: 0, guesser_player_id: null, describer_player_id: 'y' }),
      word({ turn_index: 2, round: 1, team: 0, guesser_player_id: null, describer_player_id: 'z' }),
      // Round 2 existence sets totalRounds = 2; 'a' describes here (after halfway) and scores 0
      // through halfway, leaving 'a' strictly last of the four seated players.
      word({ turn_index: 4, round: 2, team: 0, guesser_player_id: null, describer_player_id: 'a' }),
    ]
    const a = await factsFor({ words, guesses, mode: 'individual' }, 'a', { ...CTX, winners: ['a'] })
    expect(a.describe_it_comeback_wins).toBe(1)
  })

  it('does not reach team-only thresholds in individual play (one word per turn)', async () => {
    const guesses = [{ player_id: 'a', turn_index: 0, correct: true, points: 50 }]
    const words = [word({ turn_index: 0, team: 0, guesser_player_id: null, describer_player_id: 'b' })]
    const a = await factsFor({ words, guesses, mode: 'individual' }, 'a')
    expect(a.describe_it_big_team_games).toBeUndefined()
    expect(a.describe_it_words_guessed).toBe(1)
  })
})

describe('describeItFacts — room and source, and quiet on nothing', () => {
  it('flags custom sets, big rooms, and packed-house wins from context', async () => {
    const words = [word({ describer_player_id: 'a', guesser_player_id: 'b' })]
    const big = Array.from({ length: 16 }, (_, i) => `p${i}`)
    const ctx: FactsContext = { ...CTX, questionSource: 'custom', seated: big, winners: ['b'] }
    const b = await factsFor({ words, mode: 'team' }, 'b', ctx)
    expect(b.describe_it_custom_set_games).toBe(1)
    expect(b.describe_it_big_room_12).toBe(1)
    expect(b.describe_it_packed_house_wins).toBe(1)
  })

  it('returns nothing when there is no record at all', async () => {
    const facts = await describeItFacts(db({ words: [], guesses: [] }), 'G', CTX)
    expect(facts.size).toBe(0)
  })
})
