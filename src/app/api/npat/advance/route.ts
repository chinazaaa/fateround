import { NextRequest, NextResponse } from 'next/server'
import { syncNpatGameState } from '@/lib/npat-advance'
import { npatAdvanceSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// System/timer route: any client may poke it, but syncNpatGameState only acts
// once a phase deadline has genuinely passed, so there's no per-player token to
// authorize. Writes go through the service role.
export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = npatAdvanceSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const code = parsed.data.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()
  const result = await syncNpatGameState(supabase, code, { force: parsed.data.force === true })
  return NextResponse.json(result)
}
