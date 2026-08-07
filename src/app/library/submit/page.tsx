'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Field, PrimaryBtn } from '@/components/ui/PageShell'
import { Modal } from '@/components/ui/Modal'
import { parseCsvRows } from '@/lib/csv-parse'
import { parseDescribeItWords } from '@/lib/describe-it-words'
import { parseCodewordsWordRows, CODEWORDS_MIN_CUSTOM_POOL } from '@/lib/codewords-pool'
import { PAN_MIN_POOL } from '@/lib/pick-a-number-questions'
import { parseCrosswordEntries } from '@/lib/crossword-puzzles'
import { parseWordSearchEntries } from '@/lib/word-search-puzzles'
import { parseWordScrambleEntries } from '@/lib/word-scramble-puzzles'
import type { TriviaQuestion } from '@/types'
import type { WyrQuestion } from '@/lib/would-you-rather-questions'
import type { WstDeckEntry } from '@/lib/who-said-this'
import type { WordGroupingGroup } from '@/lib/word-grouping'

// Library-side shape for a Word Grouping puzzle. Each pack is an array of these — the multiplayer
// start route + `generateWordGroupingFromContent` pick one puzzle per game by seed. Must match
// `parseCustomQuestionsBody` on the create route, which accepts `{ groups: [...] }` entries.
type WordGroupingPuzzleEntry = { groups: WordGroupingGroup[] }

type GameType =
  | 'trivia'
  | 'would_you_rather'
  | 'most_likely_to'
  | 'this_or_that'
  | 'never_have_i_ever'
  | 'describe_it'
  | 'quick_draw'
  | 'codewords'
  | 'pick_a_number'
  | 'crossword'
  | 'word_search'
  | 'word_scramble'
  | 'word_grouping'
  | 'who_said_this'

interface ValidationResult {
  ok: boolean
  errors: string[]
  questions:
    | TriviaQuestion[]
    | WyrQuestion[]
    | string[]
    | { answer: string; clue: string }[]
    | { word: string }[]
    | WstDeckEntry[]
    | WordGroupingPuzzleEntry[]
  rowCount: number
}

function validateTrivia(rows: Record<string, string>[]): ValidationResult {
  const required = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct']
  if (rows.length === 0) return { ok: false, errors: ['No rows found'], questions: [], rowCount: 0 }
  const missing = required.filter((col) => !(col in rows[0]))
  if (missing.length > 0)
    return { ok: false, errors: [`Missing columns: ${missing.join(', ')}`], questions: [], rowCount: 0 }

  const errors: string[] = []
  const questions: TriviaQuestion[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 2
    if (!r.question) {
      errors.push(`Row ${rowNum}: question is empty`)
      continue
    }
    if (!r.option_a || !r.option_b || !r.option_c || !r.option_d) {
      errors.push(`Row ${rowNum}: all options (a–d) are required`)
      continue
    }
    const correctRaw = r.correct.toLowerCase().trim()
    if (!['a', 'b', 'c', 'd'].includes(correctRaw)) {
      errors.push(`Row ${rowNum}: 'correct' must be a, b, c, or d`)
      continue
    }
    questions.push({
      question: r.question,
      choices: [r.option_a, r.option_b, r.option_c, r.option_d],
      correctIndex: ['a', 'b', 'c', 'd'].indexOf(correctRaw),
      category: 'general',
    })
  }

  if (questions.length < 5) errors.push('Must have at least 5 valid rows')
  if (questions.length > 200) errors.push('Maximum 200 rows allowed')
  return { ok: errors.length === 0, errors, questions, rowCount: rows.length }
}

function validateWhoSaidThis(rows: Record<string, string>[]): ValidationResult {
  const required = ['quote', 'option_a', 'option_b', 'option_c', 'option_d', 'correct']
  if (rows.length === 0) return { ok: false, errors: ['No rows found'], questions: [], rowCount: 0 }
  const missing = required.filter((col) => !(col in rows[0]))
  if (missing.length > 0)
    return { ok: false, errors: [`Missing columns: ${missing.join(', ')}`], questions: [], rowCount: 0 }

  const errors: string[] = []
  const questions: WstDeckEntry[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 2
    if (!r.quote) {
      errors.push(`Row ${rowNum}: quote is empty`)
      continue
    }
    if (!r.option_a || !r.option_b || !r.option_c || !r.option_d) {
      errors.push(`Row ${rowNum}: all options (a–d) are required`)
      continue
    }
    const correctRaw = r.correct.toLowerCase().trim()
    if (!['a', 'b', 'c', 'd'].includes(correctRaw)) {
      errors.push(`Row ${rowNum}: 'correct' must be a, b, c, or d`)
      continue
    }
    questions.push({
      quote: r.quote,
      options: [r.option_a, r.option_b, r.option_c, r.option_d],
      correctIndex: ['a', 'b', 'c', 'd'].indexOf(correctRaw),
    })
  }

  if (questions.length < 5) errors.push('Must have at least 5 valid rows')
  if (questions.length > 200) errors.push('Maximum 200 rows allowed')
  return { ok: errors.length === 0, errors, questions, rowCount: rows.length }
}

function validateWyr(rows: Record<string, string>[]): ValidationResult {
  if (rows.length === 0) return { ok: false, errors: ['No rows found'], questions: [], rowCount: 0 }
  if (!('option_a' in rows[0]) || !('option_b' in rows[0]))
    return { ok: false, errors: ['Missing columns: option_a, option_b'], questions: [], rowCount: 0 }

  const errors: string[] = []
  const questions: WyrQuestion[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r.option_a || !r.option_b) {
      errors.push(`Row ${i + 2}: option_a and option_b are required`)
      continue
    }
    questions.push({ optionA: r.option_a, optionB: r.option_b })
  }
  if (questions.length < 5) errors.push('Must have at least 5 valid rows')
  if (questions.length > 200) errors.push('Maximum 200 rows allowed')
  return { ok: errors.length === 0, errors, questions, rowCount: rows.length }
}

function validatePrompts(rows: Record<string, string>[], min = 5): ValidationResult {
  if (rows.length === 0) return { ok: false, errors: ['No rows found'], questions: [], rowCount: 0 }
  const col = 'prompt' in rows[0] ? 'prompt' : 'question' in rows[0] ? 'question' : null
  if (!col) return { ok: false, errors: ['Missing column: question'], questions: [], rowCount: 0 }

  const errors: string[] = []
  const questions: string[] = []
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i][col]
    if (!v) {
      errors.push(`Row ${i + 2}: ${col} is empty`)
      continue
    }
    questions.push(v)
  }
  if (questions.length < min) errors.push(`Must have at least ${min} valid rows`)
  if (questions.length > 200) errors.push('Maximum 200 rows allowed')
  return { ok: errors.length === 0, errors, questions, rowCount: rows.length }
}

function validateDescribeIt(rows: Record<string, string>[]): ValidationResult {
  if (rows.length === 0) return { ok: false, errors: ['No rows found'], questions: [], rowCount: 0 }
  if (!('word' in rows[0])) return { ok: false, errors: ['Missing column: word'], questions: [], rowCount: 0 }
  const words = parseDescribeItWords(rows.map((r) => r.word ?? '').join('\n'))
  const errors: string[] = []
  if (words.length < 5) errors.push('Must have at least 5 valid words')
  if (words.length > 200) errors.push('Maximum 200 words allowed')
  return { ok: errors.length === 0, errors, questions: words, rowCount: rows.length }
}

function validateCodewords(rows: Record<string, string>[]): ValidationResult {
  if (rows.length === 0) return { ok: false, errors: ['No rows found'], questions: [], rowCount: 0 }
  if (!('word' in rows[0])) return { ok: false, errors: ['Missing column: word'], questions: [], rowCount: 0 }
  const words = parseCodewordsWordRows(rows.map((r) => r.word ?? '').join('\n'))
  const errors: string[] = []
  if (words.length < CODEWORDS_MIN_CUSTOM_POOL)
    errors.push(`Must have at least ${CODEWORDS_MIN_CUSTOM_POOL} single-word entries`)
  if (words.length > 200) errors.push('Maximum 200 words allowed')
  return { ok: errors.length === 0, errors, questions: words, rowCount: rows.length }
}

function validateCrossword(rows: Record<string, string>[]): ValidationResult {
  if (rows.length === 0) return { ok: false, errors: ['No rows found'], questions: [], rowCount: 0 }
  if (!('answer' in rows[0]) && !('word' in rows[0])) {
    return { ok: false, errors: ['Missing column: answer'], questions: [], rowCount: 0 }
  }
  const seen = new Set<string>()
  const questions: { answer: string; clue: string }[] = []
  for (const e of parseCrosswordEntries(rows)) {
    const key = e.answer.trim().toUpperCase()
    if (!seen.has(key)) {
      seen.add(key)
      questions.push({ answer: e.answer.trim(), clue: e.clue.trim() })
    }
  }
  const errors: string[] = []
  if (questions.length < 4) errors.push('Must have at least 4 answers, each with a clue')
  if (questions.length > 200) errors.push('Maximum 200 rows allowed')
  return { ok: errors.length === 0, errors, questions, rowCount: rows.length }
}

function validateWordSearch(rows: Record<string, string>[]): ValidationResult {
  if (rows.length === 0) return { ok: false, errors: ['No rows found'], questions: [], rowCount: 0 }
  if (!('word' in rows[0]) && !('answer' in rows[0])) {
    return { ok: false, errors: ['Missing column: word'], questions: [], rowCount: 0 }
  }
  const seen = new Set<string>()
  const questions: { word: string }[] = []
  for (const e of parseWordSearchEntries(rows)) {
    const word = e.word.trim().toUpperCase()
    if (word && !seen.has(word)) {
      seen.add(word)
      questions.push({ word })
    }
  }
  const errors: string[] = []
  if (questions.length < 4) errors.push('Must have at least 4 words')
  if (questions.length > 200) errors.push('Maximum 200 words allowed')
  return { ok: errors.length === 0, errors, questions, rowCount: rows.length }
}

/**
 * Word Grouping CSV: one row PER GROUP. Rows with the same `puzzle` column form one puzzle;
 * a full puzzle is 4 rows sharing that value, with every difficulty 1–4 present once, 16
 * unique words across the four groups, and 4 words per group. The output is fed to
 * `generateWordGroupingFromContent` at game start, which requires the same shape.
 */
function validateWordGrouping(rows: Record<string, string>[]): ValidationResult {
  if (rows.length === 0) return { ok: false, errors: ['No rows found'], questions: [], rowCount: 0 }
  const required = ['puzzle', 'category', 'difficulty', 'word1', 'word2', 'word3', 'word4']
  const missing = required.filter((col) => !(col in rows[0]))
  if (missing.length > 0)
    return { ok: false, errors: [`Missing columns: ${missing.join(', ')}`], questions: [], rowCount: 0 }

  const errors: string[] = []
  // Group rows by their `puzzle` column, preserving first-seen order so the numeric label
  // "puzzle 1 / puzzle 2" the user typed lines up with the pack's on-disk order.
  const byPuzzle = new Map<string, { rowNum: number; row: Record<string, string> }[]>()
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const key = (r.puzzle ?? '').trim()
    if (!key) {
      errors.push(`Row ${i + 2}: puzzle is empty`)
      continue
    }
    const list = byPuzzle.get(key) ?? []
    list.push({ rowNum: i + 2, row: r })
    byPuzzle.set(key, list)
  }

  const puzzles: WordGroupingPuzzleEntry[] = []
  for (const [puzzleKey, entries] of byPuzzle) {
    if (entries.length !== 4) {
      errors.push(`Puzzle ${puzzleKey}: needs exactly 4 rows (found ${entries.length})`)
      continue
    }

    const groups: WordGroupingGroup[] = []
    const seenDifficulties = new Set<number>()
    const seenWords = new Set<string>()
    let puzzleValid = true

    for (const { rowNum, row } of entries) {
      const category = (row.category ?? '').trim()
      if (!category) {
        errors.push(`Row ${rowNum}: category is empty`)
        puzzleValid = false
      }

      const diffRaw = (row.difficulty ?? '').trim()
      const diff = Number(diffRaw)
      if (![1, 2, 3, 4].includes(diff)) {
        errors.push(`Row ${rowNum}: difficulty must be 1, 2, 3 or 4 (got "${diffRaw}")`)
        puzzleValid = false
        continue
      }
      if (seenDifficulties.has(diff)) {
        errors.push(`Puzzle ${puzzleKey}: difficulty ${diff} appears twice`)
        puzzleValid = false
      }
      seenDifficulties.add(diff)

      const words = [row.word1, row.word2, row.word3, row.word4].map((w) => (w ?? '').trim())
      if (words.some((w) => !w)) {
        errors.push(`Row ${rowNum}: all four words are required`)
        puzzleValid = false
        continue
      }
      for (const w of words) {
        const lower = w.toLowerCase()
        if (seenWords.has(lower)) {
          errors.push(`Puzzle ${puzzleKey}: "${w}" appears in more than one group`)
          puzzleValid = false
        }
        seenWords.add(lower)
      }

      groups.push({ category, words, difficulty: diff as 1 | 2 | 3 | 4 })
    }

    if (puzzleValid && groups.length === 4) {
      // Sort groups by difficulty so the pack's on-disk order is deterministic — matches
      // how solved groups render on the finished screen (easiest to hardest).
      groups.sort((a, b) => a.difficulty - b.difficulty)
      puzzles.push({ groups })
    }
  }

  if (puzzles.length === 0 && errors.length === 0) {
    errors.push('No complete puzzles found')
  }
  // Aligns with the WG host-lobby picker's own gate (`incoming.length < 4` in
  // `WordGroupingLobbySettings.tsx`) — accepting 1–3 here would let a pack pass moderation
  // that the lobby then refuses to load. 4 also matches the "puzzle-source has at least a
  // round of variety" line taken by crossword / word_search / word_scramble validators above.
  if (puzzles.length > 0 && puzzles.length < 4) {
    errors.push('Must have at least 4 puzzles')
  }
  if (puzzles.length > 100) errors.push('Maximum 100 puzzles allowed')

  return { ok: errors.length === 0, errors, questions: puzzles, rowCount: rows.length }
}

function validateWordScramble(rows: Record<string, string>[]): ValidationResult {
  if (rows.length === 0) return { ok: false, errors: ['No rows found'], questions: [], rowCount: 0 }
  if (!('word' in rows[0]) && !('answer' in rows[0])) {
    return { ok: false, errors: ['Missing column: word'], questions: [], rowCount: 0 }
  }
  const seen = new Set<string>()
  const questions: { word: string; hint?: string }[] = []
  for (const e of parseWordScrambleEntries(rows)) {
    const word = e.word.trim().toUpperCase()
    if (word && !seen.has(word)) {
      seen.add(word)
      questions.push(e.hint ? { word, hint: e.hint } : { word })
    }
  }
  const errors: string[] = []
  if (questions.length < 4) errors.push('Must have at least 4 words')
  if (questions.length > 200) errors.push('Maximum 200 words allowed')
  return { ok: errors.length === 0, errors, questions, rowCount: rows.length }
}

const GAME_TYPES: { value: GameType; label: string; description: string; columns: string }[] = [
  {
    value: 'trivia',
    label: 'Trivia',
    description: 'Multiple-choice questions with one correct answer',
    columns: 'question, option_a, option_b, option_c, option_d, correct',
  },
  {
    value: 'who_said_this',
    label: 'Who Said This',
    description: 'Quotes with multiple-choice options for who said each one',
    columns: 'quote, option_a, option_b, option_c, option_d, correct',
  },
  {
    value: 'would_you_rather',
    label: 'Would You Rather',
    description: 'Two-option dilemma questions',
    columns: 'option_a, option_b',
  },
  {
    value: 'most_likely_to',
    label: 'Most Likely To',
    description: 'Prompts voted on by the group',
    columns: 'prompt',
  },
  {
    value: 'this_or_that',
    label: 'This or That',
    description: 'Two-option choices players pick between',
    columns: 'option_a, option_b',
  },
  {
    value: 'never_have_i_ever',
    label: 'Never Have I Ever',
    description: 'Prompts players vote on having done',
    columns: 'prompt',
  },
  {
    value: 'describe_it',
    label: 'Text Charades',
    description: 'Words or phrases for players to describe',
    columns: 'word',
  },
  {
    value: 'quick_draw',
    label: 'Quick Draw',
    description: 'Words or drawing prompts for Lie and Guess modes',
    columns: 'word',
  },
  {
    value: 'codewords',
    label: 'Codewords',
    description: 'Single words for the spy word grid',
    columns: 'word',
  },
  {
    value: 'pick_a_number',
    label: 'Pick a Number',
    description: 'Prompts players answer with a number',
    columns: 'question',
  },
  {
    value: 'crossword',
    label: 'Crossword',
    description: 'Answers with their clues for the crossword grid',
    columns: 'answer, clue',
  },
  {
    value: 'word_search',
    label: 'Word Search',
    description: 'Words to hide in the word-search grid',
    columns: 'word',
  },
  {
    value: 'word_scramble',
    label: 'Word Scramble',
    description: 'Words to unscramble, with optional hints',
    columns: 'word, hint',
  },
  {
    value: 'word_grouping',
    label: 'Word Grouping',
    // One row per group; 4 rows share the same `puzzle` number and cover difficulties 1–4.
    description: 'Puzzles of 4 groups × 4 words. One row per group.',
    columns: 'puzzle, category, difficulty, word1, word2, word3, word4',
  },
]

/**
 * Sample CSV strings per game type — served client-side as a Blob download so submitters
 * can start from a working template. Populated per game as the shape gets fiddly enough to
 * matter (Word Grouping's four-rows-per-puzzle layout is the clearest example); games with
 * a single-column CSV don't need one.
 */
const SAMPLE_CSV: Partial<Record<GameType, string>> = {
  word_grouping: [
    'puzzle,category,difficulty,word1,word2,word3,word4',
    '1,Fruits,1,Apple,Pear,Peach,Plum',
    '1,Colors,2,Red,Blue,Purple,Orange',
    '1,Animals,3,Cat,Dog,Bird,Fish',
    '1,___ ball,4,Foot,Basket,Base,Snow',
    '2,Days of the week,1,Monday,Friday,Sunday,Wednesday',
    '2,Continents,2,Asia,Europe,Africa,Australia',
    '2,Kitchen tools,3,Knife,Fork,Spoon,Plate',
    '2,___ time,4,Bed,Show,Dinner,Prime',
    '',
  ].join('\n'),
}

const DIFFICULTY_TAGS = ['easy', 'intermediate', 'advanced'] as const
const VIBE_TAGS = ['family-friendly', '18+', 'party', 'spicy'] as const

type DifficultyTag = (typeof DIFFICULTY_TAGS)[number]
type VibeTag = (typeof VIBE_TAGS)[number]

const DIFFICULTY_META: Record<DifficultyTag, { label: string; description: string }> = {
  easy: { label: 'Easy', description: 'Suitable for everyone' },
  intermediate: { label: 'Intermediate', description: 'Some knowledge needed' },
  advanced: { label: 'Advanced', description: 'Challenging questions' },
}

const VIBE_META: Record<VibeTag, { label: string }> = {
  'family-friendly': { label: 'Family-friendly' },
  '18+': { label: '18+' },
  party: { label: 'Party' },
  spicy: { label: 'Spicy' },
}

export default function SubmitPackPage() {
  const router = useRouter()
  const [gameType, setGameType] = useState<GameType | null>(null)
  const [title, setTitle] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [description, setDescription] = useState('')
  const [difficulty, setDifficulty] = useState<DifficultyTag | null>(null)
  const [vibeTags, setVibeTags] = useState<Set<VibeTag>>(new Set())
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([])
  const [collectionIds, setCollectionIds] = useState<Set<string>>(new Set())
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(true)
  const [pickerSearch, setPickerSearch] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Active collections the submitter can suggest. The pack is created as `pending`, so it only
  // shows in a collection publicly once an admin approves it — they can also re-pick then.
  useEffect(() => {
    fetch('/api/collections')
      .then((r) => r.json())
      .then((d) =>
        setCollections((d.collections ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })))
      )
      .catch(() => setCollections([]))
  }, [])

  const toggleCollection = (id: string) =>
    setCollectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const pickerMatches = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    if (!q) return GAME_TYPES
    return GAME_TYPES.filter((t) => `${t.label} ${t.description}`.toLowerCase().includes(q))
  }, [pickerSearch])

  const chooseType = (value: GameType) => {
    setGameType(value)
    setValidation(null)
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
    setPickerOpen(false)
    setPickerSearch('')
  }

  const toggleVibe = (v: VibeTag) =>
    setVibeTags((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !gameType) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = parseCsvRows(text)
      if (gameType === 'trivia') setValidation(validateTrivia(rows))
      else if (gameType === 'who_said_this') setValidation(validateWhoSaidThis(rows))
      else if (gameType === 'would_you_rather' || gameType === 'this_or_that') setValidation(validateWyr(rows))
      else if (gameType === 'describe_it' || gameType === 'quick_draw') setValidation(validateDescribeIt(rows))
      else if (gameType === 'codewords') setValidation(validateCodewords(rows))
      else if (gameType === 'crossword') setValidation(validateCrossword(rows))
      else if (gameType === 'word_search') setValidation(validateWordSearch(rows))
      else if (gameType === 'word_scramble') setValidation(validateWordScramble(rows))
      else if (gameType === 'word_grouping') setValidation(validateWordGrouping(rows))
      else if (gameType === 'pick_a_number') setValidation(validatePrompts(rows, PAN_MIN_POOL))
      else setValidation(validatePrompts(rows)) // covers most_likely_to and never_have_i_ever
    }
    reader.readAsText(file)
  }

  const handleSubmit = async () => {
    if (!gameType || !validation?.ok || !title.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    const tags = [...(difficulty ? [difficulty] : []), ...Array.from(vibeTags)]
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          game_type: gameType,
          author_name: authorName.trim() || 'Anonymous',
          description: description.trim() || undefined,
          questions: validation.questions,
          tags,
          collection_ids: Array.from(collectionIds),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Submission failed')
      setSubmitted(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedType = GAME_TYPES.find((g) => g.value === gameType)

  if (submitted) {
    return (
      <PageShell narrow centered>
        <div className="glass-card-strong p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-2xl">
            ✓
          </div>
          <div className="space-y-1">
            <p className="text-xl font-bold">Pack submitted!</p>
            <p className="text-muted text-sm leading-relaxed">
              Your pack is under review. We&apos;ll publish it once approved.
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setSubmitted(false)
                setGameType(null)
                setTitle('')
                setAuthorName('')
                setDescription('')
                setDifficulty(null)
                setVibeTags(new Set())
                setCollectionIds(new Set())
                setValidation(null)
                setFileName('')
                setSubmitError(null)
                setPickerOpen(true)
                if (fileRef.current) fileRef.current.value = ''
              }}
              className="btn-primary btn-fit px-4 py-2 text-sm mx-auto"
            >
              + Create a new pack
            </button>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => router.push('/library')}
                className="btn-secondary btn-fit px-4 py-2 text-sm"
              >
                Browse library
              </button>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="btn-secondary btn-fit px-4 py-2 text-sm"
              >
                Home
              </button>
            </div>
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell narrow>
      <div>
        <button type="button" onClick={() => router.push('/library')} className="btn-ghost -ml-2 text-sm">
          ← Library
        </button>
        <h1 className="text-2xl font-black tracking-tight gradient-title mt-1">Submit a question pack</h1>
        <p className="text-muted text-sm mt-1">Share your questions with the community</p>
      </div>

      {!gameType ? (
        // Step 1 prompt — the picker modal is open by default; this backs it if closed.
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="surface-inset flex w-full items-center justify-between gap-4 px-5 py-6 text-left transition-all hover:border-[var(--border-strong)]"
        >
          <div className="space-y-1">
            <p className="font-semibold">Choose a game type</p>
            <p className="text-faint text-sm">Pick what kind of pack you&apos;re sharing to get started.</p>
          </div>
          <span className="btn-primary btn-fit shrink-0 px-4 py-2 text-sm">Choose</span>
        </button>
      ) : (
        <>
          {/* Selected-type summary — the "step 1 result" with a way back to the picker. */}
          <div className="surface-inset flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="label-caps text-faint">Game type</p>
              <p className="font-semibold text-sm mt-0.5 truncate">{selectedType?.label}</p>
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="btn-secondary btn-fit shrink-0 px-3.5 py-1.5 text-sm"
            >
              Change
            </button>
          </div>
        </>
      )}

      {gameType && (
        <div className="space-y-6">
          <Field label="Pack title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="e.g. Science & Nature Quiz"
              className="input-field"
            />
          </Field>

          <Field label="Your name (optional)">
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              maxLength={60}
              placeholder="Shown publicly — leave blank to appear as Anonymous"
              className="input-field"
            />
          </Field>

          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="What's this pack about?"
              className="input-field resize-none"
            />
          </Field>

          <div className="space-y-3">
            <p className="text-sm font-medium text-muted">Difficulty (optional)</p>
            <div className="grid grid-cols-3 gap-2">
              {DIFFICULTY_TAGS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(difficulty === d ? null : d)}
                  className={`surface-inset text-left px-3 py-2.5 transition-all ${
                    difficulty === d
                      ? 'border-[var(--chip-active-border)] bg-[var(--chip-active-bg)]'
                      : 'hover:border-[var(--border-strong)]'
                  }`}
                >
                  <p className={`font-semibold text-xs ${difficulty === d ? 'text-[var(--chip-active-text)]' : ''}`}>
                    {DIFFICULTY_META[d].label}
                  </p>
                  <p className="text-faint text-[10px] mt-0.5">{DIFFICULTY_META[d].description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-muted">Vibe tags (optional)</p>
            <div className="flex flex-wrap gap-2">
              {VIBE_TAGS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleVibe(v)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    vibeTags.has(v)
                      ? 'border-[var(--chip-active-border)] bg-[var(--chip-active-bg)] text-[var(--chip-active-text)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  {VIBE_META[v].label}
                </button>
              ))}
            </div>
          </div>

          {collections.length > 0 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-muted">Collections (optional)</p>
                <p className="text-faint text-xs mt-0.5">
                  Suggest where this pack belongs. It only appears in a collection after we approve it.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {collections.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCollection(c.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      collectionIds.has(c.id)
                        ? 'border-[var(--chip-active-border)] bg-[var(--chip-active-bg)] text-[var(--chip-active-text)]'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted">Upload CSV</p>
              {selectedType && <p className="text-faint text-xs font-mono">{selectedType.columns}</p>}
            </div>

            {selectedType && SAMPLE_CSV[selectedType.value] && (
              <p className="text-xs text-muted">
                Not sure of the shape?{' '}
                <button
                  type="button"
                  onClick={() => {
                    // Client-side download: no server round-trip, no auth/rate-limit surface.
                    const csv = SAMPLE_CSV[selectedType.value]!
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${selectedType.value}-sample.csv`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                  }}
                  className="underline hover:text-body transition-colors"
                >
                  Download a sample .csv
                </button>
              </p>
            )}

            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={`surface-inset w-full py-6 text-center transition-all hover:border-[var(--border-strong)] ${
                fileName ? 'border-[var(--border-strong)]' : ''
              }`}
            >
              {fileName ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">{fileName}</p>
                  <p className="text-faint text-xs">Click to replace</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-muted">Choose a .csv file</p>
                  <p className="text-faint text-xs">or click to browse</p>
                </div>
              )}
            </button>
          </div>

          {validation && (
            <div
              className={`surface-inset p-4 space-y-3 ${validation.ok ? 'border-emerald-500/40' : 'border-red-500/40'}`}
            >
              {validation.ok ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 text-sm font-bold">✓</span>
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {validation.questions.length} {gameType === 'word_grouping' ? 'puzzles' : 'questions'} ready
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="label-caps text-faint">Preview</p>
                    {gameType === 'trivia' &&
                      (validation.questions as TriviaQuestion[]).slice(0, 3).map((q, i) => (
                        <p key={i} className="text-xs text-muted truncate leading-relaxed">
                          {i + 1}. {q.question}
                        </p>
                      ))}
                    {(gameType === 'would_you_rather' || gameType === 'this_or_that') &&
                      (validation.questions as WyrQuestion[]).slice(0, 3).map((q, i) => (
                        <p key={i} className="text-xs text-muted truncate leading-relaxed">
                          {i + 1}. {q.optionA} <span className="text-faint">or</span> {q.optionB}
                        </p>
                      ))}
                    {(gameType === 'most_likely_to' ||
                      gameType === 'never_have_i_ever' ||
                      gameType === 'describe_it' ||
                      gameType === 'quick_draw' ||
                      gameType === 'codewords' ||
                      gameType === 'pick_a_number') &&
                      (validation.questions as string[]).slice(0, 3).map((q, i) => (
                        <p key={i} className="text-xs text-muted truncate leading-relaxed">
                          {i + 1}. {q}
                        </p>
                      ))}
                    {gameType === 'crossword' &&
                      (validation.questions as { answer: string; clue: string }[]).slice(0, 3).map((q, i) => (
                        <p key={i} className="text-xs text-muted truncate leading-relaxed">
                          {i + 1}. {q.answer} <span className="text-faint">— {q.clue}</span>
                        </p>
                      ))}
                    {(gameType === 'word_search' || gameType === 'word_scramble') &&
                      (validation.questions as { word: string; hint?: string }[]).slice(0, 3).map((q, i) => (
                        <p key={i} className="text-xs text-muted truncate leading-relaxed">
                          {i + 1}. {q.word}
                          {q.hint ? <span className="text-faint"> — {q.hint}</span> : null}
                        </p>
                      ))}
                    {gameType === 'word_grouping' &&
                      (validation.questions as WordGroupingPuzzleEntry[]).slice(0, 3).map((p, i) => (
                        <p key={i} className="text-xs text-muted truncate leading-relaxed">
                          {i + 1}. {p.groups.map((g) => g.category).join(' · ')}
                        </p>
                      ))}
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-red-400 text-sm font-bold">✗</span>
                    <p className="text-sm font-semibold text-red-500 dark:text-red-400">
                      {validation.errors.length} error{validation.errors.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="space-y-1">
                    {validation.errors.slice(0, 5).map((e, i) => (
                      <p key={i} className="text-xs text-muted leading-relaxed">
                        {e}
                      </p>
                    ))}
                    {validation.errors.length > 5 && (
                      <p className="text-xs text-faint">…and {validation.errors.length - 5} more</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {submitError && (
            <div className="surface-inset px-4 py-3 border-red-500/40">
              <p className="text-sm text-red-500 dark:text-red-400">{submitError}</p>
            </div>
          )}

          <PrimaryBtn onClick={handleSubmit} disabled={!validation?.ok || !title.trim() || submitting}>
            {submitting ? 'Submitting…' : 'Submit pack'}
          </PrimaryBtn>
        </div>
      )}

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="What kind of pack?"
        subtitle="Choose the game your questions are for"
        size="lg"
        fillHeight
      >
        <div className="space-y-4">
          <div className="relative">
            <input
              type="search"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Search game types…"
              aria-label="Search game types"
              className="input-field w-full pr-9"
            />
            {pickerSearch && (
              <button
                type="button"
                onClick={() => setPickerSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-body text-lg leading-none"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {pickerMatches.length === 0 ? (
            <p className="text-muted text-sm text-center py-8">
              No game types match &ldquo;{pickerSearch.trim()}&rdquo;
            </p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {pickerMatches.map((type) => {
                const active = gameType === type.value
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => chooseType(type.value)}
                    aria-pressed={active}
                    className={`surface-inset flex h-full flex-col gap-1 px-4 py-3.5 text-left transition-all ${
                      active
                        ? 'border-[var(--chip-active-border)] bg-[var(--chip-active-bg)]'
                        : 'hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <p className={`font-semibold text-sm ${active ? 'text-[var(--chip-active-text)]' : ''}`}>
                      {type.label}
                    </p>
                    <p className="text-faint text-xs leading-snug">{type.description}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </Modal>
    </PageShell>
  )
}
