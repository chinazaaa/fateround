import type { Player, Round, TtlGuess, TtlMetadata } from './types'

export const TTL_MIN_PLAYERS = 3
export const TTL_MAX_PLAYERS = 40
export const TTL_DEFAULT_MAX_PLAYERS = 20
export const TTL_DEFAULT_TIMER = 45
export const TTL_TIMER_OPTIONS = [10, 15, 30, 45, 60, 90] as const
export const TTL_REVEAL_SECONDS = 5
export const TTL_GUESS_POINTS = 100
export const TTL_FOOL_POINTS = 50
export const TTL_MAX_STATEMENT_LENGTH = 200

export function parseTtlMetadata(raw: unknown): TtlMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (!Array.isArray(m.statements) || typeof m.lie_index !== 'number') return null
  const statements = m.statements.filter((s): s is string => typeof s === 'string')
  if (statements.length !== 3) return null
  const lie_index = m.lie_index
  if (lie_index < 0 || lie_index > 2) return null
  return { statements: statements as [string, string, string], lie_index }
}

export function revealCountdownSeconds(endedAt: string | null | undefined, revealSeconds = TTL_REVEAL_SECONDS): number {
  if (!endedAt) return revealSeconds
  const deadline = new Date(endedAt).getTime() + revealSeconds * 1000
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

export function formatTtlChoiceLabel(index: number): string {
  return String.fromCharCode(65 + index)
}

export interface TtlPlayerScore {
  id: string
  name: string
  score: number
  correctGuesses: number
  fooledCount: number
}

export function tallyTtlScores(guesses: TtlGuess[], players: Player[], rounds: Round[]): TtlPlayerScore[] {
  const activePlayers = players.filter((p) => p.spectator !== true)
  const totals = new Map<string, { score: number; correct: number; fooled: number }>()
  for (const p of activePlayers) {
    totals.set(p.id, { score: 0, correct: 0, fooled: 0 })
  }

  for (const g of guesses) {
    const row = totals.get(g.player_id)
    if (!row) continue
    row.score += g.points
    if (g.is_correct) row.correct += 1
  }

  for (const round of rounds) {
    const submitterId = round.submitter_player_id
    if (!submitterId) continue
    const roundGuesses = guesses.filter((g) => g.round_id === round.id)
    const fooled = roundGuesses.filter((g) => !g.is_correct).length
    const row = totals.get(submitterId)
    if (row) {
      row.fooled += fooled
      row.score += fooled * TTL_FOOL_POINTS
    }
  }

  return activePlayers
    .map((p) => {
      const row = totals.get(p.id) ?? { score: 0, correct: 0, fooled: 0 }
      return {
        id: p.id,
        name: p.name,
        score: row.score,
        correctGuesses: row.correct,
        fooledCount: row.fooled,
      }
    })
    .sort((a, b) => b.score - a.score || b.correctGuesses - a.correctGuesses || a.name.localeCompare(b.name))
}

export function playerDisplayName(playerId: string | null | undefined, players: Player[]): string {
  if (!playerId) return 'Someone'
  return players.find((p) => p.id === playerId)?.name ?? 'Someone'
}
