import type { Participant, Player, Vote } from '@/types'

export interface WstVoteTarget {
  id: string
  name: string
}

export function wstVoteTargets(participants: Participant[]): WstVoteTarget[] {
  return [...participants]
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((p) => ({ id: p.id, name: p.name }))
}

export function wstEligibleSubmitters(players: Player[]): Player[] {
  return players.filter((p) => p.participant_id)
}

export function wstCorrectParticipantId(submitterPlayerId: string | null | undefined, players: Player[]): string | null {
  if (!submitterPlayerId) return null
  return players.find((p) => p.id === submitterPlayerId)?.participant_id ?? null
}

export function wstCorrectName(
  submitterPlayerId: string | null | undefined,
  players: Player[],
  participants: Participant[]
): string | null {
  const participantId = wstCorrectParticipantId(submitterPlayerId, players)
  if (!participantId) return null
  return participants.find((p) => p.id === participantId)?.name ?? null
}

export function wstSubmitterName(submitterPlayerId: string | null | undefined, players: Player[]): string | null {
  if (!submitterPlayerId) return null
  return players.find((p) => p.id === submitterPlayerId)?.name ?? null
}

export function shuffleSubmitters(players: Player[]): Player[] {
  const eligible = wstEligibleSubmitters(players)
  const arr = [...eligible]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function buildSubmitterSequence(players: Player[], roundsCount: number): Player[] {
  const shuffled = shuffleSubmitters(players)
  if (shuffled.length === 0) return []
  const sequence: Player[] = []
  for (let i = 0; i < roundsCount; i++) {
    sequence.push(shuffled[i % shuffled.length])
  }
  return sequence
}

/** One round per player who claimed a name from the list. */
export function wstAutoRoundCount(submitterCount: number): number {
  return Math.min(20, Math.max(submitterCount, 1))
}

export function tallyWstVotes(
  votes: Vote[],
  targets: WstVoteTarget[],
  correctParticipantId: string | null
) {
  const counts = new Map<string, number>()
  for (const t of targets) counts.set(t.id, 0)
  let correctCount = 0

  for (const vote of votes) {
    const picked = vote.target_participant_id
    if (!picked) continue
    counts.set(picked, (counts.get(picked) ?? 0) + 1)
    if (correctParticipantId && picked === correctParticipantId) correctCount += 1
  }

  const rows = targets
    .map((t) => ({ participantId: t.id, name: t.name, count: counts.get(t.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  const maxCount = rows.length > 0 ? rows[0].count : 0
  const topGuesses = rows.filter((r) => r.count === maxCount && maxCount > 0).map((r) => r.name)

  return {
    rows,
    voterCount: votes.filter((v) => v.target_participant_id).length,
    maxCount,
    topGuesses,
    correctCount,
    correctParticipantId,
  }
}

export interface WstPlayerScore {
  playerId: string
  name: string
  correctGuesses: number
}

/** Points for picking the right name each round. */
export function tallyWstPlayerScores(
  rounds: { id: string; submitter_player_id?: string | null }[],
  votes: Vote[],
  players: Player[]
): WstPlayerScore[] {
  const scores = new Map<string, number>()
  for (const p of players) scores.set(p.id, 0)

  for (const round of rounds) {
    const correctId = wstCorrectParticipantId(round.submitter_player_id, players)
    if (!correctId) continue
    const roundVotes = votes.filter((v) => v.round_id === round.id)
    for (const vote of roundVotes) {
      if (vote.target_participant_id === correctId) {
        scores.set(vote.player_id, (scores.get(vote.player_id) ?? 0) + 1)
      }
    }
  }

  return [...scores.entries()]
    .map(([playerId, correctGuesses]) => ({
      playerId,
      name: players.find((p) => p.id === playerId)?.name ?? 'Unknown',
      correctGuesses,
    }))
    .sort((a, b) => b.correctGuesses - a.correctGuesses || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}
