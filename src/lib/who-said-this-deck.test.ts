import { describe, it, expect } from 'vitest'
import { buildRoundsFromDeck, wstDeckAnswers, WST_DECK_CHOICE_COUNT, type WstDeckEntry } from '@/lib/who-said-this'
import { parseWstDeckImport, parseStoredWstDeck } from '@/lib/custom-questions'

const HP_DECK: WstDeckEntry[] = [
  { quote: 'Expecto Patronum!', answer: 'Harry Potter', category: 'Harry Potter' },
  { quote: "It's LeviOsa, not LevioSA.", answer: 'Hermione Granger', category: 'Harry Potter' },
  { quote: 'Bloody hell.', answer: 'Ron Weasley', category: 'Harry Potter' },
  { quote: 'After all this time? Always.', answer: 'Severus Snape', category: 'Harry Potter' },
  { quote: 'I solemnly swear that I am up to no good.', answer: 'Harry Potter', category: 'Harry Potter' },
]

describe('wstDeckAnswers', () => {
  it('returns distinct answers (case-insensitive), first-seen order', () => {
    expect(wstDeckAnswers(HP_DECK)).toEqual(['Harry Potter', 'Hermione Granger', 'Ron Weasley', 'Severus Snape'])
  })
})

describe('buildRoundsFromDeck', () => {
  it('builds one round per entry with the correct author + choices drawn from the cast', () => {
    const rounds = buildRoundsFromDeck({
      gameId: 'GAME01',
      participantIds: ['p1', 'p2'],
      deck: HP_DECK,
      startIndex: 0,
      now: '2026-07-17T00:00:00.000Z',
    })
    expect(rounds).toHaveLength(HP_DECK.length)
    const cast = wstDeckAnswers(HP_DECK)
    for (const r of rounds) {
      const meta = r.anime_metadata
      expect(meta.source).toBe('deck')
      // The correct answer is always present in the choices.
      expect(meta.choices).toContain(meta.correct_character)
      // 4 choices (correct + 3 distractors) since the cast has ≥4 distinct answers.
      expect(meta.choices).toHaveLength(WST_DECK_CHOICE_COUNT)
      // Every choice is a real answer from the deck; no duplicates.
      expect(new Set(meta.choices).size).toBe(meta.choices.length)
      for (const c of meta.choices) expect(cast).toContain(c)
      // The quote maps to a deck entry whose answer matches the correct_character.
      const source = HP_DECK.find((e) => e.quote === r.quote_text)
      expect(source?.answer).toBe(meta.correct_character)
      // Category flows into anime_name (display label).
      expect(meta.anime_name).toBe('Harry Potter')
      // Choice rounds carry no participant author.
      expect(r.quote_author_participant_id).toBeNull()
    }
    // First round is active + started; the rest pending.
    expect(rounds[0].status).toBe('active')
    expect(rounds[0].started_at).toBe('2026-07-17T00:00:00.000Z')
    expect(rounds.slice(1).every((r) => r.status === 'pending')).toBe(true)
  })

  it('numbers rounds from startIndex + 1', () => {
    const rounds = buildRoundsFromDeck({
      gameId: 'G',
      participantIds: [],
      deck: HP_DECK.slice(0, 2),
      startIndex: 3,
      now: 'n',
    })
    expect(rounds.map((r) => r.round_number)).toEqual([4, 5])
    // Not the first overall round → not auto-activated.
    expect(rounds.every((r) => r.status === 'pending')).toBe(true)
  })

  it('shows every available answer when the cast is smaller than the choice count', () => {
    const smallDeck: WstDeckEntry[] = [
      { quote: 'a', answer: 'Alice' },
      { quote: 'b', answer: 'Bob' },
    ]
    const rounds = buildRoundsFromDeck({ gameId: 'G', participantIds: [], deck: smallDeck, startIndex: 0, now: 'n' })
    for (const r of rounds) {
      expect(r.anime_metadata.choices.sort()).toEqual(['Alice', 'Bob'])
    }
  })
})

describe('parseWstDeckImport', () => {
  it('parses a quote,answer,category CSV and dedupes', () => {
    const csv = [
      'quote,answer,category',
      'Expecto Patronum!,Harry Potter,Harry Potter',
      "It's LeviOsa,Hermione Granger,Harry Potter",
      'Expecto Patronum!,Harry Potter,Harry Potter', // duplicate
    ].join('\n')
    const result = parseWstDeckImport(csv)
    expect(result.questions).toHaveLength(2)
    expect(result.duplicateRows).toBe(1)
    expect(result.questions[0]).toEqual({
      quote: 'Expecto Patronum!',
      answer: 'Harry Potter',
      category: 'Harry Potter',
    })
  })

  it('tolerates column aliases (text/character/series) and drops incomplete rows', () => {
    const csv = [
      'text,character,series',
      'May the Force be with you,Obi-Wan,Star Wars',
      ',NoQuote,X',
      'NoAnswer,,Y',
    ].join('\n')
    const result = parseWstDeckImport(csv)
    expect(result.questions).toEqual([{ quote: 'May the Force be with you', answer: 'Obi-Wan', category: 'Star Wars' }])
    expect(result.skippedRows).toBe(2)
  })

  it('omits category when absent', () => {
    const result = parseWstDeckImport(['quote,answer', 'Hello there,General Kenobi'].join('\n'))
    expect(result.questions[0]).toEqual({ quote: 'Hello there', answer: 'General Kenobi' })
  })
})

describe('parseStoredWstDeck', () => {
  it('restores a stored deck array and dedupes', () => {
    const stored = [
      { quote: 'q1', answer: 'A', category: 'C' },
      { quote: 'q1', answer: 'A', category: 'C' },
      { quote: 'q2', answer: 'B' },
      { quote: '', answer: 'bad' },
    ]
    expect(parseStoredWstDeck(stored)).toEqual([
      { quote: 'q1', answer: 'A', category: 'C' },
      { quote: 'q2', answer: 'B' },
    ])
  })

  it('returns [] for non-array input', () => {
    expect(parseStoredWstDeck(null)).toEqual([])
    expect(parseStoredWstDeck('nope')).toEqual([])
  })
})
