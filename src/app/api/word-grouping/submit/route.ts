import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { markGameFinished } from '@/lib/game-finish'
import { WORD_GROUPING_MAX_MISTAKES, WORD_GROUPING_TOTAL_GROUPS } from '@/lib/word-grouping'

const submitSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
  // Cap each word: it is stored verbatim in `guess_words`, and real puzzle words are short.
  words: z.array(z.string().max(80)).length(4),
})

interface WordGroupingSolution {
  groups: { category: string; words: string[]; difficulty: 1 | 2 | 3 | 4 }[]
}

function wordGroupingSessionExpired(sessionStartedAt: string | null, durationSeconds: number | null): boolean {
  if (!sessionStartedAt || !durationSeconds || durationSeconds <= 0) return false
  const elapsed = (Date.now() - new Date(sessionStartedAt).getTime()) / 1000
  return elapsed > durationSeconds + 5
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
    await markGameFinished(supabase, code, new Date().toISOString(), { onlyIfActive: true })
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
  if (outcome?.status === 'out_of_guesses') {
    return NextResponse.json({ error: 'Out of guesses' }, { status: 400 })
  }
  if (outcome?.status === 'already_solved') {
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
  const playerDone = newCorrectCount >= WORD_GROUPING_TOTAL_GROUPS || newMistakes >= WORD_GROUPING_MAX_MISTAKES

  if (playerDone) {
    const { data: allPlayers } = await supabase.from('players').select('id').eq('game_id', code).eq('spectator', false)

    if (allPlayers) {
      const { data: allSubs } = await supabase
        .from('word_grouping_submissions')
        .select('player_id, is_correct')
        .eq('round_id', round.id)

      const allDone = allPlayers.every((p) => {
        const playerSubs = allSubs?.filter((s) => s.player_id === p.id) ?? []
        const pCorrect = playerSubs.filter((s) => s.is_correct).length
        const pMistakes = playerSubs.filter((s) => !s.is_correct).length
        return pCorrect >= WORD_GROUPING_TOTAL_GROUPS || pMistakes >= WORD_GROUPING_MAX_MISTAKES
      })

      if (allDone) {
        // Two players can independently observe "allDone" on their final submits — same race
        // as the timer path above. onlyIfActive lets only the CAS winner run the
        // finish side-effects (round facts + room points).
        await markGameFinished(supabase, code, new Date().toISOString(), { onlyIfActive: true })
      }
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
