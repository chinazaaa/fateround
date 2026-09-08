import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { verifyRoomCreator } from '@/lib/room-api'
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

  // creator_token is the room owner's secret; read it via the service role to authorize.
  const admin = getSupabaseAdmin()
  const auth = await verifyRoomCreator(admin, roomCode, creatorToken)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await admin.from('room_members').delete().eq('id', memberId).eq('room_id', roomCode)

  if (error)
    return NextResponse.json({ error: internalErrorMessage('rooms/code/members/memberId', error) }, { status: 500 })

  return NextResponse.json({ ok: true })
}
