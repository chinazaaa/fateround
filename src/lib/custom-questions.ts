import type { Game, GameType, QuestionSource } from '@/types'
import type { WyrQuestion } from '@/lib/would-you-rather-questions'
import { WYR_QUESTION_COUNT } from '@/lib/would-you-rather-questions'
import { MLT_QUESTION_COUNT } from '@/lib/most-likely-to-questions'
import { isWouldYouRather, isMostLikelyTo, isThisOrThat, isBinaryChoiceGame, parseGameType } from '@/lib/game-types'

function splitRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((s) => s.trim())
  if (line.includes(',')) {
    return line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
  }
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

export function parseQuestionSource(raw: unknown, gameType?: GameType | string): QuestionSource {
  if (isThisOrThat(gameType)) return 'custom'
  if (!isWouldYouRather(gameType) && !isMostLikelyTo(gameType)) return 'platform'
  return raw === 'custom' ? 'custom' : 'platform'
}

export function isLobbyQuestionGame(gameType?: GameType | string): boolean {
  const type = parseGameType(gameType)
  return isWouldYouRather(type) || isThisOrThat(type) || isMostLikelyTo(type)
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
    .map((row) =>
      row
        .map((cell) => String(cell ?? '').trim())
        .filter(Boolean)
        .join('\t')
    )
    .filter(Boolean)
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
  if (isThisOrThat(gameType)) {
    return { href: '/this-or-that-questions-sample.csv', download: 'this-or-that-questions-sample.csv' }
  }
  if (isMostLikelyTo(gameType)) {
    return { href: '/mlt-questions-sample.csv', download: 'mlt-questions-sample.csv' }
  }
  return { href: '/wyr-questions-sample.csv', download: 'wyr-questions-sample.csv' }
}

export function questionUploadHint(gameType?: GameType | string): string {
  if (isThisOrThat(gameType)) {
    return '.csv or .xlsx — one question per row (e.g. Coffee or Tea?)'
  }
  if (isMostLikelyTo(gameType)) {
    return '.csv or .xlsx — one question per row (question column)'
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
  if (isMostLikelyTo(game.game_type)) return parseStoredMltQuestions(game.custom_questions).length
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
    if (isThisOrThat(type)) return capAt(playerCount)
    return capAt(WYR_QUESTION_COUNT + playerCount)
  }
  if (isMostLikelyTo(type)) {
    const custom = customQuestionCount(game)
    const base = custom > 0 ? custom : MLT_QUESTION_COUNT
    return capAt(base + playerCount)
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

function shuffleCopy<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function pickCustomWyrQuestions(pool: WyrQuestion[], count: number): WyrQuestion[] {
  if (count <= 0 || pool.length === 0) return []
  return shuffleCopy(pool).slice(0, Math.min(count, pool.length))
}

export function pickCustomMltQuestions(pool: string[], count: number): string[] {
  if (count <= 0 || pool.length === 0) return []
  return shuffleCopy(pool).slice(0, Math.min(count, pool.length))
}

export function questionSourceOptions(gameType: GameType | string): {
  value: QuestionSource
  label: string
  hint: string
}[] {
  if (isThisOrThat(gameType)) {
    return [
      {
        value: 'custom',
        label: 'Your own',
        hint: 'Upload a CSV with “Coffee or Tea?” style prompts.',
      },
    ]
  }
  const platformCount = isMostLikelyTo(gameType) ? MLT_QUESTION_COUNT : WYR_QUESTION_COUNT
  return [
    {
      value: 'platform',
      label: 'Platform',
      hint: `Use our built-in pool (${platformCount}+ prompts).`,
    },
    {
      value: 'custom',
      label: 'Your own',
      hint: 'Upload a CSV with your questions — download the sample format first.',
    },
  ]
}
