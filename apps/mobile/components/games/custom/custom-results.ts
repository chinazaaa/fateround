import type { CustomSlot, Participant, Vote } from '@fateround/shared'

// Self-contained tally/leaderboard/recap helpers for the Custom game results.
// Mirrors src/lib/custom-game.ts (web); kept local because the shared package
// (@fateround/shared/custom-game) only exports the assignment/validation half.
//
// Custom votes are stored in the `pair_assignments` map ({ participantId: slotKey }).

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

function readAssignments(vote: Vote): Record<string, string> | null {
  const raw = vote.pair_assignments as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object') return null
  const out: Record<string, string> = {}
  for (const [id, slot] of Object.entries(raw)) {
    if (typeof slot === 'string') out[id] = slot
  }
  return Object.keys(out).length > 0 ? out : null
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
    const assignments = readAssignments(vote)
    if (!assignments) continue
    voterCount++
    for (const [pid, slotKey] of Object.entries(assignments)) {
      const counts = countsMap.get(pid)
      if (counts && slotKey in counts) counts[slotKey]++
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
    if (maxCount > 0) slotWinners[key] = { name: winnerName, count: maxCount }
  }

  return { rows, voterCount, slotWinners }
}

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
    const assignments = readAssignments(vote)
    if (!assignments) continue
    for (const [pid, slotKey] of Object.entries(assignments)) {
      const counts = totalCounts.get(pid)
      if (counts && slotKey in counts) counts[slotKey]++
    }
  }

  return slots.map((slot) => ({
    slot,
    entries: participantIds
      .map((pid) => ({ name: nameById.get(pid) ?? '', count: totalCounts.get(pid)?.[slot.key] ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .filter((e) => e.count > 0),
  }))
}

export function customVoteRecapItems(
  assignments: Record<string, string> | null | undefined,
  roundParticipants: { id: string; name: string }[],
  slots: CustomSlot[]
): { name: string; emoji: string; label: string; color: string }[] {
  if (!assignments) return []
  const nameById = new Map(roundParticipants.map((p) => [p.id, p.name]))
  const items: { name: string; emoji: string; label: string; color: string }[] = []
  for (const slot of slots) {
    for (const [participantId, slotKey] of Object.entries(assignments)) {
      if (slotKey !== slot.key) continue
      const name = nameById.get(participantId)
      if (!name) continue
      items.push({ name, emoji: slot.emoji, label: slot.label, color: slot.color })
    }
  }
  return items
}
