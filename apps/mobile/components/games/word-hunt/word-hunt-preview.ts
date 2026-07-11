import {
  WORD_HUNT_MIN_WORD_LENGTH,
  areWordHuntCellsAdjacent,
  isValidPath,
  wordFromPath,
  wordHuntPoints,
} from '@fateround/shared/word-hunt'

/** All prefixes of board words — used for live drag validation. */
export function buildWordHuntPrefixSet(validWords: ReadonlySet<string>): Set<string> {
  const prefixes = new Set<string>()
  for (const word of validWords) {
    const normalized = word.toLowerCase()
    for (let i = 1; i <= normalized.length; i++) {
      prefixes.add(normalized.slice(0, i))
    }
  }
  return prefixes
}

export function isValidWordHuntPrefix(prefix: string, validPrefixes: ReadonlySet<string>): boolean {
  if (validPrefixes.size === 0) return true
  return validPrefixes.has(prefix.toLowerCase())
}

export type WordHuntDragPreview = {
  word: string
  /** Points only when the word is valid and not already found. */
  points: number | null
  prefixValid: boolean
  isValidWord: boolean
  alreadyFound: boolean
}

export function previewWordHuntDrag(
  grid: string[][],
  path: number[],
  validWords: ReadonlySet<string>,
  validPrefixes: ReadonlySet<string>,
  foundWords: ReadonlySet<string>
): WordHuntDragPreview {
  const word = wordFromPath(grid, path)
  const prefixValid = isValidWordHuntPrefix(word, validPrefixes)
  const isValidWord =
    word.length >= WORD_HUNT_MIN_WORD_LENGTH && isValidPath(path) && (validWords.size === 0 || validWords.has(word))
  const alreadyFound = foundWords.has(word)
  const points = isValidWord && !alreadyFound ? wordHuntPoints(word.length) : null

  return { word, points, prefixValid, isValidWord, alreadyFound }
}

/** Whether appending `nextIndex` to `path` keeps it an adjacent, non-repeating, prefix-valid stroke. */
export function canExtendWordHuntPath(
  grid: string[][],
  path: number[],
  nextIndex: number,
  validPrefixes: ReadonlySet<string>
): boolean {
  if (path.length === 0) return true
  const last = path[path.length - 1]!
  if (!areWordHuntCellsAdjacent(last, nextIndex)) return false
  if (path.includes(nextIndex)) return false
  const candidate = [...path, nextIndex]
  const prefix = wordFromPath(grid, candidate)
  return isValidWordHuntPrefix(prefix, validPrefixes)
}
