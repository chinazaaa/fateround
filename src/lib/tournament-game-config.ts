import { h2hGroupSize } from './tournament-bracket'
import { clampSchoolClassCount, clampSchoolMatchSeconds } from './tournament-school'
import { clampBoardGameTurnTimer } from './board-game-lobby-settings'
import { clampChessTimer } from './chess'
import { clampWhotGameDuration } from './whot'
import {
  clampScrabbleTimer,
  clampScrabbleGameDuration,
  clampScrabbleClockSeconds,
  parseScrabbleClockMode,
} from './scrabble'
import { parseScrabbleDictionaryId } from './scrabble-dictionary-meta'

// The per-round game setup a tournament stores at creation (and, before it starts,
// when a host edits settings). Loosely typed — validated by gameConfigSchema and
// re-clamped here per game type.
export interface TournamentGameConfigInput {
  questionSource?: 'platform' | 'custom'
  roundsCount?: number
  timerSeconds?: number
  gameDurationSeconds?: number
  whotPick3?: boolean
  whotCards?: boolean
  whotNumberCalls?: boolean
  whotPick2Stacking?: boolean
  scrabbleDictionary?: string
  scrabbleClockMode?: string
  scrabbleClockSeconds?: number
  schoolClassCount?: number
}

/** Build the Scrabble room timing fields (shared by head-to-head and knockout).
 *  Chess-clock mode has no whole-game cap, so it forces `gameDurationSeconds` to 0 —
 *  otherwise the room's whole-game expiry could end a chess game early. */
function scrabbleRoomTiming(gameConfig: TournamentGameConfigInput | undefined): Record<string, unknown> {
  const clockMode = parseScrabbleClockMode(gameConfig?.scrabbleClockMode)
  return {
    gameDurationSeconds: clockMode === 'chess' ? 0 : clampScrabbleGameDuration(gameConfig?.gameDurationSeconds ?? 900),
    scrabbleClockMode: clockMode,
    scrabbleClockSeconds: clockMode === 'chess' ? clampScrabbleClockSeconds(gameConfig?.scrabbleClockSeconds) : 0,
  }
}

/**
 * Build the stored `tournaments.game_config` for a format + game, clamping every
 * value to what that game accepts. The single source of truth for both tournament
 * creation and host edits, so a created tournament and an edited one always
 * produce the same shape. Returns null for round-robin (no fixed game config).
 */
export function buildTournamentGameConfig(
  format: string | null | undefined,
  gameType: string | null | undefined,
  gameConfig: TournamentGameConfigInput | undefined
): Record<string, unknown> | null {
  if (format === 'head-to-head') {
    const groupSize = h2hGroupSize(gameType)
    if (gameType === 'whot') {
      return {
        groupSize,
        timerSeconds: clampBoardGameTurnTimer(gameConfig?.timerSeconds ?? 15, 'whot'),
        gameDurationSeconds: clampWhotGameDuration(gameConfig?.gameDurationSeconds ?? 900),
        whotPick3: gameConfig?.whotPick3 ?? true,
        whotCards: gameConfig?.whotCards ?? true,
        whotNumberCalls: gameConfig?.whotNumberCalls ?? true,
        whotPick2Stacking: gameConfig?.whotPick2Stacking ?? true,
      }
    }
    if (gameType === 'scrabble') {
      return {
        groupSize,
        timerSeconds: clampScrabbleTimer(gameConfig?.timerSeconds ?? 60),
        scrabbleDictionary: parseScrabbleDictionaryId(gameConfig?.scrabbleDictionary),
        ...scrabbleRoomTiming(gameConfig),
      }
    }
    // Chess: the per-player clock (0 = untimed) applied to every match.
    return { groupSize, timerSeconds: clampChessTimer(gameConfig?.timerSeconds ?? 600) }
  }

  if (format === 'knockout') {
    // Scrabble knockout plays in rooms (like the head-to-head Scrabble bracket), so
    // it carries the room settings — turn timer, room-length cap, dictionary — plus
    // the group size that drives room splitting. Trivia knockout seats the whole
    // field in one game and carries its per-round question pack + timer instead.
    if (gameType === 'scrabble') {
      return {
        groupSize: h2hGroupSize('scrabble'),
        timerSeconds: clampScrabbleTimer(gameConfig?.timerSeconds ?? 60),
        scrabbleDictionary: parseScrabbleDictionaryId(gameConfig?.scrabbleDictionary),
        ...scrabbleRoomTiming(gameConfig),
      }
    }
    return {
      questionSource: gameConfig?.questionSource ?? 'platform',
      roundsCount: gameConfig?.roundsCount ?? 5,
      timerSeconds: gameConfig?.timerSeconds ?? 15,
    }
  }

  if (format === 'school') {
    return {
      schoolClassCount: clampSchoolClassCount(gameConfig?.schoolClassCount ?? 16),
      timerSeconds: clampBoardGameTurnTimer(gameConfig?.timerSeconds ?? 30, 'whot'),
      gameDurationSeconds: clampSchoolMatchSeconds(gameConfig?.gameDurationSeconds),
      whotPick3: gameConfig?.whotPick3 ?? true,
      whotCards: gameConfig?.whotCards ?? true,
      whotNumberCalls: gameConfig?.whotNumberCalls ?? true,
      whotPick2Stacking: gameConfig?.whotPick2Stacking ?? true,
    }
  }

  return null
}
