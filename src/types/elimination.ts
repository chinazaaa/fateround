export interface EliminationConfig {
  mode: 'per-round' | 'lives'
  rule?: 'bottom-n' | 'score-threshold'
  eliminateCount?: number
  threshold?: number
  startingLives?: number
  livesLostRule?: 'bottom-n'
}

export interface EliminationEvent {
  id: string
  game_id: string
  player_id: string
  round_number: number | null
  reason: 'bottom-n' | 'score-threshold' | 'no-lives'
  eliminated_at: string
}

export const ELIMINATION_COMPATIBLE_TYPES = ['trivia', 'i_call_on', 'two_truths'] as const
