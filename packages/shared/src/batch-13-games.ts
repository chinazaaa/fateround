import type { GameType } from './types'

/** Troll Run — the platformer race. The engine (physics, traps, levels) is shared between web and
 *  the Expo app in `./troll-run-engine`; this batch file only labels the game for the mobile
 *  router / lobby. */
export const BATCH_13_GAMES: GameType[] = ['troll_run']

export function batch13GameLabel(gameType: GameType | string): string {
  const labels: Partial<Record<GameType, string>> = {
    troll_run: 'Troll Run',
  }
  return labels[gameType as GameType] ?? String(gameType).replace(/_/g, ' ')
}
