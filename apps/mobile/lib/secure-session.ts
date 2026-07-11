import * as SecureStore from 'expo-secure-store'
import type { PlayerGender } from '@fateround/shared'

const playerKey = (gameCode: string) => `kmk_player_${gameCode.toUpperCase()}`
const hostKey = (gameCode: string) => `game_host_${gameCode.toUpperCase()}`

export type PlayerSession = {
  playerId: string
  playerName: string
  playerGender: PlayerGender
  resumeToken: string | null
}

export async function getPlayerSession(gameCode: string): Promise<PlayerSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(playerKey(gameCode))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PlayerSession>
    if (!parsed.playerId || !parsed.playerName || !parsed.playerGender) return null
    return {
      playerId: parsed.playerId,
      playerName: parsed.playerName,
      playerGender: parsed.playerGender,
      resumeToken: typeof parsed.resumeToken === 'string' ? parsed.resumeToken : null,
    }
  } catch {
    return null
  }
}

export async function setPlayerSession(
  gameCode: string,
  playerId: string,
  playerName: string,
  playerGender: PlayerGender,
  resumeToken?: string | null
): Promise<void> {
  const token = typeof resumeToken === 'string' && resumeToken.trim() ? resumeToken.trim().toUpperCase() : null
  await SecureStore.setItemAsync(
    playerKey(gameCode),
    JSON.stringify({ playerId, playerName, playerGender, resumeToken: token })
  )
}

export async function clearPlayerSession(gameCode: string): Promise<void> {
  await SecureStore.deleteItemAsync(playerKey(gameCode))
}

export async function getHostToken(gameCode: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(hostKey(gameCode))
  } catch {
    return null
  }
}

export async function setHostToken(gameCode: string, token: string): Promise<void> {
  await SecureStore.setItemAsync(hostKey(gameCode), token)
}

export async function clearHostToken(gameCode: string): Promise<void> {
  await SecureStore.deleteItemAsync(hostKey(gameCode))
}
