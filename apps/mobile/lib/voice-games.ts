import type { GameType } from '@fateround/shared'

/** Mobile voice — social, party, and long-form board games. */
const MOBILE_VOICE_GAMES = new Set<GameType>([
  'anonymous_messages',
  'chess',
  'codewords',
  'crazy_eights',
  'describe_it',
  'hot_seat',
  'ludo',
  'mafia',
  'monopoly',
  'quiplash',
  'trivia',
  'two_truths',
  'whot',
  'word_rush',
])

export function gameHasMobileVoice(gameType: GameType | string | undefined): boolean {
  if (!gameType) return false
  return MOBILE_VOICE_GAMES.has(gameType as GameType)
}

export const MOBILE_VOICE_GAME_COUNT = MOBILE_VOICE_GAMES.size
