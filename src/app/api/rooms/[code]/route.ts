import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { ROOM_PUBLIC_FIELDS, verifyRoomCreator } from '@/lib/room-api'
import { normalizeRoomDescription, normalizeRoomTimezone } from '@/lib/room-timezones'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const supabase = getSupabaseAnon()

// Permissive shapes: every field optional + loosely typed to preserve the handlers'
// existing coercion (String()/Number()/=== true). The schema's job here is only to turn a
// malformed or non-object body into a clean 400 instead of a 500 — not to tighten
// field-level validation.
const roomDeleteSchema = z.object({ creatorToken: z.string().optional() }).passthrough()
const roomPatchSchema = z
  .object({
    creatorToken: z.string().optional(),
    isPublic: z.boolean().optional(),
    isLocked: z.boolean().optional(),
    name: z.string().optional(),
    description: z.string().nullish(),
    timezone: z.string().nullish(),
    maxMembers: z.union([z.string(), z.number(), z.null()]).optional(),
  })
  .passthrough()

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const roomCode = code.toUpperCase()
  const { data: body, error: bodyError } = await parseJsonBody(req, roomDeleteSchema)
  if (bodyError) return bodyError
  const creatorToken = String(body.creatorToken ?? '')

  const admin = getSupabaseAdmin()
  const auth = await verifyRoomCreator(admin, roomCode, creatorToken)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await admin.from('rooms').delete().eq('id', roomCode)
  if (error) return NextResponse.json({ error: internalErrorMessage('rooms/code', error) }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const roomCode = code.toUpperCase()
  const { data: body, error: bodyError } = await parseJsonBody(req, roomPatchSchema)
  if (bodyError) return bodyError
  const creatorToken = String(body.creatorToken ?? '')

  const admin = getSupabaseAdmin()
  const auth = await verifyRoomCreator(admin, roomCode, creatorToken)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const updates: Record<string, unknown> = {}

  if (body.isPublic !== undefined) {
    updates.is_public = body.isPublic === true
  }

  if (body.isLocked !== undefined) {
    updates.is_locked = body.isLocked === true
  }

  if (body.description !== undefined) {
    const description = normalizeRoomDescription(body.description)
    if (body.description && !description) {
      return NextResponse.json({ error: 'Description is too long' }, { status: 400 })
    }
    updates.description = description
  }

  if (body.timezone !== undefined) {
    const timezone = normalizeRoomTimezone(body.timezone)
    if (body.timezone && !timezone) {
      return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
    }
    updates.timezone = timezone
  }

  if (body.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Room name is required' }, { status: 400 })
    if (name.length > 50)
      return NextResponse.json({ error: 'Room name must be 50 characters or less' }, { status: 400 })
    updates.name = name
  }

  if (body.maxMembers !== undefined) {
    const raw = body.maxMembers === '' || body.maxMembers === null ? null : Number(body.maxMembers)
    if (raw !== null && (isNaN(raw) || raw < 2)) {
      return NextResponse.json({ error: 'Max members must be 2 or more' }, { status: 400 })
    }
    updates.max_members = raw === null ? null : Math.floor(raw)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No settings to update' }, { status: 400 })
  }

  const { data: room, error } = await admin
    .from('rooms')
    .update(updates)
    .eq('id', roomCode)
    .select(ROOM_PUBLIC_FIELDS)
    .single()

  if (error) return NextResponse.json({ error: internalErrorMessage('rooms/code', error) }, { status: 500 })

  return NextResponse.json({ room })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const roomCode = code.toUpperCase()

  const { data: room } = await supabase.from('rooms').select(ROOM_PUBLIC_FIELDS).eq('id', roomCode).maybeSingle()
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  const [{ data: members }, { data: recentGames }] = await Promise.all([
    supabase
      .from('room_members')
      .select('id, display_name, joined_at, times_kissed, times_married, times_killed, games_played, room_points')
      .eq('room_id', roomCode)
      .order('joined_at', { ascending: true }),
    supabase
      .from('room_games')
      .select(
        'id, game_id, created_at, started_by_member_id, room_members(display_name), games(title, game_type, status)'
      )
      .eq('room_id', roomCode)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  return NextResponse.json({ room, members: members ?? [], recentGames: recentGames ?? [] })
}
