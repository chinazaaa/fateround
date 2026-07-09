import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'
import type {
  Player,
  QuiplashAnswer,
  QuiplashBattle,
  QuiplashMetadata,
  QuiplashSession,
  QuiplashVote,
  Round,
} from '@/types'
import { quiplashPromptKey, quiplashUsageFromPrompts, type QuiplashPrompt } from '@/lib/quiplash-prompts'

export const QUIPLASH_MIN_PLAYERS = 3
export const QUIPLASH_MAX_PLAYERS = 6
export const QUIPLASH_DEFAULT_MAX_PLAYERS = 6
export const QUIPLASH_DEFAULT_ROUNDS = 3
export const QUIPLASH_MIN_ROUNDS = 3
export const QUIPLASH_MAX_ROUNDS = 5
export const QUIPLASH_DEFAULT_SUBMIT_TIMER = 60
export const QUIPLASH_DEFAULT_VOTE_TIMER = 15
export const QUIPLASH_SUBMIT_TIMER_OPTIONS = [30, 45, 60, 90] as const
export const QUIPLASH_VOTE_TIMER_OPTIONS = [10, 15, 20, 30] as const
export const QUIPLASH_REVEAL_SECONDS = 4
export const QUIPLASH_MAX_ANSWER_LENGTH = 120

export type QuiplashPhase = QuiplashSession['phase']
export type QuiplashHostMode = 'spectator' | 'player'

function quiplashHostModeKey(gameCode: string) {
  return `quiplash-host-mode-${gameCode.toUpperCase()}`
}

export function getQuiplashHostMode(gameCode: string): QuiplashHostMode {
  if (typeof window === 'undefined') return 'player'
  return localStorage.getItem(quiplashHostModeKey(gameCode)) === 'spectator' ? 'spectator' : 'player'
}

export function setQuiplashHostMode(gameCode: string, mode: QuiplashHostMode) {
  if (typeof window === 'undefined') return
  localStorage.setItem(quiplashHostModeKey(gameCode), mode)
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function clampQuiplashMaxPlayers(n: number): number {
  return Math.min(Math.max(Math.floor(n), QUIPLASH_MIN_PLAYERS), QUIPLASH_MAX_PLAYERS)
}

export function clampQuiplashSubmitTimer(seconds: number | undefined | null): number {
  const n = Number(seconds)
  return (QUIPLASH_SUBMIT_TIMER_OPTIONS as readonly number[]).includes(n) ? n : QUIPLASH_DEFAULT_SUBMIT_TIMER
}

export function clampQuiplashVoteTimer(seconds: number | undefined | null): number {
  const n = Number(seconds)
  return (QUIPLASH_VOTE_TIMER_OPTIONS as readonly number[]).includes(n) ? n : QUIPLASH_DEFAULT_VOTE_TIMER
}

export function clampQuiplashRounds(n: number | undefined | null): number {
  const v = Math.floor(Number(n) || QUIPLASH_DEFAULT_ROUNDS)
  return Math.min(Math.max(v, QUIPLASH_MIN_ROUNDS), QUIPLASH_MAX_ROUNDS)
}

export function parseQuiplashMetadata(raw: unknown): QuiplashMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (typeof m.prompt !== 'string' || !m.prompt.trim()) return null
  return { prompt: m.prompt.trim() }
}

export function buildQuiplashMetadata(prompt: QuiplashPrompt | string): QuiplashMetadata {
  const text = typeof prompt === 'string' ? prompt : prompt.prompt
  return { prompt: text.trim() }
}

export function buildQuiplashRoundRows(opts: {
  gameId: string
  prompts: QuiplashPrompt[]
  now: string
}): Omit<Round, 'id'>[] {
  return opts.prompts.map((prompt, index) => ({
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
    quiplash_metadata: buildQuiplashMetadata(prompt),
  }))
}

export function revealCountdownSeconds(
  endedAt: string | null | undefined,
  revealSeconds = QUIPLASH_REVEAL_SECONDS
): number {
  if (!endedAt) return revealSeconds
  const deadline = new Date(endedAt).getTime() + revealSeconds * 1000
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

export function phaseDeadlineCountdown(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

export interface QuiplashPlayerScore {
  id: string
  name: string
  score: number
  battleWins: number
}

export function tallyQuiplashScores(
  battles: QuiplashBattle[],
  answers: QuiplashAnswer[],
  players: Player[]
): QuiplashPlayerScore[] {
  const answerToPlayer = new Map(answers.map((a) => [a.id, a.player_id]))
  const activePlayers = players.filter((p) => p.spectator !== true)
  const totals = new Map<string, { score: number; wins: number }>()
  for (const p of activePlayers) {
    totals.set(p.id, { score: 0, wins: 0 })
  }

  for (const battle of battles) {
    if (battle.status !== 'finished' || !battle.winner_answer_id) continue
    const authorId = answerToPlayer.get(battle.winner_answer_id)
    if (!authorId) continue
    const row = totals.get(authorId)
    if (!row) continue
    row.score += battle.points_awarded > 0 ? battle.points_awarded : 0
    row.wins += 1
  }

  return activePlayers
    .map((p) => {
      const row = totals.get(p.id) ?? { score: 0, wins: 0 }
      return { id: p.id, name: p.name, score: row.score, battleWins: row.wins }
    })
    .sort((a, b) => b.score - a.score || b.battleWins - a.battleWins || a.name.localeCompare(b.name))
}

export function playerDisplayName(playerId: string | null | undefined, players: Player[]): string {
  if (!playerId) return 'Someone'
  return players.find((p) => p.id === playerId)?.name ?? 'Someone'
}

export function answerAuthorName(
  answerId: string | null | undefined,
  answers: QuiplashAnswer[],
  players: Player[]
): string {
  if (!answerId) return 'Someone'
  const answer = answers.find((a) => a.id === answerId)
  if (!answer) return 'Someone'
  return playerDisplayName(answer.player_id, players)
}

/** Player ids whose answers are competing in this battle (usually two). */
export function battleContestantPlayerIds(battle: QuiplashBattle, answers: QuiplashAnswer[]): string[] {
  const byId = new Map(answers.map((a) => [a.id, a.player_id]))
  return [battle.answer_a_id, battle.answer_b_id]
    .map((id) => byId.get(id))
    .filter((id): id is string => !!id)
}

export function playerIsBattleContestant(
  battle: QuiplashBattle,
  answers: QuiplashAnswer[],
  playerId: string
): boolean {
  return battleContestantPlayerIds(battle, answers).includes(playerId)
}

/** Audience size that can vote on this battle — contestants sit out. */
export function eligibleVotersForBattle(
  battle: QuiplashBattle,
  answers: QuiplashAnswer[],
  participantCount: number
): number {
  const contestants = new Set(battleContestantPlayerIds(battle, answers))
  return Math.max(0, participantCount - contestants.size)
}

export function canPlayerVoteInBattle(
  battle: QuiplashBattle,
  answers: QuiplashAnswer[],
  playerId: string,
  opts?: { spectator?: boolean; readOnly?: boolean }
): boolean {
  if (opts?.spectator || opts?.readOnly) return false
  return !playerIsBattleContestant(battle, answers, playerId)
}

export function isSoloRoundBattle(battle: QuiplashBattle): boolean {
  return battle.answer_a_id === battle.answer_b_id
}

export function isNoVoterDrawBattle(battle: QuiplashBattle, battleVotes: QuiplashVote[]): boolean {
  return (
    battle.status === 'finished' &&
    !battle.winner_answer_id &&
    battle.points_awarded === 0 &&
    battleVotes.length === 0 &&
    !isSoloRoundBattle(battle)
  )
}

export function soloRoundPoints(participantCount: number): number {
  return Math.max(1, participantCount - 1)
}

export function answerOptionLabel(index: number): string {
  return String.fromCharCode(65 + index)
}

/** The two answers competing in the active battle (deduped). */
export function battleVoteOptions(battle: QuiplashBattle, answers: QuiplashAnswer[]): QuiplashAnswer[] {
  const byId = new Map(answers.map((a) => [a.id, a]))
  const seen = new Set<string>()
  return [battle.answer_a_id, battle.answer_b_id]
    .map((id) => byId.get(id))
    .filter((answer): answer is QuiplashAnswer => {
      if (!answer || seen.has(answer.id)) return false
      seen.add(answer.id)
      return true
    })
}

function pairKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`
}

/** Every possible head-to-head pairing for n submitters. */
export function quiplashPairCount(submitterCount: number): number {
  const n = Math.floor(submitterCount)
  if (n < 2) return 0
  return (n * (n - 1)) / 2
}

/**
 * Battle cap per round — small groups run every pairing; larger groups cap battles
 * so voting stays fun while still covering every answer at least once.
 */
export function maxBattlesPerRound(submitterCount: number): number {
  const all = quiplashPairCount(submitterCount)
  if (all === 0) return 0
  if (submitterCount <= 4) return all
  if (submitterCount === 5) return all
  if (submitterCount === 6) return Math.min(all, 12)
  if (submitterCount === 7) return Math.min(all, 14)
  return Math.min(all, 16)
}

/** Shorter vote windows when a round has many battles to get through. */
export function effectiveQuiplashVoteTimer(configuredSeconds: number | null | undefined, participantCount: number): number {
  const configured = clampQuiplashVoteTimer(configuredSeconds)
  if (participantCount <= 5) return configured
  if (participantCount <= 6) return Math.min(configured, 12)
  return Math.min(configured, 10)
}

function selectBattlesWithCoverage(answerIds: string[], cap: number): { aId: string; bId: string }[] {
  if (answerIds.length < 2 || cap <= 0) return []

  const appearanceCount = new Map<string, number>()
  for (const id of answerIds) appearanceCount.set(id, 0)

  const usedPairs = new Set<string>()
  const selected: { aId: string; bId: string }[] = []

  const addPair = (aId: string, bId: string): boolean => {
    const key = pairKey(aId, bId)
    if (usedPairs.has(key)) return false
    usedPairs.add(key)
    selected.push({ aId, bId })
    appearanceCount.set(aId, (appearanceCount.get(aId) ?? 0) + 1)
    appearanceCount.set(bId, (appearanceCount.get(bId) ?? 0) + 1)
    return true
  }

  // Phase 1 — disjoint pairs so every answer is in at least one battle.
  const unmatched = shuffle(answerIds)
  while (unmatched.length >= 2) {
    addPair(unmatched.pop()!, unmatched.pop()!)
  }
  if (unmatched.length === 1) {
    const lone = unmatched[0]!
    const partner = [...answerIds]
      .filter((id) => id !== lone)
      .sort((a, b) => (appearanceCount.get(a) ?? 0) - (appearanceCount.get(b) ?? 0))[0]
    if (partner) addPair(lone, partner)
  }

  // Phase 2 — add pairings up to the cap, favouring answers with fewer appearances.
  while (selected.length < cap) {
    let best: { aId: string; bId: string; score: number } | null = null
    for (let i = 0; i < answerIds.length; i += 1) {
      for (let j = i + 1; j < answerIds.length; j += 1) {
        const aId = answerIds[i]!
        const bId = answerIds[j]!
        if (usedPairs.has(pairKey(aId, bId))) continue
        const score = (appearanceCount.get(aId) ?? 0) + (appearanceCount.get(bId) ?? 0)
        if (!best || score < best.score || (score === best.score && Math.random() < 0.5)) {
          best = { aId, bId, score }
        }
      }
    }
    if (!best) break
    addPair(best.aId, best.bId)
  }

  return selected
}

/** Answers shown while watching — spectators see everyone; players see everyone but themselves. */
export function roundAnswersVisibleToPlayer(
  roundAnswers: QuiplashAnswer[],
  opts: { playerId: string; spectator?: boolean }
): QuiplashAnswer[] {
  if (opts.spectator) return roundAnswers
  return roundAnswers.filter((answer) => answer.player_id !== opts.playerId)
}

/** Head-to-head pairings for a round — capped for large groups, full round-robin for small ones. */
export function partitionBattles(answerIds: string[]): {
  pairs: { aId: string; bId: string }[]
  byeId: string | null
} {
  if (answerIds.length < 2) {
    return { pairs: [], byeId: answerIds[0] ?? null }
  }

  const shuffled = shuffle(answerIds)
  const cap = maxBattlesPerRound(shuffled.length)
  const allPairCount = quiplashPairCount(shuffled.length)

  if (allPairCount <= cap) {
    const pairs: { aId: string; bId: string }[] = []
    for (let i = 0; i < shuffled.length; i += 1) {
      for (let j = i + 1; j < shuffled.length; j += 1) {
        pairs.push({ aId: shuffled[i]!, bId: shuffled[j]! })
      }
    }
    return { pairs: shuffle(pairs), byeId: null }
  }

  return { pairs: shuffle(selectBattlesWithCoverage(shuffled, cap)), byeId: null }
}

export { quiplashUsageFromPrompts } from '@/lib/quiplash-prompts'

export async function createQuiplashBattlesForRound(
  supabase: SupabaseClient,
  gameId: string,
  roundId: string,
  answers: QuiplashAnswer[]
): Promise<{ battles: QuiplashBattle[]; byeId: string | null }> {
  const answerIds = answers.map((a) => a.id)
  const { pairs } = partitionBattles(answerIds)

  const rows = pairs.map((pair, index) => ({
    game_id: gameId,
    round_id: roundId,
    battle_number: index + 1,
    answer_a_id: pair.aId,
    answer_b_id: pair.bId,
    status: 'pending' as const,
  }))

  const { data, error } = await supabase.from('quiplash_battles').insert(rows).select('*')
  if (error) throw new Error(error.message)
  return { battles: (data ?? []) as QuiplashBattle[], byeId: null }
}

export async function clearQuiplashSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, [
    'quiplash_votes',
    'quiplash_battles',
    'quiplash_answers',
    'quiplash_sessions',
  ])
}

export function countVotesForBattle(
  battle: QuiplashBattle,
  votes: QuiplashVote[]
): { votesA: number; votesB: number; winnerId: string | null; points: number } {
  const battleVotes = votes.filter((v) => v.battle_id === battle.id)
  const votesA = battleVotes.filter((v) => v.chosen_answer_id === battle.answer_a_id).length
  const votesB = battleVotes.filter((v) => v.chosen_answer_id === battle.answer_b_id).length
  if (votesA > votesB) return { votesA, votesB, winnerId: battle.answer_a_id, points: votesA }
  if (votesB > votesA) return { votesA, votesB, winnerId: battle.answer_b_id, points: votesB }
  // Tie — no points (Quiplash-style: audience must pick a winner)
  return { votesA, votesB, winnerId: null, points: 0 }
}
