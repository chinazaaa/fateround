import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseGameType, isCodewordsGame } from '@/lib/game-types'
import { cluePhaseUpdate, isTurnExpired, maskCodewordsBoardKey, otherTeam } from '@/lib/codewords'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { CodewordsBoard, CodewordsTeam } from '@/types'

// Shape-only guard: the field semantics below are unchanged, so this schema deliberately
// declares no keys — a narrower one would strip fields this handler still reads.
const expireTurnBodySchema = z.record(z.string(), z.unknown())

function passTurn(board: CodewordsBoard) {
  const nextTeam = otherTeam(board.current_turn)
  return cluePhaseUpdate(nextTeam, board.spymaster_timer_seconds)
}

// System/timer route: any client may poke it, but it only acts once the turn
// deadline has genuinely passed (enforced below via isTurnExpired), so there's
// no per-player token to authorize. Writes go through the service role.
export async function POST(req: NextRequest) {
  const { data: raw, error: bodyError } = await parseJsonBody(req, expireTurnBodySchema)
  if (bodyError) return bodyError

  const gameId = typeof raw.gameId === 'string' ? raw.gameId.toUpperCase() : ''
  if (!gameId) return NextResponse.json({ error: 'gameId is required' }, { status: 400 })
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('game_type, status').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isCodewordsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a codewords game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: board } = await supabase.from('codewords_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 })

  const typedBoard = board as CodewordsBoard
  if (typedBoard.winner) return NextResponse.json({ success: true, board: maskCodewordsBoardKey(typedBoard) })
  if (!typedBoard.turn_deadline_at || !isTurnExpired(typedBoard.turn_deadline_at)) {
    return NextResponse.json({ success: true, board: maskCodewordsBoardKey(typedBoard), skipped: true })
  }

  let update: Record<string, unknown>
  if (typedBoard.turn_phase === 'clue') {
    update = passTurn(typedBoard)
  } else {
    update = passTurn(typedBoard)
  }

  // Compare-and-swap on the exact expired turn that was observed above. The board id alone also
  // matches a LATER turn: if another request already passed the turn and the next team posted a
  // clue before this write, an id-only update would wipe that fresh clue before its own deadline.
  // The deadline is rewritten on every phase change, so matching the observed value (and team and
  // phase) pins this request to the turn that actually expired.
  let write = supabase
    .from('codewords_boards')
    .update(update)
    .eq('id', typedBoard.id)
    .eq('current_turn', typedBoard.current_turn)
    .eq('turn_deadline_at', typedBoard.turn_deadline_at)
    .is('winner', null)
  // turn_phase is NOT NULL on current rows, but an older row without it must not make the filter
  // `turn_phase = null` (never true) and block every expiry.
  if (typedBoard.turn_phase) write = write.eq('turn_phase', typedBoard.turn_phase)
  const { data: updated, error } = await write.select().maybeSingle()

  if (error) return NextResponse.json({ error: internalErrorMessage('codewords/expire-turn', error) }, { status: 500 })
  if (!updated) {
    // Another request advanced the board first: report the current state without changing it.
    const { data: current } = await supabase.from('codewords_boards').select('*').eq('id', typedBoard.id).maybeSingle()
    return NextResponse.json({
      success: true,
      board: maskCodewordsBoardKey((current ?? typedBoard) as CodewordsBoard),
      skipped: true,
    })
  }
  return NextResponse.json({ success: true, board: maskCodewordsBoardKey(updated as CodewordsBoard) })
}
