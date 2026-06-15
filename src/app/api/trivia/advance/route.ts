import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { triviaAdvanceSchema } from '@/lib/validation'
import { tryAdvanceTriviaAfterReveal } from '@/lib/trivia-advance'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = triviaAdvanceSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const result = await tryAdvanceTriviaAfterReveal(supabase, parsed.data.gameId)

  if (result.code === 'game_not_found') {
    return NextResponse.json({ error: 'Game not found', code: result.code }, { status: 404 })
  }
  if (result.code === 'not_trivia') {
    return NextResponse.json({ error: 'Not a trivia game', code: result.code }, { status: 400 })
  }

  const status = result.ok || result.code === 'already_done' ? 200 : 409
  return NextResponse.json(result, { status })
}
