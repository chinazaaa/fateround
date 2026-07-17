import type { Game, GameType, QuestionSource, TriviaCategory, TriviaQuestion } from '@/types'
import type { WyrQuestion } from '@/lib/would-you-rather-questions'
import { WYR_QUESTION_COUNT, wyrQuestionKey } from '@/lib/would-you-rather-questions'
import { MLT_QUESTION_COUNT } from '@/lib/most-likely-to-questions'
import { NHIE_QUESTION_COUNT } from '@/lib/never-have-i-ever-questions'
import { PAN_QUESTION_COUNT } from '@/lib/pick-a-number-questions'
import { THIS_OR_THAT_QUESTION_COUNT } from '@/lib/this-or-that-questions'
import { TRIVIA_QUESTION_COUNT, triviaQuestionKey } from '@/lib/trivia-questions'
import {
  isWouldYouRather,
  isMostLikelyTo,
  isNeverHaveIEver,
  isPickANumber,
  isThisOrThat,
  isBinaryChoiceGame,
  isTriviaGame,
  isCodewordsGame,
  isDescribeItGame,
  isQuickDrawGame,
  isCrosswordGame,
  isWordSearchGame,
  isWordScrambleGame,
  isWhoSaidThis,
  parseGameType,
} from '@/lib/game-types'
import { parseCsvRows } from '@/lib/csv-parse'
import type { WstDeckEntry } from '@/lib/who-said-this'
import { parseCrosswordEntries } from '@/lib/crossword-puzzles'
import { parseWordSearchEntries } from '@/lib/word-search-puzzles'
import { parseWordScrambleEntries } from '@/lib/word-scramble-puzzles'
import { pickLeastUsed } from '@/lib/question-picker'
import {
  CODEWORDS_MIN_CUSTOM_POOL,
  mergeCodewordsWords,
  parseCodewordsWordRows,
  parseExcelCodewordsWords,
  parseStoredCodewordsWords,
  pickCustomCodewordsWords,
} from '@/lib/codewords-pool'

export {
  parseCodewordsWordRows,
  parseExcelCodewordsWords,
  parseStoredCodewordsWords,
  mergeCodewordsWords,
  pickCustomCodewordsWords,
  CODEWORDS_MIN_CUSTOM_POOL,
} from '@/lib/codewords-pool'

function splitCsvRow(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''))
      current = ''
      continue
    }
    current += ch
  }

  result.push(current.trim().replace(/^"|"$/g, ''))
  return result
}

function splitRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((s) => s.trim())
  if (line.includes(',')) return splitCsvRow(line)
  return [line.trim()]
}

function isWyrHeader(cols: string[]): boolean {
  if (cols.length < 2) return false
  const a = cols[0].trim().toLowerCase().replace(/\s+/g, '_')
  const b = cols[1].trim().toLowerCase().replace(/\s+/g, '_')
  return (a === 'option_a' || a === 'optiona' || a === 'a') && (b === 'option_b' || b === 'optionb' || b === 'b')
}

function isMltHeader(cols: string[]): boolean {
  const a = cols[0]?.trim().toLowerCase()
  return a === 'question' || a === 'prompt' || a === 'questions'
}

function isTotHeader(cols: string[]): boolean {
  const a = cols[0]?.trim().toLowerCase()
  return a === 'question' || a === 'questions'
}

function looksLikeOrQuestion(text: string): boolean {
  return /\s+or\s+/i.test(text.trim())
}

export function parseOrSplitQuestion(text: string): WyrQuestion | null {
  const q = text.trim().replace(/^["']|["']$/g, '')
  const match = q.match(/^(.+?)\s+or\s+(.+)$/i)
  if (!match) return null
  const optionA = match[1].trim()
  const optionB = match[2].trim().replace(/\?+$/, '').trim()
  if (!optionA || !optionB) return null
  return { optionA, optionB }
}

export function parseThisOrThatQuestionRows(text: string): WyrQuestion[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const rows: WyrQuestion[] = []

  for (const line of lines) {
    const cols = splitRow(line)
    if (rows.length === 0 && (isTotHeader(cols) || isMltHeader(cols))) continue

    if (cols.length >= 2 && !looksLikeOrQuestion(cols[0])) {
      const optionA = cols[0].trim()
      const optionB = cols[1].trim()
      if (optionA && optionB) rows.push({ optionA, optionB })
      continue
    }

    const question = (cols.length >= 2 ? cols.join(', ') : cols[0])?.trim()
    if (!question) continue
    const parsed = parseOrSplitQuestion(question)
    if (parsed) rows.push(parsed)
  }

  return rows
}

function normalizeHeaderKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_')
}

function isTriviaHeader(cols: string[]): boolean {
  const normalized = cols.map(normalizeHeaderKey)
  if (normalized.includes('question') || normalized.includes('questions')) return true
  return normalized.includes('option_a') || normalized.includes('optiona')
}

type TriviaHeaderMap = {
  question: number
  choices: number[]
  correct: number
  category?: number
}

function buildTriviaHeaderMap(cols: string[]): TriviaHeaderMap | null {
  const normalized = cols.map(normalizeHeaderKey)
  const question =
    normalized.indexOf('question') >= 0 ? normalized.indexOf('question') : normalized.indexOf('questions')

  if (question < 0) return null

  const choiceKeys = ['option_a', 'option_b', 'option_c', 'option_d'] as const
  const choices: number[] = []
  for (const key of choiceKeys) {
    const idx = normalized.indexOf(key)
    if (idx >= 0) choices.push(idx)
  }
  if (choices.length < 2) {
    for (const key of ['a', 'b', 'c', 'd'] as const) {
      const idx = normalized.indexOf(key)
      if (idx >= 0 && !choices.includes(idx)) choices.push(idx)
    }
  }

  const correct =
    ['correct', 'correct_answer', 'answer', 'correct_index'].map((k) => normalized.indexOf(k)).find((i) => i >= 0) ?? -1

  if (choices.length < 2 || correct < 0) return null

  const category = ['category', 'cat'].map((k) => normalized.indexOf(k)).find((i) => i >= 0)

  return { question, choices, correct, category }
}

function parseCorrectIndex(raw: string, choices: string[]): number | null {
  const v = raw.trim()
  if (!v) return null
  const letter = v.toUpperCase()
  if (letter === 'A' || letter === '0') return 0
  if (letter === 'B' || letter === '1') return 1
  if (letter === 'C' || letter === '2') return 2
  if (letter === 'D' || letter === '3') return 3
  const num = Number.parseInt(v, 10)
  if (!Number.isNaN(num) && num >= 0 && num < choices.length) return num
  const idx = choices.findIndex((c) => c.toLowerCase() === v.toLowerCase())
  return idx >= 0 ? idx : null
}

function parseTriviaQuestionFromCols(
  cols: string[],
  defaultCategory: TriviaCategory,
  headerMap?: TriviaHeaderMap | null
): TriviaQuestion | null {
  if (headerMap) {
    const question = cols[headerMap.question]?.trim()
    if (!question) return null

    const choices = headerMap.choices.map((i) => cols[i]?.trim() ?? '').filter(Boolean)
    const correctRaw = cols[headerMap.correct]?.trim() ?? ''
    const catRaw = headerMap.category != null ? cols[headerMap.category]?.trim().toLowerCase() : ''
    const category: TriviaCategory = catRaw === 'tech' ? 'tech' : defaultCategory

    if (choices.length < 2) return null
    const correctIndex = parseCorrectIndex(correctRaw, choices)
    if (correctIndex == null) return null

    return { question, choices: choices.slice(0, 4), correctIndex, category }
  }

  if (cols.length < 3) return null

  const question = cols[0]?.trim()
  if (!question) return null

  let choices: string[]
  let correctRaw: string
  let category: TriviaCategory = defaultCategory

  if (cols.length >= 6) {
    choices = cols
      .slice(1, 5)
      .map((c) => c.trim())
      .filter(Boolean)
    correctRaw = cols[5] ?? ''
    const cat = cols[6]?.trim().toLowerCase()
    if (cat === 'tech' || cat === 'general') category = cat
  } else if (cols.length === 5) {
    choices = cols
      .slice(1, 4)
      .map((c) => c.trim())
      .filter(Boolean)
    correctRaw = cols[4] ?? ''
  } else if (cols.length === 4) {
    choices = cols
      .slice(1, 3)
      .map((c) => c.trim())
      .filter(Boolean)
    correctRaw = cols[3] ?? ''
  } else {
    choices = [cols[1], cols[2]].map((c) => c.trim()).filter(Boolean)
    correctRaw = cols[3] ?? cols[2] ?? ''
  }

  if (choices.length < 2) return null
  const correctIndex = parseCorrectIndex(correctRaw, choices)
  if (correctIndex == null) return null

  return { question, choices: choices.slice(0, 4), correctIndex, category }
}

export type TriviaQuestionImportResult = {
  questions: TriviaQuestion[]
  totalRows: number
  skippedRows: number
  duplicateRows: number
}

export function parseTriviaQuestionImport(
  text: string,
  defaultCategory: TriviaCategory = 'general'
): TriviaQuestionImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const parsed: TriviaQuestion[] = []
  let headerMap: TriviaHeaderMap | null = null
  let totalRows = 0
  let skippedRows = 0

  for (const line of lines) {
    const cols = splitRow(line)
    if (!headerMap && isTriviaHeader(cols)) {
      headerMap = buildTriviaHeaderMap(cols)
      continue
    }

    totalRows++
    const row = parseTriviaQuestionFromCols(cols, defaultCategory, headerMap)
    if (row) parsed.push(row)
    else skippedRows++
  }

  const seen = new Set<string>()
  const questions: TriviaQuestion[] = []
  let duplicateRows = 0
  for (const q of parsed) {
    const key = triviaQuestionKey(q)
    if (seen.has(key)) {
      duplicateRows++
      continue
    }
    seen.add(key)
    questions.push(q)
  }

  return { questions, totalRows, skippedRows, duplicateRows }
}

export function formatTriviaImportSummary(result: TriviaQuestionImportResult): string | null {
  const parts: string[] = []
  if (result.skippedRows > 0) {
    parts.push(`${result.skippedRows} row${result.skippedRows === 1 ? '' : 's'} skipped (check format)`)
  }
  if (result.duplicateRows > 0) {
    parts.push(`${result.duplicateRows} duplicate question${result.duplicateRows === 1 ? '' : 's'} removed`)
  }
  if (parts.length === 0) return null
  return parts.join(' · ')
}

export function parseTriviaQuestionRows(text: string, defaultCategory: TriviaCategory = 'general'): TriviaQuestion[] {
  return parseTriviaQuestionImport(text, defaultCategory).questions
}

// ── Crossword / Word Search custom pools ──────────────────────────────────────
// Both store their pool in games.custom_questions and the start route packs a grid from it:
// Crossword needs {answer, clue} rows; Word Search needs {word} rows. A library pack's
// `questions` JSONB uses the same shapes, so it folds straight into custom_questions.

export type EntryImportResult<T> = {
  questions: T[]
  totalRows: number
  skippedRows: number
  duplicateRows: number
}

export type CrosswordEntry = { answer: string; clue: string }
export type WordSearchEntry = { word: string }
export type WordScrambleEntry = { word: string; hint?: string }

/** Parse a crossword CSV (answer,clue header) into deduped {answer, clue} entries + counts. */
export function parseCrosswordEntryImport(text: string): EntryImportResult<CrosswordEntry> {
  const rows = parseCsvRows(text)
  const parsed = parseCrosswordEntries(rows)
  const seen = new Set<string>()
  const questions: CrosswordEntry[] = []
  let duplicateRows = 0
  for (const e of parsed) {
    const key = e.answer.trim().toUpperCase()
    if (seen.has(key)) {
      duplicateRows++
      continue
    }
    seen.add(key)
    questions.push({ answer: e.answer.trim(), clue: e.clue.trim() })
  }
  return { questions, totalRows: rows.length, skippedRows: rows.length - parsed.length, duplicateRows }
}

/** Parse a word-search CSV (word header) into deduped {word} entries + counts. */
export function parseWordSearchEntryImport(text: string): EntryImportResult<WordSearchEntry> {
  const rows = parseCsvRows(text)
  const parsed = parseWordSearchEntries(rows)
  const seen = new Set<string>()
  const questions: WordSearchEntry[] = []
  let duplicateRows = 0
  for (const e of parsed) {
    const word = e.word.trim().toUpperCase()
    if (!word) continue
    if (seen.has(word)) {
      duplicateRows++
      continue
    }
    seen.add(word)
    questions.push({ word })
  }
  return { questions, totalRows: rows.length, skippedRows: rows.length - parsed.length, duplicateRows }
}

/** Parse a word-scramble CSV (word[,hint] header) into deduped {word, hint?} entries + counts. */
export function parseWordScrambleEntryImport(text: string): EntryImportResult<WordScrambleEntry> {
  const rows = parseCsvRows(text)
  const parsed = parseWordScrambleEntries(rows)
  const seen = new Set<string>()
  const questions: WordScrambleEntry[] = []
  let duplicateRows = 0
  for (const e of parsed) {
    const word = e.word.trim().toUpperCase()
    if (!word) continue
    if (seen.has(word)) {
      duplicateRows++
      continue
    }
    seen.add(word)
    questions.push(e.hint ? { word, hint: e.hint } : { word })
  }
  return { questions, totalRows: rows.length, skippedRows: rows.length - parsed.length, duplicateRows }
}

/** Restore a stored word-scramble pool (from custom_questions or a library pack). */
export function parseStoredWordScrambleEntries(raw: unknown): WordScrambleEntry[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: WordScrambleEntry[] = []
  for (const e of parseWordScrambleEntries(raw as Record<string, string>[])) {
    const word = e.word.trim().toUpperCase()
    if (word && !seen.has(word)) {
      seen.add(word)
      out.push(e.hint ? { word, hint: e.hint } : { word })
    }
  }
  return out
}

/** Restore a stored crossword pool (from custom_questions or a library pack). */
export function parseStoredCrosswordEntries(raw: unknown): CrosswordEntry[] {
  if (!Array.isArray(raw)) return []
  return parseCrosswordEntries(raw as Record<string, string>[]).map((e) => ({
    answer: e.answer.trim(),
    clue: e.clue.trim(),
  }))
}

/** Restore a stored word-search pool (from custom_questions or a library pack). */
export function parseStoredWordSearchEntries(raw: unknown): WordSearchEntry[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: WordSearchEntry[] = []
  for (const e of parseWordSearchEntries(raw as Record<string, string>[])) {
    const word = e.word.trim().toUpperCase()
    if (word && !seen.has(word)) {
      seen.add(word)
      out.push({ word })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Who Said This — trivia-style quote questions (quote + A/B/C/D options + correct)
// ---------------------------------------------------------------------------

/** Resolve the correct option from a CSV `correct` cell: a letter (A–D), a 1/0-based index,
 *  or the exact option text. Returns the 0-based index, or null if unresolved. */
function parseWstCorrectIndex(raw: string, options: string[]): number | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  const letter = v.toUpperCase()
  const letterIdx = ['A', 'B', 'C', 'D'].indexOf(letter)
  if (letterIdx >= 0 && letterIdx < options.length) return letterIdx
  const num = Number.parseInt(v, 10)
  if (!Number.isNaN(num)) {
    // Accept 1-based (1–4) or 0-based (0–3) numbering.
    if (num >= 1 && num <= options.length) return num - 1
    if (num >= 0 && num < options.length) return num
  }
  const match = options.findIndex((o) => o.toLowerCase() === v.toLowerCase())
  return match >= 0 ? match : null
}

/** Map CSV/stored rows to {quote, options, correctIndex}. Quote column: quote/question/text;
 *  options: option_a..d (or a/b/c/d, or option1..4); correct: correct/answer/correct_answer. */
export function parseWstDeckRows(rows: Record<string, string>[]): WstDeckEntry[] {
  const out: WstDeckEntry[] = []
  for (const r of rows) {
    const quote = (r.quote ?? r.question ?? r.text ?? r.line ?? '').trim()
    const options = [
      r.option_a ?? r.a ?? r.option1 ?? r.option_1 ?? '',
      r.option_b ?? r.b ?? r.option2 ?? r.option_2 ?? '',
      r.option_c ?? r.c ?? r.option3 ?? r.option_3 ?? '',
      r.option_d ?? r.d ?? r.option4 ?? r.option_4 ?? '',
    ]
      .map((o) => o.trim())
      .filter(Boolean)
      .slice(0, 4)
    const correctIndex = parseWstCorrectIndex(r.correct ?? r.answer ?? r.correct_answer ?? '', options)
    if (!quote || options.length < 2 || correctIndex == null) continue
    out.push({ quote, options, correctIndex })
  }
  return out
}

function dedupeWstDeck(entries: WstDeckEntry[]): WstDeckEntry[] {
  const seen = new Set<string>()
  const out: WstDeckEntry[] = []
  for (const e of entries) {
    const key = `${e.quote.toLowerCase()}|${e.options.map((o) => o.toLowerCase()).join('|')}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

/** Parse a WST deck CSV (quote,option_a,option_b,option_c,option_d,correct) into deduped
 *  questions + counts. */
export function parseWstDeckImport(text: string): EntryImportResult<WstDeckEntry> {
  const rows = parseCsvRows(text)
  const parsed = parseWstDeckRows(rows)
  const deduped = dedupeWstDeck(parsed)
  return {
    questions: deduped,
    totalRows: rows.length,
    skippedRows: rows.length - parsed.length,
    duplicateRows: parsed.length - deduped.length,
  }
}

/** Parse a WST deck from an uploaded .xlsx/.xls workbook. */
export async function parseExcelWstDeckImport(buffer: ArrayBuffer): Promise<EntryImportResult<WstDeckEntry>> {
  return parseWstDeckImport(await sheetBufferToText(buffer))
}

/** Restore a stored WST deck (from games.custom_questions or a library pack). */
export function parseStoredWstDeck(raw: unknown): WstDeckEntry[] {
  if (!Array.isArray(raw)) return []
  // Stored rows keep native arrays for `options` + numeric `correctIndex`; normalise loosely.
  const normalised: Record<string, string>[] = []
  const direct: WstDeckEntry[] = []
  for (const item of raw as unknown[]) {
    const obj = item as { quote?: unknown; options?: unknown; correctIndex?: unknown }
    if (typeof obj?.quote === 'string' && Array.isArray(obj.options) && typeof obj.correctIndex === 'number') {
      const options = obj.options.map((o) => String(o).trim()).filter(Boolean)
      if (obj.quote.trim() && options.length >= 2 && obj.correctIndex >= 0 && obj.correctIndex < options.length) {
        direct.push({ quote: obj.quote.trim(), options, correctIndex: obj.correctIndex })
      }
      continue
    }
    normalised.push(item as Record<string, string>)
  }
  return dedupeWstDeck([...direct, ...parseWstDeckRows(normalised)])
}

/** Shared "N skipped · M duplicates removed" summary for the entry importers above. */
export function formatEntryImportSummary(result: { skippedRows: number; duplicateRows: number }): string | null {
  const parts: string[] = []
  if (result.skippedRows > 0) parts.push(`${result.skippedRows} row${result.skippedRows === 1 ? '' : 's'} skipped`)
  if (result.duplicateRows > 0) {
    parts.push(`${result.duplicateRows} duplicate${result.duplicateRows === 1 ? '' : 's'} removed`)
  }
  return parts.length ? parts.join(' · ') : null
}

export async function parseExcelTriviaQuestions(
  buffer: ArrayBuffer,
  defaultCategory: TriviaCategory = 'general'
): Promise<TriviaQuestion[]> {
  return (await parseExcelTriviaQuestionImport(buffer, defaultCategory)).questions
}

export async function parseExcelTriviaQuestionImport(
  buffer: ArrayBuffer,
  defaultCategory: TriviaCategory = 'general'
): Promise<TriviaQuestionImportResult> {
  return parseTriviaQuestionImport(await sheetBufferToText(buffer), defaultCategory)
}

export function mergeTriviaQuestions(existing: TriviaQuestion[], incoming: TriviaQuestion[]): TriviaQuestion[] {
  const seen = new Set(existing.map((q) => triviaQuestionKey(q)))
  const merged = [...existing]
  for (const q of incoming) {
    const key = triviaQuestionKey(q)
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(q)
    }
  }
  return merged
}

export function parseStoredTriviaQuestions(raw: unknown): TriviaQuestion[] {
  if (!Array.isArray(raw)) return []
  const out: TriviaQuestion[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const question = String((item as { question?: unknown }).question ?? '').trim()
    const choicesRaw = (item as { choices?: unknown }).choices
    const correctIndex = Number((item as { correctIndex?: unknown }).correctIndex)
    const categoryRaw = (item as { category?: unknown }).category
    const choices = Array.isArray(choicesRaw)
      ? choicesRaw
          .filter((c): c is string => typeof c === 'string')
          .map((c) => c.trim())
          .filter(Boolean)
      : []
    const category: TriviaCategory = categoryRaw === 'tech' ? 'tech' : 'general'
    if (!question || choices.length < 2 || Number.isNaN(correctIndex)) continue
    if (correctIndex < 0 || correctIndex >= choices.length) continue
    out.push({ question, choices: choices.slice(0, 4), correctIndex, category })
  }
  return out
}

export function parseQuestionSource(raw: unknown, gameType?: GameType | string): QuestionSource {
  if (isThisOrThat(gameType)) {
    // This or That has a built-in pool, community library packs, and custom uploads.
    // Library is folded into 'custom' at create time, so only 'platform'/'custom' persist;
    // anything unrecognized defaults to 'custom' (matches legacy uploaded games).
    if (raw === 'platform') return 'platform'
    if (raw === 'library') return 'library'
    return 'custom'
  }
  if (
    isTriviaGame(gameType) ||
    isCodewordsGame(gameType) ||
    isWouldYouRather(gameType) ||
    isMostLikelyTo(gameType) ||
    isNeverHaveIEver(gameType) ||
    isPickANumber(gameType)
  ) {
    if (raw === 'custom') return 'custom'
    if (raw === 'library') return 'library'
    return 'platform'
  }
  // Describe It supports uploaded ('custom') words only — it has no library tier,
  // so never persist 'library' (gameplay would silently fall back to the platform pool).
  if (isDescribeItGame(gameType)) return raw === 'custom' ? 'custom' : 'platform'
  // Crossword / Word Search / Word Scramble: library is folded into 'custom' at create (the
  // start route just checks custom_questions), so only 'platform'/'custom' persist.
  if (isCrosswordGame(gameType) || isWordSearchGame(gameType) || isWordScrambleGame(gameType))
    return raw === 'custom' ? 'custom' : 'platform'
  // Who Said This Pre-set roster decks: Library folds into 'custom' (start reads the deck from
  // custom_questions); 'platform' is a seeded deck. The player-quote mode ignores this.
  if (isWhoSaidThis(gameType)) return raw === 'custom' || raw === 'library' ? 'custom' : 'platform'
  return 'platform'
}

export function isLobbyQuestionGame(gameType?: GameType | string): boolean {
  const type = parseGameType(gameType)
  return (
    isWouldYouRather(type) ||
    isNeverHaveIEver(type) ||
    isPickANumber(type) ||
    isThisOrThat(type) ||
    isMostLikelyTo(type)
  )
}

export function parseWyrQuestionRows(text: string): WyrQuestion[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const rows: WyrQuestion[] = []

  for (const line of lines) {
    const cols = splitRow(line)
    if (cols.length < 2) continue
    if (rows.length === 0 && isWyrHeader(cols)) continue

    const optionA = cols[0].trim()
    const optionB = cols[1].trim()
    if (!optionA || !optionB) continue
    rows.push({ optionA, optionB })
  }

  return rows
}

export function parseMltQuestionRows(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const rows: string[] = []

  for (const line of lines) {
    const cols = splitRow(line)
    const question = (cols.length >= 2 ? cols.join(', ') : cols[0])?.trim()
    if (!question) continue
    if (rows.length === 0 && isMltHeader(cols)) continue
    rows.push(question)
  }

  return rows
}

async function sheetBufferToText(buffer: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return ''

  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][]
  return grid
    .map((row) => row.map((cell) => String(cell ?? '').trim()).join('\t'))
    .filter((line) => line.replace(/\t/g, '').length > 0)
    .join('\n')
}

export async function parseExcelThisOrThatQuestions(buffer: ArrayBuffer): Promise<WyrQuestion[]> {
  return parseThisOrThatQuestionRows(await sheetBufferToText(buffer))
}

export async function parseExcelWyrQuestions(buffer: ArrayBuffer): Promise<WyrQuestion[]> {
  return parseWyrQuestionRows(await sheetBufferToText(buffer))
}

export async function parseExcelMltQuestions(buffer: ArrayBuffer): Promise<string[]> {
  return parseMltQuestionRows(await sheetBufferToText(buffer))
}

export function mergeWyrQuestions(existing: WyrQuestion[], incoming: WyrQuestion[]): WyrQuestion[] {
  const seen = new Set(existing.map((q) => `${q.optionA.toLowerCase()}|${q.optionB.toLowerCase()}`))
  const merged = [...existing]
  for (const q of incoming) {
    const key = `${q.optionA.toLowerCase()}|${q.optionB.toLowerCase()}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(q)
    }
  }
  return merged
}

export function mergeMltQuestions(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((q) => q.toLowerCase()))
  const merged = [...existing]
  for (const q of incoming) {
    const key = q.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(q)
    }
  }
  return merged
}

export function questionSampleFile(gameType?: GameType | string): { href: string; download: string } {
  if (isTriviaGame(gameType)) {
    return { href: '/trivia-questions-sample.csv', download: 'trivia-questions-sample.csv' }
  }
  if (isDescribeItGame(gameType)) {
    return { href: '/text-charades-words-sample.csv', download: 'text-charades-words-sample.csv' }
  }
  if (isQuickDrawGame(gameType)) {
    return { href: '/text-charades-words-sample.csv', download: 'quick-draw-words-sample.csv' }
  }
  if (isCodewordsGame(gameType)) {
    return { href: '/codewords-words-sample.csv', download: 'codewords-words-sample.csv' }
  }
  if (isThisOrThat(gameType)) {
    return { href: '/this-or-that-questions-sample.csv', download: 'this-or-that-questions-sample.csv' }
  }
  if (isNeverHaveIEver(gameType)) {
    return { href: '/nhie-questions-sample.csv', download: 'nhie-questions-sample.csv' }
  }
  if (isPickANumber(gameType)) {
    return { href: '/pick-a-number-questions-sample.csv', download: 'pick-a-number-questions-sample.csv' }
  }
  if (isMostLikelyTo(gameType)) {
    return { href: '/mlt-questions-sample.csv', download: 'mlt-questions-sample.csv' }
  }
  if (isCrosswordGame(gameType)) {
    return { href: '/crossword-answers-sample.csv', download: 'crossword-answers-sample.csv' }
  }
  if (isWordSearchGame(gameType)) {
    return { href: '/word-search-words-sample.csv', download: 'word-search-words-sample.csv' }
  }
  if (isWordScrambleGame(gameType)) {
    return { href: '/word-scramble-words-sample.csv', download: 'word-scramble-words-sample.csv' }
  }
  return { href: '/wyr-questions-sample.csv', download: 'wyr-questions-sample.csv' }
}

export function questionUploadHint(gameType?: GameType | string): string {
  if (isTriviaGame(gameType)) {
    return '.csv or .xlsx — question, option_a–option_d, correct (A–D). Quote questions that contain commas.'
  }
  if (isDescribeItGame(gameType)) {
    return '.csv or .xlsx — one word or phrase per row.'
  }
  if (isQuickDrawGame(gameType)) {
    return '.csv or .xlsx — one word or drawing prompt per row.'
  }
  if (isCodewordsGame(gameType)) {
    return '.csv or .xlsx — one word per row (single words only, no spaces).'
  }
  if (isThisOrThat(gameType)) {
    return '.csv or .xlsx — one question per row (e.g. Coffee or Tea?)'
  }
  if (isNeverHaveIEver(gameType)) {
    return '.csv or .xlsx — one prompt per row (e.g. been skydiving — the "Never have I ever" prefix is added automatically)'
  }
  if (isPickANumber(gameType)) {
    return '.csv or .xlsx — one question per row (question column). Numbers 1, 2, 3… map to row order.'
  }
  if (isMostLikelyTo(gameType)) {
    return '.csv or .xlsx — one question per row (question column)'
  }
  if (isCrosswordGame(gameType)) {
    return '.csv — answer and clue columns (header row required). 4+ answers.'
  }
  if (isWordSearchGame(gameType)) {
    return '.csv — one word per row under a "word" header. 4+ words.'
  }
  if (isWordScrambleGame(gameType)) {
    return '.csv — word and optional hint columns (header row). 4+ words.'
  }
  return '.csv or .xlsx — option_a and option_b columns'
}

export function parseStoredWyrQuestions(raw: unknown): WyrQuestion[] {
  if (!Array.isArray(raw)) return []
  const out: WyrQuestion[] = []
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const optionA = String((item as { optionA?: unknown }).optionA ?? '').trim()
      const optionB = String((item as { optionB?: unknown }).optionB ?? '').trim()
      if (optionA && optionB) out.push({ optionA, optionB })
    }
  }
  return out
}

export function parseStoredMltQuestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      const q = item.trim()
      if (q) out.push(q)
    } else if (item && typeof item === 'object') {
      const q = String((item as { question?: unknown }).question ?? '').trim()
      if (q) out.push(q)
    }
  }
  return out
}

export function customQuestionCount(game: Pick<Game, 'game_type' | 'question_source' | 'custom_questions'>): number {
  if (parseQuestionSource(game.question_source, game.game_type) !== 'custom') return 0
  if (isBinaryChoiceGame(game.game_type)) return parseStoredWyrQuestions(game.custom_questions).length
  if (isMostLikelyTo(game.game_type) || isNeverHaveIEver(game.game_type) || isPickANumber(game.game_type)) {
    return parseStoredMltQuestions(game.custom_questions).length
  }
  if (isTriviaGame(game.game_type)) return parseStoredTriviaQuestions(game.custom_questions).length
  if (isCodewordsGame(game.game_type)) return parseStoredCodewordsWords(game.custom_questions).length
  if (isQuickDrawGame(game.game_type)) return parseStoredMltQuestions(game.custom_questions).length
  return 0
}

export const MAX_LOBBY_QUESTION_ROUNDS = 100

/** Max rounds selectable for WYR / MLT / This or That based on uploaded + player-submitted questions. */
export function questionPoolCap(
  game: Pick<Game, 'game_type' | 'question_source' | 'custom_questions' | 'player_questions_enabled'>,
  playerQuestionCount = 0
): number {
  const type = parseGameType(game.game_type)
  const capAt = (n: number) => Math.min(MAX_LOBBY_QUESTION_ROUNDS, Math.max(0, n))
  const playerCount = game.player_questions_enabled === false ? 0 : playerQuestionCount
  if (isBinaryChoiceGame(type)) {
    const custom = customQuestionCount(game)
    if (custom > 0) return capAt(custom + playerCount)
    if (isThisOrThat(type)) return capAt(THIS_OR_THAT_QUESTION_COUNT + playerCount)
    return capAt(WYR_QUESTION_COUNT + playerCount)
  }
  if (isMostLikelyTo(type)) {
    const custom = customQuestionCount(game)
    const base = custom > 0 ? custom : MLT_QUESTION_COUNT
    return capAt(base + playerCount)
  }
  if (isNeverHaveIEver(type)) {
    const custom = customQuestionCount(game)
    const base = custom > 0 ? custom : NHIE_QUESTION_COUNT
    return capAt(base + playerCount)
  }
  if (isPickANumber(type)) {
    const custom = customQuestionCount(game)
    const base = custom > 0 ? custom : PAN_QUESTION_COUNT
    return capAt(base + playerCount)
  }
  if (isTriviaGame(type)) {
    const custom = customQuestionCount(game)
    return capAt(custom > 0 ? custom : TRIVIA_QUESTION_COUNT)
  }
  return 20
}

/** Quick-pick round counts for question-based lobby games (up to pool size). */
export function questionRoundPickerOptions(max: number): number[] {
  const cap = Math.max(max, 0)
  if (cap <= 0) return []
  const presets = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 50, 60, 80, 100]
  const opts = presets.filter((n) => n <= cap)
  return opts.includes(cap) ? opts : [...opts, cap]
}

export function clampLobbyQuestionRounds(value: number | string, upper: number): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : value
  const max = Math.max(upper, 1)
  if (Number.isNaN(n)) return 1
  return Math.min(Math.max(n, 1), max)
}

export function pickCustomWyrQuestions(
  pool: WyrQuestion[],
  count: number,
  usageCounts: Map<string, number> = new Map()
): WyrQuestion[] {
  return pickLeastUsed(pool, (q) => wyrQuestionKey(q.optionA, q.optionB), usageCounts, count)
}

export function pickCustomMltQuestions(
  pool: string[],
  count: number,
  usageCounts: Map<string, number> = new Map()
): string[] {
  return pickLeastUsed(pool, (question) => question, usageCounts, count)
}

export function pickCustomTriviaQuestions(
  pool: TriviaQuestion[],
  count: number,
  usageCounts: Map<string, number> = new Map()
): TriviaQuestion[] {
  return pickLeastUsed(pool, triviaQuestionKey, usageCounts, count)
}

export function questionSourceOptions(gameType: GameType | string): {
  value: QuestionSource
  label: string
  hint: string
}[] {
  if (isThisOrThat(gameType)) {
    return [
      {
        value: 'platform',
        label: 'Platform',
        hint: `Use our built-in pool (${THIS_OR_THAT_QUESTION_COUNT}+ prompts).`,
      },
      {
        value: 'library',
        label: 'Library',
        hint: 'Pick a community-submitted question pack.',
      },
      {
        value: 'custom',
        label: 'Your own',
        hint: 'Upload a CSV with “Coffee or Tea?” style prompts.',
      },
    ]
  }
  if (isCodewordsGame(gameType)) {
    return [
      {
        value: 'platform',
        label: 'Platform',
        hint: 'Use our built-in word list (~400 words).',
      },
      {
        value: 'library',
        label: 'Library',
        hint: 'Pick a community-submitted word pack.',
      },
      {
        value: 'custom',
        label: 'Your own',
        hint: `Upload a CSV with at least ${CODEWORDS_MIN_CUSTOM_POOL} single words for your boards.`,
      },
    ]
  }
  if (isDescribeItGame(gameType) || isQuickDrawGame(gameType)) {
    return [
      {
        value: 'platform',
        label: 'Platform',
        hint: 'Use our built-in word bank.',
      },
      {
        value: 'library',
        label: 'Library',
        hint: 'Pick a community word pack.',
      },
      {
        value: 'custom',
        label: 'Your own',
        hint: 'Upload a CSV or add your own words and prompts.',
      },
    ]
  }
  if (isCrosswordGame(gameType)) {
    return [
      { value: 'platform', label: 'Platform', hint: 'Use our built-in themed word banks.' },
      { value: 'library', label: 'Library', hint: 'Pick a community answer/clue pack.' },
      { value: 'custom', label: 'Your own', hint: 'Upload a CSV of answer + clue rows (4+ answers).' },
    ]
  }
  if (isWordSearchGame(gameType)) {
    return [
      { value: 'platform', label: 'Platform', hint: 'Use our built-in themed word banks.' },
      { value: 'library', label: 'Library', hint: 'Pick a community word pack.' },
      { value: 'custom', label: 'Your own', hint: 'Upload a CSV of words (4+ words).' },
    ]
  }
  if (isWordScrambleGame(gameType)) {
    return [
      { value: 'platform', label: 'Platform', hint: 'Use our built-in themed word banks.' },
      { value: 'library', label: 'Library', hint: 'Pick a community word pack.' },
      { value: 'custom', label: 'Your own', hint: 'Upload a CSV of words + optional hints (4+ words).' },
    ]
  }
  const platformCount = isTriviaGame(gameType)
    ? TRIVIA_QUESTION_COUNT
    : isNeverHaveIEver(gameType)
      ? NHIE_QUESTION_COUNT
      : isPickANumber(gameType)
        ? PAN_QUESTION_COUNT
        : isMostLikelyTo(gameType)
          ? MLT_QUESTION_COUNT
          : WYR_QUESTION_COUNT
  const supportsLibrary =
    isTriviaGame(gameType) ||
    isWouldYouRather(gameType) ||
    isMostLikelyTo(gameType) ||
    isNeverHaveIEver(gameType) ||
    isPickANumber(gameType)
  const base: { value: QuestionSource; label: string; hint: string }[] = [
    {
      value: 'platform',
      label: 'Platform',
      hint: `Use our built-in pool (${platformCount}+ prompts).`,
    },
    {
      value: 'custom',
      label: 'Your own',
      hint: 'Upload a CSV or Excel file with your questions.',
    },
  ]
  if (supportsLibrary) {
    base.splice(1, 0, {
      value: 'library',
      label: 'Library',
      hint: 'Pick a community-submitted question pack.',
    })
  }
  return base
}
