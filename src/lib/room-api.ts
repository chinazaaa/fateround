import type { SupabaseClient } from '@supabase/supabase-js'

export type RoomRow = {
  id: string
  name: string
  created_at: string
  is_public: boolean
  is_locked: boolean
  description: string | null
  timezone: string | null
  max_members: number | null
}

export const ROOM_PUBLIC_FIELDS = 'id, name, created_at, is_public, is_locked, description, timezone, max_members'

export async function verifyRoomCreator(
  supabase: SupabaseClient,
  roomCode: string,
  creatorToken: string
): Promise<{ ok: true; room: { creator_token: string } } | { ok: false; status: number; error: string }> {
  if (!creatorToken) {
    return { ok: false, status: 401, error: 'Creator token required' }
  }

  const { data: room } = await supabase.from('rooms').select('creator_token').eq('id', roomCode).maybeSingle()

  if (!room) return { ok: false, status: 404, error: 'Room not found' }
  if (!room.creator_token || room.creator_token !== creatorToken) {
    return { ok: false, status: 403, error: 'Unauthorized' }
  }

  return { ok: true, room }
}

export async function countMembersByRoom(supabase: SupabaseClient, roomIds: string[]): Promise<Record<string, number>> {
  if (roomIds.length === 0) return {}

  const { data: members } = await supabase.from('room_members').select('room_id').in('room_id', roomIds)

  const counts: Record<string, number> = {}
  for (const id of roomIds) counts[id] = 0
  for (const row of members ?? []) {
    counts[row.room_id as string] = (counts[row.room_id as string] ?? 0) + 1
  }
  return counts
}
