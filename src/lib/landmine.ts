import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'
import { buildReviewerAssignments, syncCallerOrder } from '@/lib/npat'
import type {
  Game,
  LandmineAnswer,
  LandmineMark,
  LandmineMetadata,
  LandmineMode,
  LandmineOutcome,
  LandminePhase,
  Player,
  Round,
} from '@/types'

// Re-export the generic marking-ring helper so callers can import it from one place.
export { buildReviewerAssignments } from '@/lib/npat'

/** The single player this marker was assigned to review, from the round's ring. */
export function reviewTargetForMarker(metadata: LandmineMetadata | null, markerPlayerId: string): string | null {
  if (!metadata) return null
  return metadata.reviewer_assignments[markerPlayerId] ?? null
}

export type LandmineHostMode = 'spectator' | 'player'

function landmineHostModeKey(gameCode: string) {
  return `landmine-host-mode-${gameCode}`
}

export function getLandmineHostMode(gameCode: string): LandmineHostMode {
  if (typeof window === 'undefined') return 'player'
  return localStorage.getItem(landmineHostModeKey(gameCode)) === 'spectator' ? 'spectator' : 'player'
}

export function setLandmineHostMode(gameCode: string, mode: LandmineHostMode) {
  if (typeof window === 'undefined') return
  localStorage.setItem(landmineHostModeKey(gameCode), mode)
}

export const LANDMINE_MIN_PLAYERS = 3
export const LANDMINE_MAX_PLAYERS = 20
export const LANDMINE_DEFAULT_MAX_PLAYERS = 20

export const LANDMINE_DEFAULT_WRITING_TIMER = 45
export const LANDMINE_DEFAULT_MARKING_TIMER = 45
export const LANDMINE_DEFAULT_CATEGORY_TIMER = 10
export const LANDMINE_REVEAL_SECONDS = 10

export const LANDMINE_WRITING_TIMER_OPTIONS = [30, 45, 60, 90] as const
export const LANDMINE_MARKING_TIMER_OPTIONS = [20, 30, 45, 60] as const
// The caller picks fast — the room is waiting on them. Capped at 10s.
export const LANDMINE_CATEGORY_TIMER_OPTIONS = [5, 10] as const

export const LANDMINE_VALID_POINTS = 10
export const LANDMINE_ORIGINALITY_BONUS = 5
export const LANDMINE_MAX_ANSWER_LENGTH = 80

export const LANDMINE_DEFAULT_MODE: LandmineMode = 'zero_points'
export const LANDMINE_DEFAULT_MINE_COUNT = 1
export const LANDMINE_MINE_COUNT_OPTIONS = [1, 2, 3] as const
export const LANDMINE_DEFAULT_ROUND_COUNT = 5
export const LANDMINE_ROUND_COUNT_OPTIONS = [3, 5, 8, 10] as const

export function clampLandmineMaxPlayers(n: number): number {
  return Math.min(Math.max(Math.floor(n), LANDMINE_MIN_PLAYERS), LANDMINE_MAX_PLAYERS)
}

export function clampLandmineWritingTimer(seconds: number | undefined | null): number {
  const n = Number(seconds)
  return (LANDMINE_WRITING_TIMER_OPTIONS as readonly number[]).includes(n) ? n : LANDMINE_DEFAULT_WRITING_TIMER
}

export function clampLandmineMarkingTimer(seconds: number | undefined | null): number {
  const n = Number(seconds)
  return (LANDMINE_MARKING_TIMER_OPTIONS as readonly number[]).includes(n) ? n : LANDMINE_DEFAULT_MARKING_TIMER
}

export function clampLandmineCategoryTimer(seconds: number | undefined | null): number {
  const n = Number(seconds)
  return (LANDMINE_CATEGORY_TIMER_OPTIONS as readonly number[]).includes(n) ? n : LANDMINE_DEFAULT_CATEGORY_TIMER
}

/** The caller's category-pick timer is stored in the shared game_duration_seconds column. */
export function gameLandmineCategoryTimer(game: Pick<Game, 'game_duration_seconds'>): number {
  return clampLandmineCategoryTimer(game.game_duration_seconds)
}

export function clampLandmineMineCount(n: number | undefined | null): number {
  const v = Number(n)
  return (LANDMINE_MINE_COUNT_OPTIONS as readonly number[]).includes(v) ? v : LANDMINE_DEFAULT_MINE_COUNT
}

export function clampLandmineRoundCount(n: number | undefined | null): number {
  const v = Number(n)
  return (LANDMINE_ROUND_COUNT_OPTIONS as readonly number[]).includes(v) ? v : LANDMINE_DEFAULT_ROUND_COUNT
}

export function parseLandmineMode(raw: unknown): LandmineMode {
  return raw === 'elimination' ? 'elimination' : 'zero_points'
}

export function normalizeAnswer(text: string | null | undefined): string {
  return (text ?? '').trim().toLowerCase()
}

export function shufflePlayerOrder<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

/**
 * Pick `count` mine words from a category pool. `entries` are ordered with the most
 * obvious answers first; we weight the draw toward the front so rounds actually land
 * (a random obscure mine nobody hits is a damp squib). Duplicates avoided.
 */
export function pickMines(entries: string[], count: number): string[] {
  const pool = entries.map((e) => e.trim()).filter(Boolean)
  if (pool.length === 0) return []
  const n = Math.min(Math.max(1, Math.floor(count)), pool.length)
  const chosen: string[] = []
  const remaining = [...pool]
  while (chosen.length < n && remaining.length > 0) {
    // Triangular-ish weighting: bias index toward 0 (the obvious answers) by taking
    // the min of two random draws.
    const a = Math.random() * remaining.length
    const b = Math.random() * remaining.length
    const idx = Math.floor(Math.min(a, b))
    const [word] = remaining.splice(idx, 1)
    if (word) chosen.push(word)
  }
  return chosen
}

export function parseLandmineMetadata(raw: unknown): LandmineMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  const phase = m.phase
  if (phase !== 'category_pick' && phase !== 'writing' && phase !== 'marking' && phase !== 'reveal') {
    return null
  }

  const assignments = m.reviewer_assignments
  const reviewer_assignments: Record<string, string> = {}
  if (assignments && typeof assignments === 'object') {
    for (const [k, v] of Object.entries(assignments as Record<string, unknown>)) {
      if (typeof v === 'string') reviewer_assignments[k] = v
    }
  }

  const caller_order = Array.isArray(m.caller_order)
    ? m.caller_order.filter((id): id is string => typeof id === 'string')
    : []

  const revealed_mines = Array.isArray(m.revealed_mines)
    ? m.revealed_mines.filter((w): w is string => typeof w === 'string')
    : undefined

  return {
    phase,
    phase_started_at: typeof m.phase_started_at === 'string' ? m.phase_started_at : null,
    category: typeof m.category === 'string' ? m.category : null,
    caller_order,
    caller_index: typeof m.caller_index === 'number' ? m.caller_index : 0,
    reviewer_assignments,
    revealed_mines,
    mine_count: typeof m.mine_count === 'number' ? m.mine_count : LANDMINE_DEFAULT_MINE_COUNT,
    scores_computed: m.scores_computed === true,
  }
}

export function roundPhase(metadata: LandmineMetadata | null): LandminePhase {
  return metadata?.phase ?? 'category_pick'
}

/** Who picks the category this round — the round's stored submitter, else the caller ring. */
export function roundCallerPlayerId(
  round: Pick<Round, 'submitter_player_id'>,
  metadata: LandmineMetadata | null
): string | null {
  if (round.submitter_player_id) return round.submitter_player_id
  if (!metadata?.caller_order.length) return null
  return metadata.caller_order[metadata.caller_index] ?? metadata.caller_order[0] ?? null
}

/** Prefer the in-progress active round over a stale game pointer. */
export function resolveActiveLandmineRound(rounds: Round[], currentRoundNumber: number): Round | null {
  const active = rounds.find((r) => r.status === 'active') ?? null
  if (active) {
    const meta = parseLandmineMetadata(active.landmine_metadata)
    if (meta && meta.phase !== 'reveal') return active
  }
  const byPointer = rounds.find((r) => r.round_number === currentRoundNumber) ?? null
  if (active && byPointer && active.id !== byPointer.id && byPointer.status === 'finished') return active
  if (byPointer?.status === 'finished') {
    const pendingNext = rounds.find((r) => r.status === 'pending' && r.round_number === byPointer.round_number + 1)
    if (pendingNext) return pendingNext
  }
  return byPointer ?? active
}

export function buildLandmineInitialRound(opts: {
  gameId: string
  playerOrder: string[]
  mineCount: number
  now: string
}): Record<string, unknown> {
  const assignments = buildReviewerAssignments(opts.playerOrder, 1)
  return {
    game_id: opts.gameId,
    round_number: 1,
    participant_ids: [],
    submitter_player_id: opts.playerOrder[0],
    status: 'active',
    started_at: opts.now,
    ended_at: null,
    landmine_metadata: {
      phase: 'category_pick' as LandminePhase,
      phase_started_at: opts.now,
      category: null,
      caller_order: opts.playerOrder,
      caller_index: 0,
      reviewer_assignments: assignments,
      mine_count: clampLandmineMineCount(opts.mineCount),
      scores_computed: false,
    } satisfies LandmineMetadata,
  }
}

export function buildLandmineNextRound(opts: {
  gameId: string
  roundNumber: number
  previousMetadata: LandmineMetadata
  previousCallerId: string | null
  playerIds: string[]
  mineCount: number
  now: string
}): Record<string, unknown> | null {
  const { caller_order, caller_index, caller_id } = syncCallerOrder(
    opts.previousMetadata.caller_order,
    opts.playerIds,
    opts.previousCallerId
  )
  if (opts.playerIds.length === 0 && caller_order.length === 0) return null

  const submitterId = caller_id || opts.playerIds[0] || caller_order[0]
  if (!submitterId) return null

  const callerIndex = caller_order.indexOf(submitterId)
  const reviewerIds = opts.playerIds.length > 0 ? opts.playerIds : caller_order

  return {
    game_id: opts.gameId,
    round_number: opts.roundNumber,
    participant_ids: [],
    submitter_player_id: submitterId,
    status: 'pending',
    started_at: null,
    ended_at: null,
    landmine_metadata: {
      phase: 'category_pick' as LandminePhase,
      phase_started_at: null,
      category: null,
      caller_order,
      caller_index: callerIndex >= 0 ? callerIndex : caller_index,
      reviewer_assignments: buildReviewerAssignments(reviewerIds, opts.roundNumber),
      mine_count: clampLandmineMineCount(opts.mineCount),
      scores_computed: false,
    } satisfies LandmineMetadata,
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** normalized answers given by >1 player (used for the originality bonus). */
export function duplicateAnswerSet(answers: Pick<LandmineAnswer, 'answer'>[]): Set<string> {
  const counts = new Map<string, number>()
  for (const row of answers) {
    const normalized = normalizeAnswer(row.answer)
    if (!normalized) continue
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }
  const dupes = new Set<string>()
  for (const [key, count] of counts) if (count > 1) dupes.add(key)
  return dupes
}

export type LandmineRoundResult = {
  player_id: string
  points: number
  outcome: LandmineOutcome
  mine_hit: boolean
  is_original: boolean
}

/**
 * Compute the per-player result for a round. Marking clamps: an empty answer is
 * always Void. A mine hit trumps everything except a Void (a voided answer can't
 * blow up — it simply scored nothing).
 */
export function computeRoundResults(
  answers: LandmineAnswer[],
  marks: LandmineMark[],
  mines: string[],
  opts: { originalityBonus: boolean }
): LandmineRoundResult[] {
  const mineSet = new Set(mines.map((m) => normalizeAnswer(m)))
  const dupes = duplicateAnswerSet(answers)
  const marksByTarget = new Map(marks.map((m) => [m.target_player_id, m]))

  return answers.map((answer) => {
    const normalized = normalizeAnswer(answer.answer)
    if (!normalized) {
      return { player_id: answer.player_id, points: 0, outcome: 'empty', mine_hit: false, is_original: false }
    }

    const peerMark = marksByTarget.get(answer.player_id)
    const markedValid = peerMark?.valid ?? true

    if (!markedValid) {
      return { player_id: answer.player_id, points: 0, outcome: 'void', mine_hit: false, is_original: false }
    }

    if (mineSet.has(normalized)) {
      return { player_id: answer.player_id, points: 0, outcome: 'mine', mine_hit: true, is_original: false }
    }

    const isOriginal = opts.originalityBonus && !dupes.has(normalized)
    const points = LANDMINE_VALID_POINTS + (isOriginal ? LANDMINE_ORIGINALITY_BONUS : 0)
    return {
      player_id: answer.player_id,
      points,
      outcome: isOriginal ? 'original' : 'valid',
      mine_hit: false,
      is_original: isOriginal,
    }
  })
}

export function tallyLandmineScores(
  answers: LandmineAnswer[],
  players: Player[]
): { id: string; name: string; score: number; eliminated: boolean }[] {
  const totals = new Map<string, number>()
  const lastSubmit = new Map<string, number>()
  for (const player of players) totals.set(player.id, 0)
  for (const row of answers) {
    if (row.points == null) continue
    totals.set(row.player_id, (totals.get(row.player_id) ?? 0) + (row.points ?? 0))
    if (row.submitted_at) {
      const when = new Date(row.submitted_at).getTime()
      if (when > (lastSubmit.get(row.player_id) ?? -Infinity)) lastSubmit.set(row.player_id, when)
    }
  }
  return players
    .map((p) => ({
      id: p.id,
      name: p.name,
      score: totals.get(p.id) ?? 0,
      eliminated: Boolean(p.is_eliminated),
    }))
    .sort(
      (a, b) =>
        Number(a.eliminated) - Number(b.eliminated) ||
        b.score - a.score ||
        (lastSubmit.get(a.id) ?? Infinity) - (lastSubmit.get(b.id) ?? Infinity) ||
        a.name.localeCompare(b.name)
    )
}

export function landmineWinnerLabel(leaderboard: { name: string; score: number; eliminated?: boolean }[]): string {
  const alive = leaderboard.filter((row) => !row.eliminated)
  const pool = alive.length > 0 ? alive : leaderboard
  if (pool.length === 0) return 'Game over'
  const topScore = pool[0].score
  const winners = pool.filter((row) => row.score === topScore)
  if (winners.length === 1) return `${winners[0].name} wins!`
  return `${winners.map((row) => row.name).join(' & ')} tie for first!`
}

export function playerDisplayName(playerId: string | null | undefined, players: Player[]): string {
  if (!playerId) return 'Someone'
  return players.find((p) => p.id === playerId)?.name ?? 'Someone'
}

// ---------------------------------------------------------------------------
// Phase timing
// ---------------------------------------------------------------------------

export function phaseDeadlineMs(
  metadata: LandmineMetadata,
  writingTimerSeconds: number,
  markingTimerSeconds: number,
  categoryTimerSeconds: number = LANDMINE_DEFAULT_CATEGORY_TIMER
): number | null {
  if (!metadata.phase_started_at) return null
  const start = new Date(metadata.phase_started_at).getTime()
  if (metadata.phase === 'category_pick') return start + categoryTimerSeconds * 1000
  if (metadata.phase === 'writing') return start + writingTimerSeconds * 1000
  if (metadata.phase === 'marking') return start + markingTimerSeconds * 1000
  return null
}

export function phaseSecondsLeft(
  metadata: LandmineMetadata,
  writingTimerSeconds: number,
  markingTimerSeconds: number,
  categoryTimerSeconds: number = LANDMINE_DEFAULT_CATEGORY_TIMER
): number | null {
  const deadline = phaseDeadlineMs(metadata, writingTimerSeconds, markingTimerSeconds, categoryTimerSeconds)
  if (deadline == null) return null
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

export function revealCountdownSeconds(
  endedAt: string | null | undefined,
  revealSeconds = LANDMINE_REVEAL_SECONDS
): number {
  if (!endedAt) return revealSeconds
  const deadline = new Date(endedAt).getTime() + revealSeconds * 1000
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

// ---------------------------------------------------------------------------
// Answer / mark payload helpers
// ---------------------------------------------------------------------------

export function trimLandmineAnswer(text: string): string {
  return (text ?? '').trim().slice(0, LANDMINE_MAX_ANSWER_LENGTH)
}

export async function ensureBlankAnswers(
  supabase: SupabaseClient,
  gameId: string,
  roundId: string,
  playerIds: string[]
): Promise<void> {
  const { data: existing } = await supabase.from('landmine_answers').select('player_id').eq('round_id', roundId)
  const have = new Set((existing ?? []).map((r) => r.player_id))
  const missing = playerIds.filter((id) => !have.has(id))
  if (missing.length === 0) return
  await supabase
    .from('landmine_answers')
    .insert(missing.map((playerId) => ({ game_id: gameId, round_id: roundId, player_id: playerId, answer: '' })))
}

export async function finalizeUnsubmittedAnswers(
  supabase: SupabaseClient,
  gameId: string,
  roundId: string,
  playerIds: string[]
): Promise<void> {
  await ensureBlankAnswers(supabase, gameId, roundId, playerIds)
  const now = new Date().toISOString()
  await supabase.from('landmine_answers').update({ submitted_at: now }).eq('round_id', roundId).is('submitted_at', null)
}

/**
 * Seed one mark row per marker at the start of the marking phase. Solo/no-peer
 * markers (assignment maps to themselves) are auto-marked valid and finalised; a
 * genuine empty target answer is auto-Void. Real peer marks are left open (null).
 */
export async function ensureDefaultMarks(
  supabase: SupabaseClient,
  gameId: string,
  round: Round,
  playerIds: string[]
): Promise<void> {
  const metadata = parseLandmineMetadata(round.landmine_metadata)
  if (!metadata) return
  const { data: answers } = await supabase.from('landmine_answers').select('player_id, answer').eq('round_id', round.id)
  const answersByPlayer = new Map((answers ?? []).map((a) => [a.player_id, a]))
  const { data: existing } = await supabase.from('landmine_marks').select('marker_player_id').eq('round_id', round.id)
  const have = new Set((existing ?? []).map((r) => r.marker_player_id))

  const now = new Date().toISOString()
  const inserts = playerIds
    .filter((id) => !have.has(id))
    .map((markerId) => {
      const assignedTarget = metadata.reviewer_assignments[markerId]
      const isSolo = !assignedTarget || assignedTarget === markerId
      const targetId = assignedTarget ?? markerId
      const targetAnswer = answersByPlayer.get(targetId)
      const hasText = Boolean(normalizeAnswer(targetAnswer?.answer))
      return {
        game_id: gameId,
        round_id: round.id,
        marker_player_id: markerId,
        target_player_id: targetId,
        // Empty answers are forced Void; solo markers auto-approve non-empty answers.
        valid: hasText,
        marked_at: isSolo || !hasText ? now : null,
      }
    })

  if (inserts.length > 0) await supabase.from('landmine_marks').insert(inserts)
}

export async function clearLandmineSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  // NOTE: landmine_round_mines is NOT cleared here. clearSessionTables deletes by `game_id`,
  // but that table is keyed only by `round_id` (no game_id column) — deleting by game_id 400s
  // and fails the whole play-again flow. Its rows cascade away when the game's rounds are
  // deleted (round_id REFERENCES rounds ON DELETE CASCADE), so no explicit clear is needed.
  return clearSessionTables(supabase, gameId, ['landmine_marks', 'landmine_answers'], {
    resetSpectators: true,
  })
}

export function landmineModeLabel(mode: LandmineMode | null | undefined): string {
  return parseLandmineMode(mode) === 'elimination' ? 'Elimination' : 'Zero Points'
}

/** Read the game's mode from its stored column, defaulting safely. */
export function gameLandmineMode(game: Pick<Game, 'landmine_mode'>): LandmineMode {
  return parseLandmineMode(game.landmine_mode)
}
