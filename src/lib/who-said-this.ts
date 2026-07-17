import type { Participant, Player, Round, Vote, WstQuotePoolEntry } from '@/types'

export function isAnimeRound(round: { anime_metadata?: unknown | null }): boolean {
  return round.anime_metadata != null
}

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
    anime_metadata: incoming.anime_metadata ?? prev.anime_metadata,
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
    submitter_player_id: entry.player_id ?? null,
    quote_text: entry.quote_text,
    quote_author_participant_id: entry.author_participant_id,
    quote_submitted_at: index === 0 ? now : null,
    status: index === 0 ? 'active' : 'pending',
    started_at: index === 0 ? now : null,
    ended_at: null,
  }))
}

export interface AnimeRoundInput {
  gameId: string
  participantIds: string[]
  animeQuotes: Array<{
    quote_text: string
    anime_name: string
    correct_character: string
    choices: string[]
  }>
  startIndex: number
  now: string
}

export function buildRoundsFromAnimePool({ gameId, participantIds, animeQuotes, startIndex, now }: AnimeRoundInput) {
  const shuffled = shuffleQuotePool(animeQuotes)
  return shuffled.map((entry, index) => {
    const roundNumber = startIndex + index + 1
    const isFirst = roundNumber === 1
    return {
      game_id: gameId,
      round_number: roundNumber,
      participant_ids: participantIds,
      submitter_player_id: null,
      quote_text: entry.quote_text,
      quote_author_participant_id: null,
      quote_submitted_at: isFirst ? now : null,
      anime_metadata: {
        source: 'anime' as const,
        anime_name: entry.anime_name,
        correct_character: entry.correct_character,
        choices: entry.choices,
      },
      status: isFirst ? 'active' : 'pending',
      started_at: isFirst ? now : null,
      ended_at: null,
    }
  })
}

/** Number of answer options shown per Pre-set-roster deck round (correct + distractors). */
export const WST_DECK_CHOICE_COUNT = 4
/** A deck game needs enough rounds + distinct answers to make guessing meaningful. */
export const WST_DECK_MIN_ENTRIES = 2

/** One row of a host-provided Who Said This deck: a quote and who said it, plus an
 *  optional category/series label used purely for display. */
export interface WstDeckEntry {
  quote: string
  answer: string
  category?: string | null
}

/** Distinct answers across the deck, preserving first-seen order (case-insensitive dedupe). */
export function wstDeckAnswers(deck: WstDeckEntry[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of deck) {
    const key = e.answer.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(e.answer.trim())
  }
  return out
}

export interface WstDeckRoundInput {
  gameId: string
  participantIds: string[]
  deck: WstDeckEntry[]
  startIndex: number
  now: string
  choiceCount?: number
}

/**
 * Build choice-based rounds from a host deck (Pre-set roster). Each round guesses the quote's
 * author from `choiceCount` string options: the correct answer plus distractors sampled from
 * the deck's other answers. Reuses the `anime_metadata` choice-round shape (source: 'deck'),
 * so the existing guess/vote/tally/UI plumbing renders it unchanged. If the deck has fewer
 * distinct answers than `choiceCount`, rounds simply show every available answer.
 */
export function buildRoundsFromDeck({
  gameId,
  participantIds,
  deck,
  startIndex,
  now,
  choiceCount = WST_DECK_CHOICE_COUNT,
}: WstDeckRoundInput) {
  const allAnswers = wstDeckAnswers(deck)
  const shuffled = shuffleQuotePool(deck)
  return shuffled.map((entry, index) => {
    const roundNumber = startIndex + index + 1
    const isFirst = roundNumber === 1
    const answer = entry.answer.trim()
    // Distractors: other distinct answers, shuffled, capped to fill the choice slots.
    const distractors = shuffleQuotePool(allAnswers.filter((a) => a.toLowerCase() !== answer.toLowerCase())).slice(
      0,
      Math.max(0, choiceCount - 1)
    )
    const choices = shuffleQuotePool([answer, ...distractors])
    return {
      game_id: gameId,
      round_number: roundNumber,
      participant_ids: participantIds,
      submitter_player_id: null,
      quote_text: entry.quote,
      quote_author_participant_id: null,
      quote_submitted_at: isFirst ? now : null,
      anime_metadata: {
        source: 'deck' as const,
        anime_name: entry.category?.trim() || '',
        correct_character: answer,
        choices,
      },
      status: isFirst ? 'active' : 'pending',
      started_at: isFirst ? now : null,
      ended_at: null,
    }
  })
}

export function dedupeWstPool(entries: WstQuotePoolEntry[]): WstQuotePoolEntry[] {
  return [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

export function mergeWstPoolEntry(prev: WstQuotePoolEntry[], entry: WstQuotePoolEntry): WstQuotePoolEntry[] {
  const without = prev.filter((x) => x.id !== entry.id)
  return dedupeWstPool([...without, entry])
}

export function isWstHostQuote(entry: WstQuotePoolEntry): boolean {
  return entry.player_id == null
}

export function wstHostPoolEntries(pool: WstQuotePoolEntry[]): WstQuotePoolEntry[] {
  return pool
    .filter(isWstHostQuote)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

export function wstPoolQuoteCountByPlayer(pool: WstQuotePoolEntry[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const entry of pool) {
    if (!entry.player_id) continue
    counts.set(entry.player_id, (counts.get(entry.player_id) ?? 0) + 1)
  }
  return counts
}

export function wstPoolPlayerName(entry: WstQuotePoolEntry, players: Player[]): string | null {
  return players.find((p) => p.id === entry.player_id)?.name ?? null
}

/** Lobby status: who submitted at least one quote vs who still needs to. */
export function wstQuotePoolStatus(players: Player[], pool: WstQuotePoolEntry[]) {
  const quoteCounts = wstPoolQuoteCountByPlayer(pool)
  const eligible = wstEligibleSubmitters(players)
  const submitted = eligible.filter((p) => (quoteCounts.get(p.id) ?? 0) > 0)
  const awaitingQuote = eligible.filter((p) => (quoteCounts.get(p.id) ?? 0) === 0)
  const notClaimed = players.filter((p) => !p.participant_id)
  return { submitted, awaitingQuote, notClaimed, eligible, quoteCounts }
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

export interface AnimeWstTally {
  rows: Array<{ choice: string; count: number }>
  voterCount: number
  maxCount: number
  topGuesses: string[]
  correctCount: number
  correctCharacter: string
}

export function tallyAnimeWstVotes(votes: Vote[], choices: string[], correctCharacter: string): AnimeWstTally {
  const counts = new Map<string, number>()
  for (const c of choices) counts.set(c, 0)
  let correctCount = 0

  for (const vote of votes) {
    const picked = vote.anime_choice
    if (!picked) continue
    counts.set(picked, (counts.get(picked) ?? 0) + 1)
    if (picked === correctCharacter) correctCount += 1
  }

  const rows = choices
    .map((c) => ({ choice: c, count: counts.get(c) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.choice.localeCompare(b.choice))

  const maxCount = rows.length > 0 ? rows[0].count : 0
  const topGuesses = rows.filter((r) => r.count === maxCount && maxCount > 0).map((r) => r.choice)

  return {
    rows,
    voterCount: votes.filter((v) => v.anime_choice).length,
    maxCount,
    topGuesses,
    correctCount,
    correctCharacter,
  }
}

export interface WstPlayerScore {
  playerId: string
  name: string
  correctGuesses: number
}

/** Points for picking the right name each round. */
export function tallyWstPlayerScores(
  rounds: {
    id: string
    quote_author_participant_id?: string | null
    submitter_player_id?: string | null
    anime_metadata?: { correct_character: string } | null
  }[],
  votes: Vote[],
  players: Player[]
): WstPlayerScore[] {
  const scores = new Map<string, number>()
  const activePlayers = players.filter((p) => p.spectator !== true)
  for (const p of activePlayers) scores.set(p.id, 0)

  for (const round of rounds) {
    const roundVotes = votes.filter((v) => v.round_id === round.id)

    if (round.anime_metadata) {
      const correctChar = round.anime_metadata.correct_character
      for (const vote of roundVotes) {
        if (vote.anime_choice === correctChar) {
          scores.set(vote.player_id, (scores.get(vote.player_id) ?? 0) + 1)
        }
      }
    } else {
      const correctId = wstCorrectParticipantIdFromRound(round, players)
      if (!correctId) continue
      for (const vote of roundVotes) {
        if (vote.target_participant_id === correctId) {
          scores.set(vote.player_id, (scores.get(vote.player_id) ?? 0) + 1)
        }
      }
    }
  }

  return [...scores.entries()]
    .map(([playerId, correctGuesses]) => ({
      playerId,
      name: activePlayers.find((p) => p.id === playerId)?.name ?? 'Unknown',
      correctGuesses,
    }))
    .sort(
      (a, b) => b.correctGuesses - a.correctGuesses || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )
}
