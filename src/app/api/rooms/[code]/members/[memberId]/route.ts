import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Permissive shape: catch a malformed/non-object body (400) without tightening the
// handler's own field coercion.
const roomMemberDeleteSchema = z.object({ creatorToken: z.unknown().optional() })

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string; memberId: string }> }) {
  const { code, memberId } = await params
  const roomCode = code.toUpperCase()
  const { data: body, error: bodyError } = await parseJsonBody(req, roomMemberDeleteSchema)
  if (bodyError) return bodyError
  const creatorToken = String(body.creatorToken ?? '')

  if (!creatorToken) return NextResponse.json({ error: 'Creator token required' }, { status: 401 })

  const admin = getSupabaseAdmin()

  // creator_token is the room owner's secret; read it via the service role to authorize.
  const { data: room } = await admin.from('rooms').select('creator_token').eq('id', roomCode).maybeSingle()

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (!room.creator_token || room.creator_token !== creatorToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { error } = await admin.from('room_members').delete().eq('id', memberId).eq('room_id', roomCode)

  if (error)
    return NextResponse.json({ error: internalErrorMessage('rooms/code/members/memberId', error) }, { status: 500 })

  return NextResponse.json({ ok: true })
}
