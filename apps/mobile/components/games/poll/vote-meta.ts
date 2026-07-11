import type { GameType, Participant, ParticipantGender, Vote } from '@fateround/shared'
import { isBinaryPeoplePollGame, parseGameType } from '@fateround/shared/poll-games'
import { flagForParticipant } from '@fateround/shared/vote-stats'
import { getRoundParticipantGender } from '@/components/games/poll/gender'

/**
 * Self-contained vote-category metadata for the people-poll final leaderboards.
 * Ported from web `src/lib/game-types.ts` (slot config) + `src/lib/vote-stats.ts`
 * so the mobile leaderboards can render emoji/label/color without touching shared.
 */

export type PollVoteCategory = 'kiss' | 'marry' | 'smash'

export type PollCategoryMeta = {
  emoji: string
  label: string
  color: string
  leaderboardLabel: string
}

type SlotMetaSet = {
  kiss: PollCategoryMeta
  marry: PollCategoryMeta
  smash: PollCategoryMeta
}

const SMK: SlotMetaSet = {
  kiss: { emoji: '🔥', label: 'Smash', color: '#f97316', leaderboardLabel: 'Most Smashed' },
  marry: { emoji: '💍', label: 'Marry', color: '#fbbf24', leaderboardLabel: 'Most Married' },
  smash: { emoji: '💀', label: 'Kill', color: '#991b1b', leaderboardLabel: 'Most Killed' },
}

const RFGF: SlotMetaSet = {
  kiss: { emoji: '💚', label: 'Green Flag', color: '#4ade80', leaderboardLabel: 'Most Green Flags' },
  marry: { emoji: '⚪', label: 'Pass', color: '#94a3b8', leaderboardLabel: 'Most Passes' },
  smash: { emoji: '🚩', label: 'Red Flag', color: '#ef4444', leaderboardLabel: 'Most Red Flags' },
}

const SOP: SlotMetaSet = {
  kiss: { emoji: '🔥', label: 'Smash', color: '#f97316', leaderboardLabel: 'Most Smashed' },
  marry: { emoji: '👎', label: 'Pass', color: '#64748b', leaderboardLabel: 'Most Passed' },
  smash: { emoji: '👎', label: 'Pass', color: '#64748b', leaderboardLabel: 'Most Passed' },
}

const PAN_APPROVAL: SlotMetaSet = {
  kiss: { emoji: '✅', label: 'Yes', color: '#22c55e', leaderboardLabel: 'Most Approved' },
  marry: { emoji: '⚪', label: 'Pass', color: '#94a3b8', leaderboardLabel: 'Most Passed' },
  smash: { emoji: '❌', label: 'No', color: '#ef4444', leaderboardLabel: 'Most Rejected' },
}

function slotSet(gameType?: GameType | string): SlotMetaSet {
  switch (parseGameType(gameType)) {
    case 'red_flag_green_flag':
      return RFGF
    case 'smash_or_pass':
      return SOP
    case 'parent_approval':
      return PAN_APPROVAL
    default:
      return SMK
  }
}

export function pollVoteCategories(gameType?: GameType | string): PollVoteCategory[] {
  return isBinaryPeoplePollGame(gameType) ? ['kiss', 'smash'] : ['kiss', 'marry', 'smash']
}

export function pollCategoryMeta(gameType: GameType | string | undefined, category: PollVoteCategory): PollCategoryMeta {
  return slotSet(gameType)[category]
}

export type PollTallyRow = {
  id: string
  name: string
  photo_url: string | null
  kissCount: number
  marryCount: number
  killCount: number
}

export function buildPollTally(
  participants: Participant[],
  votes: Vote[],
  gameType?: GameType | string
): PollTallyRow[] {
  const pairGame = isBinaryPeoplePollGame(gameType)
  return participants.map((p) => ({
    id: p.id,
    name: p.name,
    photo_url: p.photo_url ?? null,
    kissCount: pairGame
      ? votes.filter((v) => flagForParticipant(v, p.id) === 'kiss').length
      : votes.filter((v) => v.kiss_participant_id === p.id).length,
    marryCount: votes.filter((v) => v.marry_participant_id === p.id).length,
    killCount: pairGame
      ? votes.filter((v) => flagForParticipant(v, p.id) === 'kill').length
      : votes.filter((v) => v.kill_participant_id === p.id).length,
  }))
}

export function countKey(category: PollVoteCategory): 'kissCount' | 'marryCount' | 'killCount' {
  return category === 'kiss' ? 'kissCount' : category === 'marry' ? 'marryCount' : 'killCount'
}

export function topByCount(rows: PollTallyRow[], key: 'kissCount' | 'marryCount' | 'killCount'): PollTallyRow | undefined {
  if (rows.length === 0) return undefined
  return [...rows].sort((a, b) => b[key] - a[key])[0]
}

/** Participants who appeared in same-gender rounds of the given gender. */
export function participantsInGenderRounds(
  participants: Participant[],
  rounds: { participant_ids?: string[] | null }[],
  gender: ParticipantGender
): Participant[] {
  const ids = new Set<string>()
  for (const round of rounds) {
    const roundIds = round.participant_ids ?? []
    if (getRoundParticipantGender(roundIds, participants) === gender) {
      roundIds.forEach((id) => ids.add(id))
    }
  }
  return participants.filter((p) => ids.has(p.id))
}

/** Participants who appeared in any round at all. */
export function participantsInAnyRound(
  participants: Participant[],
  rounds: { participant_ids?: string[] | null }[]
): Participant[] {
  const ids = new Set<string>()
  for (const round of rounds) (round.participant_ids ?? []).forEach((id) => ids.add(id))
  return participants.filter((p) => ids.has(p.id))
}
