import type { GameType } from '@fateround/shared'

/** v1 mobile voice — social / party games first. Expand after shell is proven. */
const MOBILE_VOICE_GAMES = new Set<GameType>([
  'mafia',
  'whot',
  'describe_it',
  'codewords',
  'anonymous_messages',
])

export function gameHasMobileVoice(gameType: GameType | string | undefined): boolean {
  if (!gameType) return false
  return MOBILE_VOICE_GAMES.has(gameType as GameType)
}
