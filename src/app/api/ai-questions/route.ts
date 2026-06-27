import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { generateAiQuestions } from '@/lib/ai-questions'

const requestSchema = z.object({
  gameId: z.string().min(1),
  hostToken: z.string().min(1),
  playerNames: z.array(z.string()).min(2),
  gameType: z.enum(['would_you_rather', 'most_likely_to', 'never_have_i_ever']),
  count: z.number().int().min(1).max(50),
  theme: z.string().max(100).optional(),
  customPrompt: z.string().max(500).optional(),
  apiKey: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, hostToken, playerNames, gameType, count, theme, customPrompt, apiKey } = parsed.data

  const { data: game } = await supabase
    .from('games')
    .select('id, host_token, status, game_type')
    .eq('id', gameId.toUpperCase())
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'waiting') {
    return NextResponse.json({ error: 'Can only generate questions while in lobby' }, { status: 400 })
  }

  try {
    const result = await generateAiQuestions({
      gameType,
      playerNames,
      count,
      theme,
      customPrompt,
      apiKey,
    })

    const { error: updateErr } = await supabase
      .from('games')
      .update({ ai_generated_questions: result })
      .eq('id', gameId.toUpperCase())

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    const questionCount = (result as { questions: unknown[] }).questions.length

    return NextResponse.json({ success: true, questionCount })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate questions'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
