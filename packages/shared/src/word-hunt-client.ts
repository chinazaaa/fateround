import { WORD_HUNT_MIN_WORD_LENGTH, areWordHuntCellsAdjacent, isValidPath, letterAt, wordFromPath } from './word-hunt'

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

export function toggleWordHuntPath(path: number[], cellIndex: number): number[] {
  if (path.length === 0) return [cellIndex]
  const last = path[path.length - 1]!
  if (last === cellIndex) return path.slice(0, -1)
  if (path.includes(cellIndex)) return path
  if (!areWordHuntCellsAdjacent(last, cellIndex)) return [cellIndex]
  return [...path, cellIndex]
}

export { letterAt, wordFromPath }
