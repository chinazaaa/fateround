// Deterministic word hash shared by the server (to build the client-safe validation set) and the
// client (to check a traced word) for Daily Word Hunt.
//
// Why hash: the client needs to reject non-words in-play, but shipping the full valid-word list
// would let a player read every answer off the network and max the leaderboard. Hashes let the
// client test membership without being able to enumerate the words. The server remains the scoring
// authority regardless (it re-checks against the real valid_words on submit).
//
// Pure (no fs / Node APIs) so it is safe to import from client components.

/** FNV-1a → 8-char hex. Case-insensitive (words are lowercased first). */
export function hashWord(word: string): string {
  const w = word.trim().toLowerCase()
  let hash = 0x811c9dc5
  for (let i = 0; i < w.length; i++) {
    hash ^= w.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
