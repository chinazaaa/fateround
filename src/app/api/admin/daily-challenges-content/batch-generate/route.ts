import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { generateBatch, getBankStats } from '@/lib/daily-batch-generator'

export const dynamic = 'force-dynamic'

const VALID_GAME_TYPES = [
  'crossword',
  'mini_crossword',
  'word_search',
  'word_scramble',
  'trivia',
  'word_grouping',
  'chess_mate',
  'codenames_codeword',
  'ludo_puzzle',
] as const

const generateSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  game_types: z.array(z.enum(VALID_GAME_TYPES)).min(1),
})

export async function POST(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 })

  const { data: body, error: parseError } = await parseJsonBody(req, generateSchema)
  if (parseError) return parseError

  const supabase = getSupabaseAdmin()

  // Fetch ALL existing content (not just the target range) to detect duplicates
  const { data: existing, error: fetchErr } = await supabase
    .from('daily_challenge_content')
    .select('game_type, challenge_date, content')
    .in('game_type', body.game_types)

  if (fetchErr) {
    return NextResponse.json({ error: internalErrorMessage('batch-generate/fetch', fetchErr) }, { status: 500 })
  }

  // Build date list
  const dates: string[] = []
  const start = new Date(`${body.from}T00:00:00`)
  const end = new Date(`${body.to}T00:00:00`)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${day}`)
  }

  if (dates.length === 0) {
    return NextResponse.json({ error: 'No dates in range' }, { status: 400 })
  }
  if (dates.length > 62) {
    return NextResponse.json({ error: 'Maximum 62 days per batch' }, { status: 400 })
  }

  const result = generateBatch(dates, body.game_types, existing ?? [])
  const stats = getBankStats()

  return NextResponse.json({
    generated: result.generated,
    capacity: result.capacity,
    stats,
    dateRange: { from: body.from, to: body.to },
    skippedDates: dates.length * body.game_types.length - result.generated.length,
  })
}
