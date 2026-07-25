import * as SecureStore from 'expo-secure-store'
import type { GameType } from '@fateround/shared'
import type { LateJoinPolicy } from '@fateround/shared/viewers'
import type { ThemeId } from '@fateround/shared/create-themes'
import type { GameRoomSettings, PartyRoomSettings, LandmineCreateState } from '@/lib/create-settings'

/**
 * Create-screen templates — mobile parallel of web `src/lib/game-templates.ts` (PR #681). Lets a
 * host save their current settings for a game type into one of a small number of local slots
 * (A, B) and reapply them next time they create that game type, instead of re-entering every
 * option. Purely client-side (SecureStore — mirrors this app's `lib/recent-games.ts` convention
 * for small local JSON blobs, not a "sensitive token" use, but the existing local-storage pattern
 * here) for now, no accounts yet.
 *
 * Unlike web's create screen (dozens of independent `useState` hooks needing a per-field
 * get/set/appliesTo registry), mobile's create screen holds one `CreateWizardState` object whose
 * `room` / `party` / `landmine` sub-objects are already flat, game-type-agnostic settings bags
 * (see `lib/create-settings/index.ts`) — so a template can simply snapshot/restore those
 * sub-objects wholesale plus a few top-level scalars, instead of a field-by-field registry.
 * `title`, `contentLabel`, `custom` (question/CSV content), `people` (participant list / custom
 * slots) and `wst` (Who Said This's deck content) are deliberately excluded — those aren't
 * "settings" to reuse, mirroring web's exclusions.
 */

export const MAX_TEMPLATE_SLOTS = 2
export const TEMPLATE_SCHEMA_VERSION = 1

export type TemplateValues = {
  theme: ThemeId
  isPublic: boolean
  maxPlayers: number | null
  lateJoinPolicy: LateJoinPolicy
  room: GameRoomSettings
  party: PartyRoomSettings
  landmine: LandmineCreateState
}

export interface GameTemplate {
  /** Custom name, or falls back to "Template A" / "Template B" in the UI. */
  name: string
  /** epoch ms — when this slot was last saved. */
  savedAt: number
  /** Schema version of `values` — lets us drop stale/incompatible saves later. */
  version: number
  /** Captured field values. */
  values: TemplateValues
}

export type TemplateSlots = (GameTemplate | null)[]

const templatesKey = (gameType: string) => `fateround_game_templates_${gameType}`

function emptySlots(): TemplateSlots {
  return Array.from({ length: MAX_TEMPLATE_SLOTS }, () => null)
}

/** Reads all slots for a game type. Always resolves to an array of length MAX_TEMPLATE_SLOTS. */
export async function getTemplates(gameType: string): Promise<TemplateSlots> {
  try {
    const raw = await SecureStore.getItemAsync(templatesKey(gameType))
    if (!raw) return emptySlots()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return emptySlots()
    const slots = emptySlots()
    for (let i = 0; i < MAX_TEMPLATE_SLOTS; i++) {
      const entry = parsed[i]
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.name === 'string' &&
        typeof entry.savedAt === 'number' &&
        entry.version === TEMPLATE_SCHEMA_VERSION &&
        entry.values &&
        typeof entry.values === 'object'
      ) {
        slots[i] = entry as GameTemplate
      }
    }
    return slots
  } catch {
    return emptySlots()
  }
}

/** Saves (or overwrites) the template in a given slot index (0-based). */
export async function saveTemplate(
  gameType: string,
  slot: number,
  template: Omit<GameTemplate, 'version'>
): Promise<void> {
  if (slot < 0 || slot >= MAX_TEMPLATE_SLOTS) return
  try {
    const slots = await getTemplates(gameType)
    slots[slot] = { ...template, version: TEMPLATE_SCHEMA_VERSION }
    await SecureStore.setItemAsync(templatesKey(gameType), JSON.stringify(slots))
  } catch {
    // SecureStore can throw when unavailable — saving is best-effort.
  }
}

/** Clears a single slot. */
export async function deleteTemplate(gameType: string, slot: number): Promise<void> {
  if (slot < 0 || slot >= MAX_TEMPLATE_SLOTS) return
  try {
    const slots = await getTemplates(gameType)
    slots[slot] = null
    await SecureStore.setItemAsync(templatesKey(gameType), JSON.stringify(slots))
  } catch {
    // best-effort, see above
  }
}

/** First empty slot index, or null if every slot is taken. */
export function firstFreeSlot(slots: TemplateSlots): number | null {
  const i = slots.findIndex((s) => s === null)
  return i === -1 ? null : i
}

export function slotLabel(index: number): string {
  return `Template ${String.fromCharCode(65 + index)}` // A, B, C, ...
}

export function formatTemplateSavedAt(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

// Human labels for house-rule-ish boolean fields, so a template only mentions a toggle when it's
// NOT the usual setting (otherwise every Whot template would list "Pick 3 · Stack Pick 2 · WHOT
// cards..." since those default on). A boolean with no entry here is assumed to default `false`.
const BOOL_FIELD_LABELS: Record<string, string> = {
  whotPick3Enabled: 'Pick 3',
  whotPick2Stacking: 'Stack Pick 2',
  whotCardsEnabled: 'WHOT cards',
  whotNumberCallsEnabled: 'Numbers on WHOT',
  crazy8ActionCards: 'Action cards',
  crazy8Jokers: 'Jokers',
  crazy8Pick2Stacking: 'Stack Pick 2',
  genderBased: 'Gender-based',
  mafiaDoctorEnabled: 'Doctor role',
  mafiaDetectiveEnabled: 'Detective role',
  mafiaAnonymousVotes: 'Anonymous votes',
  matchingPairsLargeGrid: 'Large grid',
  originalityBonus: 'Originality bonus',
  review: 'Review before reveal',
}

const BOOL_FIELD_DEFAULTS: Record<string, boolean> = {
  whotPick3Enabled: true,
  whotPick2Stacking: true,
  whotCardsEnabled: true,
  whotNumberCallsEnabled: true,
  crazy8ActionCards: true,
  crazy8Pick2Stacking: true,
  genderBased: true,
  mafiaDoctorEnabled: true,
  mafiaDetectiveEnabled: true,
  mafiaAnonymousVotes: true,
  review: true,
}

const STRING_FIELD_LABELS: Record<string, string> = {
  ludoVariant: 'Variant',
  ayoVariant: 'Variant',
  scrabbleClockMode: 'Clock',
  mahjongRuleset: 'Ruleset',
  bingoCallMode: 'Call mode',
  quickDrawVariant: 'Mode',
  quickDrawPlayMode: 'Team mode',
  describeItMode: 'Mode',
  wordRushMode: 'Mode',
  wordRushPromptMode: 'Prompts',
  wordRushDifficulty: 'Difficulty',
  codewordsTeamAssignment: 'Team assignment',
  crosswordTheme: 'Theme',
  crosswordDifficulty: 'Difficulty',
  wordSearchTheme: 'Theme',
  wordSearchDifficulty: 'Difficulty',
  wordScrambleTheme: 'Theme',
  wordScrambleDifficulty: 'Difficulty',
  landmineMode: 'Mode',
  landmineMineSource: 'Mine source',
}

// Fields already surfaced as "baseline" info below, or not worth summarizing on their own
// (chess board theme/piece set are cosmetic, and duplicate defaults aren't interesting).
const SKIP_KEYS = new Set(['timerSeconds', 'gameDurationSeconds', 'roundsCount', 'chessBoardTheme', 'chessPieceSet'])

const LATE_JOIN_LABELS: Record<LateJoinPolicy, string> = {
  lobby_only: 'Lobby only',
  viewers_only: 'Viewers only',
  viewers_and_players: 'Viewers & players',
}

function humanize(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDurationShort(seconds: number): string {
  if (seconds <= 0) return 'No limit'
  if (seconds % 3600 === 0) return `${seconds / 3600}h`
  if (seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}

function summarizeSubObject(obj: Record<string, unknown>, out: string[]): void {
  for (const [key, value] of Object.entries(obj)) {
    if (SKIP_KEYS.has(key)) continue
    if (typeof value === 'boolean') {
      const label = BOOL_FIELD_LABELS[key] ?? humanize(key)
      const isDefault = key in BOOL_FIELD_DEFAULTS ? value === BOOL_FIELD_DEFAULTS[key] : value === false
      if (isDefault) continue
      out.push(value ? label : `${label} off`)
      continue
    }
    if (typeof value === 'string' && value) {
      out.push(`${STRING_FIELD_LABELS[key] ?? humanize(key)}: ${humanize(value)}`)
      continue
    }
    if (typeof value === 'number' && key !== 'mineCount') continue // most numeric fields are timers/counts covered by baseline elsewhere
  }
}

/**
 * One-line summary of a saved template's values, for display. Leads with what's distinctive
 * (non-default booleans/enums across room+party+landmine), then baseline info (max players,
 * turn timer, rounds, game length, theme, visibility, late-join policy) — always shown, with an
 * explicit "No limit"/"No turn timer" when unset rather than disappearing.
 */
export function summarizeTemplate(values: TemplateValues): string {
  const distinguishing: string[] = []
  const baseline: string[] = []

  summarizeSubObject(values.room as unknown as Record<string, unknown>, distinguishing)
  summarizeSubObject(values.party as unknown as Record<string, unknown>, distinguishing)
  summarizeSubObject(values.landmine as unknown as Record<string, unknown>, distinguishing)

  if (values.isPublic) distinguishing.push('Public')
  if (values.lateJoinPolicy && values.lateJoinPolicy !== 'lobby_only') {
    distinguishing.push(`Late joiners: ${LATE_JOIN_LABELS[values.lateJoinPolicy] ?? humanize(values.lateJoinPolicy)}`)
  }

  if (typeof values.maxPlayers === 'number') baseline.push(`${values.maxPlayers} players`)
  if (values.party?.roundsCount) baseline.push(`${values.party.roundsCount} rounds`)
  if (typeof values.room?.timerSeconds === 'number' || typeof values.party?.timerSeconds === 'number') {
    const t = values.room?.timerSeconds || values.party?.timerSeconds || 0
    baseline.push(t ? `${t}s turn timer` : 'No turn timer')
  }
  const gameDuration = values.room?.gameDurationSeconds ?? values.party?.gameDurationSeconds
  if (typeof gameDuration === 'number') baseline.push(`${formatDurationShort(gameDuration)} game length`)
  if (values.theme) baseline.push(`Theme: ${humanize(values.theme)}`)

  return [...distinguishing, ...baseline].join(' · ') || 'Saved settings'
}
