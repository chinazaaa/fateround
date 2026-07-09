// Server-only dictionary: merged English Scrabble lists + Word Hunt words. Must not be imported from client code.

import fs from 'fs'
import path from 'path'
import { SCRABBLE_WORDS_RAW } from '@/lib/data/scrabble-words'
import { SCRABBLE_WORDS_COLLINS_RAW } from '@/lib/data/scrabble-words-collins'
import { SCRABBLE_WORDS_TWL_RAW } from '@/lib/data/scrabble-words-twl'
import {
  WORD_RUSH_MAX_WORD_LENGTH,
  WORD_RUSH_MIN_WORD_LENGTH,
  letterPairKey,
  normalizeWordRushWord,
  wordMatchesLetters,
  wordRushWordFormatRejectReason,
} from '@/lib/word-rush'

export { letterPairKey, normalizeWordRushWord, wordMatchesLetters }

let wordSet: Set<string> | null = null
let pairIndex: Map<string, string[]> | null = null
let validPairs: string[] | null = null

function isWordRushLength(word: string): boolean {
  return word.length >= WORD_RUSH_MIN_WORD_LENGTH && word.length <= WORD_RUSH_MAX_WORD_LENGTH && /^[a-z]+$/.test(word)
}

function addWordsFromRaw(target: Set<string>, raw: string): void {
  for (const line of raw.split('\n')) {
    const word = line.trim().toLowerCase()
    if (isWordRushLength(word)) target.add(word)
  }
}

function addWordsFromFile(target: Set<string>, filePath: string): void {
  const content = fs.readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const word = line.trim().toLowerCase()
    if (isWordRushLength(word)) target.add(word)
  }
}

function loadWordSet(): Set<string> {
  if (wordSet) return wordSet
  const merged = new Set<string>()
  addWordsFromRaw(merged, SCRABBLE_WORDS_RAW)
  addWordsFromRaw(merged, SCRABBLE_WORDS_COLLINS_RAW)
  addWordsFromRaw(merged, SCRABBLE_WORDS_TWL_RAW)
  addWordsFromFile(merged, path.join(process.cwd(), 'src/data/word-hunt-words.txt'))
  wordSet = merged
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
  return wordRushWordRejectReason(word, startLetter, endLetter) === null
}

export function wordRushWordRejectReason(
  word: string,
  startLetter: string,
  endLetter: string,
  minLength: number = WORD_RUSH_MIN_WORD_LENGTH
): string | null {
  const formatReason = wordRushWordFormatRejectReason(word, startLetter, endLetter, minLength)
  if (formatReason) return formatReason
  const normalized = normalizeWordRushWord(word)
  if (!loadWordSet().has(normalized)) {
    return 'Not in the dictionary for this letter pair'
  }
  return null
}

export function validLetterPairCount(): number {
  return loadValidPairs().length
}

function pairSupportsMinLength(key: string, minLength: number): boolean {
  const words = buildPairIndex().get(key) ?? []
  return words.some((word) => word.length >= minLength)
}

/** Pick a random start/end letter pair that has dictionary words at least minLength long. */
export function pickRandomLetterPair(
  usedPairs: string[] = [],
  minLength: number = WORD_RUSH_MIN_WORD_LENGTH
): { start: string; end: string } | null {
  const used = new Set(usedPairs.map((p) => p.toLowerCase()))
  const eligible = (keys: string[]) => keys.filter((key) => !used.has(key) && pairSupportsMinLength(key, minLength))
  const candidates = eligible(loadValidPairs())
  const pool =
    candidates.length > 0 ? candidates : loadValidPairs().filter((key) => pairSupportsMinLength(key, minLength))
  if (pool.length === 0) return null
  const key = pool[Math.floor(Math.random() * pool.length)]!
  const [start, end] = key.split('-')
  if (!start || !end) return null
  return { start, end }
}

export function pairSupportsMinLengthForLetters(start: string, end: string, minLength: number): boolean {
  return pairSupportsMinLength(letterPairKey(start, end), minLength)
}

/** Count how many dictionary words match a letter pair (for sanity checks). */
export function countWordsForPair(start: string, end: string): number {
  return buildPairIndex().get(letterPairKey(start, end))?.length ?? 0
}
