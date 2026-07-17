import { describe, it, expect } from 'vitest'
import { buildRoundsFromDeck, tallyWstPlayerScores, type WstDeckEntry } from '@/lib/who-said-this'
import { parseWstDeckImport, parseStoredWstDeck } from '@/lib/custom-questions'
import type { Player, Vote } from '@/types'

describe('tallyWstPlayerScores (speed-weighted)', () => {
  const players = [
    { id: 'a', name: 'Ann', spectator: false },
    { id: 'b', name: 'Bob', spectator: false },
    { id: 's', name: 'Spec', spectator: true },
  ] as unknown as Player[]
  const rounds = [{ id: 'r1', anime_metadata: { correct_character: 'Yoda' } }]
  const votes = [
    // Ann: correct, 400 pts (faster). Bob: correct, 300 pts (slower). Ranked by points.
    { player_id: 'a', round_id: 'r1', anime_choice: 'Yoda', points: 400, response_ms: 1000 },
    { player_id: 'b', round_id: 'r1', anime_choice: 'Yoda', points: 300, response_ms: 5000 },
  ] as unknown as Vote[]

  it('ranks by summed points and excludes spectators', () => {
    const scores = tallyWstPlayerScores(rounds, votes, players)
    expect(scores.map((s) => s.name)).toEqual(['Ann', 'Bob'])
    expect(scores[0]).toMatchObject({ name: 'Ann', points: 400, correctGuesses: 1 })
    expect(scores.find((s) => s.name === 'Spec')).toBeUndefined()
  })

  it('a wrong answer scores 0 points', () => {
    const wrong = [{ player_id: 'b', round_id: 'r1', anime_choice: 'Vader', points: 0 }] as unknown as Vote[]
    const scores = tallyWstPlayerScores(rounds, wrong, players)
    expect(scores.find((s) => s.name === 'Bob')).toMatchObject({ points: 0, correctGuesses: 0 })
  })
})

const DECK: WstDeckEntry[] = [
  { quote: 'Expecto Patronum!', options: ['Harry Potter', 'Ron Weasley', 'Draco Malfoy', 'Hagrid'], correctIndex: 0 },
  {
    quote: "It's LeviOsa, not LevioSA.",
    options: ['Hermione Granger', 'Luna Lovegood', 'Ginny Weasley', 'Cho Chang'],
    correctIndex: 0,
  },
]

describe('buildRoundsFromDeck', () => {
  it('builds one round per question, using the author-supplied options + correct answer', () => {
    const rounds = buildRoundsFromDeck({
      gameId: 'GAME01',
      participantIds: ['p1'],
      deck: DECK,
      startIndex: 0,
      now: '2026-07-17T00:00:00.000Z',
    })
    expect(rounds).toHaveLength(DECK.length)
    for (const r of rounds) {
      const meta = r.anime_metadata
      const source = DECK.find((e) => e.quote === r.quote_text)!
      expect(meta.source).toBe('deck')
      // Choices are exactly the authored options, in order.
      expect(meta.choices).toEqual(source.options)
      // Correct answer is the option at the authored correctIndex.
      expect(meta.correct_character).toBe(source.options[source.correctIndex])
      expect(meta.choices).toContain(meta.correct_character)
      expect(r.quote_author_participant_id).toBeNull()
    }
    expect(rounds[0].status).toBe('active')
    expect(rounds.slice(1).every((r) => r.status === 'pending')).toBe(true)
  })

  it('numbers rounds from startIndex + 1 and does not auto-activate non-first rounds', () => {
    const rounds = buildRoundsFromDeck({ gameId: 'G', participantIds: [], deck: DECK, startIndex: 3, now: 'n' })
    expect(rounds.map((r) => r.round_number)).toEqual([4, 5])
    expect(rounds.every((r) => r.status === 'pending')).toBe(true)
  })

  it('falls back to the first option if correctIndex is out of range', () => {
    const bad: WstDeckEntry[] = [{ quote: 'q', options: ['A', 'B'], correctIndex: 9 }]
    const [round] = buildRoundsFromDeck({ gameId: 'G', participantIds: [], deck: bad, startIndex: 0, now: 'n' })
    expect(round.anime_metadata.correct_character).toBe('A')
  })
})

describe('parseWstDeckImport', () => {
  it('parses a quote + 4 options + correct-letter CSV', () => {
    const csv = [
      'quote,option_a,option_b,option_c,option_d,correct',
      'Expecto Patronum!,Harry Potter,Ron Weasley,Draco Malfoy,Hagrid,A',
      "It's LeviOsa,Hermione Granger,Luna Lovegood,Ginny,Cho,a",
    ].join('\n')
    const result = parseWstDeckImport(csv)
    expect(result.questions).toHaveLength(2)
    expect(result.questions[0]).toEqual({
      quote: 'Expecto Patronum!',
      options: ['Harry Potter', 'Ron Weasley', 'Draco Malfoy', 'Hagrid'],
      correctIndex: 0,
    })
  })

  it('accepts the "question" header alias, 1-based correct numbers, and correct-as-text', () => {
    const byNumber = parseWstDeckImport(
      ['question,a,b,c,d,correct', 'May the Force be with you,Vader,Obi-Wan,Yoda,Luke,2'].join('\n')
    )
    expect(byNumber.questions[0]).toEqual({
      quote: 'May the Force be with you',
      options: ['Vader', 'Obi-Wan', 'Yoda', 'Luke'],
      correctIndex: 1,
    })
    const byText = parseWstDeckImport(
      ['quote,option_a,option_b,correct', 'I am your father,Vader,Luke,Vader'].join('\n')
    )
    expect(byText.questions[0].correctIndex).toBe(0)
  })

  it('skips rows without a quote, <2 options, or an unresolved correct answer; dedupes', () => {
    const csv = [
      'quote,option_a,option_b,option_c,option_d,correct',
      'Good quote,A,B,C,D,B',
      ',A,B,C,D,A', // no quote
      'One option only,Solo,,,,A', // <2 options
      'Bad correct,A,B,C,D,Z', // correct not resolvable
      'Good quote,A,B,C,D,B', // duplicate
    ].join('\n')
    const result = parseWstDeckImport(csv)
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]).toEqual({ quote: 'Good quote', options: ['A', 'B', 'C', 'D'], correctIndex: 1 })
    expect(result.skippedRows).toBe(3)
    expect(result.duplicateRows).toBe(1)
  })
})

describe('parseStoredWstDeck', () => {
  it('restores stored objects with native options arrays + numeric correctIndex', () => {
    const stored = [
      { quote: 'q1', options: ['A', 'B', 'C', 'D'], correctIndex: 2 },
      { quote: 'q1', options: ['A', 'B', 'C', 'D'], correctIndex: 2 }, // dup
      { quote: 'bad', options: ['only'], correctIndex: 0 }, // <2 options
    ]
    expect(parseStoredWstDeck(stored)).toEqual([{ quote: 'q1', options: ['A', 'B', 'C', 'D'], correctIndex: 2 }])
  })

  it('returns [] for non-array input', () => {
    expect(parseStoredWstDeck(null)).toEqual([])
    expect(parseStoredWstDeck('nope')).toEqual([])
  })
})
