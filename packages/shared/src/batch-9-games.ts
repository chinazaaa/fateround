import type { GameType } from './types'

export const BATCH_9_GAMES: GameType[] = ['secret_message', 'hot_seat', 'custom', 'anonymous_messages', 'landmine', 'ping_pong']

export function batch9GameLabel(gameType: GameType | string): string {
  const labels: Partial<Record<GameType, string>> = {
    secret_message: 'Secret Message',
    hot_seat: 'Hot Seat',
    custom: 'Custom Game',
    anonymous_messages: 'Anonymous Messages',
    landmine: 'Landmine',
    ping_pong: 'Ping Pong',
  }
  return labels[gameType as GameType] ?? String(gameType).replace(/_/g, ' ')
}

export function isAutoNameJoinGame(gameType: GameType | string): boolean {
  return gameType === 'anonymous_messages' || gameType === 'secret_message'
}
