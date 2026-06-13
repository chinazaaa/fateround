import type { PlayerGender } from '@/types'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateGameCode(): string {
  return Array.from({ length: 6 }, () =>
    CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  ).join('')
}

export function generateToken(): string {
  return Array.from({ length: 40 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')
}

/**
 * Generates round trios with minimal participant repetition.
 * With enough participants (>= roundCount * 3) nobody appears twice.
 * When the pool runs out it refills, pushing the most-recently-seen
 * participants to the back so repeats are spread as far apart as possible.
 */
export function generateRounds(participantIds: string[], roundCount: number): string[][] {
  if (participantIds.length < 3) return []

  const rounds: string[][] = []
  let pool = [...participantIds].sort(() => Math.random() - 0.5)

  for (let r = 0; r < roundCount; r++) {
    if (pool.length < 3) {
      const lastUsed = rounds[rounds.length - 1] ?? []
      const notRecent = participantIds
        .filter((id) => !lastUsed.includes(id))
        .sort(() => Math.random() - 0.5)
      const recent = lastUsed.sort(() => Math.random() - 0.5)
      pool = [...notRecent, ...recent]
    }
    rounds.push(pool.splice(0, 3))
  }

  return rounds
}

export type ParticipantForRounds = { id: string; gender: 'male' | 'female' }

/** Each round uses three people of the same gender; alternates when both pools qualify. */
export function generateRoundsByGender(
  participants: ParticipantForRounds[],
  roundCount: number
): string[][] {
  if (roundCount <= 0) return []

  const byGender: Record<'male' | 'female', string[]> = { male: [], female: [] }
  for (const p of participants) {
    byGender[p.gender].push(p.id)
  }

  const eligible = (['male', 'female'] as const).filter((g) => byGender[g].length >= 3)
  if (eligible.length === 0) return []

  if (eligible.length === 1) {
    return generateRounds(byGender[eligible[0]], roundCount)
  }

  const maleCount = Math.ceil(roundCount / 2)
  const femaleCount = Math.floor(roundCount / 2)
  const maleTrios = generateRounds(byGender.male, maleCount)
  const femaleTrios = generateRounds(byGender.female, femaleCount)

  const result: string[][] = []
  let mi = 0
  let fi = 0
  const startWithMale = byGender.male.length >= byGender.female.length

  for (let r = 0; r < roundCount; r++) {
    const preferMale = startWithMale ? r % 2 === 0 : r % 2 === 1
    if (preferMale) {
      if (mi < maleTrios.length) result.push(maleTrios[mi++])
      else if (fi < femaleTrios.length) result.push(femaleTrios[fi++])
    } else {
      if (fi < femaleTrios.length) result.push(femaleTrios[fi++])
      else if (mi < maleTrios.length) result.push(maleTrios[mi++])
    }
  }

  return result
}

/** Participant IDs that appeared in at least one round. */
export function getParticipantIdsFromRounds(rounds: { participant_ids: string[] }[]): Set<string> {
  const ids = new Set<string>()
  for (const round of rounds) {
    for (const id of round.participant_ids) ids.add(id)
  }
  return ids
}

export function filterParticipantsInRounds<T extends { id: string }>(
  participants: T[],
  rounds: { participant_ids: string[] }[]
): T[] {
  const playedIds = getParticipantIdsFromRounds(rounds)
  return participants.filter((p) => playedIds.has(p.id))
}

export function getPlayerSession(gameCode: string): {
  playerId: string
  playerName: string
  playerGender: PlayerGender
} | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`kmk_player_${gameCode.toUpperCase()}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.playerId || !parsed?.playerName) return null
    const g = parsed.playerGender
    const playerGender: PlayerGender = g === 'male' || g === 'both' ? g : 'female'
    return { playerId: parsed.playerId, playerName: parsed.playerName, playerGender }
  } catch {
    return null
  }
}

export function setPlayerSession(
  gameCode: string,
  playerId: string,
  playerName: string,
  playerGender: PlayerGender
): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(
    `kmk_player_${gameCode.toUpperCase()}`,
    JSON.stringify({ playerId, playerName, playerGender })
  )
}

export function getInitial(name: string): string {
  return name.charAt(0).toUpperCase()
}
