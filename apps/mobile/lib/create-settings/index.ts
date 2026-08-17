import type { GameType } from '@fateround/shared'
import type { ThemeId } from '@fateround/shared/create-themes'
import type { GamePlayerLimitsMap } from '@fateround/shared/lobby-limits'
import { clampLobbyMaxPlayers, isLobbyLimitGameType, lobbyDefaultMaxPlayers } from '@fateround/shared/lobby-limits'
import { isCodewordsGame } from '@fateround/shared/game-type-checks'
import type { LateJoinPolicy } from '@fateround/shared/viewers'
import {
  clampLateJoinPolicyForGameType,
  defaultLateJoinPolicyForGameType,
  gameSupportsViewerSetting,
} from '@fateround/shared/viewers'
import { themesForGameType } from '@fateround/shared/create-themes'
import {
  defaultGameRoomSettings,
  gameRoomSettingsPayload,
  type GameRoomSettings,
} from '@/lib/create-settings/board-games'
import {
  defaultPartyRoomSettings,
  isPollPartyGame,
  partyRoomSettingsPayload,
  type PartyRoomSettings,
} from '@/lib/create-settings/party-games'
import {
  customContentPayload,
  defaultCustomContentState,
  validateCustomContent,
  type CustomContentState,
} from '@/lib/create-settings/custom-content'
import {
  defaultPeopleSettings,
  isCustomGame,
  needsPeopleStep,
  peoplePayload,
  validateCustomSlots,
  validateParticipants,
  type PeopleSettings,
} from '@/lib/create-settings/people'
import {
  defaultWstCreateState,
  validateWstCreate,
  wstCreatePayload,
  type WstCreateState,
} from '@/lib/create-settings/who-said-this'
import {
  defaultLandmineCreateState,
  landmineCreatePayload,
  type LandmineCreateState,
} from '@/lib/create-settings/landmine'
import { isWhoSaidThis } from '@fateround/shared/poll-games'
import { isLandmineGame, isSecretMessageGame } from '@fateround/shared/game-type-checks'

export type { GameRoomSettings } from '@/lib/create-settings/board-games'
export { hasGameRoomSettings, BATCH_19_BOARD_GAMES } from '@/lib/create-settings/board-games'
export type { PartyRoomSettings } from '@/lib/create-settings/party-games'
export { hasPartyRoomSettings, BATCH_20_PARTY_GAMES, isPollPartyGame } from '@/lib/create-settings/party-games'
export type { CustomContentState } from '@/lib/create-settings/custom-content'
export { supportsCustomContent } from '@/lib/create-settings/custom-content'
export type { PeopleSettings } from '@/lib/create-settings/people'
export { supportsImportMode, participantModeOptions, isCustomGame, minParticipants } from '@/lib/create-settings/people'
export type { WstCreateState, WstSource } from '@/lib/create-settings/who-said-this'
export type { LandmineCreateState } from '@/lib/create-settings/landmine'

export type CreateWizardStep = 'setup' | 'people'

export type CreateWizardState = {
  title: string
  /** Player-facing content label ("Maths", "Bible trivia") for CSV/library content games.
   *  Auto-filled from the picked library pack name; typed by the host for a CSV upload. */
  contentLabel: string
  gameType: GameType
  theme: ThemeId
  isPublic: boolean
  /** Discovery Phase C — "Schedule for later". ISO timestamp for when the
   *  game should open; null means "start immediately" (Phase A default).
   *  Only sent to the server when isPublic=true. */
  scheduledAt: string | null
  maxPlayers: number | null
  lateJoinPolicy: LateJoinPolicy
  room: GameRoomSettings
  party: PartyRoomSettings
  custom: CustomContentState
  people: PeopleSettings
  wst: WstCreateState
  landmine: LandmineCreateState
  /** "Play solo" — only offered when the current game type's lobby min is 1
   *  (yahtzee, crossword, word_search, word_scramble, word_grouping). When on,
   *  the payload forces max_players=1 and the host lobby auto-seats + auto-starts
   *  so the host skips the lobby wait entirely. */
  soloMode: boolean
}

/** True when the current game type's lobby min is 1 — the games where "Play solo"
 *  can be offered. Sourced from the same limits map the max-players picker uses. */
export function supportsSoloMode(gameType: GameType, limits: GamePlayerLimitsMap): boolean {
  return isLobbyLimitGameType(gameType) && limits[gameType].min === 1
}

export type CreateSettingsRegistryEntry = {
  extraPayload?: (state: CreateWizardState) => Record<string, unknown>
  validate?: (state: CreateWizardState) => string | null
}

export function needsParticipantStep(state: CreateWizardState): boolean {
  return needsPeopleStep(state.gameType, state.people)
}

export function wizardStepsForGame(state: CreateWizardState): CreateWizardStep[] {
  return needsParticipantStep(state) ? ['setup', 'people'] : ['setup']
}

function themeForGameType(gameType: GameType, current: ThemeId): ThemeId {
  const allowed = themesForGameType(gameType)
  if (allowed.some((theme) => theme.id === current)) return current
  return allowed[0]?.id ?? 'default'
}

export function createInitialState(gameType: GameType, limits: GamePlayerLimitsMap): CreateWizardState {
  return {
    title: '',
    contentLabel: '',
    gameType,
    theme: themeForGameType(gameType, 'default'),
    isPublic: false,
    scheduledAt: null,
    maxPlayers: isLobbyLimitGameType(gameType) ? lobbyDefaultMaxPlayers(gameType, limits) : null,
    lateJoinPolicy: defaultLateJoinPolicyForGameType(gameType),
    room: defaultGameRoomSettings(gameType),
    party: defaultPartyRoomSettings(gameType),
    custom: defaultCustomContentState(),
    people: defaultPeopleSettings(gameType),
    wst: defaultWstCreateState(),
    landmine: defaultLandmineCreateState(),
    soloMode: false,
  }
}

export function applyGameTypeChange(
  prev: CreateWizardState,
  gameType: GameType,
  limits: GamePlayerLimitsMap
): CreateWizardState {
  return {
    ...prev,
    gameType,
    theme: themeForGameType(gameType, prev.theme),
    maxPlayers: isLobbyLimitGameType(gameType) ? lobbyDefaultMaxPlayers(gameType, limits) : null,
    lateJoinPolicy: clampLateJoinPolicyForGameType(defaultLateJoinPolicyForGameType(gameType), gameType),
    room: defaultGameRoomSettings(gameType),
    party: defaultPartyRoomSettings(gameType),
    custom: defaultCustomContentState(),
    people: defaultPeopleSettings(gameType),
    wst: defaultWstCreateState(),
    landmine: defaultLandmineCreateState(),
    // A game type change may make solo unavailable — never carry a stale flag.
    soloMode: supportsSoloMode(gameType, limits) ? prev.soloMode : false,
  }
}

export const CREATE_SETTINGS_REGISTRY: Partial<Record<GameType, CreateSettingsRegistryEntry>> = {
  landmine: { extraPayload: (state) => landmineCreatePayload(state.landmine) },
}

/** Everything the host must get right on the Setup step before the People step. */
export function validateSetupStep(state: CreateWizardState): string | null {
  if (!state.title.trim()) return 'Enter a game title'
  if (isWhoSaidThis(state.gameType)) return validateWstCreate(state.wst)
  const customError = validateCustomContent(state.gameType, state.custom, state.party.roundsCount)
  if (customError) return customError
  const slotError = validateCustomSlots(state.gameType, state.people)
  if (slotError) return slotError
  return null
}

export function validateCreateState(state: CreateWizardState): string | null {
  const setupError = validateSetupStep(state)
  if (setupError) return setupError
  const peopleError = validateParticipants(state.gameType, state.people)
  if (peopleError) return peopleError
  const entry = CREATE_SETTINGS_REGISTRY[state.gameType]
  return entry?.validate?.(state) ?? null
}

export function buildCreatePayload(state: CreateWizardState, limits: GamePlayerLimitsMap): Record<string, unknown> {
  const { gameType } = state
  const lateJoinPolicy = clampLateJoinPolicyForGameType(state.lateJoinPolicy, gameType)
  const supportsViewers = gameSupportsViewerSetting(gameType)

  let maxPlayers: number | undefined
  if (isLobbyLimitGameType(gameType)) {
    const fallback = lobbyDefaultMaxPlayers(gameType, limits)
    maxPlayers = clampLobbyMaxPlayers(gameType, state.maxPlayers ?? fallback, limits)
  }
  // UNO Team-Up is fixed at 4 players (2 teams of 2) — overrides whatever max-players the host
  // picked before turning Team-Up on.
  if (gameType === 'uno' && state.room.unoTeamMode) maxPlayers = 4
  // Solo mode forces a 1-seat lobby. Placed after every other max_players branch so nothing
  // can override it back up. Only honored for games whose lobby min is 1.
  if (state.soloMode && supportsSoloMode(gameType, limits)) maxPlayers = 1

  const payload: Record<string, unknown> = {
    title: state.title.trim(),
    game_type: gameType,
    theme: state.theme,
    isPublic: state.isPublic,
    // Discovery Phase C + private-schedule follow-up: send scheduled_at any
    // time the host set it, regardless of visibility. Server accepts the pair
    // for private games too (invite-by-link RSVP flow).
    ...(state.scheduledAt ? { scheduled_at: state.scheduledAt } : {}),
    ...customContentPayload(gameType, state.custom),
    ...peoplePayload(gameType, state.people, state.party.anonymous, isPollPartyGame(gameType)),
    ...gameRoomSettingsPayload(gameType, state.room),
    ...partyRoomSettingsPayload(gameType, state.party),
    // Who Said This overrides the question/participant fields with its own source model.
    ...(isWhoSaidThis(gameType) ? wstCreatePayload(state.wst) : {}),
  }

  // A stale admin theme (`pt:<id>`) left in party state must not fold its pool when the host has
  // switched to a Library/Your-own source — that would override the custom pool and difficulty.
  if (state.custom.source !== 'platform') delete payload.puzzle_theme_id

  if (maxPlayers != null) payload.max_players = maxPlayers

  // Player-facing content label — explicit host input wins, else the picked library pack name
  // (custom-content or Who Said This deck).
  const contentLabel = (
    state.contentLabel.trim() ||
    state.custom.libraryPackTitle?.trim() ||
    state.wst.libraryPackTitle?.trim() ||
    ''
  ).slice(0, 40)
  if (contentLabel) payload.content_label = contentLabel

  if (supportsViewers) {
    payload.allow_viewers = lateJoinPolicy !== 'lobby_only'
    payload.allow_late_players = lateJoinPolicy === 'viewers_and_players'
    payload.late_join_policy = lateJoinPolicy
  }

  if (isCodewordsGame(gameType)) {
    payload.codewords_late_join = lateJoinPolicy === 'viewers_and_players'
  }

  const entry = CREATE_SETTINGS_REGISTRY[gameType]
  if (entry?.extraPayload) Object.assign(payload, entry.extraPayload(state))

  return payload
}

export function supportsMaxPlayersSetting(gameType: GameType): boolean {
  return isLobbyLimitGameType(gameType)
}

// secret_message has no inputs at all, and custom's defining content is per-game participant
// slots (CustomSlotBuilder) that change every time — not a "setting" worth reusing. Every other
// game type has at least one genuinely reusable setting, so this is an exclude-list rather than
// an allowlist (mirrors web `templatableGame` in `src/lib/game-types.ts`).
export function templatableGame(gameType: GameType): boolean {
  return !isSecretMessageGame(gameType) && !isCustomGame(gameType)
}
