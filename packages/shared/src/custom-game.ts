import type { CustomSlot, Game, PairVoteMode } from './types'

export function parsePairVoteMode(raw: unknown): PairVoteMode {
  return raw === 'any' ? 'any' : 'one_each'
}

export function getCustomSlots(game: Game): CustomSlot[] {
  return game.custom_slots?.slots ?? []
}

export function getCustomTitle(game: Game): string {
  return game.custom_slots?.title ?? 'Custom Game'
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

export function assignCustomSlot(
  prev: Record<string, string>,
  participantId: string,
  slotKey: string,
  _participantIds: string[],
  mode: PairVoteMode
): Record<string, string> {
  if (prev[participantId] === slotKey) {
    const next = { ...prev }
    delete next[participantId]
    return next
  }

  if (mode === 'any') {
    return { ...prev, [participantId]: slotKey }
  }

  const myCurrent = prev[participantId]
  const holderId = Object.entries(prev).find(([id, key]) => key === slotKey && id !== participantId)?.[0]
  const next = { ...prev }

  if (holderId) {
    if (myCurrent) next[holderId] = myCurrent
    else delete next[holderId]
  }

  next[participantId] = slotKey
  return next
}
