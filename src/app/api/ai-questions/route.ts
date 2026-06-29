import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateAiQuestions, AI_QUESTION_GAME_TYPES } from '@/lib/ai-questions'

const requestSchema = z.object({
  gameType: z.enum(AI_QUESTION_GAME_TYPES as [string, ...string[]]),
  count: z.number().int().min(1).max(50),
  theme: z.string().max(100).optional(),
  customPrompt: z.string().max(500).optional(),
  triviaCategory: z.enum(['tech', 'general']).optional(),
  apiKey: z.string().min(1, 'A Claude API key is required to generate questions'),
})

export async function POST(req: NextRequest) {
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

  const { gameType, count, theme, customPrompt, triviaCategory, apiKey } = parsed.data

  try {
    const result = await generateAiQuestions({
      gameType: gameType as Parameters<typeof generateAiQuestions>[0]['gameType'],
      count,
      theme,
      customPrompt,
      triviaCategory,
      apiKey,
    })

    return NextResponse.json({ questions: result.questions })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate questions'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
