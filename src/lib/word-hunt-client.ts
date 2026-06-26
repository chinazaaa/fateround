import {
  WORD_HUNT_GRID_SIZE,
  WORD_HUNT_MIN_WORD_LENGTH,
  areWordHuntCellsAdjacent,
  indexToRowCol,
  isValidPath,
  letterAt,
  rowColToIndex,
  wordFromPath,
  wordHuntPoints,
} from '@/lib/word-hunt'

/** Instant client-side check using the round's precomputed word list. */
export function validateWordHuntSubmissionClient(
  grid: string[][],
  path: number[],
  validWords: ReadonlySet<string>,
  foundWords: ReadonlySet<string>
): { ok: true; normalized: string } | { ok: false; error: string; clearPath?: boolean } {
  if (path.length < WORD_HUNT_MIN_WORD_LENGTH) {
    return { ok: false, error: `Words must be at least ${WORD_HUNT_MIN_WORD_LENGTH} letters` }
  }
  if (!isValidPath(path)) {
    return { ok: false, error: 'Invalid letter path — use adjacent cells without repeating', clearPath: true }
  }

  const normalized = wordFromPath(grid, path)
  if (normalized.length < WORD_HUNT_MIN_WORD_LENGTH) {
    return { ok: false, error: `Words must be at least ${WORD_HUNT_MIN_WORD_LENGTH} letters` }
  }
  if (foundWords.has(normalized)) {
    return { ok: false, error: 'You already found this word' }
  }
  if (validWords.size > 0 && !validWords.has(normalized)) {
    return { ok: false, error: 'Not a valid word', clearPath: true }
  }

  return { ok: true, normalized }
}

export function validWordsSetFromMetadata(validWords?: string[] | null): Set<string> {
  return new Set(validWords ?? [])
}

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

const NEIGHBORS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const

/** Find one valid path for a word on the grid (for post-game review of missed words). */
export function findPathForWordOnGrid(
  grid: string[][],
  word: string,
  validWords: ReadonlySet<string>
): number[] | null {
  const normalized = word.trim().toLowerCase()
  if (normalized.length < WORD_HUNT_MIN_WORD_LENGTH) return null
  if (validWords.size > 0 && !validWords.has(normalized)) return null

  const target = normalized
  const visited = new Set<number>()
  const path: number[] = []

  function dfs(index: number, charIndex: number): boolean {
    const tile = letterAt(grid, index).toLowerCase()
    const remaining = target.slice(charIndex)
    if (!remaining.startsWith(tile)) return false

    const nextChar = charIndex + tile.length
    path.push(index)
    visited.add(index)

    if (nextChar === target.length) {
      return true
    }

    for (const [dr, dc] of NEIGHBORS) {
      const [row, col] = indexToRowCol(index)
      const nr = row + dr
      const nc = col + dc
      if (nr < 0 || nr >= WORD_HUNT_GRID_SIZE || nc < 0 || nc >= WORD_HUNT_GRID_SIZE) continue
      const nextIndex = rowColToIndex(nr, nc)
      if (visited.has(nextIndex)) continue
      if (dfs(nextIndex, nextChar)) return true
    }

    path.pop()
    visited.delete(index)
    return false
  }

  for (let start = 0; start < WORD_HUNT_GRID_SIZE * WORD_HUNT_GRID_SIZE; start++) {
    path.length = 0
    visited.clear()
    if (dfs(start, 0)) return [...path]
  }

  return null
}

export function canExtendWordHuntPath(
  grid: string[][],
  path: number[],
  nextIndex: number,
  validPrefixes: ReadonlySet<string>
): boolean {
  if (path.length === 0) return true
  const last = path[path.length - 1]
  if (!areWordHuntCellsAdjacent(last, nextIndex)) return false
  if (path.includes(nextIndex)) return false
  const candidate = [...path, nextIndex]
  const prefix = wordFromPath(grid, candidate)
  return isValidWordHuntPrefix(prefix, validPrefixes)
}
