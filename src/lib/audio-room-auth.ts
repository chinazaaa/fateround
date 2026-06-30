import { getSupabaseAdmin } from '@/lib/supabase-admin'

/** Proof the caller is allowed in a voice room, verified against trusted
 * server-side state. `player`/`member` are authorized by their secret `identity`
 * (a server-generated UUID); `host` proves itself with the game's host token. */
export type AudioAuth = { kind: 'player' } | { kind: 'member' } | { kind: 'host'; token?: string }

/**
 * Verify the caller is genuinely associated with the room they're asking about
 * and return the canonical room ID, or null when not permitted. Shared by the
 * token-minting and presence routes so both gate access identically.
 */
export async function authorizedRoomName(
  roomName: string,
  identity: string,
  auth: AudioAuth | undefined
): Promise<string | null> {
  if (!auth) return null
  const supabase = getSupabaseAdmin()

  if (auth.kind === 'player') {
    const { data: player } = await supabase.from('players').select('game_id').eq('id', identity).maybeSingle()
    if (!player) return null

    if (player.game_id.toUpperCase() === roomName.toUpperCase()) return player.game_id

    const { data: roomGame } = await supabase
      .from('room_games')
      .select('room_id')
      .eq('game_id', player.game_id)
      .maybeSingle()
    return roomGame && roomGame.room_id.toUpperCase() === roomName.toUpperCase() ? roomGame.room_id : null
  }

  if (auth.kind === 'member') {
    const { data } = await supabase.from('room_members').select('id, room_id').eq('id', identity).maybeSingle()
    return data && data.room_id?.toUpperCase() === roomName.toUpperCase() ? data.room_id : null
  }

  if (auth.kind === 'host') {
    if (!auth.token) return null

    const { data: room } = await supabase.from('rooms').select('id, creator_token').eq('id', roomName).maybeSingle()
    if (room?.creator_token && room.creator_token === auth.token) return room.id

    const { data: game } = await supabase.from('games').select('id, host_token').eq('id', roomName).maybeSingle()
    if (game?.host_token && game.host_token === auth.token) return game.id

    const { data: roomGames } = await supabase.from('room_games').select('game_id').eq('room_id', roomName)
    if (roomGames && roomGames.length > 0) {
      const gameIds = roomGames.map((rg) => rg.game_id)
      const { data: games } = await supabase.from('games').select('id, host_token').in('id', gameIds)
      const match = games?.find((g) => g.host_token === auth.token)
      if (match) return roomName
    }
  }

  return null
}
