// Server-only Scrabble dictionaries: the actual word data + the validation Sets.
// This module imports the large word lists, so it must never be pulled into a
// client bundle — UI code should import from ./scrabble-dictionary-meta instead.

import { SCRABBLE_WORDS_RAW } from '@/lib/data/scrabble-words'
import { SCRABBLE_WORDS_COLLINS_RAW } from '@/lib/data/scrabble-words-collins'
import { SCRABBLE_WORDS_TWL_RAW } from '@/lib/data/scrabble-words-twl'
import { parseScrabbleDictionaryId, type ScrabbleDictionaryId } from '@/lib/scrabble-dictionary-meta'

/** Maps each selectable dictionary to its raw newline-separated word list. */
const DICTIONARY_RAW: Record<ScrabbleDictionaryId, string> = {
  enable: SCRABBLE_WORDS_RAW,
  collins: SCRABBLE_WORDS_COLLINS_RAW,
  twl: SCRABBLE_WORDS_TWL_RAW,
}

// Lazily build (and cache) the validation Set for each dictionary the first time
// it's needed — each list is large, so we only pay for the ones actually played.
const wordSets = new Map<ScrabbleDictionaryId, Set<string>>()

function dictionary(dictId: ScrabbleDictionaryId): Set<string> {
  let set = wordSets.get(dictId)
  if (!set) {
    set = new Set(
      DICTIONARY_RAW[dictId]
        .split('\n')
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length >= 2)
    )
    wordSets.set(dictId, set)
  }
  return set
}

/** Dictionary check against the chosen word list. Words are length ≥ 2. Defaults to ENABLE. */
export function isValidScrabbleWord(word: string, dictId?: string): boolean {
  return dictionary(parseScrabbleDictionaryId(dictId)).has(word.toLowerCase())
}
