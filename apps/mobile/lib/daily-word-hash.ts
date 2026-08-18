/**
 * Deterministic word hash — mobile mirror of `src/lib/daily-word-hash.ts`.
 * Kept identical (byte-for-byte output) so a client-side guess accepted here
 * matches what the server signed into the puzzle payload.
 */

export function hashWord(word: string): string {
  const w = word.trim().toLowerCase()
  let hash = 0x811c9dc5
  for (let i = 0; i < w.length; i++) {
    hash ^= w.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
