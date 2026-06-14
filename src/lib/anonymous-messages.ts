import type { SupabaseClient } from '@supabase/supabase-js'
import type { Game, Player } from '@/types'

/** Keep at most this many messages per anonymous room — oldest are deleted first. */
export const ANONYMOUS_ROOM_MAX_MESSAGES = 1000

/** Fixed session length for anonymous rooms (15 minutes). */
export const ANONYMOUS_ROOM_SESSION_SECONDS = 15 * 60

/** Snapshot length for quoted replies shown in the feed. */
export const ANONYMOUS_REPLY_PREVIEW_MAX = 120

export function truncateReplyPreview(text: string, max = ANONYMOUS_REPLY_PREVIEW_MAX): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
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

export async function trimAnonymousMessages(
  supabase: SupabaseClient,
  gameId: string,
  maxMessages = ANONYMOUS_ROOM_MAX_MESSAGES
): Promise<void> {
  const { count, error: countError } = await supabase
    .from('anonymous_messages')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)

  if (countError || !count || count <= maxMessages) return

  const excess = count - maxMessages
  const { data: oldest, error: fetchError } = await supabase
    .from('anonymous_messages')
    .select('id')
    .eq('game_id', gameId)
    .order('created_at', { ascending: true })
    .limit(excess)

  if (fetchError || !oldest?.length) return

  await supabase
    .from('anonymous_messages')
    .delete()
    .in(
      'id',
      oldest.map((row) => row.id)
    )
}

export async function finishExpiredAnonymousSession(
  supabase: SupabaseClient,
  game: { id: string; status: string; game_type: string; session_started_at?: string | null }
): Promise<boolean> {
  if (game.status !== 'active') return false
  if (!anonymousSessionExpired(game.session_started_at)) return false

  const { error } = await supabase.from('games').update({ status: 'finished' }).eq('id', game.id)
  return !error
}
