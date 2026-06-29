import { NextRequest, NextResponse } from 'next/server'
import { codewordsGuessSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { parseGameType, isCodewordsGame } from '@/lib/game-types'
import { finishCodewordsGame } from '@/lib/codewords'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import type { CodewordsBoard, CodewordsCellType } from '@/types'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, codewordsGuessSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, cellIndex } = body
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
  if (!role || role.role !== 'operative') {
    return NextResponse.json({ error: 'Only operatives can guess' }, { status: 403 })
  }

  // Read the board for context we need (words, current clue) before the atomic update.
  // The RPC re-reads + locks the row atomically — this pre-read is only for metadata.
  const { data: board } = await supabase.from('codewords_boards').select('*').eq('game_id', code).maybeSingle()
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 })

  const typedBoard = board as CodewordsBoard
  if (typedBoard.winner) return NextResponse.json({ error: 'Game is over' }, { status: 400 })
  if (typedBoard.current_turn !== role.team) {
    return NextResponse.json({ error: "Not your team's turn" }, { status: 400 })
  }
  if (!typedBoard.current_clue_word || typedBoard.guesses_remaining == null) {
    return NextResponse.json({ error: 'Wait for your spymaster to give a clue' }, { status: 400 })
  }
  if (typedBoard.revealed_indices.includes(cellIndex)) {
    return NextResponse.json({ error: 'That word is already revealed' }, { status: 400 })
  }

  // Atomic update via RPC — locks the row to prevent concurrent guess race conditions
  const { data: rpcRows, error: rpcError } = await supabase.rpc('codewords_process_guess', {
    p_board_id: typedBoard.id,
    p_cell_index: cellIndex,
    p_player_team: role.team,
  })

  if (rpcError) {
    if (rpcError.message?.includes('ALREADY_REVEALED')) {
      return NextResponse.json({ error: 'That word is already revealed' }, { status: 400 })
    }
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  const updated = (Array.isArray(rpcRows) ? rpcRows[0] : rpcRows) as CodewordsBoard | undefined
  if (!updated) return NextResponse.json({ error: 'Guess failed' }, { status: 500 })

  const cellType = (typedBoard.key as CodewordsCellType[])[cellIndex]

  await supabase.from('codewords_guesses').insert({
    game_id: code,
    board_id: typedBoard.id,
    player_id: playerId,
    cell_index: cellIndex,
    word: typedBoard.words[cellIndex],
    cell_type: cellType,
    clue_word: typedBoard.current_clue_word,
    clue_number: typedBoard.current_clue_number,
    team: role.team,
  })

  if (updated.winner) {
    await finishCodewordsGame(supabase, code)
  }

  return NextResponse.json({ success: true, board: updated, cellType })
}
