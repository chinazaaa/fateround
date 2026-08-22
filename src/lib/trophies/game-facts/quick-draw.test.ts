import { describe, expect, it } from 'vitest'
import type { FactsContext } from './index'
import { quickDrawFacts } from './quick-draw'

/**
 * The builder reads `games.quick_draw_variant` and then ONE of two disjoint table sets, so the
 * mock is a table→rows map plus the variant. Every case below is a rule someone could write in
 * admin: a wrong derivation makes the trophy silently unearnable, which is the failure mode
 * these tests exist to catch.
 */
function db(variant: 'lie' | 'guess' | null, tables: Record<string, unknown[]>) {
  const reads: string[] = []
  const client = {
    from(table: string) {
      if (table === 'games') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { quick_draw_variant: variant } }) }),
          }),
        }
      }
      reads.push(table)
      return { select: () => ({ eq: () => Promise.resolve({ data: tables[table] ?? [] }) }) }
    },
  }
  return { client: client as never, reads }
}

const CTX: FactsContext = {
  timerSeconds: 0,
  questionSource: null,
  theme: null,
  seated: ['me', 'b', 'c'],
  winners: [],
}

const ctxWith = (seated: string[]): FactsContext => ({ ...CTX, seated })

// ── lie-variant fixtures ────────────────────────────────────────────────────────────────────
// Two drawings: D1 by 'me', D2 by 'b'. Titles: R1/R2 are the real prompts; F* are decoys.
const LIE_TABLES = {
  quick_draw_drawings: [
    { id: 'D1', player_id: 'me' },
    { id: 'D2', player_id: 'b' },
  ],
  quick_draw_titles: [
    { id: 'R1', drawing_id: 'D1', player_id: null, is_real: true },
    { id: 'F1b', drawing_id: 'D1', player_id: 'b', is_real: false },
    { id: 'F1c', drawing_id: 'D1', player_id: 'c', is_real: false },
    { id: 'R2', drawing_id: 'D2', player_id: null, is_real: true },
    { id: 'F2me', drawing_id: 'D2', player_id: 'me', is_real: false },
    { id: 'F2c', drawing_id: 'D2', player_id: 'c', is_real: false },
  ],
}

async function lieFactsFor(votes: { drawing_id: string; player_id: string; chosen_title_id: string }[], ctx = CTX) {
  const { client } = db('lie', { ...LIE_TABLES, quick_draw_votes: votes })
  return quickDrawFacts(client, 'G', ctx)
}

describe('quickDrawFacts — lie variant', () => {
  it('counts a drawing per seated artist', async () => {
    const facts = await lieFactsFor([])
    expect(facts.get('me')?.quick_draw_drawings_submitted).toBe(1)
    expect(facts.get('b')?.quick_draw_drawings_submitted).toBe(1)
    expect(facts.get('c')).toBeUndefined()
  })

  it('credits a fool to the author of the decoy that caught the voter', async () => {
    // 'b' and 'c' both fall for me's decoy on D2.
    const facts = await lieFactsFor([
      { drawing_id: 'D2', player_id: 'b', chosen_title_id: 'F2me' },
      { drawing_id: 'D2', player_id: 'c', chosen_title_id: 'F2me' },
    ])
    expect(facts.get('me')?.quick_draw_fools).toBe(2)
    // The voters read it wrong, so neither gets a correct-read credit.
    expect(facts.get('b')?.quick_draw_correct_reads).toBeUndefined()
    expect(facts.get('c')?.quick_draw_correct_reads).toBeUndefined()
  })

  it('credits a correct read when the voter picks the real title', async () => {
    const facts = await lieFactsFor([{ drawing_id: 'D2', player_id: 'c', chosen_title_id: 'R2' }])
    expect(facts.get('c')?.quick_draw_correct_reads).toBe(1)
    // Nobody authored the real title, so no fool is credited anywhere.
    expect(facts.get('me')?.quick_draw_fools).toBeUndefined()
  })

  it('flags a triple fool once the game total reaches three, across separate decoys', async () => {
    const { client } = db('lie', {
      quick_draw_drawings: [
        { id: 'D1', player_id: 'me' },
        { id: 'D2', player_id: 'b' },
      ],
      quick_draw_titles: [
        ...LIE_TABLES.quick_draw_titles,
        { id: 'F1me', drawing_id: 'D1', player_id: 'me', is_real: false },
      ],
      quick_draw_votes: [
        { drawing_id: 'D2', player_id: 'b', chosen_title_id: 'F2me' },
        { drawing_id: 'D2', player_id: 'c', chosen_title_id: 'F2me' },
        { drawing_id: 'D1', player_id: 'c', chosen_title_id: 'F1me' },
      ],
    })
    const facts = await quickDrawFacts(client, 'G', CTX)
    expect(facts.get('me')?.quick_draw_fools).toBe(3)
    expect(facts.get('me')?.quick_draw_triple_fool_games).toBe(1)
    // Spread over two titles, so the single-title award must NOT fire.
    expect(facts.get('me')?.quick_draw_mass_fool_games).toBeUndefined()
  })

  it('flags a mass fool only when ONE title catches three voters', async () => {
    const { client } = db('lie', {
      ...LIE_TABLES,
      quick_draw_votes: [
        { drawing_id: 'D2', player_id: 'b', chosen_title_id: 'F2me' },
        { drawing_id: 'D2', player_id: 'c', chosen_title_id: 'F2me' },
        { drawing_id: 'D2', player_id: 'd', chosen_title_id: 'F2me' },
      ],
    })
    const facts = await quickDrawFacts(client, 'G', ctxWith(['me', 'b', 'c', 'd']))
    expect(facts.get('me')?.quick_draw_mass_fool_games).toBe(1)
  })

  it('flags an unmistakable drawing only when every voter found the real title', async () => {
    const clean = await lieFactsFor([
      { drawing_id: 'D1', player_id: 'b', chosen_title_id: 'R1' },
      { drawing_id: 'D1', player_id: 'c', chosen_title_id: 'R1' },
    ])
    expect(clean.get('me')?.quick_draw_unmistakable_games).toBe(1)

    const oneFooled = await lieFactsFor([
      { drawing_id: 'D1', player_id: 'b', chosen_title_id: 'R1' },
      { drawing_id: 'D1', player_id: 'c', chosen_title_id: 'F1b' },
    ])
    expect(oneFooled.get('me')?.quick_draw_unmistakable_games).toBeUndefined()
  })

  it('does not call a single-voter drawing unmistakable', async () => {
    const facts = await lieFactsFor([{ drawing_id: 'D1', player_id: 'b', chosen_title_id: 'R1' }])
    expect(facts.get('me')?.quick_draw_unmistakable_games).toBeUndefined()
  })

  it('flags a perfect voter only at three or more drawings, all read right', async () => {
    const twoRight = await lieFactsFor([
      { drawing_id: 'D1', player_id: 'c', chosen_title_id: 'R1' },
      { drawing_id: 'D2', player_id: 'c', chosen_title_id: 'R2' },
    ])
    expect(twoRight.get('c')?.quick_draw_correct_reads).toBe(2)
    expect(twoRight.get('c')?.quick_draw_perfect_voter_games).toBeUndefined()

    const { client } = db('lie', {
      quick_draw_drawings: [...LIE_TABLES.quick_draw_drawings, { id: 'D3', player_id: 'c' }],
      quick_draw_titles: [
        ...LIE_TABLES.quick_draw_titles,
        { id: 'R3', drawing_id: 'D3', player_id: null, is_real: true },
      ],
      quick_draw_votes: [
        { drawing_id: 'D1', player_id: 'c', chosen_title_id: 'R1' },
        { drawing_id: 'D2', player_id: 'c', chosen_title_id: 'R2' },
        { drawing_id: 'D3', player_id: 'c', chosen_title_id: 'R3' },
      ],
    })
    const threeRight = await quickDrawFacts(client, 'G', CTX)
    expect(threeRight.get('c')?.quick_draw_perfect_voter_games).toBe(1)
  })

  it('ignores votes and decoys from players who are not seated', async () => {
    const facts = await lieFactsFor(
      [{ drawing_id: 'D2', player_id: 'ghost', chosen_title_id: 'F2me' }],
      ctxWith(['me', 'b'])
    )
    expect(facts.get('ghost')).toBeUndefined()
    // The fool still lands on 'me' — the voter's seat is irrelevant to the author's credit.
    expect(facts.get('me')?.quick_draw_fools).toBe(1)
  })

  it('reads the lie tables when the variant column is unset (pre-guess-mode rooms)', async () => {
    const { client, reads } = db(null, { ...LIE_TABLES, quick_draw_votes: [] })
    await quickDrawFacts(client, 'G', CTX)
    expect(reads).toContain('quick_draw_drawings')
    expect(reads).not.toContain('quick_draw_guess_words')
  })
})

// ── guess-variant fixtures ──────────────────────────────────────────────────────────────────

async function guessFactsFor(
  words: {
    turn_index: number
    drawer_player_id: string | null
    status: 'guessed' | 'skipped'
    guesser_player_id: string | null
  }[],
  guesses: { player_id: string; turn_index: number; correct: boolean | null }[] = [],
  ctx = CTX
) {
  const { client } = db('guess', { quick_draw_guess_words: words, quick_draw_guess_guesses: guesses })
  return quickDrawFacts(client, 'G', ctx)
}

describe('quickDrawFacts — guess variant', () => {
  it('credits the guesser and the drawer for the same word', async () => {
    const facts = await guessFactsFor([
      { turn_index: 0, drawer_player_id: 'me', status: 'guessed', guesser_player_id: 'b' },
    ])
    expect(facts.get('b')?.quick_draw_words_guessed).toBe(1)
    expect(facts.get('me')?.quick_draw_words_landed).toBe(1)
    expect(facts.get('me')?.quick_draw_drawer_turns).toBe(1)
  })

  it('counts drawer turns, not words drawn', async () => {
    const facts = await guessFactsFor([
      { turn_index: 0, drawer_player_id: 'me', status: 'guessed', guesser_player_id: 'b' },
      { turn_index: 0, drawer_player_id: 'me', status: 'skipped', guesser_player_id: null },
      { turn_index: 3, drawer_player_id: 'me', status: 'guessed', guesser_player_id: 'c' },
    ])
    expect(facts.get('me')?.quick_draw_drawer_turns).toBe(2)
    expect(facts.get('me')?.quick_draw_words_landed).toBe(2)
  })

  it('does not credit a skipped word to anyone', async () => {
    const facts = await guessFactsFor([
      { turn_index: 0, drawer_player_id: 'me', status: 'skipped', guesser_player_id: null },
    ])
    expect(facts.get('me')?.quick_draw_words_landed).toBeUndefined()
    expect(facts.get('b')).toBeUndefined()
  })

  it('flags five guesses in a game at exactly five', async () => {
    const word = (i: number) => ({
      turn_index: i,
      drawer_player_id: 'me',
      status: 'guessed' as const,
      guesser_player_id: 'b',
    })
    const four = await guessFactsFor([0, 1, 2, 3].map(word))
    expect(four.get('b')?.quick_draw_five_guess_games).toBeUndefined()
    const five = await guessFactsFor([0, 1, 2, 3, 4].map(word))
    expect(five.get('b')?.quick_draw_words_guessed).toBe(5)
    expect(five.get('b')?.quick_draw_five_guess_games).toBe(1)
  })

  it('flags a flawless turn only at three or more words with none skipped', async () => {
    const clean = await guessFactsFor([
      { turn_index: 1, drawer_player_id: 'me', status: 'guessed', guesser_player_id: 'b' },
      { turn_index: 1, drawer_player_id: 'me', status: 'guessed', guesser_player_id: 'c' },
      { turn_index: 1, drawer_player_id: 'me', status: 'guessed', guesser_player_id: 'b' },
    ])
    expect(clean.get('me')?.quick_draw_flawless_turn_games).toBe(1)

    const skipped = await guessFactsFor([
      { turn_index: 1, drawer_player_id: 'me', status: 'guessed', guesser_player_id: 'b' },
      { turn_index: 1, drawer_player_id: 'me', status: 'guessed', guesser_player_id: 'c' },
      { turn_index: 1, drawer_player_id: 'me', status: 'skipped', guesser_player_id: null },
    ])
    expect(skipped.get('me')?.quick_draw_flawless_turn_games).toBeUndefined()

    const tooShort = await guessFactsFor([
      { turn_index: 1, drawer_player_id: 'me', status: 'guessed', guesser_player_id: 'b' },
      { turn_index: 1, drawer_player_id: 'me', status: 'guessed', guesser_player_id: 'c' },
    ])
    expect(tooShort.get('me')?.quick_draw_flawless_turn_games).toBeUndefined()
  })

  it('flags twenty guesses on total attempts, right or wrong', async () => {
    const attempts = Array.from({ length: 20 }, (_, i) => ({ player_id: 'b', turn_index: 0, correct: i === 19 }))
    const facts = await guessFactsFor(
      [{ turn_index: 0, drawer_player_id: 'me', status: 'guessed', guesser_player_id: 'b' }],
      attempts
    )
    expect(facts.get('b')?.quick_draw_twenty_guess_games).toBe(1)
  })

  it('does not read the lie tables in guess mode', async () => {
    const { client, reads } = db('guess', {
      quick_draw_guess_words: [{ turn_index: 0, drawer_player_id: 'me', status: 'guessed', guesser_player_id: 'b' }],
    })
    await quickDrawFacts(client, 'G', CTX)
    expect(reads).toContain('quick_draw_guess_words')
    expect(reads).not.toContain('quick_draw_titles')
  })
})

describe('quickDrawFacts — shared', () => {
  it('flags a full lobby at six seats, for players who did something', async () => {
    const facts = await guessFactsFor(
      [{ turn_index: 0, drawer_player_id: 'me', status: 'guessed', guesser_player_id: 'b' }],
      [],
      ctxWith(['me', 'b', 'c', 'd', 'e', 'f'])
    )
    expect(facts.get('me')?.quick_draw_full_lobby_games).toBe(1)
    expect(facts.get('b')?.quick_draw_full_lobby_games).toBe(1)
    // A seat that never appeared in the rows gets no entry at all — a facts builder returns
    // entries only for players it has something to say about.
    expect(facts.get('f')).toBeUndefined()
  })

  it('returns nothing for an empty room rather than throwing', async () => {
    const { client } = db('lie', {})
    await expect(quickDrawFacts(client, 'G', ctxWith([]))).resolves.toEqual(new Map())
  })
})
