// Landmine — shared (client-safe) engine subset. Pure read/compute helpers used by the
// mobile player view. Server-authoritative writes live in the web app's src/lib/landmine*.
import type {
  Game,
  LandmineAnswer,
  LandmineMark,
  LandmineMetadata,
  LandmineMineSource,
  LandmineMode,
  LandmineOutcome,
  LandminePhase,
  Player,
  Round,
} from './types'

export const LANDMINE_MIN_PLAYERS = 3
export const LANDMINE_MAX_PLAYERS = 20
export const LANDMINE_DEFAULT_MAX_PLAYERS = 20

export const LANDMINE_DEFAULT_WRITING_TIMER = 45
export const LANDMINE_DEFAULT_MARKING_TIMER = 45
export const LANDMINE_DEFAULT_CATEGORY_TIMER = 10
export const LANDMINE_REVEAL_SECONDS = 10
// After peer marking, the reviewer gets a fixed window to check/override every verdict before
// scores reveal (mirrors I Call On's caller review). Manual mode's setter planted the mine and is
// engaged, so they get the longer window; the auto-mode host is just spot-checking, so it's short.
export const LANDMINE_REVIEW_SECONDS = 45
export const LANDMINE_AUTO_REVIEW_SECONDS = 20
export const LANDMINE_REVIEW_TIMER_OPTIONS = [15, 20, 30, 45, 60] as const

export const LANDMINE_WRITING_TIMER_OPTIONS = [30, 45, 60, 90] as const
export const LANDMINE_MARKING_TIMER_OPTIONS = [20, 30, 45, 60] as const
export const LANDMINE_CATEGORY_TIMER_OPTIONS = [5, 10, 15, 30] as const

export const LANDMINE_VALID_POINTS = 10
export const LANDMINE_ORIGINALITY_BONUS = 5
export const LANDMINE_MAX_ANSWER_LENGTH = 80

export const LANDMINE_DEFAULT_MINE_COUNT = 1
export const LANDMINE_MINE_COUNT_OPTIONS = [1, 2, 3] as const
export const LANDMINE_DEFAULT_ROUND_COUNT = 5
export const LANDMINE_ROUND_COUNT_OPTIONS = [3, 5, 8, 10] as const
// Manual mode counts a "round" as one full cycle (every player sets once).
export const LANDMINE_DEFAULT_MANUAL_CYCLES = 1
export const LANDMINE_MANUAL_CYCLE_OPTIONS = [1, 2, 3, 5] as const

export function parseLandmineMode(raw: unknown): LandmineMode {
  return raw === 'elimination' ? 'elimination' : 'zero_points'
}

export function gameLandmineMode(game: Pick<Game, 'landmine_mode'>): LandmineMode {
  return parseLandmineMode(game.landmine_mode)
}

export function landmineModeLabel(mode: LandmineMode | null | undefined): string {
  return parseLandmineMode(mode) === 'elimination' ? 'Elimination' : 'Zero Points'
}

export function parseLandmineMineSource(raw: unknown): LandmineMineSource {
  return raw === 'manual' ? 'manual' : 'system'
}

export function gameLandmineMineSource(game: Pick<Game, 'landmine_mine_source'>): LandmineMineSource {
  return parseLandmineMineSource(game.landmine_mine_source)
}

export function landmineMineSourceLabel(source: LandmineMineSource | null | undefined): string {
  return parseLandmineMineSource(source) === 'manual' ? 'Manual' : 'Auto'
}

/** Whether the review-before-reveal phase runs. Off (false) scores straight from peer marking. */
export function landmineReviewEnabled(game: Pick<Game, 'landmine_review'>): boolean {
  return game.landmine_review !== false
}

/** The default review window when the host hasn't set one — by mode. */
export function landmineDefaultReviewSeconds(game: Pick<Game, 'landmine_mine_source'>): number {
  return gameLandmineMineSource(game) === 'manual' ? LANDMINE_REVIEW_SECONDS : LANDMINE_AUTO_REVIEW_SECONDS
}

/** The host-chosen review window (clamped to the options); falls back to the mode default. */
export function landmineReviewSeconds(game: Pick<Game, 'landmine_mine_source' | 'landmine_review_seconds'>): number {
  const v = Number(game.landmine_review_seconds)
  return (LANDMINE_REVIEW_TIMER_OPTIONS as readonly number[]).includes(v) ? v : landmineDefaultReviewSeconds(game)
}

export const LANDMINE_DEFAULT_ELIM_SECONDS = 300
export const LANDMINE_ELIM_SECONDS_OPTIONS = [180, 300, 600, 900] as const

export function clampLandmineElimSeconds(seconds: number | undefined | null): number {
  const n = Number(seconds)
  return (LANDMINE_ELIM_SECONDS_OPTIONS as readonly number[]).includes(n) ? n : LANDMINE_DEFAULT_ELIM_SECONDS
}

export function gameLandmineElimSeconds(game: Pick<Game, 'landmine_elim_seconds'>): number {
  return clampLandmineElimSeconds(game.landmine_elim_seconds)
}

/**
 * Manual mode counts a "round" as one full cycle (every player takes their setter turn). Internally
 * each setter-turn is its own round row, so the displayed round is the cycle: ceil(turn / roster).
 */
export function landmineCycleInfo(
  roundNumber: number,
  roster: number
): { round: number; setterInRound: number; roster: number } {
  const n = Math.max(1, roster)
  return {
    round: Math.max(1, Math.ceil(roundNumber / n)),
    setterInRound: ((Math.max(1, roundNumber) - 1) % n) + 1,
    roster: n,
  }
}

/** The players who answer + peer-mark this round (manual mode excludes the sitting-out setter). */
export function landmineAnsweringPlayerIds(playerIds: string[], setterId: string | null, manual: boolean): string[] {
  if (!manual || !setterId) return playerIds
  return playerIds.filter((id) => id !== setterId)
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

export function gameLandmineCategoryTimer(game: Pick<Game, 'game_duration_seconds'>): number {
  return clampLandmineCategoryTimer(game.game_duration_seconds)
}

export function normalizeAnswer(text: string | null | undefined): string {
  return (text ?? '').trim().toLowerCase()
}

export function trimLandmineAnswer(text: string): string {
  return (text ?? '').trim().slice(0, LANDMINE_MAX_ANSWER_LENGTH)
}

export function parseLandmineMetadata(raw: unknown): LandmineMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  const phase = m.phase
  if (
    phase !== 'category_pick' &&
    phase !== 'writing' &&
    phase !== 'marking' &&
    phase !== 'review' &&
    phase !== 'reveal'
  ) {
    return null
  }
  const reviewer_assignments: Record<string, string> = {}
  if (m.reviewer_assignments && typeof m.reviewer_assignments === 'object') {
    for (const [k, v] of Object.entries(m.reviewer_assignments as Record<string, unknown>)) {
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
    phase: phase as LandminePhase,
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

export function roundCallerPlayerId(
  round: Pick<Round, 'submitter_player_id'>,
  metadata: LandmineMetadata | null
): string | null {
  if (round.submitter_player_id) return round.submitter_player_id
  if (!metadata?.caller_order.length) return null
  return metadata.caller_order[metadata.caller_index] ?? metadata.caller_order[0] ?? null
}

export function reviewTargetForMarker(metadata: LandmineMetadata | null, markerPlayerId: string): string | null {
  if (!metadata) return null
  return metadata.reviewer_assignments[markerPlayerId] ?? null
}

/**
 * Whether this player is part of the CURRENT round's answer/mark ring. The ring
 * (`caller_order` + `reviewer_assignments`) is frozen when the round is built, so a player who
 * joins mid-round — as a late player or a viewer — isn't in it. Such a player has no answer to
 * write and nobody assigned to mark, so dropping them onto the writing/marking UI reads as a
 * frozen "mark this" screen they can't complete. Use this to route them to a watch/wait view
 * until the next round folds them in.
 */
export function isLandmineRoundParticipant(
  metadata: LandmineMetadata | null,
  playerId: string | null | undefined
): boolean {
  if (!metadata || !playerId) return false
  return (
    metadata.caller_order.includes(playerId) ||
    Object.prototype.hasOwnProperty.call(metadata.reviewer_assignments, playerId)
  )
}

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

export function phaseDeadlineMs(
  metadata: LandmineMetadata,
  writingTimerSeconds: number,
  markingTimerSeconds: number,
  categoryTimerSeconds: number = LANDMINE_DEFAULT_CATEGORY_TIMER,
  reviewTimerSeconds: number = LANDMINE_REVIEW_SECONDS
): number | null {
  if (!metadata.phase_started_at) return null
  const start = new Date(metadata.phase_started_at).getTime()
  if (metadata.phase === 'category_pick') return start + categoryTimerSeconds * 1000
  if (metadata.phase === 'writing') return start + writingTimerSeconds * 1000
  if (metadata.phase === 'marking') return start + markingTimerSeconds * 1000
  if (metadata.phase === 'review') return start + reviewTimerSeconds * 1000
  return null
}

export function phaseSecondsLeft(
  metadata: LandmineMetadata,
  writingTimerSeconds: number,
  markingTimerSeconds: number,
  categoryTimerSeconds: number = LANDMINE_DEFAULT_CATEGORY_TIMER,
  reviewTimerSeconds: number = LANDMINE_REVIEW_SECONDS
): number | null {
  const deadline = phaseDeadlineMs(
    metadata,
    writingTimerSeconds,
    markingTimerSeconds,
    categoryTimerSeconds,
    reviewTimerSeconds
  )
  if (deadline == null) return null
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

export function playerDisplayName(playerId: string | null | undefined, players: Player[]): string {
  if (!playerId) return 'Someone'
  return players.find((p) => p.id === playerId)?.name ?? 'Someone'
}

/** Seconds left in the post-round reveal window before the next round starts. */
export function revealCountdownSeconds(
  endedAt: string | null | undefined,
  revealSeconds = LANDMINE_REVEAL_SECONDS
): number {
  if (!endedAt) return revealSeconds
  const deadline = new Date(endedAt).getTime() + revealSeconds * 1000
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

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
    .map((p) => ({ id: p.id, name: p.name, score: totals.get(p.id) ?? 0, eliminated: Boolean(p.is_eliminated) }))
    .sort(
      (a, b) =>
        Number(a.eliminated) - Number(b.eliminated) ||
        b.score - a.score ||
        (lastSubmit.get(a.id) ?? Infinity) - (lastSubmit.get(b.id) ?? Infinity) ||
        a.name.localeCompare(b.name)
    )
}

export function landmineOutcomeLabel(
  outcome: LandmineOutcome | null,
  points: number | null,
  isOriginal: boolean | null
): string {
  if (outcome === 'mine') return '💥 Mine'
  if (outcome === 'void') return 'Void · 0'
  if (outcome === 'empty') return '— · 0'
  if (outcome === 'setter') return `Setter · +${points ?? 0}`
  return `+${points ?? 0}${isOriginal ? ' ⭐' : ''}`
}
