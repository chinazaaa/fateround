import { codewordPoolKey } from '@/lib/codewords-pool'
import { migratePoolKey, participantPoolKey, wyrQuestionKey } from '@/lib/pool-key'
import { parseTriviaMetadata } from '@/lib/trivia'
import { triviaQuestionKey } from '@/lib/trivia-questions'

export interface PoolUsageState {
  /** WYR / This or That question keys → times used in past sessions */
  wyr?: Record<string, number>
  /** MLT question text → times used */
  mlt?: Record<string, number>
  /** Participant name+gender key → round appearances */
  participants?: Record<string, number>
  /** Hot seat player id → times in the spotlight */
  hotSeat?: Record<string, number>
  /** Trivia question keys → times used */
  trivia?: Record<string, number>
  /** Codewords board word keys → times used on a board */
  codewords?: Record<string, number>
}

type RoundForUsage = {
  participant_ids?: string[] | null
  wyr_option_a?: string | null
  wyr_option_b?: string | null
  mlt_question?: string | null
  submitter_player_id?: string | null
  trivia_metadata?: unknown | null
}

type ParticipantRow = { id: string; name: string; gender: string }

export { participantPoolKey, wyrQuestionKey } from '@/lib/pool-key'

function parseUsageSection(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: Record<string, number> = {}
  for (const [key, count] of Object.entries(value)) {
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) continue
    const migrated = migratePoolKey(key)
    out[migrated] = (out[migrated] ?? 0) + count
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function parsePoolUsage(raw: unknown): PoolUsageState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const o = raw as PoolUsageState
  const section = parseUsageSection
  return {
    wyr: section(o.wyr),
    mlt: section(o.mlt),
    participants: section(o.participants),
    hotSeat: section(o.hotSeat),
    trivia: section(o.trivia),
    codewords: section(o.codewords),
  }
}

export function poolUsageToMap(section: Record<string, number> | undefined): Map<string, number> {
  return new Map(Object.entries(section ?? {}))
}

export function mapToPoolUsageSection(map: Map<string, number>): Record<string, number> | undefined {
  if (map.size === 0) return undefined
  return Object.fromEntries(map)
}

export function mergeUsageRecords(
  base: Record<string, number> | undefined,
  delta: Map<string, number>
): Record<string, number> | undefined {
  const merged = new Map(Object.entries(base ?? {}))
  for (const [key, count] of delta) {
    merged.set(key, (merged.get(key) ?? 0) + count)
  }
  return mapToPoolUsageSection(merged)
}

export function extractRoundUsage(rounds: RoundForUsage[], participants: ParticipantRow[]): PoolUsageState {
  const byId = new Map(participants.map((p) => [p.id, p]))
  const wyr = new Map<string, number>()
  const mlt = new Map<string, number>()
  const participantUsage = new Map<string, number>()
  const hotSeat = new Map<string, number>()
  const trivia = new Map<string, number>()

  for (const round of rounds) {
    if (round.wyr_option_a && round.wyr_option_b) {
      const key = wyrQuestionKey(round.wyr_option_a, round.wyr_option_b)
      wyr.set(key, (wyr.get(key) ?? 0) + 1)
    }
    if (round.mlt_question) {
      mlt.set(round.mlt_question, (mlt.get(round.mlt_question) ?? 0) + 1)
    }
    for (const id of round.participant_ids ?? []) {
      const p = byId.get(id)
      if (!p) continue
      const key = participantPoolKey(p.name, p.gender)
      participantUsage.set(key, (participantUsage.get(key) ?? 0) + 1)
    }
    if (round.submitter_player_id) {
      hotSeat.set(round.submitter_player_id, (hotSeat.get(round.submitter_player_id) ?? 0) + 1)
    }
    const triviaMeta = parseTriviaMetadata(round.trivia_metadata)
    if (triviaMeta) {
      const key = triviaQuestionKey({
        question: triviaMeta.question,
        choices: triviaMeta.choices,
        correctIndex: triviaMeta.correct_index,
        category: 'general',
      })
      trivia.set(key, (trivia.get(key) ?? 0) + 1)
    }
  }

  return {
    wyr: mapToPoolUsageSection(wyr),
    mlt: mapToPoolUsageSection(mlt),
    participants: mapToPoolUsageSection(participantUsage),
    hotSeat: mapToPoolUsageSection(hotSeat),
    trivia: mapToPoolUsageSection(trivia),
  }
}

export function mergePoolUsageState(existing: PoolUsageState, fromRounds: PoolUsageState): PoolUsageState {
  return {
    wyr: mergeUsageRecords(existing.wyr, poolUsageToMap(fromRounds.wyr)),
    mlt: mergeUsageRecords(existing.mlt, poolUsageToMap(fromRounds.mlt)),
    participants: mergeUsageRecords(existing.participants, poolUsageToMap(fromRounds.participants)),
    hotSeat: mergeUsageRecords(existing.hotSeat, poolUsageToMap(fromRounds.hotSeat)),
    trivia: mergeUsageRecords(existing.trivia, poolUsageToMap(fromRounds.trivia)),
    codewords: mergeUsageRecords(existing.codewords, poolUsageToMap(fromRounds.codewords)),
  }
}

export function extractCodewordsBoardUsage(words: string[]): PoolUsageState {
  const usage = new Map<string, number>()
  for (const word of words) {
    const key = codewordPoolKey(word)
    usage.set(key, (usage.get(key) ?? 0) + 1)
  }
  return { codewords: mapToPoolUsageSection(usage) }
}

/** Drop usage keys that no longer exist in the updated pool. */
export function pruneQuestionUsage<T>(
  usage: Record<string, number> | undefined,
  pool: readonly T[],
  keyFn: (item: T) => string
): Record<string, number> | undefined {
  if (!usage) return undefined
  const valid = new Set(pool.map(keyFn))
  const pruned: Record<string, number> = {}
  for (const [key, count] of Object.entries(usage)) {
    if (valid.has(key)) pruned[key] = count
  }
  return mapToPoolUsageSection(new Map(Object.entries(pruned)))
}

export function pruneParticipantUsage(
  usage: Record<string, number> | undefined,
  participants: { name: string; gender: string }[]
): Record<string, number> | undefined {
  return pruneQuestionUsage(usage, participants, (p) => participantPoolKey(p.name, p.gender))
}

export function mergeUsageMaps(...maps: Map<string, number>[]): Map<string, number> {
  const merged = new Map<string, number>()
  for (const map of maps) {
    for (const [key, count] of map) {
      merged.set(key, (merged.get(key) ?? 0) + count)
    }
  }
  return merged
}

export function appearanceCountsForParticipants(
  participants: { id: string; name: string; gender: string }[],
  usage: Record<string, number> | undefined
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of participants) {
    const key = participantPoolKey(p.name, p.gender)
    counts.set(p.id, usage?.[key] ?? 0)
  }
  return counts
}
