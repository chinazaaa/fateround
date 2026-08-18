import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { z } from 'zod'
import { generateAiQuestions, AI_QUESTION_GAME_TYPES } from '@/lib/ai-questions'
import { enforceRateLimit, enforceGlobalLimit, RATE_LIMITS } from '@/lib/rate-limit'

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
  // Three caps run in series, and the ORDER matters: each check reserves a slot
  // as it passes, so the cheapest, most-likely-to-reject one goes first. Putting
  // the shared global budget last means a caller who trips their own per-IP
  // limits never consumes any of it.
  //
  //   1. per-IP burst  — stops a scripted flood
  //   2. per-IP daily  — sizes one caller's share
  //   3. global daily  — the hard ceiling on the bill; per-IP limits can't bound
  //                      the total, since cycling IPs resets them
  const burstLimited = await enforceRateLimit(req, RATE_LIMITS.aiQuestions)
  if (burstLimited) return burstLimited
  const dailyLimited = await enforceRateLimit(req, RATE_LIMITS.aiQuestionsDaily)
  if (dailyLimited) return dailyLimited
  const globalLimited = await enforceGlobalLimit(RATE_LIMITS.aiQuestionsGlobalDaily)
  if (globalLimited) return globalLimited

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
