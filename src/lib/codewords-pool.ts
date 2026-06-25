import { pickLeastUsed } from '@/lib/question-picker'
import { CODEWORDS_WORD_POOL } from '@/lib/codewords-words'

export const CODEWORDS_BOARD_SIZE = 25
export const CODEWORDS_MIN_CUSTOM_POOL = CODEWORDS_BOARD_SIZE

export function codewordPoolKey(word: string): string {
  return word.trim().toLowerCase()
}

export function normalizeCodeword(word: string): string | null {
  const trimmed = word.trim()
  if (!trimmed || trimmed.length > 40) return null
  if (/\s/.test(trimmed)) return null
  return trimmed
}

function isCodewordHeader(cols: string[]): boolean {
  const first = cols[0]?.trim().toLowerCase()
  return first === 'word' || first === 'words'
}

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

export function parseCodewordsWordRows(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const rows: string[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const cols = splitRow(line)
    const raw = cols[0]?.trim()
    if (!raw) continue
    if (rows.length === 0 && isCodewordHeader(cols)) continue
    const word = normalizeCodeword(raw)
    if (!word) continue
    const key = codewordPoolKey(word)
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(word)
  }

  return rows
}

export function parseStoredCodewordsWords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const word = normalizeCodeword(item)
    if (!word) continue
    const key = codewordPoolKey(word)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(word)
  }
  return out
}

export function mergeCodewordsWords(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map(codewordPoolKey))
  const merged = [...existing]
  for (const word of incoming) {
    const normalized = normalizeCodeword(word)
    if (!normalized) continue
    const key = codewordPoolKey(normalized)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(normalized)
  }
  return merged
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

export async function parseExcelCodewordsWords(buffer: ArrayBuffer): Promise<string[]> {
  return parseCodewordsWordRows(await sheetBufferToText(buffer))
}

export function pickCustomCodewordsWords(
  pool: string[],
  count: number,
  usageCounts: Map<string, number> = new Map()
): string[] {
  return pickLeastUsed(pool, codewordPoolKey, usageCounts, count)
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function pickBoardWordsFromPool(
  pool?: readonly string[],
  usageCounts: Map<string, number> = new Map()
): string[] {
  const sourcePool = pool && pool.length > 0 ? pool : CODEWORDS_WORD_POOL
  const picked = pickCustomCodewordsWords([...sourcePool], CODEWORDS_BOARD_SIZE, usageCounts)
  return shuffle(picked)
}
