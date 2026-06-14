import type { Game } from '@/types'
import { parseGameType, isPairGame, isThreeChoiceGame, isCustomGame } from '@/lib/game-types'
import { participantsWhoJoined } from '@/lib/participants'
import { getFullHostListForRounds } from '@/lib/participant-mode'
import {
  combineLobbyQuestions,
  parsePlayerQuestionsOrder,
  lobbyAllowsPlayerQuestions,
} from '@/lib/player-question-pool'

/** SMK, pair games, and custom — rounds show names from a poll. */
export function isPeoplePollGame(gameType?: string): boolean {
  const type = parseGameType(gameType)
  return isPairGame(type) || isThreeChoiceGame(type) || isCustomGame(type)
}

/** Player name submissions — voters-only (import list, vote only). */
export function supportsPlayerNameSubmissions(game: Pick<Game, 'game_type' | 'participant_mode'>): boolean {
  return isPeoplePollGame(game.game_type) && (game.participant_mode ?? 'import') === 'voters'
}

export function lobbyAllowsPlayerNameSubmissions(
  game: Pick<Game, 'game_type' | 'player_questions_enabled' | 'participant_mode'>
): boolean {
  if (!supportsPlayerNameSubmissions(game)) return false
  return game.player_questions_enabled !== false
}

export function lobbyAllowsPlayerLobbySubmissions(
  game: Pick<Game, 'game_type' | 'player_questions_enabled' | 'participant_mode'>
): boolean {
  return lobbyAllowsPlayerQuestions(game) || lobbyAllowsPlayerNameSubmissions(game)
}

export function playerNameSubmissionHint(): string {
  return 'Add names for everyone to rate. You join separately as a voter — your name is not on the poll.'
}

export function playerNameSubmissionPlaceholder(): string {
  return 'Celebrity, character, anyone…'
}

export function playerNameSubmissionPanelTitle(): string {
  return 'Add a name to the poll'
}

export type PollParticipantRow = {
  id: string
  gender: string
  name: string
  submitted_by_player_id?: string | null
}

export function buildPeoplePollParticipantPool(
  game: Pick<
    Game,
    'participant_mode' | 'participant_filter' | 'game_type' | 'player_questions_enabled' | 'player_questions_order'
  >,
  participantsData: PollParticipantRow[],
  playersData: { participant_id?: string | null; name: string }[]
): PollParticipantRow[] {
  const hostRows = participantsData.filter((p) => !p.submitted_by_player_id)
  const playerRows = lobbyAllowsPlayerNameSubmissions(game)
    ? participantsData.filter((p) => p.submitted_by_player_id)
    : []

  const useAllHost = getFullHostListForRounds(game)
  const hostPool = useAllHost ? hostRows : participantsWhoJoined(hostRows, playersData)

  const order = parsePlayerQuestionsOrder(game.player_questions_order)
  const total = hostPool.length + playerRows.length
  if (total === 0) return []
  return combineLobbyQuestions(playerRows, hostPool, total, order)
}
