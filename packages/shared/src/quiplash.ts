import type {
  Player,
  QuiplashAnswer,
  QuiplashBattle,
  QuiplashMetadata,
  QuiplashSession,
  QuiplashVote,
  Round,
} from './types'

export type QuiplashPrompt = string | { prompt: string }

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
  players: Player[],
  votes: QuiplashVote[] = []
): QuiplashPlayerScore[] {
  const roundVotes = votes.filter((v) => v.round_id)
  if (roundVotes.length > 0) {
    return tallyQuiplashScoresFromRoundVotes(roundVotes, answers, players)
  }

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

/** Each vote in a round awards one point to the answer's author. */
export function tallyQuiplashScoresFromRoundVotes(
  votes: QuiplashVote[],
  answers: QuiplashAnswer[],
  players: Player[]
): QuiplashPlayerScore[] {
  const answerToPlayer = new Map(answers.map((a) => [a.id, a.player_id]))
  const activePlayers = players.filter((p) => p.spectator !== true)
  const totals = new Map<string, { score: number; wins: number }>()
  for (const p of activePlayers) {
    totals.set(p.id, { score: 0, wins: 0 })
  }

  const votesByAnswer = new Map<string, number>()
  for (const vote of votes) {
    if (!vote.round_id) continue
    votesByAnswer.set(vote.chosen_answer_id, (votesByAnswer.get(vote.chosen_answer_id) ?? 0) + 1)
  }

  let maxVotes = 0
  for (const count of votesByAnswer.values()) {
    maxVotes = Math.max(maxVotes, count)
  }

  for (const [answerId, count] of votesByAnswer) {
    const authorId = answerToPlayer.get(answerId)
    if (!authorId) continue
    const row = totals.get(authorId)
    if (!row) continue
    row.score += count
    if (count > 0 && count === maxVotes) row.wins += 1
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
  return [battle.answer_a_id, battle.answer_b_id].map((id) => byId.get(id)).filter((id): id is string => !!id)
}

export function playerIsBattleContestant(battle: QuiplashBattle, answers: QuiplashAnswer[], playerId: string): boolean {
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

export function battlesForRound(battles: QuiplashBattle[], roundId: string): QuiplashBattle[] {
  return battles.filter((b) => b.round_id === roundId).sort((a, b) => a.battle_number - b.battle_number)
}

/** Answers a player may vote for — everyone else's submissions, shuffled for anonymity. */
export function roundVoteOptions(roundAnswers: QuiplashAnswer[], playerId: string): QuiplashAnswer[] {
  const others = roundAnswers.filter((a) => a.player_id !== playerId)
  return shuffle(others)
}

export function playerHasRoundVoteOption(roundAnswers: QuiplashAnswer[], playerId: string): boolean {
  return roundAnswers.some((a) => a.player_id !== playerId)
}

export function canPlayerVoteInRound(
  roundAnswers: QuiplashAnswer[],
  playerId: string,
  opts?: { spectator?: boolean; readOnly?: boolean }
): boolean {
  if (opts?.spectator || opts?.readOnly) return false
  return playerHasRoundVoteOption(roundAnswers, playerId)
}

/** Players expected to cast a round vote (submitters with only their own answer sit out). */
export function eligibleRoundVoters(roundAnswers: QuiplashAnswer[], participantCount: number): number {
  if (roundAnswers.length === 0) return 0
  if (roundAnswers.length === 1) return Math.max(0, participantCount - 1)
  return participantCount
}

export function quiplashRoundVotingHint(opts: {
  canVote: boolean
  hasVoted: boolean
  cannotParticipate: boolean
  answerCount: number
}): string {
  if (opts.cannotParticipate) return 'Watch the room vote — answers stay anonymous until results.'
  if (opts.answerCount < 2) return 'Waiting for results…'
  if (opts.hasVoted) return 'Vote locked in — waiting for everyone else…'
  if (opts.canVote) return 'Tap the funniest answer — you won’t see who wrote what until results.'
  return 'Waiting for voting…'
}

export interface QuiplashRoundVoteTally {
  answerId: string
  votes: number
}

/** Vote counts per answer for a round. */
export function countVotesForRound(roundId: string, votes: QuiplashVote[]): QuiplashRoundVoteTally[] {
  const counts = new Map<string, number>()
  for (const vote of votes) {
    if (vote.round_id !== roundId) continue
    counts.set(vote.chosen_answer_id, (counts.get(vote.chosen_answer_id) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([answerId, voteCount]) => ({ answerId, votes: voteCount }))
    .sort((a, b) => b.votes - a.votes || a.answerId.localeCompare(b.answerId))
}
