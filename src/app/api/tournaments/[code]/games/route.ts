import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateGameCode, generateToken } from '@/lib/utils'
import { addTournamentGameSchema, TOURNAMENT_ELIGIBLE_TYPES } from '@/lib/tournament-validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const raw = await req.json()
  const parsed = addTournamentGameSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { hostToken, gameType, gameSettings, questionSource, customQuestions } = parsed.data

  if (!TOURNAMENT_ELIGIBLE_TYPES.includes(gameType as (typeof TOURNAMENT_ELIGIBLE_TYPES)[number])) {
    return NextResponse.json({ error: `Game type "${gameType}" is not eligible for tournaments` }, { status: 400 })
  }

  const roundsCount = gameSettings?.rounds_count ?? 10

  const admin = getSupabaseAdmin()

  const { data: tournament } = await admin.from('tournaments').select('*').eq('id', tournamentId).maybeSingle()

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  }
  if (tournament.host_token !== hostToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  if (tournament.status === 'finished') {
    return NextResponse.json({ error: 'Tournament has ended' }, { status: 400 })
  }

  const { data: activeGame } = await admin
    .from('tournament_games')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('status', 'active')
    .maybeSingle()

  if (activeGame) {
    return NextResponse.json({ error: 'A game is already in progress' }, { status: 400 })
  }

  // Carry question usage across the tournament's games so the same questions
  // don't repeat from one game to the next, and let the host reuse the previous
  // custom set when they don't upload a new one.
  const { data: priorTournamentGames } = await admin
    .from('tournament_games')
    .select('game_id')
    .eq('tournament_id', tournamentId)
  const priorGameIds = (priorTournamentGames ?? []).map((g) => g.game_id)

  let seededPoolUsage: { trivia: Record<string, number> } | null = null
  let previousCustom: unknown[] | null = null
  if (priorGameIds.length > 0) {
    const { data: priorGames } = await admin
      .from('games')
      .select('id, pool_usage, custom_questions, created_at')
      .in('id', priorGameIds)
    const mergedTrivia: Record<string, number> = {}
    let latestCustom: { created_at: string; questions: unknown[] } | null = null
    for (const g of priorGames ?? []) {
      const trivia = (g.pool_usage as { trivia?: Record<string, number> } | null)?.trivia ?? {}
      for (const [key, count] of Object.entries(trivia)) {
        mergedTrivia[key] = (mergedTrivia[key] ?? 0) + (count as number)
      }
      if (Array.isArray(g.custom_questions) && g.custom_questions.length > 0) {
        if (!latestCustom || String(g.created_at) > latestCustom.created_at) {
          latestCustom = { created_at: String(g.created_at), questions: g.custom_questions }
        }
      }
    }
    if (Object.keys(mergedTrivia).length > 0) seededPoolUsage = { trivia: mergedTrivia }
    previousCustom = latestCustom?.questions ?? null
  }

  // Effective custom pool: an explicit upload wins; otherwise reuse the previous one.
  const effectiveCustom =
    questionSource === 'custom'
      ? Array.isArray(customQuestions) && customQuestions.length > 0
        ? customQuestions
        : previousCustom
      : null
  const useCustomQuestions = questionSource === 'custom' && Array.isArray(effectiveCustom) && effectiveCustom.length > 0

  if (questionSource === 'custom' && (!Array.isArray(effectiveCustom) || effectiveCustom.length < roundsCount)) {
    return NextResponse.json(
      {
        error:
          Array.isArray(effectiveCustom) && effectiveCustom.length > 0
            ? `Need at least ${roundsCount} custom questions for ${roundsCount} rounds — upload more or lower the round count`
            : 'No previous questions to reuse — upload a CSV for this game',
      },
      { status: 400 }
    )
  }

  let gameCode = ''
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateGameCode()
    const { data: existing } = await admin.from('games').select('id').eq('id', candidate).maybeSingle()
    if (!existing) {
      gameCode = candidate
      break
    }
  }

  if (!gameCode) {
    return NextResponse.json({ error: 'Failed to generate unique game code' }, { status: 500 })
  }

  const gameHostToken = generateToken()

  const { error: gameError } = await admin.from('games').insert({
    id: gameCode,
    host_token: gameHostToken,
    title: `${tournament.title} - Game`,
    game_type: gameType,
    // Trivia is the only eligible type; it joins by free name like a normal lobby game.
    participant_mode: 'joiners',
    rounds_count: roundsCount,
    timer_seconds: gameSettings?.timer_seconds ?? 30,
    tournament_id: tournamentId,
    question_source: useCustomQuestions ? 'custom' : 'platform',
    custom_questions: useCustomQuestions ? effectiveCustom : null,
    ...(seededPoolUsage ? { pool_usage: seededPoolUsage } : {}),
  })

  if (gameError) {
    return NextResponse.json({ error: gameError.message }, { status: 500 })
  }

  const { data: lastGame } = await admin
    .from('tournament_games')
    .select('game_order')
    .eq('tournament_id', tournamentId)
    .order('game_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = (lastGame?.game_order ?? 0) + 1

  const { error: tgError } = await admin.from('tournament_games').insert({
    tournament_id: tournamentId,
    game_id: gameCode,
    game_order: nextOrder,
    status: 'active',
  })

  if (tgError) {
    // Roll back the game we just created so we don't leave an orphan row.
    await admin.from('games').delete().eq('id', gameCode)
    return NextResponse.json({ error: tgError.message }, { status: 500 })
  }

  if (tournament.status === 'waiting') {
    await admin.from('tournaments').update({ status: 'active' }).eq('id', tournamentId)
  }

  return NextResponse.json({ gameCode, gameHostToken })
}
