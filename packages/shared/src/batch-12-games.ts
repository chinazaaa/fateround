import type { GameType } from './types'

/** Wordle Room — multiplayer word-guessing race. Client and server share the engine in
 *  `./wordle-room.ts`; this batch file only labels the game for the mobile router / lobby. */
export const BATCH_12_GAMES: GameType[] = ['wordle_room']

export function batch12GameLabel(gameType: GameType | string): string {
  const labels: Partial<Record<GameType, string>> = {
    wordle_room: 'Wordle',
  }
  return labels[gameType as GameType] ?? String(gameType).replace(/_/g, ' ')
}
