import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getProfileFromRequest } from '@/lib/identity-server'
import {
  isDailyChallengeGameType,
  computeNormalizedScore,
  watToday,
  DAILY_GAME_TIMER,
  type DailyChallengeGameType,
  type DailyScoreInput,
} from '@/lib/daily-challenge'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Per-game server-side verification + metric extraction
// ---------------------------------------------------------------------------

interface VerifiedMetrics {
  rawPoints: number
  itemsSolved: number
  itemsTotal: number
  hintsUsed: number
}

function verifySudoku(
  puzzleData: Record<string, unknown>,
  submission: Record<string, unknown>
): VerifiedMetrics | { error: string } {
  const solution = puzzleData.solution as number[][]
  const puzzle = puzzleData.puzzle as number[][]
  const cells = submission.cells as Array<{ row: number; col: number; value: number }>
  if (!Array.isArray(cells)) return { error: 'Missing cells array' }

  const emptyCells = puzzle.flat().filter((v) => v === 0).length
  let correct = 0
  let wrong = 0
  for (const cell of cells) {
    if (solution[cell.row]?.[cell.col] === cell.value) {
      correct++
    } else {
      wrong++
    }
  }

  return {
    rawPoints: correct * 10 - wrong * 3,
    itemsSolved: correct,
    itemsTotal: emptyCells,
    hintsUsed: wrong,
  }
}

function verifyWordHunt(
  puzzleData: Record<string, unknown>,
  submission: Record<string, unknown>
): VerifiedMetrics | { error: string } {
  const validWords = new Set(puzzleData.valid_words as string[])
  const words = submission.words as string[]
  if (!Array.isArray(words)) return { error: 'Missing words array' }

  const found = new Set<string>()
  for (const w of words) {
    const normalized = w.trim().toLowerCase()
    if (validWords.has(normalized)) found.add(normalized)
  }

  return {
    rawPoints: Array.from(found).reduce((sum, w) => {
      const len = w.length
      if (len === 3) return sum + 100
      if (len === 4) return sum + 400
      if (len === 5) return sum + 800
      return sum + 800 + (len - 5) * 400
    }, 0),
    itemsSolved: found.size,
    itemsTotal: validWords.size,
    hintsUsed: 0,
  }
}

function verifyCrossword(
  puzzleData: Record<string, unknown>,
  submission: Record<string, unknown>
): VerifiedMetrics | { error: string } {
  const solution = puzzleData.solution as string[][]
  const metadata = puzzleData.metadata as { clues?: unknown[] }
  const cells = submission.cells as Array<{ row: number; col: number; letter: string }>
  const hintsUsed = (submission.hintsUsed as number) ?? 0
  if (!Array.isArray(cells)) return { error: 'Missing cells array' }

  const totalClues = metadata.clues?.length ?? 0
  let correct = 0
  for (const cell of cells) {
    if (solution[cell.row]?.[cell.col]?.toUpperCase() === cell.letter?.toUpperCase()) {
      correct++
    }
  }

  const totalFillable = solution.flat().filter((c) => c && c !== ' ').length
  const wordsCompleted =
    totalFillable > 0 && correct >= totalFillable
      ? totalClues
      : Math.floor((correct / Math.max(totalFillable, 1)) * totalClues)

  return {
    rawPoints: correct * 10 - hintsUsed * 3,
    itemsSolved: wordsCompleted,
    itemsTotal: totalClues,
    hintsUsed,
  }
}

function verifyWordSearch(
  puzzleData: Record<string, unknown>,
  submission: Record<string, unknown>
): VerifiedMetrics | { error: string } {
  const metadata = puzzleData.metadata as { words?: string[] }
  const validWords = new Set((metadata.words ?? []).map((w: string) => w.toUpperCase()))
  const words = submission.words as string[]
  const hintsUsed = (submission.hintsUsed as number) ?? 0
  if (!Array.isArray(words)) return { error: 'Missing words array' }

  const found = new Set<string>()
  for (const w of words) {
    if (validWords.has(w.toUpperCase())) found.add(w.toUpperCase())
  }

  return {
    rawPoints: found.size * 10 - hintsUsed * 10,
    itemsSolved: found.size,
    itemsTotal: validWords.size,
    hintsUsed,
  }
}

function verifyWordScramble(
  puzzleData: Record<string, unknown>,
  submission: Record<string, unknown>
): VerifiedMetrics | { error: string } {
  const solution = puzzleData.solution as string[]
  const answers = submission.answers as Array<{ index: number; word: string }>
  const hintsUsed = (submission.hintsUsed as number) ?? 0
  if (!Array.isArray(answers)) return { error: 'Missing answers array' }

  let correct = 0
  for (const a of answers) {
    if (solution[a.index]?.toLowerCase() === a.word?.toLowerCase()) {
      correct++
    }
  }

  return {
    rawPoints: correct * 10 - hintsUsed * 4,
    itemsSolved: correct,
    itemsTotal: solution.length,
    hintsUsed,
  }
}

function verifySubmission(
  gameType: DailyChallengeGameType,
  puzzleData: Record<string, unknown>,
  submission: Record<string, unknown>
): VerifiedMetrics | { error: string } {
  switch (gameType) {
    case 'sudoku':
      return verifySudoku(puzzleData, submission)
    case 'word_hunt':
      return verifyWordHunt(puzzleData, submission)
    case 'crossword':
      return verifyCrossword(puzzleData, submission)
    case 'word_search':
      return verifyWordSearch(puzzleData, submission)
    case 'word_scramble':
      return verifyWordScramble(puzzleData, submission)
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest, { params }: { params: Promise<{ gameType: string }> }) {
  const { gameType: rawGameType } = await params
  if (!isDailyChallengeGameType(rawGameType)) {
    return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
  }
  const gameType: DailyChallengeGameType = rawGameType

  const profileId = await getProfileFromRequest(req)
  if (!profileId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const body = await req.json()
  const { challengeId, timeSeconds, submission } = body as {
    challengeId: string
    timeSeconds: number
    submission: Record<string, unknown>
  }

  if (!challengeId || timeSeconds == null || !submission) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const today = watToday()

  // Load challenge with solution
  const { data: challenge } = await admin
    .from('daily_challenges')
    .select('id, game_type, challenge_date, puzzle_data, config')
    .eq('id', challengeId)
    .eq('game_type', gameType)
    .eq('challenge_date', today)
    .single()

  if (!challenge) {
    return NextResponse.json({ error: 'Challenge not found or expired' }, { status: 404 })
  }

  // Check if already submitted
  const { data: existing } = await admin
    .from('daily_scores')
    .select('normalized_score')
    .eq('challenge_id', challengeId)
    .eq('profile_id', profileId)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Already submitted', existingScore: existing.normalized_score }, { status: 409 })
  }

  // Server-side verification
  const puzzleData = challenge.puzzle_data as Record<string, unknown>
  const metrics = verifySubmission(gameType, puzzleData, submission)
  if ('error' in metrics) {
    return NextResponse.json({ error: metrics.error }, { status: 400 })
  }

  // Compute normalized score
  const maxTime = DAILY_GAME_TIMER[gameType]
  const scoreInput: DailyScoreInput = {
    itemsSolved: metrics.itemsSolved,
    itemsTotal: metrics.itemsTotal,
    timeSeconds: Math.min(timeSeconds, maxTime),
    maxTimeSeconds: maxTime,
    hintsUsed: metrics.hintsUsed,
    maxHints: Math.max(metrics.itemsTotal, 1),
  }
  const normalizedScore = computeNormalizedScore(scoreInput)

  // Insert score (PK enforces one attempt)
  const { error: insertError } = await admin.from('daily_scores').insert({
    challenge_id: challengeId,
    profile_id: profileId,
    normalized_score: normalizedScore,
    raw_points: metrics.rawPoints,
    items_solved: metrics.itemsSolved,
    items_total: metrics.itemsTotal,
    time_seconds: Math.min(timeSeconds, maxTime),
    hints_used: metrics.hintsUsed,
  })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'Already submitted' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to save score' }, { status: 500 })
  }

  // Upsert personal best (best-effort)
  const clampedTime = Math.min(timeSeconds, maxTime)
  const { data: currentBest } = await admin
    .from('personal_bests')
    .select('best_score, best_time, total_plays')
    .eq('profile_id', profileId)
    .eq('game_type', gameType)
    .single()

  if (!currentBest) {
    await admin.from('personal_bests').insert({
      profile_id: profileId,
      game_type: gameType,
      best_score: normalizedScore,
      best_time: clampedTime,
      total_plays: 1,
      best_date: today,
    })
  } else {
    const newBestScore = Math.max(currentBest.best_score, normalizedScore)
    const newBestTime =
      normalizedScore > currentBest.best_score
        ? clampedTime
        : normalizedScore === currentBest.best_score && clampedTime < currentBest.best_time
          ? clampedTime
          : currentBest.best_time
    await admin
      .from('personal_bests')
      .update({
        best_score: newBestScore,
        best_time: newBestTime,
        total_plays: currentBest.total_plays + 1,
        best_date: normalizedScore > currentBest.best_score ? today : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('profile_id', profileId)
      .eq('game_type', gameType)
  }

  // Compute rank
  const { count: betterCount } = await admin
    .from('daily_scores')
    .select('*', { count: 'exact', head: true })
    .eq('challenge_id', challengeId)
    .gt('normalized_score', normalizedScore)

  const rank = (betterCount ?? 0) + 1

  const { count: totalPlayers } = await admin
    .from('daily_scores')
    .select('*', { count: 'exact', head: true })
    .eq('challenge_id', challengeId)

  // Fetch personal best for comparison
  const { data: personalBest } = await admin
    .from('personal_bests')
    .select('best_score, best_time, total_plays')
    .eq('profile_id', profileId)
    .eq('game_type', gameType)
    .single()

  const isNewBest = personalBest ? normalizedScore >= personalBest.best_score : true

  return NextResponse.json({
    normalizedScore,
    rawPoints: metrics.rawPoints,
    itemsSolved: metrics.itemsSolved,
    itemsTotal: metrics.itemsTotal,
    timeSeconds: Math.min(timeSeconds, maxTime),
    hintsUsed: metrics.hintsUsed,
    rank,
    totalPlayers: totalPlayers ?? 1,
    personalBest: personalBest
      ? { bestScore: personalBest.best_score, bestTime: personalBest.best_time, totalPlays: personalBest.total_plays }
      : null,
    isNewBest,
  })
}
