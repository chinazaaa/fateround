import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await params
  const roomCode = code.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: room } = await supabase.from('rooms').select('id').eq('id', roomCode).maybeSingle()
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  // room_members, room_games, and room_messages reference rooms(id) ON DELETE
  // CASCADE, so removing the row also clears the roster, game links, and chat.
  // The linked games themselves live in their own table and are unaffected.
  const { error } = await supabase.from('rooms').delete().eq('id', roomCode)
  if (error) return NextResponse.json({ error: internalErrorMessage('admin/rooms/delete', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
