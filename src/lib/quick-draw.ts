import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'
import type {
  QuickDrawAssignment,
  QuickDrawDrawing,
  QuickDrawDrawingStrokeData,
  QuickDrawSession,
  QuickDrawTitle,
  QuickDrawVote,
  Player,
  Round,
} from '@/types'
import { quickDrawPromptKey, quickDrawUsageFromPrompts, type QuickDrawPrompt } from '@/lib/quick-draw-prompts'

export const QUICK_DRAW_MIN_PLAYERS = 3
export const QUICK_DRAW_MAX_PLAYERS = 8
export const QUICK_DRAW_DEFAULT_MAX_PLAYERS = 8
export const QUICK_DRAW_DEFAULT_ROUNDS = 3
export const QUICK_DRAW_MIN_ROUNDS = 2
export const QUICK_DRAW_MAX_ROUNDS = 5
export const QUICK_DRAW_DEFAULT_DRAW_TIMER = 90
export const QUICK_DRAW_DEFAULT_TITLE_TIMER = 45
export const QUICK_DRAW_DEFAULT_VOTE_TIMER = 20
export const QUICK_DRAW_DRAW_TIMER_OPTIONS = [60, 75, 90, 120] as const
export const QUICK_DRAW_TITLE_TIMER_OPTIONS = [30, 45, 60, 90] as const
export const QUICK_DRAW_VOTE_TIMER_OPTIONS = [15, 20, 30, 45] as const
export const QUICK_DRAW_REVEAL_SECONDS = 5
export const QUICK_DRAW_MAX_TITLE_LENGTH = 80
export const QUICK_DRAW_MAX_STROKES = 200
export const QUICK_DRAW_MAX_POINTS_PER_STROKE = 500

export type QuickDrawVariant = 'lie' | 'guess'

export function clampQuickDrawVariant(value: unknown): QuickDrawVariant {
  return value === 'guess' ? 'guess' : 'lie'
}

export function isQuickDrawGuessVariant(variant: unknown): boolean {
  return clampQuickDrawVariant(variant) === 'guess'
}

export type QuickDrawPhase = QuickDrawSession['phase']
export type QuickDrawHostMode = 'spectator' | 'player'

function quickDrawHostModeKey(gameCode: string) {
  return `quick-draw-host-mode-${gameCode.toUpperCase()}`
}

export function getQuickDrawHostMode(gameCode: string): QuickDrawHostMode {
  if (typeof window === 'undefined') return 'player'
  return localStorage.getItem(quickDrawHostModeKey(gameCode)) === 'spectator' ? 'spectator' : 'player'
}

export function setQuickDrawHostMode(gameCode: string, mode: QuickDrawHostMode) {
  if (typeof window === 'undefined') return
  localStorage.setItem(quickDrawHostModeKey(gameCode), mode)
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function clampQuickDrawMaxPlayers(n: number): number {
  return Math.min(Math.max(Math.floor(n), QUICK_DRAW_MIN_PLAYERS), QUICK_DRAW_MAX_PLAYERS)
}

export function clampQuickDrawDrawTimer(seconds: number | undefined | null): number {
  const n = Number(seconds)
  return (QUICK_DRAW_DRAW_TIMER_OPTIONS as readonly number[]).includes(n) ? n : QUICK_DRAW_DEFAULT_DRAW_TIMER
}

export function clampQuickDrawTitleTimer(seconds: number | undefined | null): number {
  const n = Number(seconds)
  return (QUICK_DRAW_TITLE_TIMER_OPTIONS as readonly number[]).includes(n) ? n : QUICK_DRAW_DEFAULT_TITLE_TIMER
}

export function clampQuickDrawVoteTimer(seconds: number | undefined | null): number {
  const n = Number(seconds)
  return (QUICK_DRAW_VOTE_TIMER_OPTIONS as readonly number[]).includes(n) ? n : QUICK_DRAW_DEFAULT_VOTE_TIMER
}

export function clampQuickDrawRounds(n: number | undefined | null): number {
  const v = Math.floor(Number(n) || QUICK_DRAW_DEFAULT_ROUNDS)
  return Math.min(Math.max(v, QUICK_DRAW_MIN_ROUNDS), QUICK_DRAW_MAX_ROUNDS)
}

export function buildQuickDrawRoundRows(opts: {
  gameId: string
  roundCount: number
  now: string
}): Omit<Round, 'id'>[] {
  return Array.from({ length: opts.roundCount }, (_, index) => ({
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
    quick_draw_metadata: { round_number: index + 1 },
  }))
}

export function buildQuickDrawAssignmentRows(opts: {
  gameId: string
  rounds: { id: string; round_number: number }[]
  playerIds: string[]
  prompts: QuickDrawPrompt[]
}): { game_id: string; round_id: string; player_id: string; prompt: string }[] {
  const rows: { game_id: string; round_id: string; player_id: string; prompt: string }[] = []
  let promptIndex = 0
  for (const round of opts.rounds) {
    for (const playerId of opts.playerIds) {
      const prompt = opts.prompts[promptIndex]
      if (!prompt) break
      rows.push({
        game_id: opts.gameId,
        round_id: round.id,
        player_id: playerId,
        prompt: prompt.prompt,
      })
      promptIndex += 1
    }
  }
  return rows
}

export function revealCountdownSeconds(
  endedAt: string | null | undefined,
  revealSeconds = QUICK_DRAW_REVEAL_SECONDS
): number {
  if (!endedAt) return revealSeconds
  const deadline = new Date(endedAt).getTime() + revealSeconds * 1000
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

export function phaseDeadlineCountdown(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

export function playerDisplayName(playerId: string | null | undefined, players: Player[]): string {
  if (!playerId) return 'Someone'
  return players.find((p) => p.id === playerId)?.name ?? 'Someone'
}

export function drawingsForRound(drawings: QuickDrawDrawing[], roundId: string): QuickDrawDrawing[] {
  return drawings
    .filter((d) => d.round_id === roundId)
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at) || a.id.localeCompare(b.id))
}

export function orderedRoundDrawings(
  drawings: QuickDrawDrawing[],
  roundId: string,
  players: Pick<Player, 'id' | 'name'>[]
): QuickDrawDrawing[] {
  const roundDrawings = drawingsForRound(drawings, roundId)
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  return [...roundDrawings].sort(
    (a, b) =>
      (nameById.get(a.player_id) ?? '').localeCompare(nameById.get(b.player_id) ?? '') || a.id.localeCompare(b.id)
  )
}

export function activeDrawingForSession(
  drawings: QuickDrawDrawing[],
  roundId: string,
  players: Pick<Player, 'id' | 'name'>[],
  drawingIndex: number
): QuickDrawDrawing | null {
  const ordered = orderedRoundDrawings(drawings, roundId, players)
  return ordered[drawingIndex] ?? null
}

export function titlesForDrawing(titles: QuickDrawTitle[], drawingId: string): QuickDrawTitle[] {
  return titles.filter((t) => t.drawing_id === drawingId)
}

export function votesForDrawing(votes: QuickDrawVote[], drawingId: string): QuickDrawVote[] {
  return votes.filter((v) => v.drawing_id === drawingId)
}

export function assignmentForPlayer(
  assignments: QuickDrawAssignment[],
  roundId: string,
  playerId: string
): QuickDrawAssignment | null {
  return assignments.find((a) => a.round_id === roundId && a.player_id === playerId) ?? null
}

export function playerIsDrawingArtist(drawing: QuickDrawDrawing | null, playerId: string): boolean {
  return !!drawing && drawing.player_id === playerId
}

export function canPlayerSubmitFakeTitle(
  drawing: QuickDrawDrawing | null,
  playerId: string,
  opts?: { spectator?: boolean; readOnly?: boolean }
): boolean {
  if (opts?.spectator || opts?.readOnly) return false
  if (!drawing) return false
  return drawing.player_id !== playerId
}

export function canPlayerVoteOnDrawing(
  drawing: QuickDrawDrawing | null,
  playerId: string,
  opts?: { spectator?: boolean; readOnly?: boolean }
): boolean {
  if (opts?.spectator || opts?.readOnly) return false
  if (!drawing) return false
  return drawing.player_id !== playerId
}

/** Non-artist active players expected to submit a fake title. */
export function eligibleTitleSubmitters(participantCount: number): number {
  return Math.max(0, participantCount - 1)
}

/** Non-artist active players expected to vote. */
export function eligibleDrawingVoters(participantCount: number): number {
  return Math.max(0, participantCount - 1)
}

export function shuffledTitleOptions(titles: QuickDrawTitle[]): QuickDrawTitle[] {
  return shuffle(titles)
}

export function validateStrokeData(raw: unknown): QuickDrawDrawingStrokeData | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  if (!Array.isArray(data.strokes)) return null

  const width = typeof data.width === 'number' ? data.width : 400
  const height = typeof data.height === 'number' ? data.height : 300
  const strokes: QuickDrawDrawingStrokeData['strokes'] = []

  for (const stroke of data.strokes.slice(0, QUICK_DRAW_MAX_STROKES)) {
    if (!stroke || typeof stroke !== 'object') continue
    const s = stroke as Record<string, unknown>
    if (!Array.isArray(s.points)) continue
    const points: [number, number][] = []
    for (const pt of s.points.slice(0, QUICK_DRAW_MAX_POINTS_PER_STROKE)) {
      if (!Array.isArray(pt) || pt.length < 2) continue
      const x = Number(pt[0])
      const y = Number(pt[1])
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      points.push([x, y])
    }
    if (points.length < 2) continue
    strokes.push({
      color: typeof s.color === 'string' ? s.color.slice(0, 20) : '#000000',
      width: typeof s.width === 'number' ? Math.min(Math.max(s.width, 1), 20) : 3,
      points,
      ...(s.tool === 'eraser' ? { tool: 'eraser' as const } : {}),
    })
  }

  return strokes.length > 0 ? { width, height, strokes } : null
}

export interface QuickDrawPlayerScore {
  id: string
  name: string
  score: number
  foolCount: number
}

export function tallyQuickDrawScores(
  titles: QuickDrawTitle[],
  votes: QuickDrawVote[],
  drawings: QuickDrawDrawing[],
  players: Player[]
): QuickDrawPlayerScore[] {
  const activePlayers = players.filter((p) => p.spectator !== true)
  const totals = new Map<string, { score: number; fools: number }>()
  for (const p of activePlayers) {
    totals.set(p.id, { score: 0, fools: 0 })
  }

  const titleById = new Map(titles.map((t) => [t.id, t]))
  const drawingById = new Map(drawings.map((d) => [d.id, d]))

  const votesByTitle = new Map<string, number>()
  for (const vote of votes) {
    votesByTitle.set(vote.chosen_title_id, (votesByTitle.get(vote.chosen_title_id) ?? 0) + 1)
  }

  for (const [titleId, voteCount] of votesByTitle) {
    const title = titleById.get(titleId)
    if (!title || voteCount <= 0) continue

    if (title.is_real) {
      const drawing = drawingById.get(title.drawing_id)
      if (!drawing) continue
      const artistRow = totals.get(drawing.player_id)
      if (artistRow) artistRow.score += voteCount
    } else if (title.player_id) {
      const authorRow = totals.get(title.player_id)
      if (authorRow) {
        authorRow.score += voteCount
        authorRow.fools += voteCount
      }
    }
  }

  // Bonus: voters who picked the real title
  for (const vote of votes) {
    const title = titleById.get(vote.chosen_title_id)
    if (!title?.is_real) continue
    const voterRow = totals.get(vote.player_id)
    if (voterRow) voterRow.score += 1
  }

  return activePlayers
    .map((p) => {
      const row = totals.get(p.id) ?? { score: 0, fools: 0 }
      return { id: p.id, name: p.name, score: row.score, foolCount: row.fools }
    })
    .sort((a, b) => b.score - a.score || b.foolCount - a.foolCount || a.name.localeCompare(b.name))
}

export function quickDrawTitlingHint(opts: {
  canSubmit: boolean
  hasSubmitted: boolean
  cannotParticipate: boolean
  isArtist: boolean
}): string {
  if (opts.cannotParticipate) return 'Watch the room write fake titles for this drawing.'
  if (opts.isArtist) return "That's your drawing — sit tight while everyone else writes fake titles."
  if (opts.hasSubmitted) return 'Title locked in — waiting for everyone else…'
  if (opts.canSubmit) return 'Write a convincing fake title — try to fool the room!'
  return 'Waiting for titles…'
}

export function quickDrawVotingHint(opts: {
  canVote: boolean
  hasVoted: boolean
  cannotParticipate: boolean
  isArtist: boolean
}): string {
  if (opts.cannotParticipate) return 'Watch the room vote on which title is real.'
  if (opts.isArtist) return "That's your drawing — you already know the real title."
  if (opts.hasVoted) return 'Vote locked in — waiting for everyone else…'
  if (opts.canVote) return 'Pick the title you think is the real prompt.'
  return 'Waiting for votes…'
}

export { quickDrawUsageFromPrompts, quickDrawPromptKey }
export type { QuickDrawPrompt }

export async function clearQuickDrawSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null; poolUsage?: Record<string, unknown> }> {
  const { clearQuickDrawGuessSessionData } = await import('@/lib/quick-draw-guess')
  const guessClear = await clearQuickDrawGuessSessionData(supabase, gameId)
  if (guessClear.error) return { error: guessClear.error }

  const lieClear = await clearSessionTables(supabase, gameId, [
    'quick_draw_votes',
    'quick_draw_titles',
    'quick_draw_drawings',
    'quick_draw_assignments',
    'quick_draw_sessions',
  ])
  if (lieClear.error) return lieClear
  return guessClear.poolUsage ? { error: null, poolUsage: guessClear.poolUsage } : { error: null }
}
