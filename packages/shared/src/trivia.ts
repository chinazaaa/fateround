export function parseTriviaMetadata(raw: unknown): import('./types').TriviaMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (typeof m.question !== 'string' || !Array.isArray(m.choices) || typeof m.correct_index !== 'number') {
    return null
  }
  const choices = m.choices.filter((c): c is string => typeof c === 'string')
  if (choices.length < 2 || choices.length > 4) return null
  const correctIndex = m.correct_index
  if (correctIndex < 0 || correctIndex >= choices.length) return null
  const category = m.category === 'tech' || m.category === 'general' ? m.category : 'general'
  return { question: m.question, choices, correct_index: correctIndex, category }
}
