/**
 * Leaf helpers for parsing a Wordle Room's stored solution list.
 *
 * Extracted from `@/lib/wordle-room` so the trophies layer does not import the whole game
 * module, which dragged in `@/lib/game-finish` -> `@/lib/trophies/round-facts` -> the
 * game-facts barrel -> back again. See `@/lib/ludo-pieces` for the crash that cycle caused.
 *
 * `@/lib/daily-wordle` is itself a leaf (pure word scoring), so depending on it here does not
 * reopen the cycle. Keep it that way: no value imports from game-logic modules.
 */
import { normalizeWordleWord, wordleMaxAttempts } from '@/lib/daily-wordle'

export function wordleRoomMaxAttemptsForWord(word: string): number {
  return wordleMaxAttempts(normalizeWordleWord(word).length)
}

/**
 * Tolerate both storage shapes in wordle_room_solutions.words: the legacy `string[]`
 * (old rounds) and the current `{word, hint}[]` (new rounds after the sequence enrichment).
 * Returns { words, hints } aligned by index, hints defaulting to '' when unavailable.
 */
export function parseWordleRoomSolutionWords(raw: unknown): { words: string[]; hints: string[] } {
  const words: string[] = []
  const hints: string[] = []
  if (!Array.isArray(raw)) return { words, hints }
  for (const item of raw) {
    if (typeof item === 'string') {
      words.push(normalizeWordleWord(item))
      hints.push('')
    } else if (item && typeof item === 'object') {
      const rec = item as { word?: unknown; hint?: unknown }
      words.push(normalizeWordleWord(typeof rec.word === 'string' ? rec.word : ''))
      hints.push(typeof rec.hint === 'string' ? rec.hint : '')
    }
  }
  return { words, hints }
}
