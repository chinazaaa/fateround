import { NextRequest, NextResponse } from 'next/server'
import { syncNpatGameState } from '@/lib/npat-advance'
import { npatAdvanceSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// System/timer route: any client may poke it, but syncNpatGameState only acts
// once a phase deadline has genuinely passed, so there's no per-player token to
// authorize. Writes go through the service role.
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, npatAdvanceSchema)
  if (bodyError) return bodyError

  const code = body.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()
  const result = await syncNpatGameState(supabase, code, { force: body.force === true })
  return NextResponse.json(result)
}
