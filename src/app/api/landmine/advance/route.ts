import { NextRequest, NextResponse } from 'next/server'
import { syncLandmineGameState } from '@/lib/landmine-advance'
import { landmineAdvanceSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// System/timer route: any client may poke it, but syncLandmineGameState only acts once a
// phase deadline has genuinely passed (there is no client-forcible bypass). Writes go
// through the service role.
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, landmineAdvanceSchema)
  if (bodyError) return bodyError

  const code = body.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()
  const result = await syncLandmineGameState(supabase, code)
  return NextResponse.json(result)
}
