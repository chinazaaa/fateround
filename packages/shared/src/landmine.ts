// Landmine — shared (client-safe) engine subset. Pure read/compute helpers used by the
// mobile player view. Server-authoritative writes live in the web app's src/lib/landmine*.
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
} from './types'

export const LANDMINE_MIN_PLAYERS = 3
export const LANDMINE_MAX_PLAYERS = 20
export const LANDMINE_DEFAULT_MAX_PLAYERS = 20

export const LANDMINE_DEFAULT_WRITING_TIMER = 45
export const LANDMINE_DEFAULT_MARKING_TIMER = 45
export const LANDMINE_CATEGORY_PICK_SECONDS = 15
export const LANDMINE_HOST_REVIEW_SECONDS = 45
export const LANDMINE_REVEAL_SECONDS = 10

export const LANDMINE_WRITING_TIMER_OPTIONS = [30, 45, 60, 90] as const
export const LANDMINE_MARKING_TIMER_OPTIONS = [30, 45, 60] as const

export const LANDMINE_VALID_POINTS = 10
export const LANDMINE_ORIGINALITY_BONUS = 5
export const LANDMINE_MAX_ANSWER_LENGTH = 80

export const LANDMINE_DEFAULT_MINE_COUNT = 1
export const LANDMINE_MINE_COUNT_OPTIONS = [1, 2, 3] as const
export const LANDMINE_DEFAULT_ROUND_COUNT = 5
export const LANDMINE_ROUND_COUNT_OPTIONS = [3, 5, 8, 10] as const

export function parseLandmineMode(raw: unknown): LandmineMode {
  return raw === 'elimination' ? 'elimination' : 'zero_points'
}

export function gameLandmineMode(game: Pick<Game, 'landmine_mode'>): LandmineMode {
  return parseLandmineMode(game.landmine_mode)
}

export function landmineModeLabel(mode: LandmineMode | null | undefined): string {
  return parseLandmineMode(mode) === 'elimination' ? 'Elimination' : 'Zero Points'
}

export function clampLandmineWritingTimer(seconds: number | undefined | null): number {
  const n = Number(seconds)
  return (LANDMINE_WRITING_TIMER_OPTIONS as readonly number[]).includes(n) ? n : LANDMINE_DEFAULT_WRITING_TIMER
}

export function clampLandmineMarkingTimer(seconds: number | undefined | null): number {
  const n = Number(seconds)
  return (LANDMINE_MARKING_TIMER_OPTIONS as readonly number[]).includes(n) ? n : LANDMINE_DEFAULT_MARKING_TIMER
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
    phase !== 'host_review' &&
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
  const host_overrides: LandmineMetadata['host_overrides'] = {}
  if (m.host_overrides && typeof m.host_overrides === 'object') {
    for (const [pid, v] of Object.entries(m.host_overrides as Record<string, unknown>)) {
      if (typeof v === 'boolean') host_overrides[pid] = v
    }
  }
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
    host_overrides: Object.keys(host_overrides).length > 0 ? host_overrides : undefined,
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
  markingTimerSeconds: number
): number | null {
  if (!metadata.phase_started_at) return null
  const start = new Date(metadata.phase_started_at).getTime()
  if (metadata.phase === 'category_pick') return start + LANDMINE_CATEGORY_PICK_SECONDS * 1000
  if (metadata.phase === 'writing') return start + writingTimerSeconds * 1000
  if (metadata.phase === 'marking') return start + markingTimerSeconds * 1000
  if (metadata.phase === 'host_review') return start + LANDMINE_HOST_REVIEW_SECONDS * 1000
  return null
}

export function phaseSecondsLeft(
  metadata: LandmineMetadata,
  writingTimerSeconds: number,
  markingTimerSeconds: number
): number | null {
  const deadline = phaseDeadlineMs(metadata, writingTimerSeconds, markingTimerSeconds)
  if (deadline == null) return null
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

export function playerDisplayName(playerId: string | null | undefined, players: Player[]): string {
  if (!playerId) return 'Someone'
  return players.find((p) => p.id === playerId)?.name ?? 'Someone'
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
  return `+${points ?? 0}${isOriginal ? ' ⭐' : ''}`
}
