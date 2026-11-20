import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { codewordsClueSchema } from '@/lib/validation'
import { parseGameType, isCodewordsGame } from '@/lib/game-types'
import { effectiveTurnPhase, guessPhaseUpdate, omitCodewordsServerCounters } from '@/lib/codewords'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import type { CodewordsBoard } from '@/types'
import { parseJsonBody } from '@/lib/parse-body'

function normalizeWord(word: string): string {
  return word.trim().toLowerCase()
}

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, codewordsClueSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, clueWord, clueNumber } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('game_type, status').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isCodewordsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a codewords game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

  const { data: role } = await supabase
    .from('codewords_player_roles')
    .select('team, role')
    .eq('game_id', code)
    .eq('player_id', playerId)
    .maybeSingle()
  if (!role || role.role !== 'spymaster') {
    return NextResponse.json({ error: 'Only spymasters can give clues' }, { status: 403 })
  }

  const { data: board } = await supabase.from('codewords_boards').select('*').eq('game_id', code).maybeSingle()
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 })

  const typedBoard = board as CodewordsBoard
  if (typedBoard.winner) return NextResponse.json({ error: 'Game is over' }, { status: 400 })
  if (typedBoard.current_turn !== role.team) {
    return NextResponse.json({ error: "Not your team's turn" }, { status: 400 })
  }
  if (effectiveTurnPhase(typedBoard) !== 'clue') {
    return NextResponse.json({ error: 'Wait for your operatives to finish guessing' }, { status: 400 })
  }
  if (typedBoard.current_clue_word) {
    return NextResponse.json({ error: 'Wait for your operatives to finish guessing' }, { status: 400 })
  }

  const clue = normalizeWord(clueWord)
  const visibleWords = typedBoard.words.filter((_, index) => !typedBoard.revealed_indices.includes(index))
  if (visibleWords.some((word) => normalizeWord(word) === clue)) {
    return NextResponse.json({ error: 'Clue cannot match a word still on the board' }, { status: 400 })
  }

  const guessesRemaining = clueNumber === 0 ? 25 : clueNumber + 1

  let write = supabase
    .from('codewords_boards')
    .update({
      current_clue_word: clueWord.trim(),
      current_clue_number: clueNumber,
      guesses_remaining: guessesRemaining,
      ...guessPhaseUpdate(typedBoard.operative_timer_seconds ?? 60),
    })
    .eq('id', typedBoard.id)
    // Compare-and-swap on the state the checks above relied on: two clue requests can both read an
    // empty clue, and the later one would otherwise overwrite the first clue and reset the guess
    // allowance after operatives have already spent guesses on it (clue_seq cannot tell an identical
    // repost apart). Only the request that finds the board still waiting for a clue wins.
    .is('current_clue_word', null)
    .is('winner', null)
    .eq('current_turn', typedBoard.current_turn)
  // turn_seq advances on every turn change, so a request held in flight across a full turn cycle
  // (the same team's turn again, clue empty again) no longer matches. Skipped only when the column
  // is absent from the read (route deployed before the migration).
  if (typeof typedBoard.turn_seq === 'number') write = write.eq('turn_seq', typedBoard.turn_seq)

  const { data: updated, error } = await write.select().maybeSingle()

  if (error) return NextResponse.json({ error: internalErrorMessage('codewords/clue', error) }, { status: 500 })
  if (!updated) return NextResponse.json({ error: 'A clue was already given this turn' }, { status: 409 })
  return NextResponse.json({ success: true, board: omitCodewordsServerCounters(updated) })
}
