import type { GameType, MobileConfig, ParticipantGender, PlayerGender } from '@fateround/shared'
import { NATIVE_GAME_TYPES } from '@/lib/native-games'
import { apiUrl } from '@/lib/config'
import { authHeaders } from '@/lib/auth-headers'

export type JoinPlayerResponse = {
  playerId: string
  playerName: string
  resumeToken?: string
  playerGender?: PlayerGender
  canChat?: boolean
  error?: string
  /** Set by the server when a join is refused because the lobby is full. */
  full?: boolean
}

/** Error carrying the server's `full` flag so callers can offer "watch instead". */
export class JoinError extends Error {
  full: boolean
  /** Set when the server returned a cross-device 409 (already_hosting / already_joined). */
  reason?: 'already_hosting' | 'already_joined'
  existingPlayerName?: string | null
  constructor(message: string, full: boolean, extras?: { reason?: JoinError['reason']; existingPlayerName?: string | null }) {
    super(message)
    this.name = 'JoinError'
    this.full = full
    this.reason = extras?.reason
    this.existingPlayerName = extras?.existingPlayerName ?? null
  }
}

/** Reclaim an existing seat from a typed-in player code. Errors on an unknown code. */
export async function resumePlayerByCode(
  gameCode: string,
  resumeToken: string
): Promise<{
  playerId: string
  playerName: string
  playerGender: PlayerGender
  resumeToken: string
  isViewer: boolean
}> {
  const res = await fetch(apiUrl('/api/players/resume'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameCode: gameCode.toUpperCase(), resumeToken: resumeToken.trim().toUpperCase() }),
  })
  const data = (await res.json()) as {
    playerId: string
    playerName: string
    playerGender: PlayerGender
    resumeToken: string
    isViewer: boolean
    error?: string
  }
  if (!res.ok) throw new Error(data.error ?? 'Could not find that player code')
  return data
}

export async function autoJoinGame(gameCode: string, resumeToken?: string | null): Promise<JoinPlayerResponse> {
  const res = await fetch(apiUrl('/api/players'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({
      gameCode: gameCode.toUpperCase(),
      resumeToken: resumeToken ?? undefined,
    }),
  })
  const data = (await res.json()) as JoinPlayerResponse & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Failed to join')
  return data
}

/**
 * Record which player row is the game's host (games.host_player_id) so every client
 * can badge the host in the roster drawer. Mirrors web `useHostSeat`. Best-effort.
 */
export async function publishHostPlayerId(gameCode: string, hostToken: string, playerId: string): Promise<void> {
  await fetch(apiUrl(`/api/games/${gameCode.toUpperCase()}/host-player`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostToken, playerId }),
  }).catch(() => {})
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
  participantId?: string | null
  gender?: PlayerGender
  identityGender?: ParticipantGender
  pollGender?: ParticipantGender
  /** Set true to bypass the server's cross-device 409 and take the seat here. */
  continueOnThisDevice?: boolean
}): Promise<JoinPlayerResponse> {
  const res = await fetch(apiUrl('/api/players'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({
      gameCode: input.gameCode.toUpperCase(),
      playerName: input.playerName.trim(),
      gender: input.gender ?? 'both',
      resumeToken: input.resumeToken ?? undefined,
      joinAsViewer: input.joinAsViewer,
      monopolyToken: input.monopolyToken ?? undefined,
      participantId: input.participantId ?? undefined,
      identityGender: input.identityGender ?? undefined,
      pollGender: input.pollGender ?? undefined,
      continueOnThisDevice: input.continueOnThisDevice === true ? true : undefined,
    }),
  })
  const data = (await res.json()) as JoinPlayerResponse & {
    error?: string
    reason?: 'already_hosting' | 'already_joined'
    existingPlayerName?: string | null
  }
  if (!res.ok) {
    throw new JoinError(data.error ?? 'Failed to join game', data.full === true, {
      reason: data.reason,
      existingPlayerName: data.existingPlayerName ?? null,
    })
  }
  return data
}

export type LibraryPackSummary = {
  id: string
  title: string
  game_type: GameType
  author_name: string
  description: string | null
  question_count: number
  tags?: string[]
}

export type LibraryPack = LibraryPackSummary & { questions: unknown[] }

/** Community question packs for a game type (read-only pick). */
export async function fetchLibraryPacks(gameType: GameType): Promise<LibraryPackSummary[]> {
  const res = await fetch(apiUrl(`/api/library?game_type=${encodeURIComponent(gameType)}&page_size=100`), {
    cache: 'no-store',
  })
  const data = (await res.json()) as { packs?: LibraryPackSummary[]; error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Could not load packs')
  return data.packs ?? []
}

/** Full pack including its questions. */
export async function fetchLibraryPack(id: string): Promise<LibraryPack> {
  const res = await fetch(apiUrl(`/api/library/${id}`))
  const data = (await res.json()) as { pack?: LibraryPack; error?: string }
  if (!res.ok || !data.pack) throw new Error(data.error ?? 'Could not load pack')
  return data.pack
}

export type GifItem = { id: string; previewUrl: string; fullUrl: string }

type KlipyFile = {
  hd?: { gif?: { url: string }; webp?: { url: string } }
  sm?: { gif?: { url: string }; webp?: { url: string } }
  xs?: { gif?: { url: string }; webp?: { url: string } }
}
type KlipyItem = { id: number | string; file: KlipyFile }

export type KlipyMediaType = 'gifs' | 'stickers'

/**
 * Search GIFs or stickers via the shared /api/klipy proxy (Klipy).
 * Empty query = trending. Defaults to GIFs for backward compatibility.
 */
export async function searchGifs(query: string, type: KlipyMediaType = 'gifs'): Promise<GifItem[]> {
  const res = await fetch(apiUrl(`/api/klipy?type=${type}&q=${encodeURIComponent(query)}`), { cache: 'no-store' })
  if (!res.ok) throw new Error(type === 'stickers' ? 'Could not load stickers' : 'Could not load GIFs')
  const json = (await res.json()) as { data?: { data?: KlipyItem[] } }
  const items = json.data?.data ?? []
  return items
    .map((item) => {
      const f = item.file
      const previewUrl = f.sm?.webp?.url ?? f.sm?.gif?.url ?? f.xs?.gif?.url ?? ''
      const fullUrl = f.hd?.gif?.url ?? f.sm?.gif?.url ?? previewUrl
      return { id: String(item.id), previewUrl, fullUrl }
    })
    .filter((g) => g.previewUrl && g.fullUrl)
}

export function isGameMobileSupported(gameType: GameType, config: MobileConfig | null): boolean {
  if (config?.forceWebFallbackFor.includes(gameType)) return false
  if (config) return config.mobileSupportedGames.includes(gameType)
  return NATIVE_GAME_TYPES.includes(gameType)
}
