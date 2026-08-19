import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getProfileFromRequest } from '@/lib/identity-server'
import {
  isDailyChallengeGameType,
  computeNormalizedScore,
  watToday,
  DAILY_GAME_TIMER,
  DAILY_GAME_PRIMARY_METRIC,
  type DailyChallengeGameType,
  type DailyScoreInput,
} from '@/lib/daily-challenge'
import { advanceStreak, type StreakState } from '@/lib/trophies/streak'
import { syncEligibleTrophies } from '@/lib/trophies/award'
import { computeDailyRank } from '@/lib/daily-rank'
import { wordleFinalScore, wordleEmojiGrid } from '@/lib/daily-wordle'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Per-game server-side verification + metric extraction
// ---------------------------------------------------------------------------

interface VerifiedMetrics {
  rawPoints: number
  itemsSolved: number
  itemsTotal: number
  hintsUsed: number
  /** Share string for games with a spoiler-free result grid (Wordle only today). */
  grid?: string
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
  const rawHints = submission.hintsUsed
  const hintsUsed =
    typeof rawHints === 'number' && Number.isInteger(rawHints) && rawHints >= 0
      ? Math.min(rawHints, solution.length)
      : 0
  if (!Array.isArray(answers)) return { error: 'Missing answers array' }

  let correct = 0
  for (const a of answers) {
    if (solution[a.index]?.toLowerCase() === a.word?.toLowerCase()) {
      correct++
    }
  }

  return {
    rawPoints: correct * 10 - hintsUsed * 8,
    itemsSolved: correct,
    itemsTotal: solution.length,
    hintsUsed,
  }
}

function verifyTrivia(
  puzzleData: Record<string, unknown>,
  submission: Record<string, unknown>
): VerifiedMetrics | { error: string } {
  const solution = puzzleData.solution as number[]
  const answers = submission.answers as Array<{ questionIndex: number; choiceIndex: number }>
  if (!Array.isArray(answers)) return { error: 'Missing answers array' }
  if (!Array.isArray(solution)) return { error: 'Missing solution' }

  let correct = 0
  for (const a of answers) {
    if (solution[a.questionIndex] === a.choiceIndex) correct++
  }

  return {
    rawPoints: correct * 100,
    itemsSolved: correct,
    itemsTotal: solution.length,
    hintsUsed: 0,
  }
}

function verifyWhotPuzzle(
  puzzleData: Record<string, unknown>,
  submission: Record<string, unknown>
): VerifiedMetrics | { error: string } {
  const solution = puzzleData.solution as { optimalMoves: number }
  const moves = submission.moves as Array<{ type: string }>
  if (!Array.isArray(moves)) return { error: 'Missing moves array' }

  const handSize = (puzzleData.hand as unknown[])?.length ?? 6
  const cardsPlayed = moves.filter((m) => m.type === 'play').length
  const drawsMade = moves.filter((m) => m.type === 'draw').length
  const cleared = cardsPlayed >= handSize
  const optimalMoves = solution?.optimalMoves ?? moves.length

  const baseScore = 1000
  const movePenalty = 40
  const drawPenalty = 60
  const rawPoints = Math.max(
    0,
    baseScore - Math.max(0, moves.length - optimalMoves) * movePenalty - drawsMade * drawPenalty
  )

  return {
    rawPoints: cleared ? rawPoints : Math.floor(rawPoints * 0.3),
    itemsSolved: cleared ? handSize : cardsPlayed,
    itemsTotal: handSize,
    hintsUsed: drawsMade,
  }
}

function verifyWordGrouping(
  puzzleData: Record<string, unknown>,
  submission: Record<string, unknown>
): VerifiedMetrics | { error: string } {
  const solution = puzzleData.solution as { groups: Array<{ words: string[] }> }
  const guesses = submission.guesses as Array<{ words: string[] }>
  if (!Array.isArray(guesses)) return { error: 'Missing guesses array' }
  if (!solution?.groups) return { error: 'Missing solution' }

  const solutionSets = solution.groups.map((g) => new Set(g.words.map((w) => w.toLowerCase())))
  const matched = new Set<number>()
  let groupsFound = 0
  let mistakes = 0

  for (const guess of guesses) {
    const guessSet = new Set((guess.words ?? []).map((w: string) => w.toLowerCase()))
    const idx = solutionSets.findIndex(
      (s, i) => !matched.has(i) && s.size === guessSet.size && [...guessSet].every((w) => s.has(w))
    )
    if (idx >= 0) {
      matched.add(idx)
      groupsFound++
    } else {
      mistakes++
    }
  }

  const baseScore = 1000
  const mistakePenalty = 150
  const rawPoints = Math.max(0, baseScore - mistakes * mistakePenalty)

  return {
    rawPoints: groupsFound > 0 ? rawPoints : 0,
    itemsSolved: groupsFound,
    itemsTotal: 4,
    hintsUsed: mistakes,
  }
}

function verifyChessMate(
  puzzleData: Record<string, unknown>,
  submission: Record<string, unknown>
): VerifiedMetrics | { error: string } {
  const solution = puzzleData.solution as { lines: string[][] }
  const playerMoves = submission.moves as string[]
  if (!Array.isArray(playerMoves)) return { error: 'Missing moves array' }
  if (!solution?.lines?.length) return { error: 'Missing solution' }

  const mateIn = (puzzleData.mateIn as number) ?? 2
  const totalPlayerMoves = mateIn

  let bestMatch = 0
  for (const line of solution.lines) {
    const attackerMoves = line.filter((_, i) => i % 2 === 0)
    let matched = 0
    for (let i = 0; i < Math.min(playerMoves.length, attackerMoves.length); i++) {
      if (playerMoves[i] === attackerMoves[i]) {
        matched++
      } else {
        break
      }
    }
    bestMatch = Math.max(bestMatch, matched)
  }

  const solved = bestMatch >= totalPlayerMoves
  const wrongAttempts = typeof submission.wrongAttempts === 'number' ? submission.wrongAttempts : 0
  const penalty = wrongAttempts * 150
  return {
    rawPoints: solved ? Math.max(100, 1000 - penalty) : 0,
    itemsSolved: bestMatch,
    itemsTotal: totalPlayerMoves,
    hintsUsed: wrongAttempts,
  }
}

function verifyCodenamesCodeword(
  puzzleData: Record<string, unknown>,
  submission: Record<string, unknown>
): VerifiedMetrics | { error: string } {
  const solution = puzzleData.solution as { correctWords: string[] }
  const selectedWords = submission.selectedWords as string[]
  if (!Array.isArray(selectedWords)) return { error: 'Missing selectedWords array' }
  if (!solution?.correctWords) return { error: 'Missing solution' }

  const correctSet = new Set(solution.correctWords.map((w) => w.toLowerCase()))
  const total = correctSet.size
  const seen = new Set<string>()
  let correct = 0
  let wrong = 0

  for (const w of selectedWords) {
    const lower = w.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    if (correctSet.has(lower)) {
      correct++
    } else {
      wrong++
    }
  }

  const baseScore = 1000
  const wrongPenalty = 150
  const rawPoints = Math.max(0, Math.round((correct / Math.max(total, 1)) * baseScore) - wrong * wrongPenalty)

  return {
    rawPoints,
    itemsSolved: correct,
    itemsTotal: total,
    hintsUsed: wrong,
  }
}

function verifyLudoPuzzle(
  puzzleData: Record<string, unknown>,
  submission: Record<string, unknown>
): VerifiedMetrics | { error: string } {
  const moves = submission.moves as Array<number | null>
  if (!Array.isArray(moves)) return { error: 'Missing moves array' }

  // Dynamic import would be async — inline the scoring logic instead.
  // The server holds the full puzzleData including solution.optimalRolls.
  const solution = puzzleData.solution as { optimalRolls: number } | undefined
  const diceSequence = puzzleData.diceSequence as number[]
  const startingPieces = puzzleData.startingPieces as Array<{
    id: number
    zone: 'base' | 'track' | 'home' | 'finished'
    pos: number
  }>
  const obstacles = (puzzleData.obstacles as Array<{ trackPos: number }>) ?? []

  if (!Array.isArray(diceSequence) || !Array.isArray(startingPieces)) return { error: 'Invalid puzzle data' }

  const FINISH_STEPS = 56
  const HOME_ENTRY_STEPS = 51
  const stepsOf = (p: { zone: string; pos: number }) => {
    if (p.zone === 'base') return -1
    if (p.zone === 'track') return p.pos
    if (p.zone === 'home') return HOME_ENTRY_STEPS + p.pos
    return FINISH_STEPS
  }

  const steps = [...startingPieces].sort((a, b) => a.id - b.id).map(stepsOf)
  let obs = obstacles.map((o) => o.trackPos)
  let captures = 0
  let rollsUsed = 0

  for (let i = 0; i < diceSequence.length && !steps.every((s) => s === FINISH_STEPS); i++) {
    const roll = diceSequence[i]
    const choice = i < moves.length ? moves[i] : null
    rollsUsed = i + 1

    if (typeof choice === 'number' && choice >= 0 && choice < 4) {
      const cur = steps[choice]
      let next: number | null = null
      if (cur === -1) {
        if (roll === 6) next = 0
      } else if (cur < FINISH_STEPS) {
        const c = cur + roll
        if (c <= FINISH_STEPS) next = c
      }
      if (next !== null) {
        steps[choice] = next
        if (next < HOME_ENTRY_STEPS && obs.includes(next)) {
          obs = obs.filter((o) => o !== next)
          captures++
        }
      }
    }
  }

  const tokensHome = steps.filter((s) => s === FINISH_STEPS).length
  const solved = tokensHome === 4
  const optimalRolls = solution?.optimalRolls ?? diceSequence.length

  let rawPoints: number
  if (solved) {
    rawPoints = Math.max(100, 1000 - (rollsUsed - optimalRolls) * 30 + captures * 50 + tokensHome * 100)
  } else {
    rawPoints = Math.max(0, captures * 50 + tokensHome * 250)
  }

  return {
    rawPoints,
    itemsSolved: tokensHome,
    itemsTotal: 4,
    hintsUsed: 0,
  }
}

function verifyWordle(
  puzzleData: Record<string, unknown>,
  submission: Record<string, unknown>,
  serverHintUsed?: boolean
): VerifiedMetrics | { error: string } {
  const target = typeof puzzleData.word === 'string' ? puzzleData.word.toLowerCase() : ''
  const maxAttempts = Number(puzzleData.maxAttempts) || 0
  if (!target || maxAttempts < 2) return { error: 'Invalid puzzle data' }

  const rawGuesses = submission.guesses
  if (!Array.isArray(rawGuesses)) return { error: 'Missing guesses array' }

  const length = target.length
  const guesses = rawGuesses.map((g) => (typeof g === 'string' ? g.trim().toLowerCase() : ''))
  if (guesses.length < 1 || guesses.length > maxAttempts) return { error: 'Invalid guess count' }
  // Length is the only submission gate (spec §2.4) — no dictionary check, but every guess must
  // actually be a full-length word.
  if (guesses.some((g) => g.length !== length || !/^[a-z]+$/.test(g))) return { error: 'Invalid guess' }

  // A win only counts if the target is the LAST guess — the game locks on a win, so anything after
  // it is fabricated. Re-grading here (not trusting the client) is what keeps scores honest.
  const winIndex = guesses.indexOf(target)
  if (winIndex >= 0 && winIndex !== guesses.length - 1) return { error: 'Invalid submission' }
  const won = winIndex >= 0
  const guessesUsed = guesses.length
  // Trust the server-persisted hint reveal (from daily_hint_reveals) over the client field.
  // The client value is still accepted as an inline signal for callers that never persisted
  // the reveal, but a server-side "true" always wins — otherwise a forged hintUsed=false in
  // the submission would let the player pocket the 300 points they should have paid.
  const hintUsed = serverHintUsed === true || submission.hintUsed === true
  const rawPoints = wordleFinalScore(guessesUsed, maxAttempts, won, hintUsed)

  return {
    rawPoints,
    itemsSolved: guessesUsed,
    itemsTotal: maxAttempts,
    // Report the hint reveal as one "hint used" so it shows up in per-player stats. Score
    // penalty is already applied above via wordleFinalScore.
    hintsUsed: hintUsed ? 1 : 0,
    grid: wordleEmojiGrid(guesses, target),
  }
}

function verifySubmission(
  gameType: DailyChallengeGameType,
  puzzleData: Record<string, unknown>,
  submission: Record<string, unknown>,
  serverHintUsed?: boolean
): VerifiedMetrics | { error: string } {
  switch (gameType) {
    case 'sudoku':
      return verifySudoku(puzzleData, submission)
    case 'word_hunt':
      return verifyWordHunt(puzzleData, submission)
    case 'crossword':
      return verifyCrossword(puzzleData, submission)
    case 'mini_crossword':
      return verifyCrossword(puzzleData, submission)
    case 'word_search':
      return verifyWordSearch(puzzleData, submission)
    case 'word_scramble':
      return verifyWordScramble(puzzleData, submission)
    case 'trivia':
      return verifyTrivia(puzzleData, submission)
    case 'whot_puzzle':
      return verifyWhotPuzzle(puzzleData, submission)
    case 'word_grouping':
      return verifyWordGrouping(puzzleData, submission)
    case 'chess_mate':
      return verifyChessMate(puzzleData, submission)
    case 'codenames_codeword':
      return verifyCodenamesCodeword(puzzleData, submission)
    case 'ludo_puzzle':
      return verifyLudoPuzzle(puzzleData, submission)
    case 'wordle':
      return verifyWordle(puzzleData, submission, serverHintUsed)
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

  // Never trust the client's time: a negative or non-finite value would sort to the top of the
  // fastest-time tie-breaker (and into personal_bests.best_time). Require a finite, non-negative
  // number; the maxTime cap is applied afterwards.
  if (typeof timeSeconds !== 'number' || !Number.isFinite(timeSeconds) || timeSeconds < 0) {
    return NextResponse.json({ error: 'Invalid time' }, { status: 400 })
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

  // Check if already submitted. `.maybeSingle()` avoids PostgREST's 406 log noise
  // that `.single()` emits every time zero rows match — which is the common case on a
  // fresh submission and was filling Supabase logs with spurious warnings.
  const { data: existing } = await admin
    .from('daily_scores')
    .select('normalized_score')
    .eq('challenge_id', challengeId)
    .eq('profile_id', profileId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Already submitted', existingScore: existing.normalized_score }, { status: 409 })
  }

  // Server-side verification. For Wordle, source the hint flag from daily_hint_reveals so
  // a modified client can't submit hintUsed:false to dodge the −300 penalty after paying.
  const puzzleData = challenge.puzzle_data as Record<string, unknown>
  let serverHintUsed = false
  if (gameType === 'wordle') {
    const { data: hintRow } = await admin
      .from('daily_hint_reveals')
      .select('challenge_id')
      .eq('challenge_id', challengeId)
      .eq('profile_id', profileId)
      .maybeSingle()
    serverHintUsed = Boolean(hintRow)
  }
  const metrics = verifySubmission(gameType, puzzleData, submission, serverHintUsed)
  if ('error' in metrics) {
    return NextResponse.json({ error: metrics.error }, { status: 400 })
  }

  // Compute normalized score
  const maxTime = DAILY_GAME_TIMER[gameType]
  const clampedTime = Math.min(timeSeconds, maxTime)
  // Word scramble: using any hint kills the speed bonus (timeSeconds = maxTime → speedRatio = 0)
  // and each hint costs a flat 80 from the normalized score.
  const killSpeed = gameType === 'word_scramble' && metrics.hintsUsed > 0
  const scoreInput: DailyScoreInput = {
    itemsSolved: metrics.itemsSolved,
    itemsTotal: metrics.itemsTotal,
    timeSeconds: killSpeed ? maxTime : clampedTime,
    maxTimeSeconds: maxTime,
    hintsUsed: gameType === 'word_scramble' ? 0 : metrics.hintsUsed,
    maxHints: gameType === 'word_scramble' ? 0 : Math.max(metrics.itemsTotal, 1),
  }
  let normalizedScore = computeNormalizedScore(scoreInput)
  if (gameType === 'wordle') {
    // Wordle's score is guess-count-based, not completion+speed. Keep the stored 0–1000
    // normalized_score in sync with the leaderboard's raw_points (a guess-1 win + perfect bonus
    // hits 1200 raw, capped to 1000 here for the column check).
    normalizedScore = Math.min(1000, metrics.rawPoints)
  }
  if (killSpeed) {
    normalizedScore = Math.max(0, normalizedScore - metrics.hintsUsed * 80)
  }

  // Word Hunt is a points game with no natural "complete" — rank/record it by raw points, not the
  // completion-based normalized score (which is tiny when there are hundreds of possible words).
  // normalized_score is still stored (its column is capped 0–1000); raw_points/best_score are not.
  const isPointsGame = DAILY_GAME_PRIMARY_METRIC[gameType] === 'score'
  const boardScore = isPointsGame ? metrics.rawPoints : normalizedScore

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

  // Word Grouping is the only daily challenge with a system trophy tied to daily plays today
  // (#20 Daily Player, `word_grouping.sys.daily_player`). The daily submit path never touches
  // `awardForFinishedGame`, so we bump the counter directly via `bump_player_stats` and
  // fire-and-forget a trophy sync afterwards. Best-effort — a trophy delay must not fail the
  // score submission the user is watching for.
  if (gameType === 'word_grouping') {
    try {
      // `.rpc()` resolves with `{ data, error }` by default rather than throwing — without
      // this explicit check, a failed `bump_player_stats` call would skip the counter update
      // silently and then the trophy sync would run against un-bumped counters, so the
      // daily-player trophy never fires and no diagnostic is logged.
      const { error: statsError } = await admin.rpc('bump_player_stats', {
        p_profile_id: profileId,
        p_game_type: 'word_grouping',
        p_played: 0,
        p_won: 0,
        p_counters: { word_grouping_daily_played: 1 },
      })
      if (statsError) throw statsError
      await syncEligibleTrophies(admin, profileId)
    } catch (err) {
      console.error(`daily-challenge WG trophy sync failed for profile ${profileId}`, err)
    }
  }

  // Upsert personal best (best-effort). `.maybeSingle()` — first-ever play has no row,
  // and `.single()` would log a spurious 406 on every first-time submission per game.
  const { data: currentBest } = await admin
    .from('personal_bests')
    .select('best_score, best_time, total_plays')
    .eq('profile_id', profileId)
    .eq('game_type', gameType)
    .maybeSingle()

  if (!currentBest) {
    await admin.from('personal_bests').insert({
      profile_id: profileId,
      game_type: gameType,
      best_score: boardScore,
      best_time: clampedTime,
      total_plays: 1,
      best_date: today,
    })
  } else {
    const newBestScore = Math.max(currentBest.best_score, boardScore)
    const newBestTime =
      boardScore > currentBest.best_score
        ? clampedTime
        : boardScore === currentBest.best_score && clampedTime < currentBest.best_time
          ? clampedTime
          : currentBest.best_time
    await admin
      .from('personal_bests')
      .update({
        best_score: newBestScore,
        best_time: newBestTime,
        total_plays: currentBest.total_plays + 1,
        best_date: boardScore > currentBest.best_score ? today : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('profile_id', profileId)
      .eq('game_type', gameType)
  }

  // Advance the profile's day streak (best-effort — a failure here must not break the submission).
  // Reuses `today` captured at the top so the streak date matches the challenge date even if the
  // request crosses WAT midnight.
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('current_streak, longest_streak, last_active_date')
      .eq('id', profileId)
      .maybeSingle()

    if (profile) {
      const streak = advanceStreak(
        {
          current_streak: Number(profile.current_streak) || 0,
          longest_streak: Number(profile.longest_streak) || 0,
          last_active_date: (profile.last_active_date as string) ?? null,
        } satisfies StreakState,
        today
      )
      if (streak.last_active_date !== (profile.last_active_date ?? null)) {
        await admin
          .from('profiles')
          .update({
            current_streak: streak.current_streak,
            longest_streak: streak.longest_streak,
            last_active_date: streak.last_active_date,
          })
          .eq('id', profileId)
      }
    }
  } catch {
    // Swallow — streak is best-effort
  }

  // Compute rank with the SAME comparator the leaderboard uses, so the finished-screen rank matches
  // the board. Re-read the row we just inserted so submitted_at (the final tiebreaker) matches
  // what the leaderboard query will see.
  const { data: mine } = await admin
    .from('daily_scores')
    .select('normalized_score, raw_points, items_solved, time_seconds, hints_used, submitted_at')
    .eq('challenge_id', challengeId)
    .eq('profile_id', profileId)
    .maybeSingle()
  const rank = mine ? await computeDailyRank(admin, gameType, challengeId, mine) : 1

  // Match the leaderboard's row set — zero-score/zero-point rows are filtered off the board, so
  // the "of N" denominator has to filter the same column that ranks the board or the finished
  // screen's "#K of N" will disagree with the leaderboard the player scrolls to next.
  const totalCountColumn = DAILY_GAME_PRIMARY_METRIC[gameType] === 'score' ? 'raw_points' : 'normalized_score'
  const { count: totalPlayers } = await admin
    .from('daily_scores')
    .select('*', { count: 'exact', head: true })
    .eq('challenge_id', challengeId)
    .gt(totalCountColumn, 0)

  // Fetch personal best for comparison. `.maybeSingle()` — the row may have been created
  // one call above, but a fresh player before that insert has no row and `.single()` logs
  // a 406 there for no reason.
  const { data: personalBest } = await admin
    .from('personal_bests')
    .select('best_score, best_time, total_plays')
    .eq('profile_id', profileId)
    .eq('game_type', gameType)
    .maybeSingle()

  const isNewBest = personalBest ? boardScore >= personalBest.best_score : true

  return NextResponse.json({
    normalizedScore,
    rawPoints: metrics.rawPoints,
    itemsSolved: metrics.itemsSolved,
    itemsTotal: metrics.itemsTotal,
    timeSeconds: Math.min(timeSeconds, maxTime),
    hintsUsed: metrics.hintsUsed,
    grid: metrics.grid,
    rank,
    totalPlayers: totalPlayers ?? 1,
    personalBest: personalBest
      ? { bestScore: personalBest.best_score, bestTime: personalBest.best_time, totalPlays: personalBest.total_plays }
      : null,
    isNewBest,
  })
}
