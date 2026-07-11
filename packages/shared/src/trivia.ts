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
}

export function tallyTriviaPlayerScores(
  answers: Array<{ player_id: string; points: number; is_correct: boolean }>,
  players: Array<{ id: string; name: string; spectator?: boolean }>
): TriviaPlayerScore[] {
  const activePlayers = players.filter((p) => p.spectator !== true)
  const totals = new Map<string, { score: number; correct: number }>()
  for (const p of activePlayers) totals.set(p.id, { score: 0, correct: 0 })

  for (const a of answers) {
    const row = totals.get(a.player_id)
    if (!row) continue
    row.score += a.points
    if (a.is_correct) row.correct += 1
  }

  return activePlayers
    .map((p) => {
      const row = totals.get(p.id) ?? { score: 0, correct: 0 }
      return { id: p.id, name: p.name, score: row.score, correctCount: row.correct }
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}
