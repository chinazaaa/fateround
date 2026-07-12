import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { finishExpiredWordSearchGame, finishWordSearchIfAnyPlayerDone } from '@/lib/word-search-finish'
import {
  wordSearchGameSessionExpired,
  parseWordSearchMetadata,
  matchSelectionToPlacement,
  placementEnd,
  playerFoundWords,
  type WordSearchPlacement,
} from '@/lib/word-search'

const foundSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
  startRow: z.number().int().min(0).max(30),
  startCol: z.number().int().min(0).max(30),
  endRow: z.number().int().min(0).max(30),
  endCol: z.number().int().min(0).max(30),
  // A hint reveals (and locks in) one still-unfound word for a −2 point penalty.
  hint: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, foundSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, startRow, startCol, endRow, endCol } = body
  const hint = body.hint === true
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('id, status, session_started_at, game_duration_seconds')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  if (wordSearchGameSessionExpired(game.session_started_at, game.game_duration_seconds)) {
    await finishExpiredWordSearchGame(supabase, game)
    return NextResponse.json({ error: 'Time is up' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.player.spectator === true) {
    return NextResponse.json({ error: 'Spectators cannot hunt the grid' }, { status: 403 })
  }

  const { data: round } = await supabase
    .from('rounds')
    .select('id, word_search_metadata')
    .eq('game_id', code)
    .eq('round_number', 1)
    .maybeSingle()
  const meta = parseWordSearchMetadata(round?.word_search_metadata)
  if (!round || !meta) return NextResponse.json({ error: 'Puzzle not found' }, { status: 404 })

  const { data: solutionRow } = await supabase
    .from('word_search_solutions')
    .select('solution')
    .eq('round_id', round.id)
    .maybeSingle()
  const placements = (solutionRow?.solution as WordSearchPlacement[] | undefined) ?? undefined
  if (!placements) return NextResponse.json({ error: 'Puzzle data missing' }, { status: 500 })

  // Which words has this player already found? (so a hint reveals a fresh one, and a repeat
  // find is a friendly no-op).
  const { data: existingFound } = await supabase
    .from('word_search_found')
    .select('player_id, word')
    .eq('round_id', round.id)
    .eq('player_id', auth.player.id)
  const alreadyFound = playerFoundWords((existingFound ?? []) as { player_id: string; word: string }[], auth.player.id)

  let placement: WordSearchPlacement | null
  if (hint) {
    // Reveal a random still-unfound word for this player.
    const remaining = placements.filter((p) => !alreadyFound.has(p.word))
    if (remaining.length === 0) return NextResponse.json({ found: false, complete: true })
    placement = remaining[Math.floor(Math.random() * remaining.length)]
  } else {
    placement = matchSelectionToPlacement(placements, [startRow, startCol], [endRow, endCol])
    if (!placement) return NextResponse.json({ found: false })
  }

  const end = placementEnd(placement)
  if (alreadyFound.has(placement.word)) {
    return NextResponse.json({ found: true, word: placement.word, alreadyFound: true })
  }

  const { error: insertError } = await supabase.from('word_search_found').insert({
    game_id: code,
    round_id: round.id,
    player_id: auth.player.id,
    word: placement.word,
    start_row: placement.row,
    start_col: placement.col,
    end_row: end[0],
    end_col: end[1],
    via_hint: hint,
  })
  if (insertError) {
    return NextResponse.json({ error: internalErrorMessage('word-search/found', insertError) }, { status: 500 })
  }

  // A new find can complete the hunt — re-check the race win condition.
  const { error: finishError } = await finishWordSearchIfAnyPlayerDone(supabase, code)
  if (finishError) {
    return NextResponse.json(
      { error: internalErrorMessage('word-search/found completeness check', finishError) },
      { status: 500 }
    )
  }

  return NextResponse.json({
    found: true,
    word: placement.word,
    hint,
    start: [placement.row, placement.col],
    end,
  })
}
