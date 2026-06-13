import type { GameType } from '@/types'
import {
  type VoteCategory,
  categoryMeta,
  parseGameType,
  voteCategories,
} from '@/lib/game-types'

export type { VoteCategory } from '@/lib/game-types'

export interface RoundTally {
  id: string
  kiss: number
  marry: number
  smash: number
}

type VoteRow = {
  kiss_participant_id: string | null
  marry_participant_id: string | null
  kill_participant_id: string | null
}

export function tallyRoundVotes(participantIds: string[], votes: VoteRow[]): RoundTally[] {
  return participantIds.map((id) => ({
    id,
    kiss: votes.filter((v) => v.kiss_participant_id === id).length,
    marry: votes.filter((v) => v.marry_participant_id === id).length,
    smash: votes.filter((v) => v.kill_participant_id === id).length,
  }))
}

export function maxInRound(tallies: RoundTally[]): Record<VoteCategory, number> {
  return {
    kiss: Math.max(1, ...tallies.map((t) => t.kiss)),
    marry: Math.max(1, ...tallies.map((t) => t.marry)),
    smash: Math.max(1, ...tallies.map((t) => t.smash)),
  }
}

export function isCategoryWinner(
  tallies: RoundTally[],
  participantId: string,
  category: VoteCategory
): boolean {
  const max = Math.max(...tallies.map((t) => t[category]))
  if (max === 0) return false
  const tally = tallies.find((t) => t.id === participantId)
  return tally?.[category] === max
}

export function winnerNames(
  tallies: RoundTally[],
  category: VoteCategory,
  nameById: Map<string, string>
): string[] {
  const max = Math.max(...tallies.map((t) => t[category]))
  if (max === 0) return []
  return tallies
    .filter((t) => t[category] === max)
    .map((t) => nameById.get(t.id) ?? '')
    .filter(Boolean)
}

/** @deprecated Use categoryMeta(gameType, category) */
export const VOTE_CATEGORY_META = {
  kiss: { emoji: '🔥', label: 'Smash', color: '#fb923c', leaderboardLabel: 'Most Smashed' },
  marry: { emoji: '💍', label: 'Marry', color: '#fbbf24', leaderboardLabel: 'Most Married' },
  smash: { emoji: '💀', label: 'Kill', color: '#f87171', leaderboardLabel: 'Most Killed' },
} as const

export function getCategoryMeta(gameType: GameType | string | undefined, category: VoteCategory) {
  return categoryMeta(parseGameType(gameType), category)
}

export function getVoteCategories(gameType?: GameType | string | undefined): VoteCategory[] {
  return voteCategories(gameType)
}

/** @deprecated Use assignmentEmoji(gameType, slot) */
export const ASSIGNMENT_ACTION_META = {
  kiss: VOTE_CATEGORY_META.kiss,
  marry: VOTE_CATEGORY_META.marry,
  kill: VOTE_CATEGORY_META.smash,
} as const

export function assignmentEmojiFor(
  gameType: GameType | string | undefined,
  slot: 'kiss' | 'marry' | 'kill'
): string {
  return getCategoryMeta(gameType, slot === 'kill' ? 'smash' : slot).emoji
}

/** @deprecated Use assignmentEmojiFor */
export function assignmentEmoji(action: keyof typeof ASSIGNMENT_ACTION_META): string {
  return ASSIGNMENT_ACTION_META[action].emoji
}

export function myActionBorderClass(
  gameType: GameType | string | undefined,
  action: 'kiss' | 'marry' | 'kill' | null
): string {
  if (!action) return 'border-white/10'
  const type = parseGameType(gameType)
  if (action === 'kiss') {
    return type === 'red_flag_green_flag' ? 'border-emerald-500/40' : 'border-pink-500/40'
  }
  if (action === 'marry') return 'border-amber-500/40'
  if (type === 'red_flag_green_flag') return 'border-red-500/40'
  if (type === 'smash_or_pass') return 'border-white/25'
  return 'border-red-500/40'
}
