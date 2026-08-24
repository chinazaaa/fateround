import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Validates a host token for a game. The client can no longer read `games.host_token`
 * (migration 0122), so the host page calls this to gate the host UI. Server actions
 * still independently enforce host auth — this is just the early "are you the host?" check.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()

  let body: { hostToken?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })
  }
  const hostToken = typeof body?.hostToken === 'string' ? body.hostToken : ''
  if (!hostToken) return NextResponse.json({ ok: false }, { status: 200 })

  const supabase = getSupabaseAdmin()
  const { data: game } = await supabase.from('games').select('host_token, host_user_id').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ ok: false, notFound: true }, { status: 200 })

  return NextResponse.json({ ok: game.host_token === hostToken }, { status: 200 })
}
