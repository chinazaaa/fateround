import type { SupabaseClient } from '@supabase/supabase-js'
import { secondsUntilDeadline } from '@/lib/round-timing'
import type { Game, NpatAnswer, NpatCategory, NpatMark, NpatMetadata, NpatPhase, Player, Round } from '@/types'

export type NpatHostMode = 'spectator' | 'player'

function npatHostModeKey(gameCode: string) {
  return `npat-host-mode-${gameCode}`
}

export function getNpatHostMode(gameCode: string): NpatHostMode {
  if (typeof window === 'undefined') return 'spectator'
  return localStorage.getItem(npatHostModeKey(gameCode)) === 'player' ? 'player' : 'spectator'
}

export function setNpatHostMode(gameCode: string, mode: NpatHostMode) {
  if (typeof window === 'undefined') return
  localStorage.setItem(npatHostModeKey(gameCode), mode)
}

export const NPAT_MIN_PLAYERS = 3
export const NPAT_MAX_PLAYERS = 20
export const NPAT_DEFAULT_MAX_PLAYERS = 20
export const NPAT_DEFAULT_TIMER = 60
export const NPAT_DEFAULT_MARKING_TIMER = 45
export const NPAT_LETTER_PICK_SECONDS = 15
export const NPAT_REVEAL_SECONDS = 8
export const NPAT_CATEGORY_POINTS = 10
export const NPAT_MAX_ANSWER_LENGTH = 80

export const NPAT_TIMER_OPTIONS = [30, 45, 60, 90] as const
export const NPAT_MARKING_TIMER_OPTIONS = [30, 45, 60] as const
export const NPAT_MAX_LETTERS = 26
export const NPAT_DEFAULT_GAME_DURATION = 1800
export const NPAT_GAME_DURATION_OPTIONS = [0, 600, 900, 1200, 1800, 2700, 3600] as const

export const NPAT_CATEGORIES: NpatCategory[] = ['name', 'animal', 'place', 'thing']

export const NPAT_CATEGORY_LABELS: Record<NpatCategory, string> = {
  name: 'Name',
  animal: 'Animal',
  place: 'Place',
  thing: 'Thing',
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
  }
}

export function buildReviewerAssignments(playerIds: string[]): Record<string, string> {
  const assignments: Record<string, string> = {}
  for (let i = 0; i < playerIds.length; i += 1) {
    assignments[playerIds[i]] = playerIds[(i + 1) % playerIds.length]
  }
  return assignments
}

export function buildNpatInitialRound(opts: {
  gameId: string
  playerOrder: string[]
  now: string
}): Record<string, unknown> {
  const assignments = buildReviewerAssignments(opts.playerOrder)
  return {
    game_id: opts.gameId,
    round_number: 1,
    participant_ids: [],
    submitter_player_id: opts.playerOrder[0],
    status: 'active',
    started_at: opts.now,
    ended_at: null,
    npat_metadata: {
      letter: null,
      phase: 'letter_pick' as NpatPhase,
      phase_started_at: opts.now,
      reviewer_assignments: assignments,
      scores_computed: false,
      used_letters: [],
      caller_order: opts.playerOrder,
      caller_index: 0,
    } satisfies NpatMetadata,
  }
}

export function buildNpatNextRound(opts: {
  gameId: string
  roundNumber: number
  previousMetadata: NpatMetadata
  playerIds: string[]
  now: string
}): Record<string, unknown> | null {
  const used_letters = [...opts.previousMetadata.used_letters]
  if (opts.previousMetadata.letter) used_letters.push(opts.previousMetadata.letter)
  if (used_letters.length >= NPAT_MAX_LETTERS) return null

  const caller_order = opts.previousMetadata.caller_order
  if (caller_order.length === 0) return null

  const caller_index = (opts.previousMetadata.caller_index + 1) % caller_order.length
  const reviewerIds = opts.playerIds.length > 0 ? opts.playerIds : caller_order

  return {
    game_id: opts.gameId,
    round_number: opts.roundNumber,
    participant_ids: [],
    submitter_player_id: caller_order[caller_index],
    status: 'pending',
    started_at: null,
    ended_at: null,
    npat_metadata: {
      letter: null,
      phase: 'letter_pick' as NpatPhase,
      phase_started_at: null,
      reviewer_assignments: buildReviewerAssignments(reviewerIds),
      scores_computed: false,
      used_letters,
      caller_order,
      caller_index,
    } satisfies NpatMetadata,
  }
}

export function npatLettersRemaining(metadata: NpatMetadata | null): number {
  if (!metadata) return NPAT_MAX_LETTERS
  const used = metadata.used_letters.length + (metadata.letter ? 1 : 0)
  return Math.max(0, NPAT_MAX_LETTERS - used)
}

export function shufflePlayerOrder(playerIds: string[]): string[] {
  return shuffle([...playerIds])
}

export function randomLetter(): string {
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
}

export function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase()
}

export function answerStartsWithLetter(answer: string, letter: string): boolean {
  const trimmed = answer.trim()
  if (!trimmed || !letter) return false
  return trimmed[0].toUpperCase() === letter.toUpperCase().slice(0, 1)
}

export function isForcedInvalidAnswer(answer: string, letter: string | null, isDuplicate: boolean): boolean {
  if (!normalizeAnswer(answer)) return true
  if (letter && !answerStartsWithLetter(answer, letter)) return true
  if (isDuplicate) return true
  return false
}

export function duplicateKeysByCategory(
  answers: Pick<NpatAnswer, 'name' | 'animal' | 'place' | 'thing'>[]
): Record<NpatCategory, Set<string>> {
  const result: Record<NpatCategory, Set<string>> = {
    name: new Set(),
    animal: new Set(),
    place: new Set(),
    thing: new Set(),
  }

  for (const category of NPAT_CATEGORIES) {
    const counts = new Map<string, number>()
    for (const row of answers) {
      const normalized = normalizeAnswer(row[category])
      if (!normalized) continue
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
    }
    for (const [key, count] of counts) {
      if (count > 1) result[category].add(key)
    }
  }

  return result
}

export type NpatScoreReason = 'empty' | 'duplicate' | 'invalid' | 'wrong_letter' | 'valid'

export function computeCategoryScore(opts: {
  answer: string
  letter: string | null
  markedValid: boolean
  isDuplicate: boolean
}): { points: number; reason: NpatScoreReason } {
  if (!normalizeAnswer(opts.answer)) return { points: 0, reason: 'empty' }
  if (opts.letter && !answerStartsWithLetter(opts.answer, opts.letter)) {
    return { points: 0, reason: 'wrong_letter' }
  }
  if (opts.isDuplicate) return { points: 0, reason: 'duplicate' }
  if (!opts.markedValid) return { points: 0, reason: 'invalid' }
  return { points: NPAT_CATEGORY_POINTS, reason: 'valid' }
}

function resolveCategoryValid(opts: {
  answer: string
  category: NpatCategory
  letter: string | null
  markedValid: boolean
  isDuplicate: boolean
  hostOverride?: boolean
}): boolean {
  if (isForcedInvalidAnswer(opts.answer, opts.letter, opts.isDuplicate)) return false
  if (typeof opts.hostOverride === 'boolean') return opts.hostOverride
  return opts.markedValid
}

export function computeRoundScores(
  answers: NpatAnswer[],
  marks: NpatMark[],
  opts?: { letter?: string | null; hostOverrides?: NpatMetadata['host_overrides'] }
): Array<{
  player_id: string
  score_name: number
  score_animal: number
  score_place: number
  score_thing: number
}> {
  const letter = opts?.letter ?? null
  const hostOverrides = opts?.hostOverrides
  const dupes = duplicateKeysByCategory(answers)
  const marksByTarget = new Map(marks.map((m) => [m.target_player_id, m]))

  return answers.map((answer) => {
    const mark = marksByTarget.get(answer.player_id)
    const playerOverrides = hostOverrides?.[answer.player_id]

    const scores = {} as Record<NpatCategory, number>
    for (const category of NPAT_CATEGORIES) {
      const normalized = normalizeAnswer(answer[category])
      const isDuplicate = normalized ? dupes[category].has(normalized) : false
      const markedValid = mark?.[`valid_${category}` as keyof NpatMark] ?? true
      const hostOverride = playerOverrides?.[category]
      const valid = resolveCategoryValid({
        answer: answer[category],
        category,
        letter,
        markedValid: markedValid !== false,
        isDuplicate,
        hostOverride,
      })
      scores[category] = computeCategoryScore({
        answer: answer[category],
        letter,
        markedValid: valid,
        isDuplicate,
      }).points
    }

    return {
      player_id: answer.player_id,
      score_name: scores.name,
      score_animal: scores.animal,
      score_place: scores.place,
      score_thing: scores.thing,
    }
  })
}

export function suggestedHostReviewValidity(
  answers: NpatAnswer[],
  marks: NpatMark[],
  letter: string | null
): NpatMetadata['host_overrides'] {
  const dupes = duplicateKeysByCategory(answers)
  const marksByTarget = new Map(marks.map((m) => [m.target_player_id, m]))
  const result: NonNullable<NpatMetadata['host_overrides']> = {}

  for (const answer of answers) {
    const mark = marksByTarget.get(answer.player_id)
    const entry: Partial<Record<NpatCategory, boolean>> = {}
    for (const category of NPAT_CATEGORIES) {
      const text = answer[category]
      const normalized = normalizeAnswer(text)
      const isDuplicate = normalized ? dupes[category].has(normalized) : false
      const markedValid = mark?.[`valid_${category}` as keyof NpatMark] ?? true
      entry[category] = resolveCategoryValid({
        answer: text,
        category,
        letter,
        markedValid: markedValid !== false,
        isDuplicate,
      })
    }
    result[answer.player_id] = entry
  }

  return result
}

export function answerTotal(answer: Pick<NpatAnswer, 'score_name' | 'score_animal' | 'score_place' | 'score_thing'>) {
  return (answer.score_name ?? 0) + (answer.score_animal ?? 0) + (answer.score_place ?? 0) + (answer.score_thing ?? 0)
}

export function tallyNpatScores(answers: NpatAnswer[], players: Player[]): { id: string; name: string; score: number }[] {
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

export function reviewTargetForMarker(
  metadata: NpatMetadata | null,
  markerPlayerId: string
): string | null {
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

export function revealCountdownSeconds(endedAt: string | null | undefined, revealSeconds = NPAT_REVEAL_SECONDS): number {
  if (!endedAt) return revealSeconds
  const deadline = new Date(endedAt).getTime() + revealSeconds * 1000
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

export async function ensureBlankAnswers(
  supabase: SupabaseClient,
  gameId: string,
  roundId: string,
  playerIds: string[]
): Promise<void> {
  const { data: existing } = await supabase.from('npat_answers').select('player_id').eq('round_id', roundId)
  const have = new Set((existing ?? []).map((r) => r.player_id))
  const missing = playerIds.filter((id) => !have.has(id))
  if (missing.length === 0) return
  await supabase.from('npat_answers').insert(
    missing.map((playerId) => ({
      game_id: gameId,
      round_id: roundId,
      player_id: playerId,
    }))
  )
}

export async function ensureDefaultMarks(
  supabase: SupabaseClient,
  gameId: string,
  round: Round,
  playerIds: string[]
): Promise<void> {
  const metadata = parseNpatMetadata(round.npat_metadata)
  if (!metadata) return
  const letter = metadata.letter
  const { data: answers } = await supabase.from('npat_answers').select('*').eq('round_id', round.id)
  const answersByPlayer = new Map((answers ?? []).map((a) => [a.player_id, a]))
  const dupes = duplicateKeysByCategory(answers ?? [])
  const { data: existing } = await supabase.from('npat_marks').select('marker_player_id').eq('round_id', round.id)
  const have = new Set((existing ?? []).map((r) => r.marker_player_id))

  const inserts = playerIds
    .filter((id) => !have.has(id))
    .map((markerId) => {
      const targetId = metadata.reviewer_assignments[markerId] ?? markerId
      const targetAnswer = answersByPlayer.get(targetId)
      const validFor = (category: NpatCategory) => {
        if (!targetAnswer) return false
        const text = targetAnswer[category]
        const normalized = normalizeAnswer(text)
        const isDuplicate = normalized ? dupes[category].has(normalized) : false
        return !isForcedInvalidAnswer(text, letter, isDuplicate)
      }
      return {
        game_id: gameId,
        round_id: round.id,
        marker_player_id: markerId,
        target_player_id: targetId,
        valid_name: validFor('name'),
        valid_animal: validFor('animal'),
        valid_place: validFor('place'),
        valid_thing: validFor('thing'),
        marked_at: null,
      }
    })
    .filter((row) => row.target_player_id !== row.marker_player_id)

  if (inserts.length > 0) await supabase.from('npat_marks').insert(inserts)
}

export function roundPhase(metadata: NpatMetadata | null): NpatPhase {
  return metadata?.phase ?? 'letter_pick'
}

export function isRoundInReveal(round: Round): boolean {
  const metadata = parseNpatMetadata(round.npat_metadata)
  return round.status === 'finished' && metadata?.phase === 'reveal'
}

export async function clearNpatSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  for (const table of ['npat_marks', 'npat_answers'] as const) {
    const { error } = await supabase.from(table).delete().eq('game_id', gameId)
    if (error) return { error: error.message }
  }
  const { error: spectatorError } = await supabase
    .from('players')
    .update({ spectator: false })
    .eq('game_id', gameId)
    .eq('spectator', true)
  if (spectatorError) return { error: spectatorError.message }
  return { error: null }
}
