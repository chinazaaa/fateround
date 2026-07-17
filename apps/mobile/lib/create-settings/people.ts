import type { GameType } from '@fateround/shared'
import { parseGameType, isMostLikelyTo } from '@fateround/shared/poll-games'
import { HOT_SEAT_MIN_PLAYERS } from '@fateround/shared/create-party-games'

export type ParticipantGender = 'male' | 'female'
export type ParticipantMode = 'joiners' | 'import' | 'voters'
export type ParticipantDraft = { name: string; gender: ParticipantGender }
export type CustomSlotDraft = { key: string; label: string; emoji: string; color: string }

export type PeopleSettings = {
  participantMode: ParticipantMode
  participants: ParticipantDraft[]
  slots: CustomSlotDraft[]
  slotsTitle: string
}

/** Ported from web `CustomSlotBuilder` presets. */
export const CUSTOM_SLOT_EMOJI = [
  '🔥',
  '💀',
  '💍',
  '💚',
  '🚩',
  '⭐',
  '💼',
  '🏆',
  '💩',
  '👔',
  '📋',
  '🚪',
  '💕',
  '👋',
  '🎯',
  '👑',
  '🥇',
  '🥈',
  '🥉',
  '✨',
]
export const CUSTOM_SLOT_COLORS = [
  '#ef4444',
  '#22c55e',
  '#3b82f6',
  '#eab308',
  '#a855f7',
  '#ec4899',
  '#64748b',
  '#b45309',
]
export const CUSTOM_SLOT_MIN = 2
export const CUSTOM_SLOT_MAX = 5

export type CustomSlotTemplate = { title: string; slots: CustomSlotDraft[] }

export const CUSTOM_SLOT_TEMPLATES: CustomSlotTemplate[] = [
  {
    title: 'Hire / Fire / Promote',
    slots: [
      { key: 'slot_0', label: 'Hire', emoji: '💼', color: '#22c55e' },
      { key: 'slot_1', label: 'Fire', emoji: '🔥', color: '#ef4444' },
      { key: 'slot_2', label: 'Promote', emoji: '⭐', color: '#eab308' },
    ],
  },
  {
    title: 'Date / Friendzone',
    slots: [
      { key: 'slot_0', label: 'Date', emoji: '💕', color: '#ec4899' },
      { key: 'slot_1', label: 'Friendzone', emoji: '👋', color: '#64748b' },
    ],
  },
  {
    title: 'Best / Worst',
    slots: [
      { key: 'slot_0', label: 'Best', emoji: '🏆', color: '#22c55e' },
      { key: 'slot_1', label: 'Worst', emoji: '💩', color: '#ef4444' },
    ],
  },
  {
    title: 'Gold / Silver / Bronze',
    slots: [
      { key: 'slot_0', label: 'Gold', emoji: '🥇', color: '#eab308' },
      { key: 'slot_1', label: 'Silver', emoji: '🥈', color: '#64748b' },
      { key: 'slot_2', label: 'Bronze', emoji: '🥉', color: '#b45309' },
    ],
  },
  {
    title: 'CEO / Intern / Fired',
    slots: [
      { key: 'slot_0', label: 'CEO', emoji: '👔', color: '#3b82f6' },
      { key: 'slot_1', label: 'Intern', emoji: '📋', color: '#a855f7' },
      { key: 'slot_2', label: 'Fired', emoji: '🚪', color: '#ef4444' },
    ],
  },
]

export function isCustomGame(gameType: GameType): boolean {
  return parseGameType(gameType) === 'custom'
}

export function isHotSeatGame(gameType: GameType): boolean {
  return parseGameType(gameType) === 'hot_seat'
}

/** Games that collect a host name list at create (mirrors web import/voters flows). */
export function supportsImportMode(gameType: GameType): boolean {
  // Who Said This no longer collects a name list — players just join and answer (see
  // `create-settings/who-said-this.ts`), so it's a single-step joiners game.
  return isMostLikelyTo(gameType) || isHotSeatGame(gameType) || isCustomGame(gameType)
}

/** Import-only games — the host can't switch to join-as-you-go. */
export function isImportOnly(gameType: GameType): boolean {
  return isCustomGame(gameType)
}

/** The joiners/import choice offered in Setup, or `null` when the mode is fixed. */
export function participantModeOptions(
  gameType: GameType
): { value: ParticipantMode; label: string; hint: string }[] | null {
  if (isMostLikelyTo(gameType)) {
    return [
      { value: 'joiners', label: 'Join & vote', hint: 'Players join and vote live.' },
      { value: 'voters', label: 'Import list', hint: 'Upload the names being voted on — players just vote.' },
    ]
  }
  if (isHotSeatGame(gameType)) {
    return [
      { value: 'joiners', label: 'Join & play', hint: 'Players join with their own name.' },
      { value: 'import', label: 'Pre-set roster', hint: 'Upload names — each player claims theirs.' },
    ]
  }
  return null
}

export function defaultParticipantMode(gameType: GameType): ParticipantMode {
  if (isCustomGame(gameType)) return 'import'
  return 'joiners'
}

export function makeCustomSlots(count: number): CustomSlotDraft[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `slot_${i}`,
    label: '',
    emoji: CUSTOM_SLOT_EMOJI[i % CUSTOM_SLOT_EMOJI.length],
    color: CUSTOM_SLOT_COLORS[i % CUSTOM_SLOT_COLORS.length],
  }))
}

export function deriveSlotsTitle(slots: CustomSlotDraft[], fallback: string): string {
  return slots.every((s) => s.label.trim()) ? slots.map((s) => s.label.trim()).join(' / ') : fallback
}

export function defaultPeopleSettings(gameType: GameType): PeopleSettings {
  const participantMode = defaultParticipantMode(gameType)
  const usesList = participantMode !== 'joiners'
  return {
    participantMode,
    participants: usesList ? [emptyParticipant(), emptyParticipant()] : [],
    slots: isCustomGame(gameType) ? makeCustomSlots(3) : [],
    slotsTitle: '',
  }
}

export function emptyParticipant(): ParticipantDraft {
  return { name: '', gender: 'female' }
}

export function usesHostParticipantList(mode: ParticipantMode): boolean {
  return mode === 'import' || mode === 'voters'
}

/** True when the wizard should show a second "People" step for this state. */
export function needsPeopleStep(gameType: GameType, people: PeopleSettings): boolean {
  return supportsImportMode(gameType) && usesHostParticipantList(people.participantMode)
}

/** Minimum host-list names to create. Custom needs one per slot; others need 2. */
export function minParticipants(gameType: GameType, people: PeopleSettings): number {
  if (isCustomGame(gameType)) return Math.max(people.slots.length, CUSTOM_SLOT_MIN)
  if (isHotSeatGame(gameType)) return HOT_SEAT_MIN_PLAYERS
  return 2
}

export function validParticipants(people: PeopleSettings): ParticipantDraft[] {
  return people.participants.map((p) => ({ name: p.name.trim(), gender: p.gender })).filter((p) => p.name.length > 0)
}

/** `null` when the custom slot config is valid (or unused). */
export function validateCustomSlots(gameType: GameType, people: PeopleSettings): string | null {
  if (!isCustomGame(gameType)) return null
  if (people.slots.length < CUSTOM_SLOT_MIN) return `Add at least ${CUSTOM_SLOT_MIN} slots`
  if (people.slots.some((s) => !s.label.trim())) return 'Give every slot a label'
  return null
}

/** `null` when the host name list is valid (or unused). */
export function validateParticipants(gameType: GameType, people: PeopleSettings): string | null {
  if (!needsPeopleStep(gameType, people)) return null
  const count = validParticipants(people).length
  const min = minParticipants(gameType, people)
  if (count < min) return `Add at least ${min} names (${count} so far)`
  return null
}

/** Participant / custom-slot fields for the create payload. */
export function peoplePayload(
  gameType: GameType,
  people: PeopleSettings,
  pollAnonymous: boolean,
  isPollPartyGame: boolean
): Record<string, unknown> {
  const mode = people.participantMode
  const usesList = usesHostParticipantList(mode)
  const payload: Record<string, unknown> = {
    participant_mode: mode,
    participants: usesList ? validParticipants(people) : [],
    anonymous: mode === 'joiners' && isPollPartyGame ? pollAnonymous : true,
  }

  if (isCustomGame(gameType)) {
    const slots = people.slots
    const title = deriveSlotsTitle(slots, people.slotsTitle.trim() || 'Custom Game')
    payload.custom_slots = { slots, title, gender_based: false }
    payload.gender_based = false
  }

  return payload
}
