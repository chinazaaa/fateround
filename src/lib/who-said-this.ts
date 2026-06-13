import type { Participant, Player, Round, Vote, WstQuotePoolEntry } from '@/types'

export interface WstVoteTarget {
  id: string
  name: string
}

export function wstVoteTargets(participants: Participant[]): WstVoteTarget[] {
  return [...participants]
    .sort(
      (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )
    .map((p) => ({ id: p.id, name: p.name }))
}

/** Merge a realtime/poll round update without dropping a quote that was already saved. */
export function mergeActiveRound(prev: Round | null, incoming: Round): Round {
  if (!prev || prev.id !== incoming.id) return incoming
  return {
    ...prev,
    ...incoming,
    quote_text: incoming.quote_text ?? prev.quote_text,
    quote_author_participant_id: incoming.quote_author_participant_id ?? prev.quote_author_participant_id,
    quote_submitted_at: incoming.quote_submitted_at ?? prev.quote_submitted_at,
  }
}

export function wstEligibleSubmitters(players: Player[]): Player[] {
  return players.filter((p) => p.participant_id)
}

export function wstCorrectParticipantId(
  submitterPlayerId: string | null | undefined,
  players: Player[]
): string | null {
  if (!submitterPlayerId) return null
  return players.find((p) => p.id === submitterPlayerId)?.participant_id ?? null
}

export function wstCorrectParticipantIdFromRound(
  round: { quote_author_participant_id?: string | null; submitter_player_id?: string | null },
  players: Player[]
): string | null {
  if (round.quote_author_participant_id) return round.quote_author_participant_id
  return wstCorrectParticipantId(round.submitter_player_id, players)
}

export function wstCorrectNameFromRound(
  round: { quote_author_participant_id?: string | null; submitter_player_id?: string | null },
  players: Player[],
  participants: Participant[]
): string | null {
  const participantId = wstCorrectParticipantIdFromRound(round, players)
  if (!participantId) return null
  return participants.find((p) => p.id === participantId)?.name ?? null
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

/** One round per quote submitted to the lobby pool (max 20). */
export function wstAutoRoundCount(poolCount: number): number {
  return Math.min(20, Math.max(poolCount, 1))
}

export function shuffleQuotePool<T>(entries: T[]): T[] {
  const arr = [...entries]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export interface WstRoundFromPoolInput {
  gameId: string
  participantIds: string[]
  poolEntries: WstQuotePoolEntry[]
  now: string
}

/** Build one round row per pool entry, quotes pre-filled for the guess phase. */
export function buildRoundsFromQuotePool({ gameId, participantIds, poolEntries, now }: WstRoundFromPoolInput) {
  const shuffled = shuffleQuotePool(poolEntries)
  return shuffled.map((entry, index) => ({
    game_id: gameId,
    round_number: index + 1,
    participant_ids: participantIds,
    submitter_player_id: entry.player_id,
    quote_text: entry.quote_text,
    quote_author_participant_id: entry.author_participant_id,
    quote_submitted_at: index === 0 ? now : null,
    status: index === 0 ? 'active' : 'pending',
    started_at: index === 0 ? now : null,
    ended_at: null,
  }))
}

export function dedupeWstPool(entries: WstQuotePoolEntry[]): WstQuotePoolEntry[] {
  const byPlayer = new Map<string, WstQuotePoolEntry>()
  for (const entry of entries) {
    const existing = byPlayer.get(entry.player_id)
    if (!existing || entry.updated_at > existing.updated_at) {
      byPlayer.set(entry.player_id, entry)
    }
  }
  return [...byPlayer.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

export function mergeWstPoolEntry(prev: WstQuotePoolEntry[], entry: WstQuotePoolEntry): WstQuotePoolEntry[] {
  return dedupeWstPool([...prev.filter((x) => x.player_id !== entry.player_id), entry])
}

export function wstPoolPlayerName(entry: WstQuotePoolEntry, players: Player[]): string | null {
  return players.find((p) => p.id === entry.player_id)?.name ?? null
}

const poolPlayerIds = (pool: WstQuotePoolEntry[]) => new Set(pool.map((e) => e.player_id))

/** Lobby status: who submitted a quote vs who still needs to. */
export function wstQuotePoolStatus(players: Player[], pool: WstQuotePoolEntry[]) {
  const ids = poolPlayerIds(pool)
  const eligible = wstEligibleSubmitters(players)
  const submitted = eligible.filter((p) => ids.has(p.id))
  const awaitingQuote = eligible.filter((p) => !ids.has(p.id))
  const notClaimed = players.filter((p) => !p.participant_id)
  return { submitted, awaitingQuote, notClaimed, eligible }
}

export function tallyWstVotes(votes: Vote[], targets: WstVoteTarget[], correctParticipantId: string | null) {
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
  rounds: { id: string; quote_author_participant_id?: string | null; submitter_player_id?: string | null }[],
  votes: Vote[],
  players: Player[]
): WstPlayerScore[] {
  const scores = new Map<string, number>()
  for (const p of players) scores.set(p.id, 0)

  for (const round of rounds) {
    const correctId = wstCorrectParticipantIdFromRound(round, players)
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
    .sort(
      (a, b) => b.correctGuesses - a.correctGuesses || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )
}
