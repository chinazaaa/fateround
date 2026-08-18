import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { syncTrollRunGameState } from '@/lib/troll-run-advance'
import { z } from 'zod'

const advanceSchema = z.object({
  gameId: z.string().min(1),
  forceNextRound: z.boolean().optional(),
})

export async function POST(req: Request) {
  try {
    const json = await req.json()
    const parsed = advanceSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { gameId, forceNextRound } = parsed.data
    const supabase = getSupabaseAdmin()

    const result = await syncTrollRunGameState(supabase, gameId, { forceNextRound })

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
