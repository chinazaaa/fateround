import type {
  Game,
  NpatAnswer,
  NpatCategory,
  NpatMark,
  NpatMetadata,
  Player,
  Round,
} from './types'

function secondsUntilDeadline(sessionStartedAt: string, durationSeconds: number): number {
  return Math.max(0, Math.ceil((new Date(sessionStartedAt).getTime() + durationSeconds * 1000 - Date.now()) / 1000))
}

export const NPAT_MIN_PLAYERS = 3
export const NPAT_MAX_PLAYERS = 20
export const NPAT_DEFAULT_MAX_PLAYERS = 20
export const NPAT_DEFAULT_TIMER = 60
export const NPAT_DEFAULT_MARKING_TIMER = 45
export const NPAT_LETTER_PICK_SECONDS = 15
export const NPAT_REVEAL_SECONDS = 8
export const NPAT_CALLER_REVIEW_SECONDS = 45
export const NPAT_CATEGORY_POINTS = 10
export const NPAT_DUPLICATE_POINTS = 5
export const NPAT_MAX_ANSWER_LENGTH = 80

export const NPAT_TIMER_OPTIONS = [30, 45, 60, 90] as const
export const NPAT_MARKING_TIMER_OPTIONS = [30, 45, 60] as const
export const NPAT_MAX_LETTERS = 26
export const NPAT_DEFAULT_GAME_DURATION = 0
export const NPAT_GAME_DURATION_OPTIONS = [0, 600, 900, 1200, 1800, 2700, 3600] as const

export const NPAT_CATEGORIES: NpatCategory[] = ['name', 'animal', 'place', 'thing', 'food']

export const NPAT_CATEGORY_LABELS: Record<NpatCategory, string> = {
  name: 'Name',
  animal: 'Animal',
  place: 'Place',
  thing: 'Thing',
  food: 'Food',
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function clampNpatMaxPlayers(n: number): number {
  return Math.min(Math.max(Math.floor(n), NPAT_MIN_PLAYERS), NPAT_MAX_PLAYERS)
}

export function clampNpatTimer(seconds: number | undefined | null): number {
  const n = Number(seconds)
  return (NPAT_TIMER_OPTIONS as readonly number[]).includes(n) ? n : NPAT_DEFAULT_TIMER
}

export function clampNpatMarkingTimer(seconds: number | undefined | null): number {
  const n = Number(seconds)
  return (NPAT_MARKING_TIMER_OPTIONS as readonly number[]).includes(n) ? n : NPAT_DEFAULT_MARKING_TIMER
}

export function clampNpatGameDuration(raw: unknown): number {
  const n = Number(raw ?? NPAT_DEFAULT_GAME_DURATION)
  return (NPAT_GAME_DURATION_OPTIONS as readonly number[]).includes(n) ? n : NPAT_DEFAULT_GAME_DURATION
}

export function formatNpatGameDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return 'All 26 letters'
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 === 1 ? '' : 's'}`
  return `${Math.round(seconds / 60)} minutes`
}

export function npatSessionExpired(
  sessionStartedAt: string | null | undefined,
  durationSeconds: number | null | undefined
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  if (!sessionStartedAt) return false
  return secondsUntilDeadline(sessionStartedAt, durationSeconds) <= 0
}

export function npatSessionShouldEnd(
  game: Pick<Game, 'session_started_at' | 'game_duration_seconds'>,
  usedLettersCount: number
): boolean {
  if (usedLettersCount >= NPAT_MAX_LETTERS) return true
  return npatSessionExpired(game.session_started_at, game.game_duration_seconds)
}

export function unusedLetters(usedLetters: string[]): string[] {
  const used = new Set(usedLetters.map((l) => l.toUpperCase()))
  return ALPHABET.filter((l) => !used.has(l))
}

/** All letters already picked across every round in the game. */
export function collectUsedLetters(rounds: Pick<Round, 'npat_metadata'>[]): string[] {
  const used = new Set<string>()
  for (const round of rounds) {
    const meta = parseNpatMetadata(round.npat_metadata)
    if (!meta) continue
    for (const letter of meta.used_letters) used.add(letter.toUpperCase())
    if (meta.letter) used.add(meta.letter.toUpperCase())
  }
  return ALPHABET.filter((l) => used.has(l))
}

export function availableLettersForPick(rounds: Pick<Round, 'npat_metadata'>[]): string[] {
  const used = new Set(collectUsedLetters(rounds))
  return ALPHABET.filter((l) => !used.has(l))
}

export function randomUnusedLetter(usedLetters: string[]): string {
  const remaining = unusedLetters(usedLetters)
  if (remaining.length === 0) return randomLetter()
  return remaining[Math.floor(Math.random() * remaining.length)]
}

export function parseNpatMetadata(raw: unknown): NpatMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  const phase = m.phase
  if (
    phase !== 'letter_pick' &&
    phase !== 'writing' &&
    phase !== 'marking' &&
    phase !== 'host_review' &&
    phase !== 'reveal'
  ) {
    return null
  }
  const assignments = m.reviewer_assignments
  if (!assignments || typeof assignments !== 'object') return null
  const reviewer_assignments: Record<string, string> = {}
  for (const [k, v] of Object.entries(assignments as Record<string, unknown>)) {
    if (typeof v === 'string') reviewer_assignments[k] = v
  }
  const used_letters = Array.isArray(m.used_letters)
    ? m.used_letters.filter((l): l is string => typeof l === 'string').map((l) => l.toUpperCase().slice(0, 1))
    : []
  const caller_order = Array.isArray(m.caller_order)
    ? m.caller_order.filter((id): id is string => typeof id === 'string')
    : []

  const host_overrides: NpatMetadata['host_overrides'] = {}
  if (m.host_overrides && typeof m.host_overrides === 'object') {
    for (const [playerId, rawFlags] of Object.entries(m.host_overrides as Record<string, unknown>)) {
      if (!rawFlags || typeof rawFlags !== 'object') continue
      const flags = rawFlags as Record<string, unknown>
      const entry: Partial<Record<NpatCategory, boolean>> = {}
      for (const category of NPAT_CATEGORIES) {
        const value = flags[category]
        if (typeof value === 'boolean') entry[category] = value
      }
      if (Object.keys(entry).length > 0) host_overrides[playerId] = entry
    }
  }

  const disputes: NpatMetadata['disputes'] = []
  if (Array.isArray(m.disputes)) {
    for (const d of m.disputes) {
      if (
        d &&
        typeof d === 'object' &&
        typeof d.challenger_id === 'string' &&
        typeof d.target_player_id === 'string' &&
        NPAT_CATEGORIES.includes(d.category as NpatCategory)
      ) {
        disputes.push({
          challenger_id: d.challenger_id,
          target_player_id: d.target_player_id,
          category: d.category as NpatCategory,
        })
      }
    }
  }

  return {
    letter: typeof m.letter === 'string' ? m.letter.toUpperCase().slice(0, 1) : null,
    phase,
    phase_started_at: typeof m.phase_started_at === 'string' ? m.phase_started_at : null,
    reviewer_assignments,
    scores_computed: m.scores_computed === true,
    used_letters,
    caller_order,
    caller_index: typeof m.caller_index === 'number' ? m.caller_index : 0,
    host_overrides: Object.keys(host_overrides).length > 0 ? host_overrides : undefined,
    disputes: disputes.length > 0 ? disputes : undefined,
  }
}

export function roundCallerPlayerId(
  round: Pick<Round, 'submitter_player_id'>,
  metadata: NpatMetadata | null
): string | null {
  if (round.submitter_player_id) return round.submitter_player_id
  if (!metadata?.caller_order.length) return null
  return metadata.caller_order[metadata.caller_index] ?? metadata.caller_order[0] ?? null
}

export function randomLetter(): string {
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
}

export function answerStartsWithLetter(answer: string, letter: string): boolean {
  const trimmed = answer.trim()
  if (!trimmed || !letter) return false
  return trimmed[0].toUpperCase() === letter.toUpperCase().slice(0, 1)
}

export function answerTotal(
  answer: Pick<NpatAnswer, 'score_name' | 'score_animal' | 'score_place' | 'score_thing' | 'score_food'>
) {
  return (
    (answer.score_name ?? 0) +
    (answer.score_animal ?? 0) +
    (answer.score_place ?? 0) +
    (answer.score_thing ?? 0) +
    (answer.score_food ?? 0)
  )
}

export function tallyNpatScores(
  answers: NpatAnswer[],
  players: Player[]
): { id: string; name: string; score: number }[] {
  const totals = new Map<string, number>()
  for (const player of players) totals.set(player.id, 0)
  for (const row of answers) {
    if (row.score_name == null) continue
    totals.set(row.player_id, (totals.get(row.player_id) ?? 0) + answerTotal(row))
  }
  return players
    .map((p) => ({ id: p.id, name: p.name, score: totals.get(p.id) ?? 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

export function npatWinnerLabel(leaderboard: { name: string; score: number }[]): string {
  if (leaderboard.length === 0) return 'Game over'
  const topScore = leaderboard[0].score
  const winners = leaderboard.filter((row) => row.score === topScore)
  if (winners.length === 1) return `${winners[0].name} wins!`
  return `${winners.map((row) => row.name).join(' & ')} tie for first!`
}

export function playerDisplayName(playerId: string | null | undefined, players: Player[]): string {
  if (!playerId) return 'Someone'
  return players.find((p) => p.id === playerId)?.name ?? 'Someone'
}

export function reviewTargetForMarker(metadata: NpatMetadata | null, markerPlayerId: string): string | null {
  if (!metadata) return null
  return metadata.reviewer_assignments[markerPlayerId] ?? null
}

export function phaseDeadlineMs(
  metadata: NpatMetadata,
  writingTimerSeconds: number,
  markingTimerSeconds: number
): number | null {
  if (!metadata.phase_started_at) return null
  const start = new Date(metadata.phase_started_at).getTime()
  if (metadata.phase === 'letter_pick') return start + NPAT_LETTER_PICK_SECONDS * 1000
  if (metadata.phase === 'writing') return start + writingTimerSeconds * 1000
  if (metadata.phase === 'marking') return start + markingTimerSeconds * 1000
  return null
}

export function phaseSecondsLeft(
  metadata: NpatMetadata,
  writingTimerSeconds: number,
  markingTimerSeconds: number
): number | null {
  const deadline = phaseDeadlineMs(metadata, writingTimerSeconds, markingTimerSeconds)
  if (deadline == null) return null
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

export function revealCountdownSeconds(
  endedAt: string | null | undefined,
  revealSeconds = NPAT_REVEAL_SECONDS
): number {
  if (!endedAt) return revealSeconds
  const deadline = new Date(endedAt).getTime() + revealSeconds * 1000
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

export function trimNpatAnswerFields(fields: Partial<Record<NpatCategory, string>>): Record<NpatCategory, string> {
  return Object.fromEntries(
    NPAT_CATEGORIES.map((category) => [category, (fields[category] ?? '').trim().slice(0, NPAT_MAX_ANSWER_LENGTH)])
  ) as Record<NpatCategory, string>
}

export function npatAnswerRequestPayload(opts: {
  gameId: string
  resumeToken: string
  roundId: string
  answers: Partial<Record<NpatCategory, string>>
}) {
  const fields = trimNpatAnswerFields(opts.answers)
  return {
    gameId: opts.gameId,
    resumeToken: opts.resumeToken,
    roundId: opts.roundId,
    name: fields.name,
    animal: fields.animal,
    place: fields.place,
    thing: fields.thing,
    food: fields.food,
  }
}

export function validateNpatAnswerFields(letter: string | null, fields: Record<NpatCategory, string>): string | null {
  for (const category of NPAT_CATEGORIES) {
    const trimmed = fields[category]
    if (trimmed && letter && !answerStartsWithLetter(trimmed, letter)) {
      return `${NPAT_CATEGORY_LABELS[category]} must start with the letter ${letter}`
    }
  }
  return null
}
