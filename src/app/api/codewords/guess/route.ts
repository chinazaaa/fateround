import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { codewordsGuessSchema } from '@/lib/validation'
import { parseGameType, isCodewordsGame } from '@/lib/game-types'
import { cluePhaseUpdate, effectiveTurnPhase, otherTeam, teamWon } from '@/lib/codewords'
import { markGameFinished } from '@/lib/game-finish'
import type { CodewordsBoard, CodewordsCellType, CodewordsTeam } from '@/types'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

function endTeamTurn(board: CodewordsBoard) {
  return cluePhaseUpdate(otherTeam(board.current_turn), board.spymaster_timer_seconds)
}

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = codewordsGuessSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, playerId, cellIndex } = parsed.data
  const code = gameId.toUpperCase()

  const { data: game } = await supabase.from('games').select('game_type, status').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isCodewordsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a codewords game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: role } = await supabase
    .from('codewords_player_roles')
    .select('team, role')
    .eq('game_id', code)
    .eq('player_id', playerId)
    .maybeSingle()
  if (!role || role.role !== 'operative') {
    return NextResponse.json({ error: 'Only operatives can guess' }, { status: 403 })
  }

  const { data: board } = await supabase.from('codewords_boards').select('*').eq('game_id', code).maybeSingle()
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 })

  const typedBoard = board as CodewordsBoard
  if (typedBoard.winner) return NextResponse.json({ error: 'Game is over' }, { status: 400 })
  if (typedBoard.current_turn !== role.team) {
    return NextResponse.json({ error: 'Not your team\'s turn' }, { status: 400 })
  }
  if (effectiveTurnPhase(typedBoard) !== 'guess') {
    return NextResponse.json({ error: 'Wait for your spymaster to give a clue' }, { status: 400 })
  }
  if (!typedBoard.current_clue_word || typedBoard.guesses_remaining == null) {
    return NextResponse.json({ error: 'Wait for your spymaster to give a clue' }, { status: 400 })
  }
  if (typedBoard.revealed_indices.includes(cellIndex)) {
    return NextResponse.json({ error: 'That word is already revealed' }, { status: 400 })
  }

  const key = typedBoard.key as CodewordsCellType[]
  const revealed = [...typedBoard.revealed_indices, cellIndex]
  const cellType = key[cellIndex]
  const team = role.team as CodewordsTeam

  let update: Record<string, unknown> = { revealed_indices: revealed }
  let gameStatus: 'active' | 'finished' = 'active'

  if (cellType === 'assassin') {
    update = {
      ...update,
      winner: otherTeam(team),
      assassin_team: team,
      guesses_remaining: null,
      current_clue_word: null,
      current_clue_number: null,
    }
    gameStatus = 'finished'
  } else if (cellType === team) {
    const won = teamWon(key, revealed, team)
    if (won) {
      update = {
        ...update,
        winner: team,
        guesses_remaining: null,
        current_clue_word: null,
        current_clue_number: null,
      }
      gameStatus = 'finished'
    } else {
      const remaining = typedBoard.guesses_remaining - 1
      if (remaining <= 0) {
        update = { ...update, ...endTeamTurn(typedBoard) }
      } else {
        update = { ...update, guesses_remaining: remaining }
      }
    }
  } else {
    update = { ...update, ...endTeamTurn(typedBoard) }
  }

  const { data: updated, error } = await supabase
    .from('codewords_boards')
    .update(update)
    .eq('id', typedBoard.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('codewords_guesses').insert({
    game_id: code,
    board_id: typedBoard.id,
    player_id: playerId,
    cell_index: cellIndex,
    word: typedBoard.words[cellIndex],
    cell_type: cellType,
    clue_word: typedBoard.current_clue_word,
    clue_number: typedBoard.current_clue_number,
    team,
  })

  if (gameStatus === 'finished') {
    await markGameFinished(supabase, code)
  }

  return NextResponse.json({ success: true, board: updated, cellType })
}
