import * as SecureStore from 'expo-secure-store'
import type { PlayerGender } from '@fateround/shared'

const playerKey = (gameCode: string) => `kmk_player_${gameCode.toUpperCase()}`
const hostKey = (gameCode: string) => `game_host_${gameCode.toUpperCase()}`
// Manifest of game codes this device currently holds a host token for. Kept
// in sync by setHostToken/clearHostToken so the Home "upcoming" list can
// enumerate hosted scheduled games without scanning every SecureStore key
// (SecureStore has no listKeys API on iOS).
const HOST_CODES_MANIFEST_KEY = 'game_host_codes_v1'
// Same idea for player sessions: the attribution-recovery sweep needs to walk
// every game this device has ever seated a player in, so it can retry any
// finished game whose trophy pass was skipped because the player left before
// the finished screen mounted. Capped to the most recent MAX entries so the
// manifest can't grow without bound.
const PLAYER_CODES_MANIFEST_KEY = 'game_player_codes_v1'
const PLAYER_CODES_MANIFEST_MAX = 100

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

async function readPlayerCodesManifest(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(PLAYER_CODES_MANIFEST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed.filter((x) => typeof x === 'string') as string[]) : []
  } catch {
    return []
  }
}

async function writePlayerCodesManifest(codes: string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(PLAYER_CODES_MANIFEST_KEY, JSON.stringify(codes))
  } catch {
    // Non-fatal — recovery just won't include this device's games.
  }
}

/** Game codes this device has seated a player in, most-recent first. */
export async function getPlayerGameCodes(): Promise<string[]> {
  return readPlayerCodesManifest()
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
  const code = gameCode.toUpperCase()
  const token = typeof resumeToken === 'string' && resumeToken.trim() ? resumeToken.trim().toUpperCase() : null
  await SecureStore.setItemAsync(
    playerKey(code),
    JSON.stringify({ playerId, playerName, playerGender, resumeToken: token })
  )
  // Keep the recovery-sweep manifest current: move this code to the front and cap
  // the manifest so it can't grow without bound over many played games.
  const codes = await readPlayerCodesManifest()
  const next = [code, ...codes.filter((c) => c !== code)].slice(0, PLAYER_CODES_MANIFEST_MAX)
  await writePlayerCodesManifest(next)
}

export async function clearPlayerSession(gameCode: string): Promise<void> {
  const code = gameCode.toUpperCase()
  await SecureStore.deleteItemAsync(playerKey(code))
  const codes = await readPlayerCodesManifest()
  const next = codes.filter((c) => c !== code)
  if (next.length !== codes.length) await writePlayerCodesManifest(next)
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
