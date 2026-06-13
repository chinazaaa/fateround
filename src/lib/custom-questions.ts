import type { Game, GameType, QuestionSource } from '@/types'
import type { WyrQuestion } from '@/lib/would-you-rather-questions'
import { WYR_QUESTION_COUNT } from '@/lib/would-you-rather-questions'
import { MLT_QUESTION_COUNT } from '@/lib/most-likely-to-questions'
import { isWouldYouRather, isMostLikelyTo, parseGameType } from '@/lib/game-types'

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

export function parseQuestionSource(raw: unknown, gameType?: GameType | string): QuestionSource {
  if (!isWouldYouRather(gameType) && !isMostLikelyTo(gameType)) return 'platform'
  return raw === 'custom' ? 'custom' : 'platform'
}

export function isLobbyQuestionGame(gameType?: GameType | string): boolean {
  const type = parseGameType(gameType)
  return isWouldYouRather(type) || isMostLikelyTo(type)
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
  if (isMostLikelyTo(gameType)) {
    return { href: '/mlt-questions-sample.csv', download: 'mlt-questions-sample.csv' }
  }
  return { href: '/wyr-questions-sample.csv', download: 'wyr-questions-sample.csv' }
}

export function questionUploadHint(gameType?: GameType | string): string {
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
  if (isWouldYouRather(game.game_type)) return parseStoredWyrQuestions(game.custom_questions).length
  if (isMostLikelyTo(game.game_type)) return parseStoredMltQuestions(game.custom_questions).length
  return 0
}

/** Max rounds selectable for WYR / MLT based on question source. */
export function questionPoolCap(game: Pick<Game, 'game_type' | 'question_source' | 'custom_questions'>): number {
  const type = parseGameType(game.game_type)
  if (isWouldYouRather(type)) {
    const custom = customQuestionCount(game)
    return custom > 0 ? Math.min(20, custom) : Math.min(20, WYR_QUESTION_COUNT)
  }
  if (isMostLikelyTo(type)) {
    const custom = customQuestionCount(game)
    return custom > 0 ? Math.min(20, custom) : Math.min(20, MLT_QUESTION_COUNT)
  }
  return 20
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
