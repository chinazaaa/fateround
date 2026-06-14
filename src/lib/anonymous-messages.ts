import type { SupabaseClient } from '@supabase/supabase-js'
import type { Game, Player } from '@/types'

/** Keep at most this many messages per anonymous room before batch trimming kicks in. */
export const ANONYMOUS_ROOM_MAX_MESSAGES = 1000

/** How many oldest messages to delete per trim pass. */
export const ANONYMOUS_ROOM_TRIM_BATCH = 100

/** Minimum time between trim passes once over the cap. */
export const ANONYMOUS_ROOM_TRIM_INTERVAL_MS = 5 * 60 * 1000

/** Fixed session length for anonymous rooms (15 minutes). */
export const ANONYMOUS_ROOM_SESSION_SECONDS = 15 * 60

/** Lobby size limits for anonymous rooms. */
export const ANONYMOUS_ROOM_MIN_PLAYERS = 2
export const ANONYMOUS_ROOM_MAX_PLAYERS = 50
export const ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS = 50

export function clampAnonymousRoomMaxPlayers(value: number): number {
  return Math.min(ANONYMOUS_ROOM_MAX_PLAYERS, Math.max(ANONYMOUS_ROOM_MIN_PLAYERS, value))
}

export function anonymousRoomMaxPlayers(game: Pick<Game, 'max_players'>): number {
  if (game.max_players == null) return ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS
  return clampAnonymousRoomMaxPlayers(game.max_players)
}

/** Snapshot length for quoted replies shown in the feed. */
export const ANONYMOUS_REPLY_PREVIEW_MAX = 120

export function truncateReplyPreview(text: string, max = ANONYMOUS_REPLY_PREVIEW_MAX): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

/** Default mute length when the host bans someone. */
export const ANONYMOUS_ROOM_DEFAULT_BAN_MINUTES = 10

export const ANONYMOUS_ROOM_BAN_MINUTE_OPTIONS = [5, 10, 15, 30] as const

export function isPlayerBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false
  return new Date(bannedUntil).getTime() > Date.now()
}

export function banSecondsLeft(bannedUntil: string | null | undefined): number {
  if (!bannedUntil) return 0
  return Math.max(0, Math.ceil((new Date(bannedUntil).getTime() - Date.now()) / 1000))
}

export function formatBanCountdown(secondsLeft: number): string {
  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Players who join after the session starts may watch but not post. */
export function anonymousPlayerCanChat(
  player: Pick<Player, 'joined_at'>,
  game: Pick<Game, 'status' | 'session_started_at'>
): boolean {
  if (game.status === 'waiting') return true
  if (!game.session_started_at) return false
  return new Date(player.joined_at).getTime() < new Date(game.session_started_at).getTime()
}

export function anonymousPlayerCanPost(
  player: Pick<Player, 'joined_at'>,
  game: Pick<Game, 'status' | 'session_started_at'>,
  bannedUntil?: string | null
): boolean {
  if (isPlayerBanned(bannedUntil)) return false
  return anonymousPlayerCanChat(player, game)
}

export function anonymousSessionExpired(sessionStartedAt: string | null | undefined): boolean {
  if (!sessionStartedAt) return false
  const deadline = new Date(sessionStartedAt).getTime() + ANONYMOUS_ROOM_SESSION_SECONDS * 1000
  return Date.now() >= deadline
}

export function anonymousSessionSecondsLeft(sessionStartedAt: string | null | undefined): number {
  if (!sessionStartedAt) return ANONYMOUS_ROOM_SESSION_SECONDS
  const deadline = new Date(sessionStartedAt).getTime() + ANONYMOUS_ROOM_SESSION_SECONDS * 1000
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

export async function trimAnonymousMessagesIfDue(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ trimmed: number }> {
  const { count, error: countError } = await supabase
    .from('anonymous_messages')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)

  if (countError || !count || count <= ANONYMOUS_ROOM_MAX_MESSAGES) {
    return { trimmed: 0 }
  }

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('anonymous_messages_trimmed_at')
    .eq('id', gameId)
    .maybeSingle()

  if (gameError) return { trimmed: 0 }

  const lastTrimMs = game?.anonymous_messages_trimmed_at ? new Date(game.anonymous_messages_trimmed_at).getTime() : 0

  if (Date.now() - lastTrimMs < ANONYMOUS_ROOM_TRIM_INTERVAL_MS) {
    return { trimmed: 0 }
  }

  const { data: oldest, error: fetchError } = await supabase
    .from('anonymous_messages')
    .select('id')
    .eq('game_id', gameId)
    .order('created_at', { ascending: true })
    .limit(ANONYMOUS_ROOM_TRIM_BATCH)

  if (fetchError || !oldest?.length) return { trimmed: 0 }

  const { error: deleteError } = await supabase
    .from('anonymous_messages')
    .delete()
    .in(
      'id',
      oldest.map((row) => row.id)
    )

  if (deleteError) return { trimmed: 0 }

  await supabase.from('games').update({ anonymous_messages_trimmed_at: new Date().toISOString() }).eq('id', gameId)

  return { trimmed: oldest.length }
}

/** Wipe live session data when an anonymous room ends — messages are not kept. */
export async function clearAnonymousRoomSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  const { error: messagesError } = await supabase.from('anonymous_messages').delete().eq('game_id', gameId)
  if (messagesError) return { error: messagesError.message }

  const { error: bansError } = await supabase.from('anonymous_room_bans').delete().eq('game_id', gameId)
  if (bansError) return { error: bansError.message }

  return { error: null }
}

export async function finishAnonymousRoomSession(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  const { error: gameError } = await supabase.from('games').update({ status: 'finished' }).eq('id', gameId)
  if (gameError) return { error: gameError.message }

  return clearAnonymousRoomSessionData(supabase, gameId)
}

export async function finishExpiredAnonymousSession(
  supabase: SupabaseClient,
  game: { id: string; status: string; game_type: string; session_started_at?: string | null }
): Promise<boolean> {
  if (game.status !== 'active') return false
  if (!anonymousSessionExpired(game.session_started_at)) return false

  const { error } = await finishAnonymousRoomSession(supabase, game.id)
  return !error
}
