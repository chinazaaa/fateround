import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import type { MafiaPlayerState, MafiaSession } from '@/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  const admin = getSupabaseAdmin()

  let body: { resumeToken?: unknown; message?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { resumeToken, message } = body

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

  // 3. Verify player is alive Mafia and it's night phase
  if (playerState.role !== 'mafia') {
    return NextResponse.json({ error: 'Only Mafia members can use night chat' }, { status: 403 })
  }
  if (!playerState.is_alive) {
    return NextResponse.json({ error: 'Dead players cannot chat' }, { status: 403 })
  }
  if (session.phase !== 'night') {
    return NextResponse.json({ error: 'Night chat is only active during the night phase' }, { status: 403 })
  }

  // 4. Save message to database
  const { error } = await admin.from('mafia_chat_messages').insert({
    game_id: gameId,
    sender_player_id: auth.player.id,
    sender_name: auth.player.name,
    message: message.trim(),
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
