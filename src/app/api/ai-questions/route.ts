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
  triviaCategory: z
    .enum([
      'tech',
      'general',
      'art',
      'food',
      'geography',
      'history',
      'language',
      'literature',
      'math',
      'movies',
      'music',
      'nature',
      'pop_culture',
      'science',
      'sports',
      'technology',
      'world_culture',
    ])
    .optional(),
})

export async function POST(req: NextRequest) {
  // We host the Claude key ourselves now, so every request costs real money.
  // Two per-IP caps run in series — a short-window burst limit and a day-window
  // ceiling. Until billing/entitlements exist (revenue-model-v3.md §7), this is
  // the only gate against a runaway spend.
  const burstLimited = await enforceRateLimit(req, RATE_LIMITS.aiQuestions)
  if (burstLimited) return burstLimited
  const dailyLimited = await enforceRateLimit(req, RATE_LIMITS.aiQuestionsDaily)
  if (dailyLimited) return dailyLimited

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI generation is not configured on this server.' }, { status: 503 })
  }

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

  const { gameType, count, theme, customPrompt, triviaCategory } = parsed.data

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
