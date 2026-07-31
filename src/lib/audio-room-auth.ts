import { getSupabaseAdmin } from '@/lib/supabase-admin'

/** Proof the caller is allowed in a voice room, verified against trusted
 * server-side state. `player`/`member` prove ownership with a SECRET the anon
 * client cannot read for someone else — `players.resume_token` /
 * `room_members.member_code` (both revoked from anon) — and the server derives
 * the LiveKit identity from the row those secrets resolve to. `host` proves
 * itself with the game's host token. A client-supplied `id` is NEVER trusted as
 * identity: `players.id` / `room_members.id` are anon-readable, so accepting them
 * would let anyone mint a join token for any room. */
export type AudioAuth =
  | { kind: 'player'; resumeToken?: string }
  | { kind: 'member'; memberCode?: string }
  | { kind: 'host'; token?: string }

/** A verified room the caller may join, plus the identity the server derived for
 * them (never the raw, client-supplied id for the player/member paths). */
export type AuthorizedRoom = { room: string; identity: string }

/**
 * Verify the caller is genuinely associated with the room they're asking about
 * and return the canonical room ID + the server-derived identity, or null when
 * not permitted. Shared by the token-minting and presence routes so both gate
 * access identically.
 *
 * `identity` is only trusted for the `host` path (which authenticates with the
 * host token); for `player`/`member` the identity is resolved from the secret.
 */
export async function authorizedRoomName(
  roomName: string,
  identity: string,
  auth: AudioAuth | undefined
): Promise<AuthorizedRoom | null> {
  if (!auth) return null
  const supabase = getSupabaseAdmin()

  if (auth.kind === 'player') {
    // Resolve the player by their SECRET resume_token (anon can't read it for
    // another player), never by the client-supplied id. The derived id becomes
    // the LiveKit identity.
    if (!auth.resumeToken) return null
    const { data: player } = await supabase
      .from('players')
      .select('id, game_id')
      .eq('resume_token', auth.resumeToken)
      .maybeSingle()
    if (!player) return null

    if (player.game_id.toUpperCase() === roomName.toUpperCase()) {
      return { room: player.game_id, identity: player.id }
    }

    const { data: roomGame } = await supabase
      .from('room_games')
      .select('room_id')
      .eq('game_id', player.game_id)
      .maybeSingle()
    return roomGame && roomGame.room_id.toUpperCase() === roomName.toUpperCase()
      ? { room: roomGame.room_id, identity: player.id }
      : null
  }

  if (auth.kind === 'member') {
    // Resolve the member by their SECRET member_code, never by id.
    if (!auth.memberCode) return null
    const { data } = await supabase
      .from('room_members')
      .select('id, room_id')
      .eq('member_code', auth.memberCode)
      .maybeSingle()
    return data && data.room_id?.toUpperCase() === roomName.toUpperCase()
      ? { room: data.room_id, identity: data.id }
      : null
  }

  if (auth.kind === 'host') {
    if (!auth.token) return null

    const { data: room } = await supabase.from('rooms').select('id, creator_token').eq('id', roomName).maybeSingle()
    if (room?.creator_token && room.creator_token === auth.token) return { room: room.id, identity }

    const { data: game } = await supabase.from('games').select('id, host_token').eq('id', roomName).maybeSingle()
    if (game?.host_token && game.host_token === auth.token) return { room: game.id, identity }

    const { data: roomGames } = await supabase.from('room_games').select('game_id').eq('room_id', roomName)
    if (roomGames && roomGames.length > 0) {
      const gameIds = roomGames.map((rg) => rg.game_id)
      const { data: games } = await supabase.from('games').select('id, host_token').in('id', gameIds)
      const match = games?.find((g) => g.host_token === auth.token)
      if (match) return { room: roomName, identity }
    }
  }

  return null
}
