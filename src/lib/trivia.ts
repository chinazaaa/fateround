import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'
import type { Player, Round, TriviaAnswer, TriviaCategory, TriviaMetadata, TriviaQuestion } from '@/types'
import { triviaQuestionKey } from '@/lib/trivia-questions'

export const TRIVIA_MIN_PLAYERS = 2
export const TRIVIA_MAX_PLAYERS = 40
export const TRIVIA_DEFAULT_MAX_PLAYERS = 30
export const TRIVIA_DEFAULT_ROUNDS = 10
export const TRIVIA_DEFAULT_TIMER = 10
export const TRIVIA_TIMER_OPTIONS = [10, 15, 30, 60] as const
export const TRIVIA_MIN_ROUNDS = 3
export const TRIVIA_MAX_ROUNDS = 25
export const TRIVIA_REVEAL_SECONDS = 5

export type TriviaHostMode = 'spectator' | 'player'

function triviaHostModeKey(gameCode: string) {
  return `trivia-host-mode-${gameCode.toUpperCase()}`
}

export function getTriviaHostMode(gameCode: string): TriviaHostMode {
  if (typeof window === 'undefined') return 'spectator'
  return localStorage.getItem(triviaHostModeKey(gameCode)) === 'player' ? 'player' : 'spectator'
}

export function setTriviaHostMode(gameCode: string, mode: TriviaHostMode) {
  if (typeof window === 'undefined') return
  localStorage.setItem(triviaHostModeKey(gameCode), mode)
}

export function revealCountdownSeconds(
  endedAt: string | null | undefined,
  revealSeconds = TRIVIA_REVEAL_SECONDS
): number {
  if (!endedAt) return revealSeconds
  const deadline = new Date(endedAt).getTime() + revealSeconds * 1000
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

const BASE_POINTS = 300
const MAX_SPEED_BONUS = 500
const FIRST_CORRECT_BONUS = 200

export function clampTriviaMaxPlayers(n: number): number {
  return Math.min(Math.max(Math.floor(n), TRIVIA_MIN_PLAYERS), TRIVIA_MAX_PLAYERS)
}

export function clampTriviaTimer(seconds: number | undefined | null): number {
  const n = Number(seconds)
  return (TRIVIA_TIMER_OPTIONS as readonly number[]).includes(n) ? n : TRIVIA_DEFAULT_TIMER
}

export function isTriviaRound(round: { trivia_metadata?: unknown | null }): boolean {
  return round.trivia_metadata != null
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
  const category = m.category === 'tech' || m.category === 'general' ? m.category : 'general'
  return { question: m.question, choices, correct_index: correctIndex, category }
}

export function buildTriviaMetadata(question: TriviaQuestion): TriviaMetadata {
  return {
    question: question.question,
    choices: question.choices,
    correct_index: question.correctIndex,
    category: question.category,
  }
}

export function buildRoundsFromTriviaQuestions(opts: {
  gameId: string
  questions: TriviaQuestion[]
  now: string
}): Omit<Round, 'id'>[] {
  return opts.questions.map((q, index) => ({
    game_id: opts.gameId,
    round_number: index + 1,
    participant_ids: [],
    wyr_option_a: null,
    wyr_option_b: null,
    mlt_question: null,
    submitter_player_id: null,
    quote_text: null,
    quote_author_participant_id: null,
    quote_submitted_at: null,
    status: index === 0 ? 'active' : 'pending',
    started_at: index === 0 ? opts.now : null,
    ended_at: null,
    trivia_metadata: buildTriviaMetadata(q),
  }))
}

export function computeTriviaPoints(opts: {
  isCorrect: boolean
  responseMs: number
  timerMs: number
  isFirstCorrect: boolean
}): number {
  if (!opts.isCorrect) return 0
  const timerMs = Math.max(opts.timerMs, 1000)
  const ratio = Math.max(0, Math.min(1, 1 - opts.responseMs / timerMs))
  const speedBonus = Math.floor(MAX_SPEED_BONUS * ratio)
  const firstBonus = opts.isFirstCorrect ? FIRST_CORRECT_BONUS : 0
  return BASE_POINTS + speedBonus + firstBonus
}

export interface TriviaPlayerScore {
  id: string
  name: string
  score: number
  correctCount: number
  avgResponseMs: number
}

export function tallyTriviaPlayerScores(answers: TriviaAnswer[], players: Player[]): TriviaPlayerScore[] {
  const activePlayers = players.filter((p) => p.spectator !== true)
  const totals = new Map<string, { score: number; correct: number; totalMs: number; answerCount: number }>()
  for (const p of activePlayers) {
    totals.set(p.id, { score: 0, correct: 0, totalMs: 0, answerCount: 0 })
  }

  for (const a of answers) {
    const row = totals.get(a.player_id)
    if (!row) continue
    row.score += a.points
    row.answerCount += 1
    row.totalMs += a.response_ms
    if (a.is_correct) row.correct += 1
  }

  return activePlayers
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
    .sort((a, b) => b.score - a.score || a.avgResponseMs - b.avgResponseMs || a.name.localeCompare(b.name))
}

export function triviaUsageFromQuestions(questions: TriviaQuestion[]): Record<string, number> {
  const usage: Record<string, number> = {}
  for (const q of questions) {
    const key = triviaQuestionKey(q)
    usage[key] = (usage[key] ?? 0) + 1
  }
  return usage
}

export function formatTriviaChoiceLabel(index: number): string {
  return String.fromCharCode(65 + index)
}

export function triviaCategoryFromGame(game: { trivia_category?: string | null }): TriviaCategory {
  return game.trivia_category === 'tech' ? 'tech' : 'general'
}

export async function clearTriviaSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['trivia_answers'])
}
