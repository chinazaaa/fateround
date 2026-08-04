import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  content: z.unknown().optional(),
  challenge_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 })

  const { id } = await params
  const { data: body, error: parseError } = await parseJsonBody(req, updateSchema)
  if (parseError) return parseError

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.content !== undefined) updates.content = body.content
  if (body.challenge_date !== undefined) updates.challenge_date = body.challenge_date

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('daily_challenge_content')
    .update(updates)
    .eq('id', id)
    .select('id, game_type, challenge_date, content, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Content already exists for that date' }, { status: 409 })
    }
    return NextResponse.json({ error: internalErrorMessage('daily-content/update', error) }, { status: 500 })
  }

  return NextResponse.json({ item: data })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 })

  const { id } = await params
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('daily_challenge_content').delete().eq('id', id)

  if (error) return NextResponse.json({ error: internalErrorMessage('daily-content/delete', error) }, { status: 500 })

  return NextResponse.json({ ok: true })
}
