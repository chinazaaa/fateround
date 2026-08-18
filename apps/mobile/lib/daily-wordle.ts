/**
 * Wordle client-side grading — mobile mirror of the pure grading section of
 * `src/lib/daily-wordle.ts`. Only the functions the play surface needs are
 * duplicated (grading, key-best-state, normalize); everything to do with the
 * word bank and puzzle generation stays on the server.
 *
 * Same duplicate-letter rules as web — the server re-grades on submit and is
 * authoritative for scoring either way, but keeping this in lockstep lets the
 * mobile player see the same feedback web players see.
 */

export type WordleLetterState = 'correct' | 'present' | 'absent'

export function normalizeWordleWord(word: string): string {
  return word.trim().toLowerCase().replace(/[^a-z]/g, '')
}

export function gradeWordleGuess(guess: string, target: string): WordleLetterState[] {
  const g = normalizeWordleWord(guess)
  const t = normalizeWordleWord(target)
  const length = t.length
  const states: WordleLetterState[] = new Array(length).fill('absent')
  if (g.length !== length) return states

  const remaining = new Map<string, number>()
  for (const ch of t) remaining.set(ch, (remaining.get(ch) ?? 0) + 1)

  for (let i = 0; i < length; i++) {
    if (g[i] === t[i]) {
      states[i] = 'correct'
      remaining.set(g[i], (remaining.get(g[i]) ?? 0) - 1)
    }
  }
  for (let i = 0; i < length; i++) {
    if (states[i] === 'correct') continue
    const ch = g[i]
    const left = remaining.get(ch) ?? 0
    if (left > 0) {
      states[i] = 'present'
      remaining.set(ch, left - 1)
    }
  }
  return states
}

const STATE_PRIORITY: Record<WordleLetterState, number> = { correct: 3, present: 2, absent: 1 }

export function wordleKeyBestStates(
  guesses: readonly string[],
  target: string
): Map<string, WordleLetterState> {
  const best = new Map<string, WordleLetterState>()
  for (const guess of guesses) {
    const states = gradeWordleGuess(guess, target)
    const norm = normalizeWordleWord(guess)
    for (let i = 0; i < states.length; i++) {
      const ch = norm[i]
      if (!ch) continue
      const current = best.get(ch)
      if (!current || STATE_PRIORITY[states[i]!] > STATE_PRIORITY[current]) {
        best.set(ch, states[i]!)
      }
    }
  }
  return best
}
