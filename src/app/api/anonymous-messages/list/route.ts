import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertHostAny } from '@/lib/game-admin'
import { isSecretMessageGame, parseGameType } from '@/lib/game-types'
import { parseJsonBody } from '@/lib/parse-body'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listSecretMessagesSchema } from '@/lib/validation'

/** The inbox is trimmed at 1,000 messages, so this returns the whole board. */
const SECRET_MESSAGE_LIST_LIMIT = 1000

/**
 * POST /api/anonymous-messages/list
 *
 * Host-only read of a Secret Message inbox. `anonymous_messages` is NOT readable by anon for
 * `secret_message` games (RLS), because anyone with the share link could otherwise read every
 * message and, via `player_id`, who sent it. The host proves ownership with the game's host
 * token and gets text + timestamps only: no sender identity is ever returned.
 */
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, listSecretMessagesSchema)
  if (bodyError) return bodyError

  const limited = await enforceRateLimit(req, RATE_LIMITS.anonymousMessagesList)
  if (limited) return limited

  const gameCode = body.gameId.toUpperCase()
  const admin = getSupabaseAdmin()

  const {
    game,
    error: authError,
    status: authStatus,
  } = await assertHostAny(admin, gameCode, body.hostToken, { columns: 'game_type' })
  if (!game) return NextResponse.json({ error: authError }, { status: authStatus })
  if (!isSecretMessageGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a secret message board' }, { status: 400 })
  }

  // Explicit column list: never select player_id (or `*`), so identity cannot leak by accident.
  const { data, error } = await admin
    .from('anonymous_messages')
    .select('id, game_id, text, created_at, message_type, media_url')
    .eq('game_id', gameCode)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(SECRET_MESSAGE_LIST_LIMIT)

  if (error)
    return NextResponse.json({ error: internalErrorMessage('anonymous-messages-list', error) }, { status: 500 })

  const messages = (data ?? []).reverse().map((m) => ({
    id: m.id,
    game_id: m.game_id,
    text: m.text,
    created_at: m.created_at,
    message_type: m.message_type ?? 'text',
    media_url: m.media_url ?? null,
  }))
  return NextResponse.json({ messages })
}
