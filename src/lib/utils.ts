import type { PlayerGender } from '@/types'
import { parsePlayerGenderFromDb } from '@/lib/participants'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateGameCode(): string {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
}

export function generateResumeToken(): string {
  return generateGameCode()
}

export function normalizeResumeToken(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function generateToken(): string {
  return Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function trioKey(trio: string[]): string {
  return [...trio].sort().join('|')
}

function pairKey(pair: string[]): string {
  return [...pair].sort().join('|')
}

/**
 * Builds same-gender round trios with fair rotation:
 * - Prefer people who have appeared least often
 * - Avoid back-to-back rounds for the same person when possible
 * - Avoid repeating the exact same trio when possible
 */
export function generateRounds(
  participantIds: string[],
  roundCount: number,
  initialAppearanceCounts?: Map<string, number>
): string[][] {
  if (participantIds.length < 3 || roundCount <= 0) return []

  const ids = [...participantIds]
  const appearanceCount = new Map<string, number>(ids.map((id) => [id, initialAppearanceCounts?.get(id) ?? 0]))
  const lastRound = new Map<string, number>(ids.map((id) => [id, Number.NEGATIVE_INFINITY]))
  const usedTrios = new Set<string>()
  const rounds: string[][] = []

  for (let r = 0; r < roundCount; r++) {
    const ranked = [...ids].sort((a, b) => {
      const countDiff = (appearanceCount.get(a) ?? 0) - (appearanceCount.get(b) ?? 0)
      if (countDiff !== 0) return countDiff

      const la = lastRound.get(a) ?? Number.NEGATIVE_INFINITY
      const lb = lastRound.get(b) ?? Number.NEGATIVE_INFINITY
      const backToBackA = la === r - 1 ? 1 : 0
      const backToBackB = lb === r - 1 ? 1 : 0
      if (backToBackA !== backToBackB) return backToBackA - backToBackB

      return la - lb
    })

    const minCount = appearanceCount.get(ranked[0]) ?? 0
    const topTier = shuffleInPlace(ranked.filter((id) => (appearanceCount.get(id) ?? 0) === minCount))
    const rest = ranked.filter((id) => (appearanceCount.get(id) ?? 0) > minCount)
    const ordered = [...topTier, ...rest]

    let trio: string[] | null = null

    outer: for (let i = 0; i < ordered.length - 2; i++) {
      for (let j = i + 1; j < ordered.length - 1; j++) {
        for (let k = j + 1; k < ordered.length; k++) {
          const candidate = [ordered[i], ordered[j], ordered[k]]
          const key = trioKey(candidate)
          const hasBackToBack = candidate.some((id) => lastRound.get(id) === r - 1)
          if (usedTrios.has(key) || hasBackToBack) continue
          trio = candidate
          break outer
        }
      }
    }

    if (!trio) {
      outer2: for (let i = 0; i < ordered.length - 2; i++) {
        for (let j = i + 1; j < ordered.length - 1; j++) {
          for (let k = j + 1; k < ordered.length; k++) {
            const candidate = [ordered[i], ordered[j], ordered[k]]
            if (!usedTrios.has(trioKey(candidate))) {
              trio = candidate
              break outer2
            }
          }
        }
      }
    }

    if (!trio) {
      trio = ordered.slice(0, 3)
    }

    rounds.push(trio)
    usedTrios.add(trioKey(trio))
    for (const id of trio) {
      appearanceCount.set(id, (appearanceCount.get(id) ?? 0) + 1)
      lastRound.set(id, r)
    }
  }

  return rounds
}

/**
 * Builds same-gender round pairs with fair rotation (Red Flag / Green Flag).
 */
export function generatePairRounds(
  participantIds: string[],
  roundCount: number,
  initialAppearanceCounts?: Map<string, number>
): string[][] {
  if (participantIds.length < 2 || roundCount <= 0) return []

  const ids = [...participantIds]
  const appearanceCount = new Map<string, number>(ids.map((id) => [id, initialAppearanceCounts?.get(id) ?? 0]))
  const lastRound = new Map<string, number>(ids.map((id) => [id, Number.NEGATIVE_INFINITY]))
  const usedPairs = new Set<string>()
  const rounds: string[][] = []

  for (let r = 0; r < roundCount; r++) {
    const ranked = [...ids].sort((a, b) => {
      const countDiff = (appearanceCount.get(a) ?? 0) - (appearanceCount.get(b) ?? 0)
      if (countDiff !== 0) return countDiff

      const la = lastRound.get(a) ?? Number.NEGATIVE_INFINITY
      const lb = lastRound.get(b) ?? Number.NEGATIVE_INFINITY
      const backToBackA = la === r - 1 ? 1 : 0
      const backToBackB = lb === r - 1 ? 1 : 0
      if (backToBackA !== backToBackB) return backToBackA - backToBackB

      return la - lb
    })

    const minCount = appearanceCount.get(ranked[0]) ?? 0
    const topTier = shuffleInPlace(ranked.filter((id) => (appearanceCount.get(id) ?? 0) === minCount))
    const rest = ranked.filter((id) => (appearanceCount.get(id) ?? 0) > minCount)
    const ordered = [...topTier, ...rest]

    let pair: string[] | null = null

    outer: for (let i = 0; i < ordered.length - 1; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const candidate = [ordered[i], ordered[j]]
        const key = pairKey(candidate)
        const hasBackToBack = candidate.some((id) => lastRound.get(id) === r - 1)
        if (usedPairs.has(key) || hasBackToBack) continue
        pair = candidate
        break outer
      }
    }

    if (!pair) {
      outer2: for (let i = 0; i < ordered.length - 1; i++) {
        for (let j = i + 1; j < ordered.length; j++) {
          const candidate = [ordered[i], ordered[j]]
          if (!usedPairs.has(pairKey(candidate))) {
            pair = candidate
            break outer2
          }
        }
      }
    }

    if (!pair) {
      pair = ordered.slice(0, 2)
    }

    rounds.push(pair)
    usedPairs.add(pairKey(pair))
    for (const id of pair) {
      appearanceCount.set(id, (appearanceCount.get(id) ?? 0) + 1)
      lastRound.set(id, r)
    }
  }

  return rounds
}

/** Generate rounds with N participants each (for custom games with 2-5 slots). */
export function generateNRounds(
  participantIds: string[],
  roundCount: number,
  poolSize: number,
  initialAppearanceCounts?: Map<string, number>
): string[][] {
  if (participantIds.length < poolSize || poolSize < 1) return []

  const rounds: string[][] = []
  const appearances = new Map<string, number>()
  for (const id of participantIds) appearances.set(id, initialAppearanceCounts?.get(id) ?? 0)
  const seen = new Set<string>()

  for (let r = 0; r < roundCount; r++) {
    const sorted = [...participantIds].sort((a, b) => {
      const diff = (appearances.get(a) ?? 0) - (appearances.get(b) ?? 0)
      if (diff !== 0) return diff
      return Math.random() - 0.5
    })

    const group = sorted.slice(0, poolSize)
    const key = [...group].sort().join(',')

    if (seen.has(key) && r < roundCount - 1) {
      const shuffled = [...participantIds].sort(() => Math.random() - 0.5)
      const alt = shuffled.slice(0, poolSize)
      const altKey = [...alt].sort().join(',')
      if (!seen.has(altKey)) {
        group.length = 0
        group.push(...alt)
      }
    }

    const finalKey = [...group].sort().join(',')
    seen.add(finalKey)
    rounds.push(group)

    for (const id of group) {
      appearances.set(id, (appearances.get(id) ?? 0) + 1)
    }
  }

  return rounds
}

export type ParticipantForRounds = { id: string; gender: 'male' | 'female' }

/** Each round uses same-gender people; alternates when both pools qualify. */
export function generateRoundsByGender(
  participants: ParticipantForRounds[],
  roundCount: number,
  poolSize: 1 | 2 | 3 = 3,
  initialAppearanceCounts?: Map<string, number>
): string[][] {
  if (roundCount <= 0) return []

  const generate =
    poolSize === 1
      ? (ids: string[], rc: number, ic?: Map<string, number>) => generateNRounds(ids, rc, 1, ic)
      : poolSize === 2
        ? generatePairRounds
        : generateRounds
  const minPool = poolSize

  const byGender: Record<'male' | 'female', string[]> = { male: [], female: [] }
  for (const p of participants) {
    byGender[p.gender].push(p.id)
  }

  const eligible = (['male', 'female'] as const).filter((g) => byGender[g].length >= minPool)
  if (eligible.length === 0) return []

  if (eligible.length === 1) {
    return generate(byGender[eligible[0]], roundCount, initialAppearanceCounts)
  }

  const maleCount = Math.ceil(roundCount / 2)
  const femaleCount = Math.floor(roundCount / 2)
  const maleTrios = generate(byGender.male, maleCount, initialAppearanceCounts)
  const femaleTrios = generate(byGender.female, femaleCount, initialAppearanceCounts)

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
  resumeToken: string | null
} | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`kmk_player_${gameCode.toUpperCase()}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.playerId || !parsed?.playerName) return null
    const g = parsed.playerGender
    const playerGender = parsePlayerGenderFromDb(g)
    if (!playerGender) return null
    const resumeToken =
      typeof parsed.resumeToken === 'string' && parsed.resumeToken.trim()
        ? normalizeResumeToken(parsed.resumeToken)
        : null
    return { playerId: parsed.playerId, playerName: parsed.playerName, playerGender, resumeToken }
  } catch {
    return null
  }
}

export function setPlayerSession(
  gameCode: string,
  playerId: string,
  playerName: string,
  playerGender: PlayerGender,
  resumeToken?: string | null
): void {
  if (typeof window === 'undefined') return
  const token = typeof resumeToken === 'string' && resumeToken.trim() ? normalizeResumeToken(resumeToken) : null
  localStorage.setItem(
    `kmk_player_${gameCode.toUpperCase()}`,
    JSON.stringify({ playerId, playerName, playerGender, resumeToken: token })
  )
  // A real join clears any prior "kicked" mark — the player deliberately came back.
  clearPlayerKicked(gameCode)
  window.dispatchEvent(new CustomEvent('kmk-player-session', { detail: { gameCode: gameCode.toUpperCase() } }))
}

/**
 * Mark that this device's player is no longer in the game (host kick or self-leave),
 * so room-link auto-join won't silently re-add them. They can still rejoin, but only
 * by deliberately tapping "join" — which clears the mark via {@link setPlayerSession}.
 * {@link clearPlayerSession} sets this automatically, so every leave/removal path is
 * covered without each caller having to remember to mark it.
 */
export function markPlayerKicked(gameCode: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`kmk_kicked_${gameCode.toUpperCase()}`, '1')
}

export function wasPlayerKicked(gameCode: string): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(`kmk_kicked_${gameCode.toUpperCase()}`) === '1'
}

export function clearPlayerKicked(gameCode: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(`kmk_kicked_${gameCode.toUpperCase()}`)
}

export function clearPlayerSession(gameCode: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(`kmk_player_${gameCode.toUpperCase()}`)
  // Clearing the session means the player left or was removed — mark them kicked so a
  // room link won't silently auto-rejoin them until they deliberately tap "join".
  markPlayerKicked(gameCode)
  window.dispatchEvent(new CustomEvent('kmk-player-session', { detail: { gameCode: gameCode.toUpperCase() } }))
}

export function getInitial(name: string): string {
  return name.charAt(0).toUpperCase()
}

const FETCH_NETWORK_ERROR = /load failed|failed to fetch|networkerror|network request failed/i

export function isFetchNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && FETCH_NETWORK_ERROR.test(err.message))
}

export function messageFromFetchActionError(err: unknown, fallback = 'Action failed'): string {
  if (isFetchNetworkError(err)) {
    return 'Connection lost — check your network and try again'
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}
