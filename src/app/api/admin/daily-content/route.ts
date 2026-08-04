import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'

export const dynamic = 'force-dynamic'

const VALID_GAME_TYPES = ['crossword', 'word_search', 'word_scramble'] as const

export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 })

  const url = req.nextUrl
  const gameType = url.searchParams.get('game_type') ?? undefined
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('daily_challenge_content')
    .select('id, game_type, challenge_date, content, created_at, updated_at')
    .order('challenge_date', { ascending: true })

  if (gameType) query = query.eq('game_type', gameType)
  if (from) query = query.gte('challenge_date', from)
  if (to) query = query.lte('challenge_date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: internalErrorMessage('daily-content/list', error) }, { status: 500 })

  return NextResponse.json({ items: data ?? [] })
}

const createSchema = z.object({
  game_type: z.enum(VALID_GAME_TYPES),
  challenge_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  content: z.unknown(),
})

export async function POST(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 })

  const { data: body, error: parseError } = await parseJsonBody(req, createSchema)
  if (parseError) return parseError

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('daily_challenge_content')
    .insert({
      game_type: body.game_type,
      challenge_date: body.challenge_date,
      content: body.content,
    })
    .select('id, game_type, challenge_date, content, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `Content already exists for ${body.game_type} on ${body.challenge_date}` },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: internalErrorMessage('daily-content/create', error) }, { status: 500 })
  }

  return NextResponse.json({ item: data }, { status: 201 })
}
