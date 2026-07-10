import type { GameType, MobileConfig, PlayerGender } from '@fateround/shared'
import { NATIVE_GAME_TYPES } from '@/lib/native-games'
import { apiUrl } from '@/lib/config'

export type JoinPlayerResponse = {
  playerId: string
  playerName: string
  resumeToken?: string
  playerGender?: PlayerGender
  canChat?: boolean
  error?: string
}

export async function autoJoinGame(gameCode: string, resumeToken?: string | null): Promise<JoinPlayerResponse> {
  const res = await fetch(apiUrl('/api/players'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameCode: gameCode.toUpperCase(),
      resumeToken: resumeToken ?? undefined,
    }),
  })
  const data = (await res.json()) as JoinPlayerResponse & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Failed to join')
  return data
}

export async function fetchMobileConfig(): Promise<MobileConfig> {
  const res = await fetch(apiUrl('/api/mobile-config'), { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to load mobile config')
  return res.json() as Promise<MobileConfig>
}

export async function joinGame(input: {
  gameCode: string
  playerName: string
  resumeToken?: string | null
  joinAsViewer?: boolean
  monopolyToken?: string | null
}): Promise<JoinPlayerResponse> {
  const res = await fetch(apiUrl('/api/players'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameCode: input.gameCode.toUpperCase(),
      playerName: input.playerName.trim(),
      gender: 'both',
      resumeToken: input.resumeToken ?? undefined,
      joinAsViewer: input.joinAsViewer,
      monopolyToken: input.monopolyToken ?? undefined,
    }),
  })
  const data = (await res.json()) as JoinPlayerResponse & { error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? 'Failed to join game')
  }
  return data
}

export function isGameMobileSupported(
  gameType: GameType,
  config: MobileConfig | null
): boolean {
  if (config?.forceWebFallbackFor.includes(gameType)) return false
  if (config) return config.mobileSupportedGames.includes(gameType)
  return NATIVE_GAME_TYPES.includes(gameType)
}
