import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const roomCode = code.toUpperCase()

  const { data: messages } = await supabase
    .from('room_messages')
    .select('id, display_name, text, created_at, member_id')
    .eq('room_id', roomCode)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ messages: (messages ?? []).reverse() })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const roomCode = code.toUpperCase()

  const body = await req.json()
  const memberCode = String(body.memberCode ?? '')
    .trim()
    .toUpperCase()
  const text = String(body.text ?? '').trim()

  if (!text) return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 })
  if (text.length > 500)
    return NextResponse.json({ error: 'Message is too long (max 500 characters)' }, { status: 400 })
  if (!memberCode) return NextResponse.json({ error: 'memberCode is required' }, { status: 400 })

  const admin = getSupabaseAdmin()
  // Authorize the poster by their secret member_code; resolve the acting member server-side.
  const { data: member } = await admin
    .from('room_members')
    .select('id, display_name')
    .eq('room_id', roomCode)
    .eq('member_code', memberCode)
    .maybeSingle()

  if (!member) return NextResponse.json({ error: 'Member not found in this room' }, { status: 404 })

  const { data: message, error } = await admin
    .from('room_messages')
    .insert({ room_id: roomCode, member_id: member.id, display_name: member.display_name, text })
    .select('id, display_name, text, created_at, member_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ message })
}
