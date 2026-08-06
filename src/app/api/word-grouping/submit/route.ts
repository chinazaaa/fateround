import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { WORD_GROUPING_MAX_MISTAKES, WORD_GROUPING_TOTAL_GROUPS } from '@/lib/word-grouping'

const submitSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
  words: z.array(z.string()).length(4),
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
    await supabase.from('games').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', code)
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

  const { data: existingSubs } = await supabase
    .from('word_grouping_submissions')
    .select('id, group_index, is_correct')
    .eq('round_id', round.id)
    .eq('player_id', auth.player.id)

  const correctCount = existingSubs?.filter((s) => s.is_correct).length ?? 0
  const mistakeCount = existingSubs?.filter((s) => !s.is_correct).length ?? 0

  if (mistakeCount >= WORD_GROUPING_MAX_MISTAKES) {
    return NextResponse.json({ error: 'Out of guesses' }, { status: 400 })
  }

  if (matchedGroup && existingSubs?.some((s) => s.is_correct && s.group_index === matchedIndex)) {
    return NextResponse.json({ success: true, isCorrect: true, alreadySolved: true })
  }

  const isCorrect = matchedGroup !== null
  const newMistakes = isCorrect ? mistakeCount : mistakeCount + 1

  const { error: insertError } = await supabase.from('word_grouping_submissions').insert({
    game_id: code,
    round_id: round.id,
    player_id: auth.player.id,
    group_index: isCorrect ? matchedIndex : -1,
    difficulty: isCorrect ? matchedGroup!.difficulty : 0,
    guess_words: words,
    is_correct: isCorrect,
    mistakes_at_time: newMistakes,
  })
  if (insertError) {
    return NextResponse.json({ error: internalErrorMessage('word-grouping/submit', insertError) }, { status: 500 })
  }

  const newCorrectCount = isCorrect ? correctCount + 1 : correctCount
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
        await supabase
          .from('games')
          .update({ status: 'finished', finished_at: new Date().toISOString() })
          .eq('id', code)
      }
    }
  }

  const oneAway =
    !isCorrect &&
    solution.groups.some((g) => {
      const overlap = words.filter((w) => g.words.includes(w)).length
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
