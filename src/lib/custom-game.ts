import type { Game, Vote, Participant, CustomSlot, PairVoteMode } from '@/types'
import { isCustomGame, parsePairVoteMode } from '@/lib/game-types'
import { isGameGenderBased } from '@/lib/gender-based'

/** @deprecated Use isGameGenderBased from @/lib/gender-based */
export function isCustomGenderBased(game: Pick<Game, 'game_type' | 'gender_based' | 'custom_slots'>): boolean {
  return isGameGenderBased(game)
}

// ---------------------------------------------------------------------------
// Config access
// ---------------------------------------------------------------------------

export function getCustomSlots(game: Game): CustomSlot[] {
  return game.custom_slots?.slots ?? []
}

export function getCustomSlotKeys(game: Game): string[] {
  return getCustomSlots(game).map((s) => s.key)
}

export function getCustomSlotCount(game: Game): number {
  return getCustomSlots(game).length
}

export function getCustomTitle(game: Game): string {
  return game.custom_slots?.title ?? 'Custom Game'
}

export function isCustomTwoSlotGame(game: Pick<Game, 'game_type' | 'custom_slots'>): boolean {
  return isCustomGame(game.game_type) && getCustomSlotCount(game as Game) === 2
}

export function isCustomOneEachMode(game: Pick<Game, 'game_type' | 'pair_vote_mode' | 'custom_slots'>): boolean {
  if (!isCustomTwoSlotGame(game)) return true
  return parsePairVoteMode(game.pair_vote_mode) === 'one_each'
}

export function customPairVoteModeOptions(slots: CustomSlot[]): {
  value: PairVoteMode
  label: string
  hint: string
}[] {
  const first = slots[0]?.label?.trim() || 'Option A'
  const second = slots[1]?.label?.trim() || 'Option B'
  return [
    {
      value: 'one_each',
      label: 'One each',
      hint: `Must pick one ${first} and one ${second} every round.`,
    },
    {
      value: 'any',
      label: 'Any combo',
      hint: `Players can pick 2 ${first}, 2 ${second}, or 1 of each.`,
    },
  ]
}

export function customAssignmentMode(
  game: Pick<Game, 'pair_vote_mode' | 'custom_slots'>,
  participantCount: number,
  slotKeys: string[]
): PairVoteMode {
  if (slotKeys.length === 2 && participantCount === 2) {
    return parsePairVoteMode(game.pair_vote_mode)
  }
  return 'one_each'
}

// ---------------------------------------------------------------------------
// Vote assignment validation
// ---------------------------------------------------------------------------

export function parseCustomAssignments(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Record<string, string> = {}
  for (const [id, slot] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof slot === 'string') out[id] = slot
  }
  return Object.keys(out).length > 0 ? out : null
}

export function isCustomAssignmentValid(
  assignments: Record<string, string>,
  participantIds: string[],
  slotKeys: string[],
  mode: PairVoteMode = 'one_each'
): boolean {
  if (!participantIds.every((id) => id in assignments)) return false
  const slotSet = new Set(slotKeys)
  if (!Object.values(assignments).every((v) => slotSet.has(v))) return false
  if (Object.keys(assignments).length !== participantIds.length) return false

  if (mode === 'any' && slotKeys.length === 2 && participantIds.length === 2) {
    return true
  }

  const usedSlots = new Set(Object.values(assignments))
  return usedSlots.size === slotKeys.length
}

export function customDisabledSlots(
  assignments: Record<string, string>,
  participantId: string,
  participantIds: string[],
  slotKeys: string[],
  mode: PairVoteMode
): string[] {
  if (mode !== 'one_each' || slotKeys.length !== 2 || participantIds.length !== 2) return []
  const otherId = participantIds.find((id) => id !== participantId)
  if (!otherId) return []
  const otherSlot = assignments[otherId]
  return otherSlot ? [otherSlot] : []
}

export function fillRandomCustomAssignment(
  participantIds: string[],
  slotKeys: string[],
  mode: PairVoteMode = 'one_each'
): Record<string, string> {
  const out: Record<string, string> = {}
  if (mode === 'any' && slotKeys.length === 2 && participantIds.length === 2) {
    for (const id of participantIds) {
      out[id] = slotKeys[Math.floor(Math.random() * slotKeys.length)]
    }
    return out
  }

  const shuffledSlots = [...slotKeys]
  for (let i = shuffledSlots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffledSlots[i], shuffledSlots[j]] = [shuffledSlots[j], shuffledSlots[i]]
  }
  participantIds.forEach((id, i) => {
    out[id] = shuffledSlots[i]
  })
  return out
}

export function completeRandomCustomAssignment(
  current: Record<string, string>,
  participantIds: string[],
  slotKeys: string[],
  mode: PairVoteMode = 'one_each'
): Record<string, string> {
  const out = { ...current }
  const unassigned = participantIds.filter((id) => !(id in out))

  if (mode === 'any' && slotKeys.length === 2 && participantIds.length === 2) {
    for (const id of unassigned) {
      out[id] = slotKeys[Math.floor(Math.random() * slotKeys.length)]
    }
    return out
  }

  const usedSlots = new Set(Object.values(out))
  const remainingSlots = slotKeys.filter((k) => !usedSlots.has(k))
  for (let i = remainingSlots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[remainingSlots[i], remainingSlots[j]] = [remainingSlots[j], remainingSlots[i]]
  }
  unassigned.forEach((id, i) => {
    out[id] = remainingSlots[i]
  })
  return out
}

export function customVoteRecapItems(
  assignments: Record<string, string> | null | undefined,
  roundParticipants: { id: string; name: string }[],
  slots: CustomSlot[]
): { name: string; emoji: string; label: string; color: string }[] {
  if (!assignments) return []
  const slotByKey = new Map(slots.map((s) => [s.key, s]))
  const items: { name: string; emoji: string; label: string; color: string }[] = []
  for (const p of roundParticipants) {
    const slotKey = assignments[p.id]
    if (!slotKey) continue
    const slot = slotByKey.get(slotKey)
    if (!slot) continue
    items.push({ name: p.name, emoji: slot.emoji, label: slot.label, color: slot.color })
  }
  return items
}

// ---------------------------------------------------------------------------
// Vote tallying
// ---------------------------------------------------------------------------

export interface CustomTallyRow {
  participantId: string
  name: string
  counts: Record<string, number>
}

export interface CustomTally {
  rows: CustomTallyRow[]
  voterCount: number
  slotWinners: Record<string, { name: string; count: number }>
}

export function tallyCustomVotes(
  votes: Vote[],
  participantIds: string[],
  nameById: Map<string, string>,
  slotKeys: string[]
): CustomTally {
  const countsMap = new Map<string, Record<string, number>>()
  for (const pid of participantIds) {
    const counts: Record<string, number> = {}
    for (const key of slotKeys) counts[key] = 0
    countsMap.set(pid, counts)
  }

  let voterCount = 0
  for (const vote of votes) {
    const assignments = vote.pair_assignments as Record<string, string> | null
    if (!assignments) continue
    voterCount++
    for (const [pid, slotKey] of Object.entries(assignments)) {
      const counts = countsMap.get(pid)
      if (counts && slotKey in counts) {
        counts[slotKey]++
      }
    }
  }

  const rows: CustomTallyRow[] = participantIds.map((pid) => ({
    participantId: pid,
    name: nameById.get(pid) ?? '',
    counts: countsMap.get(pid) ?? {},
  }))

  const slotWinners: Record<string, { name: string; count: number }> = {}
  for (const key of slotKeys) {
    let maxCount = 0
    let winnerName = ''
    for (const row of rows) {
      const count = row.counts[key] ?? 0
      if (count > maxCount) {
        maxCount = count
        winnerName = row.name
      }
    }
    if (maxCount > 0) {
      slotWinners[key] = { name: winnerName, count: maxCount }
    }
  }

  return { rows, voterCount, slotWinners }
}

// ---------------------------------------------------------------------------
// Leaderboard (final results)
// ---------------------------------------------------------------------------

export interface CustomLeaderboardEntry {
  slot: CustomSlot
  entries: Array<{ name: string; count: number }>
}

export function buildCustomLeaderboard(
  allVotes: Vote[],
  participants: Participant[],
  slots: CustomSlot[]
): CustomLeaderboardEntry[] {
  const nameById = new Map(participants.map((p) => [p.id, p.name]))
  const participantIds = participants.map((p) => p.id)
  const slotKeys = slots.map((s) => s.key)

  const totalCounts = new Map<string, Record<string, number>>()
  for (const pid of participantIds) {
    const counts: Record<string, number> = {}
    for (const key of slotKeys) counts[key] = 0
    totalCounts.set(pid, counts)
  }

  for (const vote of allVotes) {
    const assignments = vote.pair_assignments as Record<string, string> | null
    if (!assignments) continue
    for (const [pid, slotKey] of Object.entries(assignments)) {
      const counts = totalCounts.get(pid)
      if (counts && slotKey in counts) {
        counts[slotKey]++
      }
    }
  }

  return slots.map((slot) => ({
    slot,
    entries: participantIds
      .map((pid) => ({
        name: nameById.get(pid) ?? '',
        count: totalCounts.get(pid)?.[slot.key] ?? 0,
      }))
      .sort((a, b) => b.count - a.count)
      .filter((e) => e.count > 0),
  }))
}
