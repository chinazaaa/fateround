import type { GameType } from '@fateround/shared'
import type { ThemeId } from '@fateround/shared/create-themes'
import type { GamePlayerLimitsMap } from '@fateround/shared/lobby-limits'
import {
  clampLobbyMaxPlayers,
  isLobbyLimitGameType,
  lobbyDefaultMaxPlayers,
} from '@fateround/shared/lobby-limits'
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
  needsPeopleStep,
  peoplePayload,
  validateCustomSlots,
  validateParticipants,
  type PeopleSettings,
} from '@/lib/create-settings/people'

export type { GameRoomSettings } from '@/lib/create-settings/board-games'
export { hasGameRoomSettings, BATCH_19_BOARD_GAMES } from '@/lib/create-settings/board-games'
export type { PartyRoomSettings } from '@/lib/create-settings/party-games'
export { hasPartyRoomSettings, BATCH_20_PARTY_GAMES, isPollPartyGame } from '@/lib/create-settings/party-games'
export type { CustomContentState } from '@/lib/create-settings/custom-content'
export { supportsCustomContent } from '@/lib/create-settings/custom-content'
export type { PeopleSettings } from '@/lib/create-settings/people'
export {
  supportsImportMode,
  participantModeOptions,
  isCustomGame,
  minParticipants,
} from '@/lib/create-settings/people'

export type CreateWizardStep = 'setup' | 'people'

export type CreateWizardState = {
  title: string
  gameType: GameType
  theme: ThemeId
  isPublic: boolean
  maxPlayers: number | null
  lateJoinPolicy: LateJoinPolicy
  room: GameRoomSettings
  party: PartyRoomSettings
  custom: CustomContentState
  people: PeopleSettings
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

export function createInitialState(
  gameType: GameType,
  limits: GamePlayerLimitsMap
): CreateWizardState {
  return {
    title: '',
    gameType,
    theme: themeForGameType(gameType, 'default'),
    isPublic: false,
    maxPlayers: isLobbyLimitGameType(gameType) ? lobbyDefaultMaxPlayers(gameType, limits) : null,
    lateJoinPolicy: defaultLateJoinPolicyForGameType(gameType),
    room: defaultGameRoomSettings(gameType),
    party: defaultPartyRoomSettings(gameType),
    custom: defaultCustomContentState(),
    people: defaultPeopleSettings(gameType),
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
    lateJoinPolicy: clampLateJoinPolicyForGameType(
      defaultLateJoinPolicyForGameType(gameType),
      gameType
    ),
    room: defaultGameRoomSettings(gameType),
    party: defaultPartyRoomSettings(gameType),
    custom: defaultCustomContentState(),
    people: defaultPeopleSettings(gameType),
  }
}

export const CREATE_SETTINGS_REGISTRY: Partial<Record<GameType, CreateSettingsRegistryEntry>> = {}

/** Everything the host must get right on the Setup step before the People step. */
export function validateSetupStep(state: CreateWizardState): string | null {
  if (!state.title.trim()) return 'Enter a game title'
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

  const payload: Record<string, unknown> = {
    title: state.title.trim(),
    game_type: gameType,
    theme: state.theme,
    isPublic: state.isPublic,
    ...customContentPayload(gameType, state.custom),
    ...peoplePayload(gameType, state.people, state.party.anonymous, isPollPartyGame(gameType)),
    ...gameRoomSettingsPayload(gameType, state.room),
    ...partyRoomSettingsPayload(gameType, state.party),
  }

  if (maxPlayers != null) payload.max_players = maxPlayers

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
