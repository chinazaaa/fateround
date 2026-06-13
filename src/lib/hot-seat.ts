import type { Player } from '@/types'
import { participantsWhoJoined } from '@/lib/participants'

export const HOT_SEAT_MIN_PLAYERS = 3
/** Hard ceiling — actual max in lobby is min(this, joined player count). */
export const HOT_SEAT_MAX_ROUNDS_CAP = 100

export function hotSeatMaxCapUpperBound(joinedCount: number, listSize?: number): number {
  const candidate = Math.max(
    joinedCount >= HOT_SEAT_MIN_PLAYERS ? joinedCount : 0,
    (listSize ?? 0) >= HOT_SEAT_MIN_PLAYERS ? listSize ?? 0 : 0,
    HOT_SEAT_MIN_PLAYERS
  )
  return Math.min(HOT_SEAT_MAX_ROUNDS_CAP, candidate)
}

export type HotSeatPlayerRow = {
  id: string
  name: string
  participant_id?: string | null
}

/** Players eligible for the hot seat — import: claimed names only; legacy joiners: everyone in the room. */
export function hotSeatJoinedPlayers(
  players: HotSeatPlayerRow[],
  participants: { id: string; name: string }[],
  participantMode?: string | null
): HotSeatPlayerRow[] {
  if ((participantMode ?? 'import') === 'joiners' && participants.length === 0) {
    return [...players]
  }

  const joinedParticipantIds = new Set(participantsWhoJoined(participants, players).map((p) => p.id))
  return players.filter((p) => p.participant_id && joinedParticipantIds.has(p.participant_id))
}

/** Participant ids that may appear in hot seat rounds — joined names only. */
export function hotSeatJoinedParticipantIds(
  players: HotSeatPlayerRow[],
  participants: { id: string; name: string }[],
  participantMode?: string | null
): string[] {
  if ((participantMode ?? 'import') === 'joiners' && participants.length === 0) {
    return players.map((p) => p.participant_id).filter((id): id is string => !!id)
  }
  return participantsWhoJoined(participants, players).map((p) => p.id)
}

export function hotSeatPlayerDisplayName(
  submitterPlayerId: string | null | undefined,
  players: { id: string; name: string; participant_id?: string | null }[],
  participants: { id: string; name: string }[]
): string {
  if (!submitterPlayerId) return 'Someone'

  const player = players.find((p) => p.id === submitterPlayerId)
  if (player) return player.name

  const participant = participants.find((p) => p.id === submitterPlayerId)
  if (participant) {
    const linked = players.find((p) => p.participant_id === participant.id)
    return linked?.name ?? participant.name
  }

  return 'Someone'
}

export function buildHotSeatRoundRows(opts: {
  gameId: string
  players: HotSeatPlayerRow[]
  participants: { id: string; name: string }[]
  participantMode?: string | null
  maxRoundsCap: number
  now: string
}):
  | { ok: true; roundRows: Array<Record<string, unknown>>; roundsCount: number }
  | { ok: false; error: string } {
  const joined = hotSeatJoinedPlayers(opts.players, opts.participants, opts.participantMode)
  if (joined.length < HOT_SEAT_MIN_PLAYERS) {
    return {
      ok: false,
      error: `Need at least ${HOT_SEAT_MIN_PLAYERS} players who claimed a name from the list`,
    }
  }

  const participantIds = hotSeatJoinedParticipantIds(opts.players, opts.participants, opts.participantMode)
  const roundsCount = hotSeatEffectiveRounds(joined.length, opts.maxRoundsCap)
  const sequence = buildHotSeatSequence(joined as Player[], roundsCount)

  const roundRows = sequence.map((hotSeatPlayer, index) => ({
    game_id: opts.gameId,
    round_number: index + 1,
    participant_ids: participantIds,
    submitter_player_id: hotSeatPlayer.id,
    status: index === 0 ? 'active' : ('pending' as const),
    started_at: index === 0 ? opts.now : null,
    ended_at: null,
  }))

  return { ok: true, roundRows, roundsCount }
}

/** Build a round-robin sequence of players for the hot seat. */
export function buildHotSeatSequence(players: Player[], roundCount: number): Player[] {
  if (players.length === 0) return []
  const shuffled = [...players].sort(() => Math.random() - 0.5)
  const sequence: Player[] = []
  for (let i = 0; i < roundCount; i++) {
    sequence.push(shuffled[i % shuffled.length])
  }
  return sequence
}

/** Clamp admin max-rounds cap to a valid integer in range. */
export function clampHotSeatMaxCap(raw: unknown, upperBound?: number): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  const upper = upperBound ?? HOT_SEAT_MAX_ROUNDS_CAP
  if (!Number.isFinite(n)) return HOT_SEAT_MIN_PLAYERS
  return Math.min(upper, Math.max(HOT_SEAT_MIN_PLAYERS, Math.floor(n)))
}

/** Playable rounds = one turn per joined player, capped by admin max. */
export function hotSeatEffectiveRounds(joinedCount: number, maxCap: number): number {
  if (joinedCount < HOT_SEAT_MIN_PLAYERS) return 0
  const cap = Math.max(maxCap, HOT_SEAT_MIN_PLAYERS)
  return Math.min(joinedCount, cap)
}

export function hotSeatLobbyRoundsHint(joinedCount: number, maxCap: number): string {
  if (joinedCount < HOT_SEAT_MIN_PLAYERS) {
    return `Need at least ${HOT_SEAT_MIN_PLAYERS} players who claimed a name`
  }
  const effective = hotSeatEffectiveRounds(joinedCount, maxCap)
  if (effective < joinedCount) {
    return `${joinedCount} players joined → ${effective} rounds (max cap ${maxCap})`
  }
  return `${joinedCount} players joined → ${effective} rounds`
}

/** @deprecated Use hotSeatEffectiveRounds(joined, maxCap) */
export function hotSeatAutoRoundCount(playerCount: number): number {
  return hotSeatEffectiveRounds(playerCount, HOT_SEAT_MAX_ROUNDS_CAP)
}

export interface HotSeatSubmission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  text: string
  submission_type: 'compliment' | 'roast' | 'observation'
  created_at: string
}

export const HOT_SEAT_SUBMISSION_TYPES = [
  { type: 'compliment' as const, emoji: '💛', label: 'Compliment' },
  { type: 'roast' as const, emoji: '🔥', label: 'Roast' },
  { type: 'observation' as const, emoji: '👀', label: 'Observation' },
]
