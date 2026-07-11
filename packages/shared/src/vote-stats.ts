import type { PairFlag, WyrChoice } from './types'

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

export type MltTargetKind = 'player' | 'participant'

export function tallyMltVotes(
  votes: { target_player_id?: string | null; target_participant_id?: string | null }[],
  targets: { id: string; name: string }[],
  targetKind: MltTargetKind = 'player'
): MltTally {
  const rows = targets.map((t) => ({
    playerId: t.id,
    name: t.name,
    count: votes.filter((v) =>
      targetKind === 'participant' ? v.target_participant_id === t.id : v.target_player_id === t.id
    ).length,
  }))
  const maxCount = Math.max(0, ...rows.map((r) => r.count))
  const winnerNames = maxCount > 0 ? rows.filter((r) => r.count === maxCount).map((r) => r.name) : []
  return {
    rows: rows.sort((a, b) => b.count - a.count),
    voterCount: votes.length,
    maxCount,
    winnerNames,
  }
}
