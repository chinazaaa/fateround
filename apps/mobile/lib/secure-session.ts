import * as SecureStore from 'expo-secure-store'
import type { PlayerGender } from '@fateround/shared'

const playerKey = (gameCode: string) => `kmk_player_${gameCode.toUpperCase()}`
const hostKey = (gameCode: string) => `game_host_${gameCode.toUpperCase()}`
// Manifest of game codes this device currently holds a host token for. Kept
// in sync by setHostToken/clearHostToken so the Home "upcoming" list can
// enumerate hosted scheduled games without scanning every SecureStore key
// (SecureStore has no listKeys API on iOS).
const HOST_CODES_MANIFEST_KEY = 'game_host_codes_v1'

async function readHostCodesManifest(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(HOST_CODES_MANIFEST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed.filter((x) => typeof x === 'string') as string[]) : []
  } catch {
    return []
  }
}

async function writeHostCodesManifest(codes: string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(HOST_CODES_MANIFEST_KEY, JSON.stringify(codes))
  } catch {
    // Non-fatal — the strip just won't include hosted rows.
  }
}

export async function getHostedGameCodes(): Promise<string[]> {
  return readHostCodesManifest()
}

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
  const code = gameCode.toUpperCase()
  await SecureStore.setItemAsync(hostKey(code), token)
  const codes = await readHostCodesManifest()
  if (!codes.includes(code)) await writeHostCodesManifest([...codes, code])
}

export async function clearHostToken(gameCode: string): Promise<void> {
  const code = gameCode.toUpperCase()
  await SecureStore.deleteItemAsync(hostKey(code))
  const codes = await readHostCodesManifest()
  const next = codes.filter((c) => c !== code)
  if (next.length !== codes.length) await writeHostCodesManifest(next)
}
