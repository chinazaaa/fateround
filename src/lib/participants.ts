export type ParticipantGender = 'male' | 'female'

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
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
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

export function mergeParticipants(
  existing: ParticipantInput[],
  incoming: ParticipantInput[]
): ParticipantInput[] {
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

export function countByGender(participants: ParticipantInput[]): Record<ParticipantGender, number> {
  return participants.reduce(
    (acc, p) => {
      acc[p.gender] += 1
      return acc
    },
    { male: 0, female: 0 }
  )
}

export function hasEnoughForRounds(participants: ParticipantInput[]): boolean {
  const counts = countByGender(participants)
  return counts.male >= 3 || counts.female >= 3
}

export function genderLabel(gender: ParticipantGender): string {
  return gender === 'male' ? 'Male' : 'Female'
}

export function roundGenderLabel(genders: ParticipantGender[]): string | null {
  const unique = [...new Set(genders)]
  if (unique.length !== 1) return null
  return unique[0] === 'male' ? "Men's round" : "Women's round"
}

export function getRoundParticipantGender(
  participantIds: string[],
  participants: { id: string; gender: ParticipantGender }[]
): ParticipantGender | null {
  const genders = participantIds
    .map((id) => participants.find((p) => p.id === id)?.gender)
    .filter((g): g is ParticipantGender => g === 'male' || g === 'female')
  const unique = [...new Set(genders)]
  if (unique.length !== 1) return null
  return unique[0]
}

/** Men's poll → women vote; women's poll → men vote. */
export function canPlayerVoteInRound(
  playerGender: ParticipantGender,
  roundGender: ParticipantGender
): boolean {
  return playerGender !== roundGender
}

export function voterGenderForRound(roundGender: ParticipantGender): ParticipantGender {
  return roundGender === 'male' ? 'female' : 'male'
}

export function eligibleVotersForRound<T extends { id: string; gender: ParticipantGender }>(
  roundGender: ParticipantGender | null,
  players: T[]
): T[] {
  if (!roundGender) return players
  const voterGender = voterGenderForRound(roundGender)
  return players.filter((p) => p.gender === voterGender)
}

export function roundVoterLabel(roundGender: ParticipantGender | null): string | null {
  if (roundGender === 'male') return 'Women vote on the men'
  if (roundGender === 'female') return 'Men vote on the women'
  return null
}

export function spectatorMessage(roundGender: ParticipantGender | null): string {
  if (roundGender === 'male') return "This is the men's poll — only women vote. You're watching this round."
  if (roundGender === 'female') return "This is the women's poll — only men vote. You're watching this round."
  return "You're spectating this round."
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
export async function parseExcelParticipants(buffer: ArrayBuffer): Promise<ParticipantInput[]> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return []

  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][]
  const lines = grid
    .map((row) => row.map((cell) => String(cell ?? '').trim()).filter(Boolean).join('\t'))
    .filter(Boolean)
    .join('\n')

  return parseParticipantRows(lines)
}
