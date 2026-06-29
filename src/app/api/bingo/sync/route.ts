import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { syncBingoAutoCall } from '@/lib/bingo'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

const bingoSyncSchema = z.object({
  gameId: z.string().min(4).max(10),
})

// System/auto-call route: any client may poke it, but it only auto-calls numbers
// once the configured interval has genuinely elapsed (enforced in
// syncBingoAutoCall), so there's no per-player token to authorize. Writes go
// through the service role.
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, bingoSyncSchema)
  if (bodyError) return bodyError

  const supabase = getSupabaseAdmin()
  const result = await syncBingoAutoCall(supabase, body.gameId)

  if (result.code === 'game_not_found') {
    return NextResponse.json({ error: 'Game not found', code: result.code }, { status: 404 })
  }
  if (result.code === 'not_bingo') {
    return NextResponse.json({ error: 'Not a bingo game', code: result.code }, { status: 400 })
  }

  const idleCodes = new Set(['manual_mode', 'not_active', 'waiting', 'all_called'])
  const status = result.ok || idleCodes.has(result.code) ? 200 : 409
  return NextResponse.json(result, { status })
}
