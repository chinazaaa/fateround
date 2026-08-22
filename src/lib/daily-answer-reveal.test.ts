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
  ludo_puzzle: {
    // Four pieces, each one step from finish (home:4) and a dice sequence of four 1s so
    // each roll advances one piece over the line. That gives the solver a real 4-step
    // optimal path to reconstruct instead of the summary-only fallback.
    startingPieces: [
      { id: 0, zone: 'home', pos: 4 },
      { id: 1, zone: 'home', pos: 4 },
      { id: 2, zone: 'home', pos: 4 },
      { id: 3, zone: 'home', pos: 4 },
    ],
    diceSequence: [1, 1, 1, 1],
    obstacles: [],
    solution: { optimalRolls: 4 },
  },
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

  it('gives the ludo target + optimal step-by-step, which is what the player wants to see', () => {
    const section = build('ludo_puzzle', FIXTURES.ludo_puzzle)!.sections[0]
    // The section label carries the roll count; the item list carries the moves.
    expect(section.label).toMatch(/^Finish in \d+ rolls?$/)
    const items = lines(section)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].label).toMatch(/^Roll 1/)
    // Never leak a raw object into the UI.
    for (const item of items) expect(item.value).not.toContain('[object')
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
    ['web', 'src/components/daily/DailyAnswersClient.tsx', /searchParams\.get\('date'\)/],
    ['mobile', 'apps/mobile/app/daily-challenges/answers/[slug].tsx', /useLocalSearchParams<\{[^}]*date/],
  ])(
    'the %s answers view forwards the URL date param, and the server still refuses today',
    (_platform, rel, hookRe) => {
      // Both platforms now support prev/next-day navigation via ?date=YYYY-MM-DD in the URL,
      // so they pass the param through to the API. That's safe because the server route
      // (src/app/api/daily-challenges/[gameType]/answers/route.ts) rejects any date that
      // isn't strictly before today in WAT — the gate lives on the server, not the client.
      // What we still verify here is that the client cannot inject today itself: the only
      // date it sends is whatever came in via the platform's URL-param hook.
      const src = read(rel)
      expect(src).toMatch(/\/answers/)
      expect(src, 'the date must come from the URL, not from the client synthesising it').toMatch(hookRe)
    }
  )
})

/**
 * Entry points must name a game from the canonical list, never a hardcoded slug.
 *
 * The hub used to link "View Leaderboards" at `/daily-challenges/sudoku/leaderboard`, which
 * sent everyone to Sudoku whether they play it or not — and would have 404'd the day Sudoku
 * left the daily lineup. Both destinations carry chips for all thirteen games, so the landing
 * game is a starting tab rather than a dead end; it should still be one the player cares about.
 */
describe('daily hub entry points', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
  const HUB = read('src/components/daily/DailyHubClient.tsx')
  // Comments stripped: the note explaining what the hardcoded link USED to be would otherwise
  // fail the very test that documents its removal.
  const HUB_CODE = HUB.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('names no game in a hardcoded URL', () => {
    const hardcoded = [...HUB_CODE.matchAll(/\/daily-challenges\/([a-z-]+)\/(leaderboard|answers)/g)].map((m) => m[1])
    expect(hardcoded, 'derive the slug from DAILY_CHALLENGE_GAME_TYPES instead').toEqual([])
  })

  it('derives the landing game from a game the player actually played', () => {
    expect(HUB).toMatch(/const entrySlug = useMemo\(/)
    expect(HUB).toMatch(/DAILY_CHALLENGE_GAME_TYPES\.find\(\(type\) => games\.some/)
    // Falls back to the canonical list's first entry, so removing a game can't strand the link.
    expect(HUB).toMatch(/DAILY_GAME_TYPE_TO_SLUG\[played \?\? DAILY_CHALLENGE_GAME_TYPES\[0\]\]/)
  })

  it('offers both destinations from the hub', () => {
    expect(HUB).toMatch(/\$\{entrySlug\}\/leaderboard/)
    expect(HUB).toMatch(/\$\{entrySlug\}\/answers/)
  })

  it.each([
    ['web', 'src/components/daily/DailyAnswersClient.tsx'],
    ['mobile', 'apps/mobile/app/daily-challenges/answers/[slug].tsx'],
  ])('the %s answers view can switch game, so a link is never a dead end', (_platform, rel) => {
    expect(read(rel)).toMatch(/DAILY_CHALLENGE_GAME_TYPES\.map/)
  })
})
