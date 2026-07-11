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

export type { GameRoomSettings } from '@/lib/create-settings/board-games'
export { hasGameRoomSettings, BATCH_19_BOARD_GAMES } from '@/lib/create-settings/board-games'
export type { PartyRoomSettings } from '@/lib/create-settings/party-games'
export { hasPartyRoomSettings, BATCH_20_PARTY_GAMES, isPollPartyGame } from '@/lib/create-settings/party-games'
export type { CustomContentState } from '@/lib/create-settings/custom-content'
export { supportsCustomContent } from '@/lib/create-settings/custom-content'

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
}

export type CreateSettingsRegistryEntry = {
  extraPayload?: (state: CreateWizardState) => Record<string, unknown>
  validate?: (state: CreateWizardState) => string | null
}

export function needsParticipantStep(gameType: GameType): boolean {
  return gameType === 'who_said_this'
}

export function wizardStepsForGame(gameType: GameType): CreateWizardStep[] {
  return needsParticipantStep(gameType) ? ['setup', 'people'] : ['setup']
}

export function usesNativeJoinersMode(gameType: GameType): boolean {
  return gameType !== 'who_said_this'
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
  }
}

export const CREATE_SETTINGS_REGISTRY: Partial<Record<GameType, CreateSettingsRegistryEntry>> = {
  who_said_this: {
    validate: () => 'Add a participant list on web for now — coming in a future app update.',
  },
}

export function validateCreateState(state: CreateWizardState): string | null {
  if (!state.title.trim()) return 'Enter a game title'
  const customError = validateCustomContent(state.gameType, state.custom, state.party.roundsCount)
  if (customError) return customError
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
    participants: [],
    ...(usesNativeJoinersMode(gameType)
      ? {
          participant_mode: 'joiners',
          anonymous: isPollPartyGame(gameType) ? state.party.anonymous : true,
        }
      : { participant_mode: 'import', anonymous: true }),
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
