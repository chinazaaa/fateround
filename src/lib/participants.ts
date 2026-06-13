import {
  roundPoolSize,
  isWouldYouRather,
  isMostLikelyTo,
  isWhoSaidThis,
  isHotSeat,
  isLobbyGame,
  isNameOnlyPlayerJoin,
  parseGameType,
} from '@/lib/game-types'
import { WYR_QUESTION_COUNT } from '@/lib/would-you-rather-questions'
import { MLT_QUESTION_COUNT } from '@/lib/most-likely-to-questions'
import type { GameType, ParticipantMode } from '@/types'

export type ParticipantGender = 'male' | 'female'
export type PlayerGender = 'male' | 'female' | 'both'

export interface ParticipantInput {
  name: string
  gender: ParticipantGender
}

const MALE_ALIASES = new Set(['m', 'male', 'man', 'men', 'boy', 'boys', 'guy', 'guys'])
const FEMALE_ALIASES = new Set(['f', 'female', 'woman', 'women', 'girl', 'girls', 'lady', 'ladies'])

export function normalizeGender(raw: string): ParticipantGender | null {
  const key = raw.trim().toLowerCase()
  if (!key) return null
  if (MALE_ALIASES.has(key)) return 'male'
  if (FEMALE_ALIASES.has(key)) return 'female'
  return null
}

function isHeaderRow(cols: string[]): boolean {
  if (cols.length < 2) return false
  const a = cols[0].trim().toLowerCase()
  const b = cols[1].trim().toLowerCase()
  return (a === 'name' || a === 'names') && (b === 'gender' || b === 'sex')
}

function splitRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((s) => s.trim())
  if (line.includes(',')) {
    return line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
  }
  return [line.trim()]
}

/** Parse pasted text or CSV file content (name + gender columns). */
export function parseParticipantRows(text: string): ParticipantInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const rows: ParticipantInput[] = []

  for (const line of lines) {
    const cols = splitRow(line)
    if (cols.length < 2) continue
    if (rows.length === 0 && isHeaderRow(cols)) continue

    const name = cols[0].trim()
    const gender = normalizeGender(cols[1])
    if (!name || !gender) continue
    rows.push({ name, gender })
  }

  return rows
}

/** Smash / pair / KMK need gender for same-gender rounds. Name-only lobby games, WST & Hot Seat do not. */
export function participantsNeedGender(gameType?: GameType | string): boolean {
  const type = parseGameType(gameType)
  return !isNameOnlyPlayerJoin(type) && !isWhoSaidThis(type) && !isHotSeat(type)
}

/** Whether the join screen should ask for gender / vote preference. */
export function playerJoinNeedsGender(gameType?: GameType | string): boolean {
  return participantsNeedGender(gameType)
}

/** Parse name-only rows (one name per line or single CSV column). Gender defaults for DB storage. */
export function parseNameOnlyRows(text: string): ParticipantInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const rows: ParticipantInput[] = []

  for (const line of lines) {
    const cols = splitRow(line)
    const name = cols[0]?.trim()
    if (!name) continue
    if (rows.length === 0 && (name.toLowerCase() === 'name' || name.toLowerCase() === 'names')) continue
    const gender = cols.length >= 2 ? normalizeGender(cols[1]) : null
    rows.push({ name, gender: gender ?? 'female' })
  }

  return rows
}

/** Parse upload/paste text — gender required or optional depending on game type. */
export function parseParticipantsForGame(text: string, gameType?: GameType | string): ParticipantInput[] {
  if (participantsNeedGender(gameType)) {
    return parseParticipantRows(text)
  }
  const withGender = parseParticipantRows(text)
  if (withGender.length > 0) return withGender
  return parseNameOnlyRows(text)
}

export function participantUploadHint(gameType?: GameType | string): string {
  if (participantsNeedGender(gameType)) {
    return '.csv or .xlsx — name + gender columns'
  }
  return '.csv or .xlsx — names only (one per row)'
}

export function participantSampleFile(gameType?: GameType | string): { href: string; download: string } {
  if (participantsNeedGender(gameType)) {
    return { href: '/participants-sample.csv', download: 'participants-sample.csv' }
  }
  return { href: '/participants-sample-names.csv', download: 'participants-sample-names.csv' }
}

export function mergeParticipants(existing: ParticipantInput[], incoming: ParticipantInput[]): ParticipantInput[] {
  const seen = new Set(existing.map((p) => `${p.name.toLowerCase()}|${p.gender}`))
  const merged = [...existing]
  for (const p of incoming) {
    const key = `${p.name.toLowerCase()}|${p.gender}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(p)
    }
  }
  return merged
}

export interface ParticipantModeOption {
  value: ParticipantMode
  label: string
  hint: string
}

/** Copy for create-game "Who's in the poll" — differs by game type. */
export function participantModeOptions(gameType?: GameType | string): ParticipantModeOption[] {
  if (isWhoSaidThis(gameType) || isHotSeat(gameType)) {
    return [
      {
        value: 'import',
        label: 'Import list',
        hint: isHotSeat(gameType)
          ? 'Upload names — each player claims their name when joining.'
          : 'Upload names — players claim their name when joining, then take turns writing quotes.',
      },
    ]
  }

  if (isMostLikelyTo(gameType)) {
    return [
      {
        value: 'joiners',
        label: 'Join & vote',
        hint: 'Players join and pick a friend for each prompt — no list to upload.',
      },
      {
        value: 'import',
        label: 'Import list',
        hint: 'Upload names for the poll — players join separately to vote.',
      },
    ]
  }

  return [
    {
      value: 'joiners',
      label: 'Join & play',
      hint: 'Everyone who joins is in the poll — no list to upload.',
    },
    {
      value: 'import',
      label: 'Pre-set roster',
      hint: 'Upload names first — players claim their name from the list when they join.',
    },
  ]
}

export function participantImportStepHint(gameType?: GameType | string): string {
  if (isWhoSaidThis(gameType)) {
    return 'Add everyone in the group — each player claims their name when joining, then takes turns writing quotes.'
  }
  if (isHotSeat(gameType)) {
    return 'Add everyone in the group — each player claims their name from this list when joining.'
  }
  if (isMostLikelyTo(gameType)) {
    return 'Add everyone who can be voted for — players join separately to vote.'
  }
  return 'Add names and genders — each player picks their name from this list when joining.'
}

export function countByGender(participants: ParticipantInput[]): Record<ParticipantGender, number> {
  return participants.reduce(
    (acc, p) => {
      acc[p.gender] += 1
      return acc
    },
    { male: 0, female: 0 }
  )
}

export function hasEnoughForRounds(participants: ParticipantInput[], gameType?: GameType | string): boolean {
  if (isWouldYouRather(gameType)) return true
  if (isHotSeat(gameType)) return participants.length >= 3
  if (isMostLikelyTo(gameType)) return participants.length >= roundPoolSize(gameType)
  if (isWhoSaidThis(gameType)) return participants.length >= 2
  const min = roundPoolSize(gameType)
  const counts = countByGender(participants)
  return counts.male >= min || counts.female >= min
}

/** Round count buttons for KMK-style games — every value from 1 through max (up to 10). */
export function kmkRoundPickerOptions(maxRounds: number): number[] {
  const cap = Math.max(maxRounds, 1)
  if (cap <= 10) {
    return Array.from({ length: cap }, (_, i) => i + 1)
  }
  const presets = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20].filter((n) => n <= cap)
  return presets.includes(cap) ? presets : [...presets, cap]
}

/** Max rounds before the same names repeat heavily. */
export function maxRecommendedRounds(participants: ParticipantInput[], gameType?: GameType | string): number {
  if (isWouldYouRather(gameType)) return Math.min(20, WYR_QUESTION_COUNT)
  if (isHotSeat(gameType)) return participants.length >= 3 ? Math.min(20, participants.length) : 0
  if (isMostLikelyTo(gameType)) return Math.min(20, MLT_QUESTION_COUNT)
  if (isWhoSaidThis(gameType)) return Math.min(20, Math.max(participants.length, 2))
  const perRound = roundPoolSize(gameType)
  const counts = countByGender(participants)
  const maleRounds = Math.floor(counts.male / perRound)
  const femaleRounds = Math.floor(counts.female / perRound)
  if (maleRounds >= 1 && femaleRounds >= 1) {
    return Math.min(20, maleRounds + femaleRounds)
  }
  if (maleRounds >= 1) return Math.min(20, maleRounds)
  if (femaleRounds >= 1) return Math.min(20, femaleRounds)
  return 0
}

export function roundLimitHint(participants: ParticipantInput[], gameType?: GameType | string): string | null {
  if (isWouldYouRather(gameType)) {
    return `${WYR_QUESTION_COUNT} questions available → up to ${Math.min(20, WYR_QUESTION_COUNT)} rounds`
  }
  if (isHotSeat(gameType)) {
    if (participants.length < 3) return null
    return `${participants.length} players → up to ${Math.min(20, participants.length)} rounds`
  }
  if (isMostLikelyTo(gameType)) {
    return `${MLT_QUESTION_COUNT} prompts available → up to ${Math.min(20, MLT_QUESTION_COUNT)} rounds`
  }
  const min = roundPoolSize(gameType)
  const counts = countByGender(participants)
  const max = maxRecommendedRounds(participants, gameType)
  if (max === 0) return null
  if (counts.male >= min && counts.female >= min) {
    return `${counts.male} male · ${counts.female} female → up to ${max} rounds`
  }
  if (counts.male >= min) return `${counts.male} male → up to ${max} rounds`
  return `${counts.female} female → up to ${max} rounds`
}

export function normalizePlayerGender(raw: string): PlayerGender | null {
  const key = raw.trim().toLowerCase()
  if (!key) return null
  if (key === 'both' || key === 'all' || key === 'everyone') return 'both'
  return normalizeGender(raw)
}

/** Read participant gender from DB / realtime payloads (handles casing and aliases). */
export function parseParticipantGenderFromDb(raw: unknown): ParticipantGender | null {
  if (raw === 'male' || raw === 'female') return raw
  return normalizeGender(String(raw ?? ''))
}

/** Read player gender from DB / realtime payloads. */
export function parsePlayerGenderFromDb(raw: unknown): PlayerGender | null {
  if (raw === 'male' || raw === 'female' || raw === 'both') return raw
  return normalizePlayerGender(String(raw ?? ''))
}

/** Which list this player votes on (opposite-gender rule). */
export type VoteTarget = 'women' | 'men' | 'both'

export function playerGenderForVoteTarget(target: VoteTarget): PlayerGender {
  if (target === 'women') return 'male'
  if (target === 'men') return 'female'
  return 'both'
}

export function voteTargetForPlayerGender(gender: PlayerGender): VoteTarget {
  if (gender === 'male') return 'women'
  if (gender === 'female') return 'men'
  return 'both'
}

export function voteTargetLabel(target: VoteTarget): string {
  if (target === 'women') return "Women's list"
  if (target === 'men') return "Men's list"
  return 'Both lists'
}

export function voteTargetHint(target: VoteTarget, isJoinersMode: boolean, pollGender?: ParticipantGender): string {
  if (target === 'both') {
    return isJoinersMode
      ? `You vote on every list — your name appears in the ${pollGender === 'male' ? "men's" : "women's"} poll`
      : "You vote on both the men's and women's lists each round"
  }
  const voteList = voteTargetLabel(target)
  if (!isJoinersMode) return `You'll vote on the ${voteList.toLowerCase()} each round`
  const poll = target === 'women' ? "men's" : "women's"
  return `You'll vote on the ${voteList.toLowerCase()} — your name appears in the ${poll} poll`
}

/** Default ballot gender in joiners mode for a vote target. */
export function defaultPollGenderForVoteTarget(target: VoteTarget): ParticipantGender {
  if (target === 'women') return 'male'
  if (target === 'men') return 'female'
  return 'female'
}

export function genderLabel(gender: ParticipantGender): string {
  return gender === 'male' ? 'Male' : 'Female'
}

export function playerGenderLabel(gender: PlayerGender): string {
  if (gender === 'both') return 'Both genders'
  return genderLabel(gender)
}

export function resolvePlayerIdentity(
  player: {
    gender: PlayerGender | string
    identity_gender?: ParticipantGender | string | null
    name: string
  },
  participants?: { name: string; gender: ParticipantGender }[]
): ParticipantGender {
  const stored = parseParticipantGenderFromDb(player.identity_gender)
  if (stored) return stored
  const vote = parsePlayerGenderFromDb(player.gender)
  if (vote && vote !== 'both') return vote
  const part = participants?.find((p) => p.name === player.name)
  if (part) return part.gender
  return 'female'
}

export function playerIdentityLabel(
  player: {
    gender: PlayerGender | string
    identity_gender?: ParticipantGender | string | null
    name: string
  },
  participants?: { name: string; gender: ParticipantGender }[],
  gameType?: GameType | string
): string {
  if (isLobbyGame(gameType) || isNameOnlyPlayerJoin(gameType) || isWhoSaidThis(gameType) || isHotSeat(gameType))
    return ''
  return genderLabel(resolvePlayerIdentity(player, participants))
}

export function playerGenderFromJoin(identity: ParticipantGender, voteBoth: boolean): PlayerGender {
  return voteBoth ? 'both' : identity
}

export function joinChoicesFromPlayerGender(
  gender: PlayerGender,
  identityGender?: ParticipantGender | null
): {
  identity: ParticipantGender
  voteBoth: boolean
} {
  if (gender === 'both') {
    return { identity: identityGender ?? 'female', voteBoth: true }
  }
  return { identity: gender, voteBoth: false }
}

export function joinGenderHint(
  identity: ParticipantGender,
  voteBoth: boolean,
  isJoinersMode: boolean,
  pollGender?: ParticipantGender
): string {
  if (voteBoth) {
    return isJoinersMode
      ? `You'll vote every round — your name is in the ${pollGender === 'male' ? "men's" : "women's"} poll`
      : "You'll vote on both men's and women's rounds"
  }
  const opposite = identity === 'male' ? "women's" : "men's"
  if (!isJoinersMode) {
    return `${genderLabel(identity)} — you vote on the ${opposite} rounds`
  }
  const poll = identity === 'male' ? "men's" : "women's"
  return `${genderLabel(identity)} — you vote on ${opposite} rounds, your name is in the ${poll} poll`
}

export function roundGenderLabel(genders: ParticipantGender[]): string | null {
  const unique = [...new Set(genders)]
  if (unique.length !== 1) return null
  return unique[0] === 'male' ? "Men's round" : "Women's round"
}

export function getRoundParticipantGender(
  participantIds: string[],
  participants: { id: string; gender: ParticipantGender | string }[]
): ParticipantGender | null {
  const genders = participantIds
    .map((id) => {
      const p = participants.find((item) => item.id === id)
      return p ? parseParticipantGenderFromDb(p.gender) : null
    })
    .filter((g): g is ParticipantGender => g !== null)
  const unique = [...new Set(genders)]
  if (unique.length !== 1) return null
  return unique[0]
}

/** Gender used for opposite-gender voting (identity when set, unless vote-both). */
export function playerVoteGenderForRound(
  player: {
    gender: PlayerGender | string
    identity_gender?: ParticipantGender | string | null
    name: string
  },
  participants?: { name: string; gender: ParticipantGender }[]
): PlayerGender | null {
  const votePref = parsePlayerGenderFromDb(player.gender)
  if (votePref === 'both') return 'both'
  const identity = parseParticipantGenderFromDb(player.identity_gender)
  if (identity) return identity
  if (votePref === 'male' || votePref === 'female') return votePref
  const part = participants?.find((p) => p.name === player.name)
  if (part) return part.gender
  return null
}

/** Opposite gender votes; `both` votes on every round. */
export function canPlayerVoteInRound(playerGender: PlayerGender, roundGender: ParticipantGender): boolean {
  if (playerGender === 'both') return true
  return playerGender !== roundGender
}

export function voterGenderForRound(roundGender: ParticipantGender): ParticipantGender {
  return roundGender === 'male' ? 'female' : 'male'
}

export function eligibleVotersForRound<
  T extends {
    id: string
    gender: PlayerGender | string
    identity_gender?: ParticipantGender | string | null
    name: string
  },
>(roundGender: ParticipantGender | null, players: T[], gameType?: GameType | string): T[] {
  if (isLobbyGame(gameType) || isMostLikelyTo(gameType)) return players
  if (!roundGender) return []
  return players.filter((p) => {
    const g = playerVoteGenderForRound(p)
    return g && canPlayerVoteInRound(g, roundGender)
  })
}

export function roundVoterLabel(roundGender: ParticipantGender | null): string | null {
  if (roundGender === 'male') return "Men's list — women & both vote now"
  if (roundGender === 'female') return "Women's list — men & both vote now"
  return null
}

export function activeVoteBanner(playerGender: PlayerGender | null | undefined): string | null {
  if (!playerGender) return null
  if (playerGender === 'both') return 'You vote on both genders'
  return `You're voting this round`
}

export function spectatorMessage(roundGender: ParticipantGender | null, playerGender?: PlayerGender | null): string {
  if (playerGender === 'both') return ''
  if (!roundGender || !playerGender) return "You're spectating this round."
  if (playerGender === roundGender) {
    const thisRound = roundGender === 'male' ? "men's" : "women's"
    return `This is the ${thisRound} round — as ${genderLabel(playerGender).toLowerCase()} you sit this one out.`
  }
  return ''
}

/** Import mode: only participants claimed by a joined player can appear in rounds. */
export function participantsWhoJoined<T extends { id: string; name: string }>(
  participants: T[],
  players: { participant_id?: string | null; name: string }[]
): T[] {
  const claimedIds = new Set<string>()
  const claimedNames = new Set<string>()

  for (const player of players) {
    if (player.participant_id) claimedIds.add(player.participant_id)
    if (player.name) claimedNames.add(player.name.toLowerCase())
  }

  return participants.filter((p) => claimedIds.has(p.id) || claimedNames.has(p.name.toLowerCase()))
}

/** Every poll gender needs at least one eligible voter before the game starts. */
export function hasVotersForPolls(
  participants: { gender: ParticipantGender | string }[],
  players: {
    gender: PlayerGender | string
    identity_gender?: ParticipantGender | string | null
    name: string
  }[]
): { ok: boolean; message?: string } {
  const pollGenders = new Set<ParticipantGender>()
  for (const p of participants) {
    const g = parseParticipantGenderFromDb(p.gender)
    if (g) pollGenders.add(g)
  }

  for (const pollGender of pollGenders) {
    const voters = players.filter((p) => {
      const g = playerVoteGenderForRound(p)
      return g && canPlayerVoteInRound(g, pollGender)
    })
    if (voters.length === 0) {
      const list = pollGender === 'male' ? "men's" : "women's"
      const need = pollGender === 'male' ? "women's" : "men's"
      return {
        ok: false,
        message: `No one can vote on the ${list} list — need someone voting on the ${need} list (or Both)`,
      }
    }
  }

  return { ok: true }
}

export function participantsInGenderRounds<T extends { id: string; gender: ParticipantGender }>(
  participants: T[],
  rounds: { participant_ids: string[] }[],
  gender: ParticipantGender
): T[] {
  const ids = new Set<string>()
  for (const round of rounds) {
    const roundGender = getRoundParticipantGender(round.participant_ids, participants)
    if (roundGender === gender) {
      round.participant_ids.forEach((id) => ids.add(id))
    }
  }
  return participants.filter((p) => ids.has(p.id))
}

/** Parse first sheet of an Excel workbook (ArrayBuffer). */
export async function parseExcelParticipants(
  buffer: ArrayBuffer,
  gameType?: GameType | string
): Promise<ParticipantInput[]> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return []

  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][]
  const lines = grid
    .map((row) =>
      row
        .map((cell) => String(cell ?? '').trim())
        .filter(Boolean)
        .join('\t')
    )
    .filter(Boolean)
    .join('\n')

  return parseParticipantsForGame(lines, gameType)
}
