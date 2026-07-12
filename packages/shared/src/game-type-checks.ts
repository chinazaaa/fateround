import type { GameType } from './types'

export function parseGameType(raw: GameType | string | undefined): GameType {
  return (typeof raw === 'string' ? raw : 'would_you_rather') as GameType
}

function eq(gameType: GameType | string | undefined, value: GameType): boolean {
  return parseGameType(gameType) === value
}

export function isSecretMessageGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'secret_message')
}

export function isAnonymousMessagesGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'anonymous_messages')
}

export function isBingoGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'bingo')
}

export function isCodewordsGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'codewords')
}

export function isTriviaGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'trivia')
}

export function isTwoTruthsGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'two_truths')
}

export function isMonopolyGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'monopoly')
}

export function isYahtzeeGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'yahtzee')
}

export function isWhotGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'whot')
}

export function isCrazyEightsGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'crazy_eights')
}

export function isLudoGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'ludo')
}

export function isMahjongGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'mahjong')
}

export function isSnakeAndLadderGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'snake_and_ladder')
}

export function isTicTacToeGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'tic_tac_toe')
}

export function isChessGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'chess')
}

export function isCheckersGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'checkers')
}

export function isAyoGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'ayo')
}

export function isScrabbleGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'scrabble')
}

export function isDescribeItGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'describe_it')
}

export function isWordRushGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'word_rush')
}

export function isWordHuntGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'word_hunt')
}

export function isICallOnGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'i_call_on')
}

export function isSudokuGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'sudoku')
}

export function isCrosswordGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'crossword')
}

export function isWordSearchGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'word_search')
}

export function isQuiplashGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'quiplash')
}

export function isQuickDrawGame(gameType: GameType | string | undefined): boolean {
  return eq(gameType, 'quick_draw')
}
