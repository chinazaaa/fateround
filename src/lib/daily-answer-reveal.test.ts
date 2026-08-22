import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildDailyAnswerReveal, type DailyAnswerSection } from '@/lib/daily-answer-reveal'
import { DAILY_CHALLENGE_GAME_TYPES, type DailyChallengeGameType } from '@/lib/daily-challenge'

/**
 * The reveal has to cover every daily game and never invent an answer.
 *
 * A wrong reveal is worse than none: it tells a player they were right when they weren't, in
 * the one place they came for a definitive answer. So each extractor returns nothing rather
 * than guessing, and this pins the "nothing" cases as hard as the happy ones.
 */

const DATE = '2026-08-21'
const build = (t: DailyChallengeGameType, data: Record<string, unknown>) => buildDailyAnswerReveal(t, DATE, data)
const lines = (s: DailyAnswerSection | undefined) => (s?.kind === 'lines' ? s.items : [])

/** Realistic-enough puzzle_data per type, matching what `daily-challenge-server.ts` writes. */
const FIXTURES: Record<DailyChallengeGameType, Record<string, unknown>> = {
  wordle: { word: 'crane' },
  sudoku: {
    puzzle: [[0]],
    solution: [
      [1, 2],
      [3, 4],
    ],
  },
  word_hunt: { grid: [], valid_words: ['CAT', 'PLANET', 'TAP'] },
  word_search: { metadata: { words: ['LAGOS', 'ABUJA'] }, solution: [{ word: 'LAGOS' }] },
  word_scramble: { metadata: { scrambles: [{ scrambled: 'TENALP' }] }, solution: ['PLANET'] },
  crossword: {
    metadata: { clues: [{ row: 0, col: 0, length: 3, direction: 'across', clue: 'Feline', number: 1 }] },
    solution: [['C', 'A', 'T']],
  },
  mini_crossword: {
    metadata: { clues: [{ row: 0, col: 0, length: 3, direction: 'down', clue: 'Feline', number: 1 }] },
    solution: [['C'], ['A'], ['T']],
  },
  trivia: {
    questions: [{ question: 'Capital of Nigeria?', choices: ['Lagos', 'Abuja'], correct_index: 1 }],
    solution: [1],
  },
  word_grouping: { solution: { groups: [{ category: 'Cats', words: ['LION', 'TIGER'], difficulty: 1 }] } },
  codenames_codeword: { clue: 'ANIMAL', clueNumber: 2, grid: [], solution: { correctWords: ['LION', 'BEAR'] } },
  chess_mate: { solution: { lines: [['Qh5+', 'Kf8', 'Qf7#']] } },
  whot_puzzle: {
    solution: { optimalMoves: 2, moves: [{ type: 'play', card: { shape: 'circle', number: 5 } }, { type: 'draw' }] },
  },
  ludo_puzzle: { solution: { optimalRolls: 4 } },
}

describe('buildDailyAnswerReveal', () => {
  it('covers every shipped daily game type', () => {
    // A new daily game that forgets an extractor would otherwise ship a blank reveal.
    const missing = DAILY_CHALLENGE_GAME_TYPES.filter((t) => !build(t, FIXTURES[t]))
    expect(missing, 'no extractor produced a reveal for these').toEqual([])
  })

  it('returns null rather than guessing when the solution is absent', () => {
    for (const type of DAILY_CHALLENGE_GAME_TYPES) {
      expect(build(type, {}), `${type} invented an answer from empty data`).toBeNull()
    }
  })

  it('reads the Wordle word', () => {
    expect(lines(build('wordle', FIXTURES.wordle)!.sections[0])[0].value).toBe('CRANE')
  })

  it('lays out the sudoku solution as a grid', () => {
    const section = build('sudoku', FIXTURES.sudoku)!.sections[0]
    expect(section.kind).toBe('grid')
    expect(section.kind === 'grid' && section.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('sorts word-hunt answers longest first — the ones worth seeing', () => {
    const items = lines(build('word_hunt', FIXTURES.word_hunt)!.sections[0])
    expect(items.map((i) => i.value)).toEqual(['PLANET', 'CAT', 'TAP'])
  })

  it('pairs each scramble with its answer', () => {
    const items = lines(build('word_scramble', FIXTURES.word_scramble)!.sections[0])
    expect(items[0]).toEqual({ label: 'TENALP', value: 'PLANET' })
  })

  it('reads crossword answers out of the solution grid, both directions', () => {
    const across = build('crossword', FIXTURES.crossword)!.sections
    expect(across).toHaveLength(1)
    expect(across[0].label).toBe('Across')
    expect(lines(across[0])[0]).toEqual({ label: '1A. Feline', value: 'CAT' })

    // Down clues walk the grid vertically — the axis a naive implementation gets wrong.
    const down = build('mini_crossword', FIXTURES.mini_crossword)!.sections
    expect(down[0].label).toBe('Down')
    expect(lines(down[0])[0].value).toBe('CAT')
  })

  it('resolves the trivia answer text, not its index', () => {
    const items = lines(build('trivia', FIXTURES.trivia)!.sections[0])
    expect(items[0]).toEqual({ label: 'Capital of Nigeria?', value: 'Abuja' })
  })

  it('falls back to per-question correct_index when the parallel solution array is absent', () => {
    // Rows written before the index array was split out still have to reveal correctly.
    const { questions } = FIXTURES.trivia as { questions: unknown }
    const items = lines(build('trivia', { questions })!.sections[0])
    expect(items[0].value).toBe('Abuja')
  })

  it('groups word-grouping answers under their category', () => {
    const items = lines(build('word_grouping', FIXTURES.word_grouping)!.sections[0])
    expect(items[0]).toEqual({ label: 'Cats', value: 'LION, TIGER' })
  })

  it('shows the codeword clue alongside its words', () => {
    const section = build('codenames_codeword', FIXTURES.codenames_codeword)!.sections[0]
    expect(section.label).toBe('ANIMAL 2')
    expect(lines(section).map((i) => i.value)).toEqual(['LION', 'BEAR'])
  })

  it('renders a mating line as a move sequence', () => {
    expect(lines(build('chess_mate', FIXTURES.chess_mate)!.sections[0])[0].value).toBe('Qh5+ Kf8 Qf7#')
  })

  it('describes whot moves in words, not card objects', () => {
    const section = build('whot_puzzle', FIXTURES.whot_puzzle)!.sections[0]
    expect(section.label).toBe('Solved in 2 moves')
    const items = lines(section)
    expect(items[0].value).toBe('Play 5 circle')
    expect(items[1].value).toBe('Draw from market')
    // Never leak a raw object into the UI.
    for (const item of items) expect(item.value).not.toContain('[object')
  })

  it('gives the ludo target, which is the whole answer there', () => {
    expect(lines(build('ludo_puzzle', FIXTURES.ludo_puzzle)!.sections[0])[0].value).toBe('4 rolls')
  })
})

/**
 * Both platforms must offer the reveal, and neither may reach for a live puzzle to do it.
 */
describe('answer reveal surfaces', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

  it.each([
    ['web', 'src/components/daily/DailyChallengeResults.tsx'],
    ['mobile', 'apps/mobile/components/daily/DailyChallengeResults.tsx'],
  ])("the %s results screen links to yesterday's answers", (_platform, rel) => {
    // The results screen covers both cases that matter: just finished, and already played
    // today (the hook routes an already-played visit straight to `phase: 'results'`).
    expect(read(rel)).toMatch(/answers/i)
  })

  it.each([
    ['web', 'src/components/daily/DailyAnswersClient.tsx'],
    ['mobile', 'apps/mobile/app/daily-challenges/answers/[slug].tsx'],
  ])('the %s answers view never asks for a specific date', (_platform, rel) => {
    // Passing a date would be the one way a client could aim at today. Both omit it and take
    // the route's default of yesterday, so the gate cannot be argued with.
    const src = read(rel)
    expect(src).toMatch(/\/answers`/)
    expect(src, 'must not send a date param').not.toMatch(/answers\?date=/)
  })
})
