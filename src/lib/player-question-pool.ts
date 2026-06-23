import type { Game, PlayerQuestionsOrder } from '@/types'
import {
  parseGameType,
  isBinaryChoiceGame,
  isMostLikelyTo,
  isNeverHaveIEver,
  isPickANumber,
  isPairGame,
  isUnaryPollGame,
  isThreeChoiceGame,
  isCustomGame,
} from '@/lib/game-types'
import { parseQuestionSource } from '@/lib/custom-questions'

export function parsePlayerQuestionsEnabled(raw: unknown): boolean {
  return raw !== false
}

export function parsePlayerQuestionsOrder(raw: unknown): PlayerQuestionsOrder {
  if (raw === 'uploaded_first' || raw === 'mixed') return raw
  return 'players_first'
}

export function lobbyAllowsPlayerQuestions(game: Pick<Game, 'game_type' | 'player_questions_enabled'>): boolean {
  const type = parseGameType(game.game_type)
  if (!isBinaryChoiceGame(type) && !isMostLikelyTo(type) && !isNeverHaveIEver(type) && !isPickANumber(type)) return false
  return game.player_questions_enabled !== false
}

export function effectivePlayerQuestionCount(
  game: Pick<Game, 'player_questions_enabled'>,
  submittedCount: number
): number {
  return game.player_questions_enabled === false ? 0 : submittedCount
}

/** Label for the host-uploaded / platform side of the question mix. */
export function lobbyPoolSourceLabel(game: Pick<Game, 'game_type' | 'question_source'>): string {
  const type = parseGameType(game.game_type)
  if (isPairGame(type) || isUnaryPollGame(type) || isThreeChoiceGame(type) || isCustomGame(type)) return 'Host list'
  const src = parseQuestionSource(game.question_source, type)
  if (src === 'custom' || src === 'library' || type === 'this_or_that') {
    return 'Uploaded'
  }
  return 'Platform'
}

export function playerQuestionsOrderOptions(
  game: Pick<Game, 'game_type' | 'question_source'>
): { value: PlayerQuestionsOrder; label: string; hint: string }[] {
  const pool = lobbyPoolSourceLabel(game)
  const items = pool === 'Host list' ? 'names' : 'questions'
  return [
    {
      value: 'players_first',
      label: 'Players first',
      hint: `Player submissions first, then ${pool.toLowerCase()} ${items}`,
    },
    {
      value: 'uploaded_first',
      label: `${pool} first`,
      hint: `${pool} ${items} first, then player submissions`,
    },
    {
      value: 'mixed',
      label: 'Mix evenly',
      hint: `Alternate between player and ${pool.toLowerCase()} ${items}`,
    },
  ]
}

export function combineLobbyQuestions<T>(
  playerItems: T[],
  poolItems: T[],
  roundCount: number,
  order: PlayerQuestionsOrder
): T[] {
  if (roundCount <= 0) return []

  if (order === 'players_first') {
    return [...playerItems, ...poolItems].slice(0, roundCount)
  }

  if (order === 'uploaded_first') {
    return [...poolItems, ...playerItems].slice(0, roundCount)
  }

  const out: T[] = []
  let pi = 0
  let ui = 0
  let next: 'player' | 'pool' = 'player'

  while (out.length < roundCount) {
    const canPlayer = pi < playerItems.length
    const canPool = ui < poolItems.length
    if (!canPlayer && !canPool) break

    if (next === 'player' && canPlayer) {
      out.push(playerItems[pi++])
    } else if (canPool) {
      out.push(poolItems[ui++])
    } else if (canPlayer) {
      out.push(playerItems[pi++])
    } else {
      break
    }

    next = next === 'player' ? 'pool' : 'player'
  }

  return out
}

export function poolPickCountForLobby(
  roundCount: number,
  playerCount: number,
  order: PlayerQuestionsOrder,
  playerQuestionsEnabled: boolean
): number {
  if (!playerQuestionsEnabled) return roundCount
  if (order === 'players_first') return Math.max(0, roundCount - playerCount)
  return roundCount
}
