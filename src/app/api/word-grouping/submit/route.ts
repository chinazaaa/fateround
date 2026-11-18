import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { markGameFinished } from '@/lib/game-finish'
import {
  WORD_GROUPING_MAX_MISTAKES,
  WORD_GROUPING_MAX_WORD_LENGTH,
  WORD_GROUPING_TOTAL_GROUPS,
} from '@/lib/word-grouping'

const submitSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
  // Cap each word: it is stored verbatim in `guess_words`. The same limit is enforced on stored
  // puzzle tiles by parseStoredWordGroupingPuzzles, so every valid tile can be guessed.
  words: z.array(z.string().max(WORD_GROUPING_MAX_WORD_LENGTH)).length(4),
})

interface WordGroupingSolution {
  groups: { category: string; words: string[]; difficulty: 1 | 2 | 3 | 4 }[]
}

function wordGroupingSessionExpired(sessionStartedAt: string | null, durationSeconds: number | null): boolean {
  if (!sessionStartedAt || !durationSeconds || durationSeconds <= 0) return false
  const elapsed = (Date.now() - new Date(sessionStartedAt).getTime()) / 1000
  return elapsed > durationSeconds + 5
}

function isPlayerDone(correctCount: number | undefined, mistakeCount: number | undefined): boolean {
  return (correctCount ?? 0) >= WORD_GROUPING_TOTAL_GROUPS || (mistakeCount ?? 0) >= WORD_GROUPING_MAX_MISTAKES
}

/** Finishes the game if every non-spectator is done. Returns an error when completion failed. */
async function finishGameIfAllDone(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  code: string,
  roundId: string,
  sessionStartedAt: string | null
): Promise<Error | null> {
  try {
    const { data: allPlayers, error: playersError } = await supabase
      .from('players')
      .select('id')
      .eq('game_id', code)
      .eq('spectator', false)
    if (playersError) return new Error(`players read failed: ${playersError.message}`)
    if (!allPlayers) return null

    const { data: allSubs, error: subsError } = await supabase
      .from('word_grouping_submissions')
      .select('player_id, is_correct')
      .eq('round_id', roundId)
    if (subsError) return new Error(`submissions read failed: ${subsError.message}`)

    const allDone = allPlayers.every((p) => {
      const playerSubs = allSubs?.filter((s) => s.player_id === p.id) ?? []
      const pCorrect = playerSubs.filter((s) => s.is_correct).length
      const pMistakes = playerSubs.filter((s) => !s.is_correct).length
      return isPlayerDone(pCorrect, pMistakes)
    })
    if (!allDone) return null

    // Two players can independently observe "allDone" on their final submits — same race as the
    // timer path. onlyIfActive lets only the CAS winner run the finish side-effects.
    const result = await markGameFinished(supabase, code, new Date().toISOString(), {
      onlyIfActive: true,
      // Only finish the session whose submissions were just checked; a replay under the same
      // game id gets a new session_started_at and must not be finished by this stale check.
      onlySessionStartedAt: sessionStartedAt,
    })
    return result.error ? new Error(`markGameFinished failed: ${result.error}`) : null
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }
}

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, submitSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, words } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('id, status, session_started_at, game_duration_seconds')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  if (wordGroupingSessionExpired(game.session_started_at, game.game_duration_seconds)) {
    // markGameFinished (over a raw UPDATE) snapshots trophy facts + awards room points on the
    // active→finished transition. Multiple players can race here at the buzzer, so gate on
    // status='active' — only the CAS winner runs the finish side-effects, not every racer.
    await markGameFinished(supabase, code, new Date().toISOString(), {
      onlyIfActive: true,
      onlySessionStartedAt: game.session_started_at,
    })
    return NextResponse.json({ error: 'Time is up' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.player.spectator === true) {
    return NextResponse.json({ error: 'Spectators cannot guess' }, { status: 403 })
  }

  const { data: round } = await supabase
    .from('rounds')
    .select('id, word_grouping_metadata')
    .eq('game_id', code)
    .eq('round_number', 1)
    .maybeSingle()
  if (!round) return NextResponse.json({ error: 'Puzzle not found' }, { status: 404 })

  const { data: solutionRow } = await supabase
    .from('word_grouping_solutions')
    .select('solution')
    .eq('round_id', round.id)
    .maybeSingle()
  const solution = solutionRow?.solution as WordGroupingSolution | undefined
  if (!solution?.groups) return NextResponse.json({ error: 'Puzzle data missing' }, { status: 500 })

  const sortedGuess = [...words].map((w) => w.trim()).sort()

  let matchedGroup: (typeof solution.groups)[number] | null = null
  let matchedIndex = -1
  for (let i = 0; i < solution.groups.length; i++) {
    const groupSorted = [...solution.groups[i].words].sort()
    if (groupSorted.length === sortedGuess.length && groupSorted.every((w, j) => w === sortedGuess[j])) {
      matchedGroup = solution.groups[i]
      matchedIndex = i
      break
    }
  }

  const isCorrect = matchedGroup !== null

  // The limit checks and the insert happen atomically in the word_grouping_submit Postgres
  // function: it serialises this player's guesses, so simultaneous wrong guesses can neither
  // exceed the limit nor leave a rejected row behind, and it returns the post-insert counts.
  const { data: result, error: rpcError } = await supabase.rpc('word_grouping_submit', {
    p_game_id: code,
    p_round_id: round.id,
    p_player_id: auth.player.id,
    p_group_index: isCorrect ? matchedIndex : -1,
    p_difficulty: isCorrect ? matchedGroup!.difficulty : 0,
    p_guess_words: words,
    p_is_correct: isCorrect,
    p_max_mistakes: WORD_GROUPING_MAX_MISTAKES,
  })
  if (rpcError) {
    return NextResponse.json({ error: internalErrorMessage('word-grouping/submit', rpcError) }, { status: 500 })
  }
  const outcome = result as { status?: string; correct_count?: number; mistake_count?: number } | null
  if (outcome?.status === 'game_not_active') {
    return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  }
  if (outcome?.status === 'out_of_guesses' || outcome?.status === 'already_solved') {
    // The player is already done (or re-sent a solved group). If an earlier request committed
    // their final guess but failed to finish the game, this retry is the only chance to complete
    // it, so re-run the completion check (no guess is stored here). It is a no-op when the game
    // is already finished (onlyIfActive) or other players are still playing.
    if (isPlayerDone(outcome.correct_count, outcome.mistake_count)) {
      const finishError = await finishGameIfAllDone(supabase, code, round.id, game.session_started_at)
      if (finishError) {
        return NextResponse.json({ error: internalErrorMessage('word-grouping/submit', finishError) }, { status: 500 })
      }
    }
    if (outcome.status === 'out_of_guesses') return NextResponse.json({ error: 'Out of guesses' }, { status: 400 })
    return NextResponse.json({ success: true, isCorrect: true, alreadySolved: true })
  }
  if (outcome?.status !== 'ok') {
    return NextResponse.json(
      { error: internalErrorMessage('word-grouping/submit', new Error('unexpected submit result')) },
      { status: 500 }
    )
  }

  const newCorrectCount = outcome.correct_count ?? 0
  const newMistakes = outcome.mistake_count ?? 0
  if (isPlayerDone(newCorrectCount, newMistakes)) {
    const finishError = await finishGameIfAllDone(supabase, code, round.id, game.session_started_at)
    // The guess is already committed; surface a failed finish so the client retries, and the
    // retry (out_of_guesses / already_solved above) re-runs the completion check.
    if (finishError) {
      return NextResponse.json({ error: internalErrorMessage('word-grouping/submit', finishError) }, { status: 500 })
    }
  }

  // Use the same trimmed values match-comparison uses at line 71/76 — matching against untrimmed
  // `words` here would report overlap=0 for a guess that has surrounding whitespace but exactly
  // matches on the sorted-and-trimmed path above.
  const oneAway =
    !isCorrect &&
    solution.groups.some((g) => {
      const groupSet = new Set(g.words.map((w) => w.trim()))
      const overlap = sortedGuess.filter((w) => groupSet.has(w)).length
      return overlap === 3
    })

  return NextResponse.json({
    success: true,
    isCorrect,
    oneAway: !isCorrect ? oneAway : undefined,
    group: isCorrect
      ? { category: matchedGroup!.category, words: matchedGroup!.words, difficulty: matchedGroup!.difficulty }
      : undefined,
  })
}
