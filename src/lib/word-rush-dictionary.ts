// Server-only dictionary: loads word-hunt-words.txt via fs — must not be imported from client code.

import fs from 'fs'
import path from 'path'
import {
  WORD_RUSH_MAX_WORD_LENGTH,
  WORD_RUSH_MIN_WORD_LENGTH,
  letterPairKey,
  normalizeWordRushWord,
  wordMatchesLetters,
} from '@/lib/word-rush'

export { letterPairKey, normalizeWordRushWord, wordMatchesLetters }

let wordSet: Set<string> | null = null
let pairIndex: Map<string, string[]> | null = null
let validPairs: string[] | null = null

function loadWordSet(): Set<string> {
  if (wordSet) return wordSet
  const filePath = path.join(process.cwd(), 'src/data/word-hunt-words.txt')
  const content = fs.readFileSync(filePath, 'utf8')
  wordSet = new Set(
    content
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter(
        (line) =>
          line.length >= WORD_RUSH_MIN_WORD_LENGTH && line.length <= WORD_RUSH_MAX_WORD_LENGTH && /^[a-z]+$/.test(line)
      )
  )
  return wordSet
}

function buildPairIndex(): Map<string, string[]> {
  if (pairIndex) return pairIndex
  const index = new Map<string, string[]>()
  for (const word of loadWordSet()) {
    const key = letterPairKey(word[0], word[word.length - 1])
    const list = index.get(key) ?? []
    list.push(word)
    index.set(key, list)
  }
  pairIndex = index
  return index
}

function loadValidPairs(): string[] {
  if (validPairs) return validPairs
  const index = buildPairIndex()
  validPairs = [...index.keys()].filter((key) => (index.get(key)?.length ?? 0) > 0)
  return validPairs
}

export function isValidWordRushWord(word: string, startLetter: string, endLetter: string): boolean {
  const normalized = normalizeWordRushWord(word)
  if (!wordMatchesLetters(normalized, startLetter, endLetter)) return false
  return loadWordSet().has(normalized)
}

export function validLetterPairCount(): number {
  return loadValidPairs().length
}

/** Pick a random start/end letter pair that has dictionary words. */
export function pickRandomLetterPair(usedPairs: string[] = []): { start: string; end: string } | null {
  const used = new Set(usedPairs.map((p) => p.toLowerCase()))
  const candidates = loadValidPairs().filter((key) => !used.has(key))
  const pool = candidates.length > 0 ? candidates : loadValidPairs()
  if (pool.length === 0) return null
  const key = pool[Math.floor(Math.random() * pool.length)]!
  const [start, end] = key.split('-')
  if (!start || !end) return null
  return { start, end }
}

/** Count how many dictionary words match a letter pair (for sanity checks). */
export function countWordsForPair(start: string, end: string): number {
  return buildPairIndex().get(letterPairKey(start, end))?.length ?? 0
}
