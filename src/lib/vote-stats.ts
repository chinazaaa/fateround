import type { GameType, PairFlag, WyrChoice } from '@/types'
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
  pair_assignments?: Record<string, PairFlag> | null
}

export function flagForParticipant(vote: VoteRow, participantId: string): PairFlag | null {
  const stored = vote.pair_assignments?.[participantId]
  if (stored === 'kiss' || stored === 'kill') return stored
  if (vote.kiss_participant_id === participantId) return 'kiss'
  if (vote.kill_participant_id === participantId) return 'kill'
  return null
}

export function tallyRoundVotes(participantIds: string[], votes: VoteRow[]): RoundTally[] {
  return participantIds.map((id) => ({
    id,
    kiss: votes.filter((v) => flagForParticipant(v, id) === 'kiss').length,
    marry: votes.filter((v) => v.marry_participant_id === id).length,
    smash: votes.filter((v) => flagForParticipant(v, id) === 'kill').length,
  }))
}

export interface WyrTally {
  countA: number
  countB: number
  voterCount: number
}

export function tallyWyrVotes(votes: { wyr_choice?: WyrChoice | string | null }[]): WyrTally {
  const countA = votes.filter((v) => v.wyr_choice === 'a').length
  const countB = votes.filter((v) => v.wyr_choice === 'b').length
  return { countA, countB, voterCount: votes.length }
}

export interface MltTallyRow {
  playerId: string
  name: string
  count: number
}

export interface MltTally {
  rows: MltTallyRow[]
  voterCount: number
  maxCount: number
  winnerNames: string[]
}

export function tallyMltVotes(
  votes: { target_player_id?: string | null }[],
  players: { id: string; name: string }[]
): MltTally {
  const rows = players.map((p) => ({
    playerId: p.id,
    name: p.name,
    count: votes.filter((v) => v.target_player_id === p.id).length,
  }))
  const maxCount = Math.max(0, ...rows.map((r) => r.count))
  const winnerNames =
    maxCount > 0 ? rows.filter((r) => r.count === maxCount).map((r) => r.name) : []
  return {
    rows: rows.sort((a, b) => b.count - a.count),
    voterCount: votes.length,
    maxCount,
    winnerNames,
  }
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
  if (type === 'smash_or_pass') return 'border-slate-400/40'
  return 'border-red-500/40'
}
