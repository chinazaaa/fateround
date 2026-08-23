import type { TriviaCategory, TriviaMetadata } from './types'

/**
 * Canonical trivia categories, in the order the create + lobby pickers show them.
 *
 * WHY THIS LIVES HERE. The list used to be copy-pasted into four pickers and, worse,
 * several READ sites collapsed it to a binary `=== 'tech' ? 'Tech' : 'General knowledge'`.
 * A host who picked Maths therefore saw "General knowledge" on the lobby chip and a
 * "General" pill preselected in the edit sheet — the stored value was right, every
 * display of it was wrong. One list, one label map, no second opinion.
 */
export const TRIVIA_CATEGORIES = [
  'general',
  'tech',
  'art',
  'food',
  'geography',
  'history',
  'language',
  'literature',
  'math',
  'movies',
  'music',
  'nature',
  'pop_culture',
  'science',
  'sports',
  'technology',
  'world_culture',
] as const satisfies readonly TriviaCategory[]

/** Short label for chips and pills. `general` is the everything bucket, not a topic. */
export const TRIVIA_CATEGORY_LABELS: Record<TriviaCategory, string> = {
  general: 'General knowledge',
  tech: 'Tech',
  art: 'Art',
  food: 'Food',
  geography: 'Geography',
  history: 'History',
  language: 'Language',
  literature: 'Literature',
  math: 'Math',
  movies: 'Movies',
  music: 'Music',
  nature: 'Nature',
  pop_culture: 'Pop Culture',
  science: 'Science',
  sports: 'Sports',
  technology: 'Technology',
  world_culture: 'World Culture',
}

/** Options for a category picker, in display order. */
export const TRIVIA_CATEGORY_OPTIONS: readonly { value: TriviaCategory; label: string }[] = TRIVIA_CATEGORIES.map(
  (value) => ({
    // The picker spells out what "general" draws from; chips use the short label.
    label: value === 'general' ? 'General (All Categories)' : TRIVIA_CATEGORY_LABELS[value],
    value,
  })
)

const VALID_TRIVIA_CATS: ReadonlySet<string> = new Set<string>(TRIVIA_CATEGORIES)

/** Whether this string is a category we know how to draw questions for. */
export function isTriviaCategory(value: unknown): value is TriviaCategory {
  return typeof value === 'string' && VALID_TRIVIA_CATS.has(value)
}

/** Display label for a stored category. Never returns the raw enum value. */
export function triviaCategoryLabel(category: string | null | undefined): string {
  return isTriviaCategory(category) ? TRIVIA_CATEGORY_LABELS[category] : TRIVIA_CATEGORY_LABELS.general
}

export function parseTriviaMetadata(raw: unknown): TriviaMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (typeof m.question !== 'string' || !Array.isArray(m.choices) || typeof m.correct_index !== 'number') {
    return null
  }
  const choices = m.choices.filter((c): c is string => typeof c === 'string')
  if (choices.length < 2 || choices.length > 4) return null
  const correctIndex = m.correct_index
  if (correctIndex < 0 || correctIndex >= choices.length) return null
  // Any of the 17 categories, not just tech/general: a Maths round used to come back
  // tagged 'general' and any UI reading metadata.category then mislabelled it.
  const category: TriviaCategory = isTriviaCategory(m.category) ? m.category : 'general'
  return { question: m.question, choices, correct_index: correctIndex, category }
}

export const TRIVIA_REVEAL_SECONDS = 5

export function revealCountdownSeconds(
  endedAt: string | null | undefined,
  revealSeconds = TRIVIA_REVEAL_SECONDS
): number {
  if (!endedAt) return revealSeconds
  const deadline = new Date(endedAt).getTime() + revealSeconds * 1000
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

export function formatTriviaChoiceLabel(index: number): string {
  return String.fromCharCode(65 + index)
}

export interface TriviaPlayerScore {
  id: string
  name: string
  score: number
  correctCount: number
  avgResponseMs: number
}

export function tallyTriviaPlayerScores(
  answers: Array<{ player_id: string; points: number; is_correct: boolean; response_ms?: number }>,
  players: Array<{ id: string; name: string; spectator?: boolean }>
): TriviaPlayerScore[] {
  const activePlayers = players.filter((p) => p.spectator !== true)
  const totals = new Map<string, { score: number; correct: number; totalMs: number; answerCount: number }>()
  for (const p of activePlayers) totals.set(p.id, { score: 0, correct: 0, totalMs: 0, answerCount: 0 })

  for (const a of answers) {
    const row = totals.get(a.player_id)
    if (!row) continue
    row.score += a.points
    row.answerCount += 1
    row.totalMs += a.response_ms ?? 0
    if (a.is_correct) row.correct += 1
  }

  return (
    activePlayers
      .map((p) => {
        const row = totals.get(p.id) ?? { score: 0, correct: 0, totalMs: 0, answerCount: 0 }
        return {
          id: p.id,
          name: p.name,
          score: row.score,
          correctCount: row.correct,
          avgResponseMs: row.answerCount > 0 ? Math.round(row.totalMs / row.answerCount) : 0,
        }
      })
      // Score first, then speed (lower average response wins), name only as the final
      // fallback — mirrors web src/lib/trivia.ts so both platforms pick the same winner.
      .sort((a, b) => b.score - a.score || a.avgResponseMs - b.avgResponseMs || a.name.localeCompare(b.name))
  )
}
