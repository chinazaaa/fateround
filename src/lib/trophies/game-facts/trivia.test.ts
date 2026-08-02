import { describe, expect, it } from 'vitest'
import type { FactsContext } from './index'
import { triviaFacts } from './trivia'

/**
 * The facts builder reads two tables and nothing else, so the mock is a pair of arrays.
 * Every case here is a rule someone could write in admin — if the derivation is wrong the
 * trophy is silently unearnable, which is indistinguishable from a typo.
 */
function db(answers: Record<string, unknown>[], rounds: Record<string, unknown>[]) {
  return {
    from(table: string) {
      const rows = table === 'trivia_answers' ? answers : rounds
      return { select: () => ({ eq: () => Promise.resolve({ data: rows }) }) }
    },
  } as never
}

const CTX: FactsContext = { timerSeconds: 10, questionSource: 'platform', seated: ['me', 'rival'], winners: [] }
const rounds = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, round_number: i + 1 }))

/** One call returns the whole room; most cases only care about one player's slice of it. */
const factsFor = async (
  answers: Record<string, unknown>[],
  roundRows: Record<string, unknown>[],
  playerId: string,
  ctx: FactsContext = CTX
) => (await triviaFacts(db(answers, roundRows), 'G', ctx)).get(playerId) ?? {}

describe('triviaFacts', () => {
  it('counts correct answers and the in-game streak', async () => {
    const answers = [1, 2, 3, 4, 5].map((n) => ({
      round_id: `r${n}`,
      player_id: 'me',
      is_correct: n !== 4, // 1,2,3 then a miss then 5 → best run of 3
      response_ms: 4000,
      points: 10,
    }))
    const f = await factsFor(answers, rounds(5), 'me')
    expect(f.trivia_correct_answers).toBe(4)
    expect(f.trivia_streak_3_games).toBe(1)
    expect(f.trivia_streak_5_games).toBeUndefined()
  })

  it('a skipped round breaks the run rather than being ignored', async () => {
    // Answering 1,2 then 4,5 is not "four in a row" — the unanswered question is not correct,
    // and treating the gap as neutral would let someone farm streaks by skipping hard ones.
    const answers = [1, 2, 4, 5].map((n) => ({
      round_id: `r${n}`,
      player_id: 'me',
      is_correct: true,
      response_ms: 3000,
      points: 10,
    }))
    const f = await factsFor(answers, rounds(5), 'me')
    expect(f.trivia_correct_answers).toBe(4)
    expect(f.trivia_streak_3_games).toBeUndefined()
  })

  it('awards first-correct to the fastest answerer only', async () => {
    const answers = [
      { round_id: 'r1', player_id: 'me', is_correct: true, response_ms: 2000, points: 10 },
      { round_id: 'r1', player_id: 'rival', is_correct: true, response_ms: 900, points: 10 },
    ]
    const facts = await triviaFacts(db(answers, rounds(1)), 'G', CTX)
    expect(facts.get('me')?.trivia_first_correct_games).toBeUndefined()
    expect(facts.get('rival')?.trivia_first_correct_games).toBe(1)
  })

  it('gives every player their own facts from a single call', async () => {
    // The point of the once-per-round shape: two players, one read, each derived correctly and
    // independently — nobody inherits the other's streak, speed or accuracy.
    const answers = [
      { round_id: 'r1', player_id: 'me', is_correct: true, response_ms: 1000, points: 10 },
      { round_id: 'r2', player_id: 'me', is_correct: true, response_ms: 1200, points: 10 },
      { round_id: 'r3', player_id: 'me', is_correct: true, response_ms: 1100, points: 10 },
      { round_id: 'r1', player_id: 'rival', is_correct: true, response_ms: 8000, points: 10 },
      { round_id: 'r2', player_id: 'rival', is_correct: false, response_ms: 8000, points: 0 },
      { round_id: 'r3', player_id: 'rival', is_correct: false, response_ms: 8000, points: 0 },
    ]
    const facts = await triviaFacts(db(answers, rounds(3)), 'G', CTX)
    expect([...facts.keys()].sort()).toEqual(['me', 'rival'])
    expect(facts.get('me')?.trivia_correct_answers).toBe(3)
    expect(facts.get('me')?.trivia_streak_3_games).toBe(1)
    expect(facts.get('me')?.trivia_lightning_games).toBe(1)
    expect(facts.get('rival')?.trivia_correct_answers).toBe(1)
    expect(facts.get('rival')?.trivia_streak_3_games).toBeUndefined()
    expect(facts.get('rival')?.trivia_lightning_games).toBeUndefined()
  })

  it('flags a buzzer beater only inside the last two seconds', async () => {
    const late = [{ round_id: 'r1', player_id: 'me', is_correct: true, response_ms: 8500, points: 10 }]
    const early = [{ round_id: 'r1', player_id: 'me', is_correct: true, response_ms: 3000, points: 10 }]
    expect((await factsFor(late, rounds(1), 'me')).trivia_buzzer_beater_games).toBe(1)
    expect((await factsFor(early, rounds(1), 'me')).trivia_buzzer_beater_games).toBeUndefined()
  })

  it('does not call a partial game perfect', async () => {
    // 5 correct out of 10 questions is not full marks — the count must be against the ROUNDS,
    // not against how many the player happened to answer.
    const answers = [1, 2, 3, 4, 5].map((n) => ({
      round_id: `r${n}`,
      player_id: 'me',
      is_correct: true,
      response_ms: 4000,
      points: 10,
    }))
    const f = await factsFor(answers, rounds(10), 'me')
    expect(f.trivia_full_marks_games).toBeUndefined()
    expect(f.trivia_perfect_10q_games).toBeUndefined()
  })

  it('records a wire-to-wire win but not a comeback', async () => {
    const answers = [
      { round_id: 'r1', player_id: 'me', is_correct: true, response_ms: 1000, points: 20 },
      { round_id: 'r1', player_id: 'rival', is_correct: false, response_ms: 9000, points: 0 },
      { round_id: 'r2', player_id: 'me', is_correct: true, response_ms: 1000, points: 20 },
      { round_id: 'r2', player_id: 'rival', is_correct: true, response_ms: 5000, points: 10 },
    ]
    const f = await factsFor(answers, rounds(2), 'me', { ...CTX, winners: ['me'] })
    expect(f.trivia_wire_to_wire_wins).toBe(1)
    expect(f.trivia_comeback_wins).toBeUndefined()
  })

  it('returns nothing for a player who never answered', async () => {
    const facts = await triviaFacts(db([], rounds(5)), 'G', CTX)
    expect(facts.has('ghost')).toBe(false)
    expect(facts.size).toBe(0)
  })
})
