import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncNpatGameState } from '@/lib/npat-advance'
import { npatAdvanceSchema } from '@/lib/validation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = npatAdvanceSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const code = parsed.data.gameId.toUpperCase()
  const result = await syncNpatGameState(supabase, code, { force: parsed.data.force === true })
  return NextResponse.json(result)
}
