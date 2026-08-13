import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { generateGameCode, generateToken } from '@/lib/utils'
import { addTournamentGameSchema, TOURNAMENT_ELIGIBLE_TYPES } from '@/lib/tournament-validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { clampTriviaTimer, TRIVIA_DEFAULT_ROUNDS } from '@/lib/trivia'
import { clampTtlTimer, TTL_DEFAULT_TIMER } from '@/lib/two-truths'
import {
  clampNpatTimer,
  clampNpatMarkingTimer,
  clampNpatGameDuration,
  NPAT_DEFAULT_TIMER,
  NPAT_DEFAULT_MARKING_TIMER,
  NPAT_DEFAULT_GAME_DURATION,
} from '@/lib/npat'

const supabase = getSupabaseAnon()

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const { data: body, error: bodyError } = await parseJsonBody(req, addTournamentGameSchema)
  if (bodyError) return bodyError

  const { hostToken, gameType, gameSettings, questionSource, customQuestions } = body

  if (!TOURNAMENT_ELIGIBLE_TYPES.includes(gameType as (typeof TOURNAMENT_ELIGIBLE_TYPES)[number])) {
    return NextResponse.json({ error: `Game type "${gameType}" is not eligible for tournaments` }, { status: 400 })
  }

  // Two Truths always plays one lobby-wide round (players submit statements in the
  // lobby, then everyone guesses per player), so the host doesn't pick a round count.
  const roundsCount =
    gameType === 'two_truths' ? 1 : (gameSettings?.rounds_count ?? (gameType === 'trivia' ? TRIVIA_DEFAULT_ROUNDS : 10))

  const rawTimer = gameSettings?.timer_seconds
  const timerSeconds =
    gameType === 'trivia'
      ? clampTriviaTimer(rawTimer)
      : gameType === 'two_truths'
        ? clampTtlTimer(rawTimer ?? TTL_DEFAULT_TIMER)
        : clampNpatTimer(rawTimer ?? NPAT_DEFAULT_TIMER)

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

  // Trivia-only: carry question usage and a reusable custom pack across this
  // tournament's *trivia* rounds so questions don't repeat and the host doesn't
  // have to re-upload their CSV between games. Rounds of other game types are
  // ignored here — merging their state would either be nonsense or leak content.
  let seededPoolUsage: { trivia: Record<string, number> } | null = null
  let previousCustom: unknown[] | null = null
  if (gameType === 'trivia') {
    const { data: priorTournamentGames } = await admin
      .from('tournament_games')
      .select('game_id')
      .eq('tournament_id', tournamentId)
    const priorGameIds = (priorTournamentGames ?? []).map((g) => g.game_id).filter((id): id is string => Boolean(id))

    if (priorGameIds.length > 0) {
      const { data: priorGames } = await admin
        .from('games')
        .select('id, game_type, pool_usage, custom_questions, created_at')
        .in('id', priorGameIds)
      const mergedTrivia: Record<string, number> = {}
      let latestCustom: { created_at: string; questions: unknown[] } | null = null
      for (const g of priorGames ?? []) {
        if (g.game_type !== 'trivia') continue
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
  }

  // Effective custom pool (trivia only): an explicit upload wins; otherwise reuse the previous one.
  const useCustomQuestions = gameType === 'trivia' && questionSource === 'custom'
  const effectiveCustom = useCustomQuestions
    ? Array.isArray(customQuestions) && customQuestions.length > 0
      ? customQuestions
      : previousCustom
    : null
  const hasCustom = useCustomQuestions && Array.isArray(effectiveCustom) && effectiveCustom.length > 0

  if (useCustomQuestions && (!Array.isArray(effectiveCustom) || effectiveCustom.length < roundsCount)) {
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

  // Per-game extras: trivia carries its question source + prior pool usage;
  // i_call_on needs its marking timer + whole-game timer; two_truths needs neither.
  const perGameExtras: Record<string, unknown> =
    gameType === 'trivia'
      ? {
          question_source: hasCustom ? 'custom' : 'platform',
          custom_questions: hasCustom ? effectiveCustom : null,
          ...(seededPoolUsage ? { pool_usage: seededPoolUsage } : {}),
        }
      : gameType === 'i_call_on'
        ? {
            operative_timer_seconds: clampNpatMarkingTimer(NPAT_DEFAULT_MARKING_TIMER),
            game_duration_seconds: clampNpatGameDuration(NPAT_DEFAULT_GAME_DURATION),
          }
        : {}

  const { error: gameError } = await admin.from('games').insert({
    id: gameCode,
    host_token: gameHostToken,
    title: `${tournament.title} - Game`,
    game_type: gameType,
    // Every round-robin-eligible game joins by free name like a normal lobby game.
    participant_mode: 'joiners',
    rounds_count: roundsCount,
    timer_seconds: timerSeconds,
    tournament_id: tournamentId,
    ...perGameExtras,
  })

  if (gameError) {
    return NextResponse.json({ error: internalErrorMessage('tournaments/code/games', gameError) }, { status: 500 })
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
    return NextResponse.json({ error: internalErrorMessage('tournaments/code/games', tgError) }, { status: 500 })
  }

  if (tournament.status === 'waiting') {
    await admin.from('tournaments').update({ status: 'active' }).eq('id', tournamentId)
  }

  return NextResponse.json({ gameCode, gameHostToken })
}
