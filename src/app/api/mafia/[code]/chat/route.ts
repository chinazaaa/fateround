import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import type { MafiaPlayerState, MafiaSession } from '@/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  const admin = getSupabaseAdmin()

  let body: { resumeToken?: unknown; message?: unknown; scope?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { resumeToken, message, scope = 'night' } = body

  const MAX_CHAT_LENGTH = 500
  if (typeof resumeToken !== 'string' || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }
  if (message.trim().length > MAX_CHAT_LENGTH) {
    return NextResponse.json({ error: `Message too long (max ${MAX_CHAT_LENGTH} characters)` }, { status: 400 })
  }

  // 1. Fetch player and confirm participation
  const auth = await assertPlayer(admin, gameId, resumeToken)
  if (!auth.player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }

  // 2. Fetch mafia session and player state
  const [{ data: mafiaSession }, { data: mafiaPlayerState }] = await Promise.all([
    admin.from('mafia_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    admin.from('mafia_player_states').select('*').eq('game_id', gameId).eq('player_id', auth.player.id).maybeSingle(),
  ])

  if (!mafiaSession || !mafiaPlayerState) {
    return NextResponse.json({ error: 'Session not initialized' }, { status: 404 })
  }

  const session = mafiaSession as MafiaSession
  const playerState = mafiaPlayerState as MafiaPlayerState

  const targetScope = scope === 'day' ? 'day' : scope === 'ghost' ? 'ghost' : 'night'

  // 3. Verify scope-specific authorization
  if (targetScope === 'ghost') {
    // Ghost chat: eliminated players any time, plus an alive Medium at night (they can
    // talk with the dead, but only then — see state/route.ts for the matching read-side
    // restriction).
    const isMediumAtNight = playerState.is_alive && playerState.role === 'medium' && session.phase === 'night'
    if (playerState.is_alive && !isMediumAtNight) {
      return NextResponse.json(
        { error: 'Only eliminated players (or the Medium at night) can use ghost chat' },
        { status: 403 }
      )
    }
  } else {
    // All other scopes require the player to be alive
    if (!playerState.is_alive) {
      return NextResponse.json({ error: 'Dead players cannot chat' }, { status: 403 })
    }
    if (targetScope === 'night') {
      // Wolf-team secret chat: alive mafia/alpha_wolf/wolf_cub/framer, any phase
      const MAFIA_TEAM_ROLES = ['mafia', 'alpha_wolf', 'wolf_cub', 'framer']
      if (!MAFIA_TEAM_ROLES.includes(playerState.role)) {
        return NextResponse.json({ error: 'Only Mafia members can use the secret chat' }, { status: 403 })
      }
    } else {
      // Day chat: sending is allowed during Discussion and Voting — Sunrise, Elimination,
      // and Night can all still view the same feed (see state/route.ts), but not post to it.
      if (session.phase !== 'day' && session.phase !== 'voting') {
        return NextResponse.json({ error: 'Day chat is only active during Discussion or Voting' }, { status: 403 })
      }
    }
  }

  // 4. Save message to database
  const { error } = await admin.from('mafia_chat_messages').insert({
    game_id: gameId,
    sender_player_id: auth.player.id,
    sender_name: auth.player.name,
    message: message.trim(),
    scope: targetScope,
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
