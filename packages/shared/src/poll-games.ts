import type {
  Game,
  GameType,
  PairAssignmentMap,
  PairFlag,
  PairVoteMode,
  Participant,
  Player,
  Vote,
  VoteAssignment,
  VoteSlot,
} from './types'

export const BATCH_2_POLL_GAMES: GameType[] = [
  'would_you_rather',
  'this_or_that',
  'never_have_i_ever',
  'most_likely_to',
  'who_said_this',
  'smash_marry_kill',
  'smash_or_pass',
  'red_flag_green_flag',
  'pick_a_number',
  'parent_approval',
]

export function parseGameType(raw: GameType | string | undefined): GameType {
  return (typeof raw === 'string' ? raw : 'would_you_rather') as GameType
}

export function isWouldYouRather(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'would_you_rather'
}

export function isThisOrThat(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'this_or_that'
}

export function isBinaryChoiceGame(gameType: GameType | string | undefined): boolean {
  return isWouldYouRather(gameType) || isThisOrThat(gameType)
}

export function isNeverHaveIEver(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'never_have_i_ever'
}

export function isMostLikelyTo(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'most_likely_to'
}

export function isWhoSaidThis(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'who_said_this'
}

export function isPickANumber(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'pick_a_number'
}

export function isPairGame(gameType: GameType | string | undefined): boolean {
  const type = parseGameType(gameType)
  return type === 'red_flag_green_flag' || type === 'smash_or_pass'
}

export function isUnaryPollGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'parent_approval'
}

export function isBinaryPeoplePollGame(gameType: GameType | string | undefined): boolean {
  return isPairGame(gameType) || isUnaryPollGame(gameType)
}

export function isThreeChoiceGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'smash_marry_kill'
}

export function isPollGame(gameType: GameType | string | undefined): boolean {
  return BATCH_2_POLL_GAMES.includes(parseGameType(gameType))
}

export function parsePairVoteMode(raw: unknown): PairVoteMode {
  return raw === 'any' ? 'any' : 'one_each'
}

export function isVoterOnlyMode(game: Pick<Game, 'participant_mode' | 'game_type'>): boolean {
  if (game.participant_mode === 'voters') return true
  return isMostLikelyTo(game.game_type) && game.participant_mode === 'import'
}

export function isMltImportGame(game: Pick<Game, 'game_type' | 'participant_mode'>): boolean {
  return isMostLikelyTo(game.game_type) && isVoterOnlyMode(game)
}

export function voteSlots(gameType?: GameType | string): VoteSlot[] {
  return isThreeChoiceGame(gameType) ? ['kiss', 'marry', 'kill'] : ['kiss', 'kill']
}

export function emptyAssignment(): VoteAssignment {
  return { kiss: null, marry: null, kill: null }
}

export function isAssignmentComplete(assignment: VoteAssignment, gameType?: GameType | string): boolean {
  return voteSlots(gameType).every((slot) => assignment[slot])
}

export function isPairAssignmentComplete(pairAssignment: PairAssignmentMap, participantIds: string[]): boolean {
  return participantIds.every((id) => pairAssignment[id] === 'kiss' || pairAssignment[id] === 'kill')
}

export function isPairAssignmentValid(
  pairAssignment: PairAssignmentMap,
  participantIds: string[],
  mode: PairVoteMode
): boolean {
  if (!isPairAssignmentComplete(pairAssignment, participantIds)) return false
  if (mode !== 'one_each' || participantIds.length !== 2) return true
  const [a, b] = participantIds.map((id) => pairAssignment[id])
  return (a === 'kiss' && b === 'kill') || (a === 'kill' && b === 'kiss')
}

export function assignPairSlot(
  prev: PairAssignmentMap,
  participantId: string,
  action: PairFlag,
  participantIds: string[],
  mode: PairVoteMode
): PairAssignmentMap {
  if (prev[participantId] === action) {
    const next = { ...prev }
    delete next[participantId]
    return next
  }

  if (mode === 'any') {
    return { ...prev, [participantId]: action }
  }

  const next = { ...prev }
  const myCurrent = prev[participantId]
  const holderId = Object.entries(prev).find(([id, flag]) => flag === action && id !== participantId)?.[0]

  if (holderId) {
    if (myCurrent) next[holderId] = myCurrent
    else delete next[holderId]
  }

  next[participantId] = action
  return next
}

export function parsePickANumberPool(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      const q = item.trim()
      if (q) out.push(q)
    } else if (item && typeof item === 'object') {
      const q = String((item as { question?: unknown }).question ?? '').trim()
      if (q) out.push(q)
    }
  }
  return out
}

export function panUsedNumbersFromVotes(
  votes: Array<{ picked_number?: number | null; round_id?: string | null }>,
  currentRoundId?: string | null
): Set<number> {
  const used = new Set<number>()
  for (const vote of votes) {
    if (currentRoundId && vote.round_id === currentRoundId) continue
    if (typeof vote.picked_number === 'number' && Number.isInteger(vote.picked_number)) {
      used.add(vote.picked_number)
    }
  }
  return used
}

export function panAvailableNumbers(poolSize: number, used: Iterable<number>): number[] {
  const usedSet = used instanceof Set ? used : new Set(used)
  return Array.from({ length: poolSize }, (_, i) => i + 1).filter((n) => !usedSet.has(n))
}

export function mltVoteTargets(
  game: Pick<Game, 'game_type' | 'participant_mode'>,
  players: Player[],
  participants: Participant[]
): { id: string; name: string; kind: 'player' | 'participant' }[] {
  if (isMltImportGame(game)) {
    return participants
      .map((p) => ({ id: p.id, name: p.name, kind: 'participant' as const }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }
  return [...players]
    .filter((p) => !p.spectator && !p.is_eliminated)
    .map((p) => ({ id: p.id, name: p.name, kind: 'player' as const }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export function participantNameMap(participants: Participant[]): Map<string, string> {
  return new Map(participants.map((p) => [p.id, p.name]))
}

export function roundParticipants(roundIds: string[], participants: Participant[]): Participant[] {
  const byId = new Map(participants.map((p) => [p.id, p]))
  return roundIds.map((id) => byId.get(id)).filter((p): p is Participant => !!p)
}

export function pairLabels(gameType: GameType | string): { positive: string; negative: string } {
  const type = parseGameType(gameType)
  if (type === 'smash_or_pass') return { positive: 'Smash', negative: 'Pass' }
  if (type === 'red_flag_green_flag') return { positive: 'Green', negative: 'Red' }
  if (type === 'parent_approval') return { positive: 'Yes', negative: 'Pass' }
  return { positive: 'Yes', negative: 'No' }
}

export function smkSlotLabels(): Record<VoteSlot, string> {
  return { kiss: '💋 Kiss', marry: '💍 Marry', kill: '💀 Kill' }
}

export function pollGameLabel(gameType: GameType | string): string {
  const labels: Partial<Record<GameType, string>> = {
    would_you_rather: 'Would You Rather',
    this_or_that: 'This or That',
    never_have_i_ever: 'Never Have I Ever',
    most_likely_to: 'Most Likely To',
    who_said_this: 'Who Said This',
    smash_marry_kill: 'Smash Marry Kill',
    smash_or_pass: 'Smash or Pass',
    red_flag_green_flag: 'Red Flag Green Flag',
    pick_a_number: 'Pick a Number',
    parent_approval: 'Date My Kid',
  }
  return labels[parseGameType(gameType)] ?? 'Poll'
}

export function voteFromExisting(vote: Vote | undefined): {
  wyrChoice: 'a' | 'b' | null
  targetId: string | null
  animeChoice: string | null
  pickedNumber: number | null
  assignment: VoteAssignment
  pairAssignment: PairAssignmentMap
} {
  const assignment = emptyAssignment()
  if (vote) {
    assignment.kiss = vote.kiss_participant_id
    assignment.marry = vote.marry_participant_id
    assignment.kill = vote.kill_participant_id
  }
  const pairAssignment: PairAssignmentMap = vote?.pair_assignments ? { ...vote.pair_assignments } : {}
  return {
    wyrChoice: vote?.wyr_choice ?? null,
    targetId: vote?.target_participant_id ?? vote?.target_player_id ?? null,
    animeChoice: vote?.anime_choice ?? null,
    pickedNumber: vote?.picked_number ?? null,
    assignment,
    pairAssignment,
  }
}
