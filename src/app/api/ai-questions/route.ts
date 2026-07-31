import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { z } from 'zod'
import { generateAiQuestions, AI_QUESTION_GAME_TYPES } from '@/lib/ai-questions'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

const requestSchema = z.object({
  gameType: z.enum(AI_QUESTION_GAME_TYPES as [string, ...string[]]),
  count: z.number().int().min(1).max(50),
  theme: z.string().max(100).optional(),
  customPrompt: z.string().max(500).optional(),
  triviaCategory: z.enum(['tech', 'general']).optional(),
  apiKey: z.string().min(1, 'A Claude API key is required to generate questions'),
})

export async function POST(req: NextRequest) {
  // Unauthenticated proxy to a paid LLM — backstop the flood with a per-IP cap.
  const limited = await enforceRateLimit(req, RATE_LIMITS.join)
  if (limited) return limited

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
    const message = internalErrorMessage('ai-questions', err, 'Failed to generate questions')
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
