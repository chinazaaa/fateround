import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { finishExpiredWordScrambleGame } from '@/lib/word-scramble-finish'
import { markGameFinished } from '@/lib/game-finish'
import { wordScrambleGameSessionExpired, parseWordScrambleMetadata, guessMatchesAnswer } from '@/lib/word-scramble'

const submitSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
  scrambleIndex: z.number().int().min(0).max(200),
  // The typed answer. Ignored (and the answer revealed) when `hint` is true.
  guess: z.string().max(80).optional(),
  // A hint reveals (and locks in) the current answer for a small penalty.
  hint: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, submitSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, scrambleIndex } = body
  const hint = body.hint === true
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  // Fetch the game, round and authenticate in parallel — these are independent reads, so doing
  // them serially added round trips to every keystroke and made solving feel laggy.
  const [gameRes, roundRes, auth] = await Promise.all([
    supabase.from('games').select('id, status, session_started_at, game_duration_seconds').eq('id', code).maybeSingle(),
    supabase
      .from('rounds')
      .select('id, word_scramble_metadata')
      .eq('game_id', code)
      .eq('round_number', 1)
      .maybeSingle(),
    assertPlayer(supabase, code, resumeToken),
  ])

  const game = gameRes.data
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  if (wordScrambleGameSessionExpired(game.session_started_at, game.game_duration_seconds)) {
    await finishExpiredWordScrambleGame(supabase, game)
    return NextResponse.json({ error: 'Time is up' }, { status: 400 })
  }

  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.player.spectator === true) {
    return NextResponse.json({ error: 'Spectators cannot play' }, { status: 403 })
  }

  const round = roundRes.data
  const meta = parseWordScrambleMetadata(round?.word_scramble_metadata)
  if (!round || !meta) return NextResponse.json({ error: 'Puzzle not found' }, { status: 404 })
  if (scrambleIndex >= meta.count) return NextResponse.json({ error: 'No such scramble' }, { status: 400 })

  // Fetch the answer and this player's existing solves in parallel.
  const [solutionRes, mySolvesRes] = await Promise.all([
    supabase.from('word_scramble_solutions').select('solution').eq('round_id', round.id).maybeSingle(),
    supabase
      .from('word_scramble_solves')
      .select('scramble_index')
      .eq('round_id', round.id)
      .eq('player_id', auth.player.id),
  ])
  const answers = (solutionRes.data?.solution as string[] | undefined) ?? undefined
  const answer = answers?.[scrambleIndex]
  if (!answer) return NextResponse.json({ error: 'Puzzle data missing' }, { status: 500 })

  const mySolved = new Set(((mySolvesRes.data ?? []) as { scramble_index: number }[]).map((r) => r.scramble_index))
  // Already solved this scramble → friendly no-op (returns the answer so the client advances).
  if (mySolved.has(scrambleIndex)) return NextResponse.json({ correct: true, word: answer, alreadySolved: true })

  if (!hint && !guessMatchesAnswer(body.guess ?? '', answer)) {
    return NextResponse.json({ correct: false })
  }

  const { error: insertError } = await supabase.from('word_scramble_solves').insert({
    game_id: code,
    round_id: round.id,
    player_id: auth.player.id,
    scramble_index: scrambleIndex,
    word: answer,
    via_hint: hint,
  })
  if (insertError) {
    return NextResponse.json({ error: internalErrorMessage('word-scramble/submit', insertError) }, { status: 500 })
  }

  // The race can only END on a submit that completes a player's LAST word. On every other submit
  // no new completion is possible, so we skip the win-condition tally entirely (it used to run —
  // with its own game + round refetch — on every keystroke).
  let finished = false
  if (mySolved.size + 1 >= meta.count) {
    const hasTimer = !!game.game_duration_seconds && game.game_duration_seconds > 0
    if (!hasTimer) {
      // No timer → the first player to finish everything ends the race (this player just did).
      const { error } = await markGameFinished(supabase, code, undefined, { onlyIfActive: true })
      finished = !error
    } else {
      // Timer games end only once EVERY active player has finished.
      const [allSolvesRes, playersRes] = await Promise.all([
        supabase.from('word_scramble_solves').select('player_id, scramble_index').eq('round_id', round.id),
        supabase.from('players').select('id').eq('game_id', code).eq('spectator', false),
      ])
      const byPlayer = new Map<string, Set<number>>()
      for (const s of (allSolvesRes.data ?? []) as { player_id: string; scramble_index: number }[]) {
        const set = byPlayer.get(s.player_id) ?? new Set<number>()
        set.add(s.scramble_index)
        byPlayer.set(s.player_id, set)
      }
      const ids = ((playersRes.data ?? []) as { id: string }[]).map((p) => p.id)
      if (ids.length > 0 && ids.every((id) => (byPlayer.get(id)?.size ?? 0) >= meta.count)) {
        const { error } = await markGameFinished(supabase, code, undefined, { onlyIfActive: true })
        finished = !error
      }
    }
  }

  return NextResponse.json({ correct: true, word: answer, hint, finished })
}
