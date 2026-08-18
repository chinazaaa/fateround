import * as DocumentPicker from 'expo-document-picker'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import type { GameType } from '@fateround/shared'
import { isCodewordsGame } from '@fateround/shared/game-type-checks'
import {
  MAX_TRIVIA_CHOICES,
  normalizeCodeword,
  type PuzzleEntryDraft,
  type TriviaDraft,
  type WyrPairDraft,
} from '@/lib/create-settings/custom-content'
import type { ParticipantDraft, ParticipantGender } from '@/lib/create-settings/people'
import { WST_MAX_OPTIONS, WST_MIN_OPTIONS, type WstDeckEntry } from '@/lib/who-said-this-deck'

/**
 * Picks a CSV/TSV/text file and returns its text. Returns null if cancelled.
 * xlsx is intentionally not supported on mobile (binary) — that stays on web.
 */
export async function pickCsvText(): Promise<{ name: string; text: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'text/tab-separated-values', 'text/plain', 'application/csv'],
    copyToCacheDirectory: true,
    multiple: false,
  })
  if (res.canceled || !res.assets?.[0]) return null
  const asset = res.assets[0]
  const text = await new File(asset.uri).text()
  return { name: asset.name, text }
}

/**
 * Writes `content` to a cache-directory file named `filename` and hands it to the native Share
 * sheet — on iOS that surfaces "Save to Files" and any installed app that accepts CSV; on
 * Android it surfaces the app chooser (Files / Drive / mail / etc). Real file download, not a
 * text share, so users can pick it back up in the Files app to edit and re-upload here.
 */
export async function shareTextAsFile(filename: string, content: string): Promise<void> {
  const file = new File(Paths.cache, filename)
  try {
    // `overwrite: true` on create() is enough on iOS, but Android sometimes preserves the old
    // file. Delete first (best-effort) so a stale sample never gets shared.
    if (file.exists) file.delete()
  } catch {
    // No prior file — safe to fall through.
  }
  file.create({ overwrite: true })
  file.write(content)
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: filename,
    })
  }
}

function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

function splitRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((s) => s.trim())
  if (line.includes(',')) return line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
  return [line.trim()]
}

const MALE_ALIASES = new Set(['m', 'male', 'man', 'men', 'boy', 'boys', 'guy', 'guys'])
const FEMALE_ALIASES = new Set(['f', 'female', 'woman', 'women', 'girl', 'girls', 'lady', 'ladies'])

function normalizeGender(raw: string): ParticipantGender | null {
  const key = raw.trim().toLowerCase()
  if (MALE_ALIASES.has(key)) return 'male'
  if (FEMALE_ALIASES.has(key)) return 'female'
  return null
}

// --- Custom-question CSV parsers (mirror web `src/lib/custom-questions.ts`) ---

/** option_a, option_b columns (skips a header row). */
export function parseWyrCsv(text: string): WyrPairDraft[] {
  const rows: WyrPairDraft[] = []
  for (const line of toLines(text)) {
    const cols = splitRow(line)
    if (cols.length < 2) continue
    const a = cols[0]?.toLowerCase()
    const b = cols[1]?.toLowerCase()
    if (
      rows.length === 0 &&
      (a === 'option_a' || a === 'optiona' || a === 'a') &&
      (b === 'option_b' || b === 'optionb' || b === 'b')
    ) {
      continue
    }
    const optionA = cols[0].trim()
    const optionB = cols[1].trim()
    if (optionA && optionB) rows.push({ optionA, optionB })
  }
  return rows
}

/** One prompt per row (joins extra columns with ", "). Codewords keeps single words only. */
export function parseListCsv(gameType: GameType, text: string): string[] {
  const rows: string[] = []
  for (const line of toLines(text)) {
    const cols = splitRow(line)
    const raw = (cols.length >= 2 ? cols.join(', ') : cols[0])?.trim()
    if (!raw) continue
    if (
      rows.length === 0 &&
      (raw.toLowerCase() === 'question' || raw.toLowerCase() === 'word' || raw.toLowerCase() === 'prompt')
    ) {
      continue
    }
    if (isCodewordsGame(gameType)) {
      const word = normalizeCodeword(cols[0] ?? raw)
      if (word) rows.push(word)
    } else {
      rows.push(raw)
    }
  }
  return rows
}

/**
 * Quote-aware CSV field splitter: keeps commas inside "double-quoted" cells and unescapes ""
 * to ". Crossword/word-scramble clues often contain commas, so the naive splitRow would drop
 * everything after the first comma of a clue.
 */
function splitCsvFields(line: string): string[] {
  if (line.includes('\t') && !line.includes('"')) return line.split('\t').map((s) => s.trim())
  const fields: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else inQuotes = false
      } else cur += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  fields.push(cur.trim())
  return fields
}

/**
 * Puzzle rows (crossword/word_search/word_scramble). First column is the word/answer,
 * second (optional) is the hint/clue. Skips a header row (word/answer). Dedupes by word.
 */
export function parsePuzzleCsv(text: string): PuzzleEntryDraft[] {
  const rows: PuzzleEntryDraft[] = []
  const seen = new Set<string>()
  for (const line of toLines(text)) {
    const cols = splitCsvFields(line)
    const word = (cols[0] ?? '').trim()
    if (!word) continue
    const first = word.toLowerCase()
    if (rows.length === 0 && (first === 'word' || first === 'answer')) continue
    const key = word.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ word, hint: (cols[1] ?? '').trim() })
  }
  return rows
}

/** question, option_a–option_d, correct (A–D or 1–4). */
export function parseTriviaCsv(text: string): TriviaDraft[] {
  const rows: TriviaDraft[] = []
  const letterIndex = (raw: string): number => {
    const key = raw.trim().toLowerCase()
    const byLetter = { a: 0, b: 1, c: 2, d: 3 }[key]
    if (byLetter !== undefined) return byLetter
    const n = parseInt(key, 10)
    return Number.isNaN(n) ? -1 : n - 1
  }
  const lines = toLines(text)
  for (let i = 0; i < lines.length; i++) {
    const cols = splitRow(lines[i])
    if (cols.length < 4) continue
    if (i === 0 && cols[0].toLowerCase() === 'question') continue
    const question = cols[0].trim()
    const choices = cols
      .slice(1, 1 + MAX_TRIVIA_CHOICES)
      .map((c) => c.trim())
      .filter(Boolean)
    const correctRaw = cols[cols.length > 5 ? 5 : cols.length - 1] ?? 'a'
    const correctIndex = letterIndex(correctRaw)
    if (!question || choices.length < 2) continue
    if (correctIndex < 0 || correctIndex >= choices.length) continue
    rows.push({ question, choices, correctIndex, category: 'general' })
  }
  return rows
}

/**
 * Who Said This deck rows: quote, option_a–option_d, correct (A–D or 1–4). Uses the quote-aware
 * splitter so a quote/option containing a comma survives. Dedupes by quote + options. Mirrors web
 * `parseWstDeckImport` (`src/lib/custom-questions.ts`).
 */
export function parseWstDeckCsv(text: string): WstDeckEntry[] {
  const out: WstDeckEntry[] = []
  const seen = new Set<string>()
  const correctIndex = (raw: string, options: string[]): number => {
    const key = (raw ?? '').trim().toLowerCase()
    const byLetter = { a: 0, b: 1, c: 2, d: 3 }[key]
    if (byLetter !== undefined && byLetter < options.length) return byLetter
    const n = parseInt(key, 10)
    if (!Number.isNaN(n)) {
      if (n >= 1 && n <= options.length) return n - 1
      if (n >= 0 && n < options.length) return n
    }
    const match = options.findIndex((o) => o.toLowerCase() === key)
    return match
  }
  const lines = toLines(text)
  for (let i = 0; i < lines.length; i++) {
    const cols = splitCsvFields(lines[i])
    if (cols.length < 3) continue
    if (i === 0 && ['quote', 'question', 'text', 'line'].includes(cols[0].toLowerCase())) continue
    const quote = cols[0].trim()
    const options = cols
      .slice(1, 1 + WST_MAX_OPTIONS)
      .map((c) => c.trim())
      .filter(Boolean)
    // The `correct` cell is whatever follows the options — up to the 4 option columns.
    const correctRaw = cols[cols.length > 1 + WST_MAX_OPTIONS ? 1 + WST_MAX_OPTIONS : cols.length - 1] ?? ''
    const idx = correctIndex(correctRaw, options)
    if (!quote || options.length < WST_MIN_OPTIONS || idx < 0 || idx >= options.length) continue
    const key = `${quote.toLowerCase()}|${options.map((o) => o.toLowerCase()).join('|')}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ quote, options, correctIndex: idx })
  }
  return out
}

/** name, gender columns (gender optional). */
export function parseParticipantsCsv(text: string): ParticipantDraft[] {
  const rows: ParticipantDraft[] = []
  for (const line of toLines(text)) {
    const cols = splitRow(line)
    const name = cols[0]?.trim()
    if (!name) continue
    const a = cols[0]?.toLowerCase()
    const b = cols[1]?.toLowerCase()
    if (rows.length === 0 && (a === 'name' || a === 'names') && (b === 'gender' || b === 'sex')) continue
    const gender = normalizeGender(cols[1] ?? '') ?? 'female'
    rows.push({ name, gender })
  }
  return rows
}
