import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizeResumeToken } from '@/lib/utils'

/**
 * Proof the caller is allowed in a voice room, verified against trusted server-side state.
 *
 * SECURITY (audit finding C4, Aug 2026): this used to authorize `player` and `member` on the
 * caller-supplied `identity` — `players.id` / `room_members.id` — on the belief that a
 * server-generated UUID is secret. It is not: anon holds SELECT on `players.id` (the roster
 * has to render), so `select id, game_id from players` with the publishable key returned
 * every player on the platform, and posting one back here minted a LiveKit token with
 * canPublish/canSubscribe for that game. Proven end-to-end during the audit.
 *
 * `src/lib/game-admin.ts` already states the rule this violated: a client-supplied playerId is
 * "a public, forgeable value". So both branches now take the SAME secret the rest of the app
 * authorizes on — `players.resume_token` and `room_members.member_code`, neither of which anon
 * can read (migrations 0122 and 0126) — and the identity is DERIVED from the resolved row
 * rather than trusted from the request.
 */
export type AudioAuth =
  { kind: 'player'; resumeToken: string } | { kind: 'member'; memberCode: string } | { kind: 'host'; token?: string }

export type AudioAuthResult = {
  /** Canonical LiveKit room to grant, resolved server-side. */
  room: string
  /**
   * Canonical LiveKit identity, derived from the authorized row — never from the request.
   * Callers must mint the token with this, not with anything the client sent.
   */
  identity: string
}

/**
 * Verify the caller is genuinely associated with the room they're asking about and return the
 * canonical room ID plus the identity to mint under, or null when not permitted. Shared by the
 * token-minting and presence routes so both gate access identically.
 */
export async function authorizedRoom(roomName: string, auth: AudioAuth | undefined): Promise<AudioAuthResult | null> {
  if (!auth || !roomName) return null
  const supabase = getSupabaseAdmin()
  const requested = roomName.toUpperCase()

  if (auth.kind === 'player') {
    const token = normalizeResumeToken(String(auth.resumeToken ?? ''))
    // Mirrors assertPlayer's floor: a token this short can't be a real one, and matching on it
    // would turn a lucky guess into a room grant.
    if (token.length < 4) return null

    const { data: player } = await supabase
      .from('players')
      .select('id, game_id')
      .eq('resume_token', token)
      .maybeSingle()
    if (!player) return null

    // The player's own game, or the room that game belongs to — a player in a room-hosted
    // game joins the room-wide voice channel.
    if (player.game_id.toUpperCase() === requested) return { room: player.game_id, identity: player.id }

    const { data: roomGame } = await supabase
      .from('room_games')
      .select('room_id')
      .eq('game_id', player.game_id)
      .maybeSingle()
    if (roomGame && roomGame.room_id.toUpperCase() === requested) {
      return { room: roomGame.room_id, identity: player.id }
    }
    return null
  }

  if (auth.kind === 'member') {
    const code = String(auth.memberCode ?? '').trim()
    if (code.length < 4) return null

    const { data: member } = await supabase
      .from('room_members')
      .select('id, room_id')
      .eq('member_code', code)
      .maybeSingle()
    if (!member || member.room_id?.toUpperCase() !== requested) return null
    return { room: member.room_id, identity: member.id }
  }

  if (auth.kind === 'host') {
    if (!auth.token) return null

    const { data: room } = await supabase.from('rooms').select('id, creator_token').eq('id', requested).maybeSingle()
    if (room?.creator_token && room.creator_token === auth.token) {
      return { room: room.id, identity: `host-${room.id}` }
    }

    const { data: game } = await supabase.from('games').select('id, host_token').eq('id', requested).maybeSingle()
    if (game?.host_token && game.host_token === auth.token) {
      return { room: game.id, identity: `host-${game.id}` }
    }

    // A host of any game inside the room may join the room-wide channel.
    const { data: roomGames } = await supabase.from('room_games').select('game_id').eq('room_id', requested)
    if (roomGames && roomGames.length > 0) {
      const gameIds = roomGames.map((rg) => rg.game_id)
      const { data: games } = await supabase.from('games').select('id, host_token').in('id', gameIds)
      const match = games?.find((g) => g.host_token === auth.token)
      if (match) return { room: requested, identity: `host-${match.id}` }
    }
  }

  return null
}
