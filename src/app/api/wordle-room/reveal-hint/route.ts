import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  parseWordleRoomMetadata,
  parseWordleRoomSolutionWords,
  wordleRoomSessionExpired,
  WORDLE_ROOM_HINT_COST,
} from '@/lib/wordle-room'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { playerIsViewer } from '@/lib/viewers'
import { parseJsonBody } from '@/lib/parse-body'

const revealSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
  wordIndex: z.number().int().min(0).max(50),
})

/**
 * Buy the hint for the player's CURRENT word. Deduction is applied when the guess route
 * scores that word — this endpoint just persists the purchase so it survives a refresh
 * (and can't be undone by closing the tab). The client asserts `wordIndex` matches the
 * player's current position; we re-check server-side so a stale/forged index is rejected.
 */
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, revealSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, wordIndex } = body
  const supabase = getSupabaseAdmin()

  const [{ data: game }, { data: round }] = await Promise.all([
    supabase.from('games').select('id,status,session_started_at,timer_seconds').eq('id', gameId).maybeSingle(),
    supabase.from('rounds').select('id,wordle_room_metadata').eq('game_id', gameId).eq('round_number', 1).maybeSingle(),
  ])

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  if (wordleRoomSessionExpired(game.session_started_at, game.timer_seconds)) {
    return NextResponse.json({ error: 'Time is up' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, gameId, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const player = auth.player
  if (playerIsViewer(player, game)) return NextResponse.json({ error: 'Viewers cannot reveal hints' }, { status: 403 })

  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  const metadata = parseWordleRoomMetadata(round.wordle_room_metadata)
  if (!metadata) return NextResponse.json({ error: 'Room data missing' }, { status: 500 })

  const [{ data: solutions }, { data: progress }] = await Promise.all([
    supabase.from('wordle_room_solutions').select('words').eq('round_id', round.id).maybeSingle(),
    supabase
      .from('wordle_room_progress')
      .select('*')
      .eq('game_id', gameId)
      .eq('round_id', round.id)
      .eq('player_id', player.id)
      .maybeSingle(),
  ])

  if (progress?.finished === true) {
    return NextResponse.json({ error: 'You have already finished this room' }, { status: 400 })
  }
  const currentIndex = progress?.word_index ?? 0
  if (wordIndex !== currentIndex) {
    return NextResponse.json({ error: 'Not your current word' }, { status: 400 })
  }

  const { words, hints } = parseWordleRoomSolutionWords(solutions?.words)
  const hint = hints[currentIndex] ?? ''
  if (!hint) return NextResponse.json({ error: 'No hint available for this word' }, { status: 400 })
  if (!words[currentIndex]) return NextResponse.json({ error: 'No word to hint' }, { status: 400 })

  // Atomic reveal via RPC. The record-guess RPC locks the same progress row before scoring,
  // so any reveal that commits before a guess is picked up by the scoring path — a
  // concurrent guess submission can't score the word without the −300 deduction.
  const { error: rpcError } = await supabase.rpc('wordle_room_reveal_hint', {
    p_game_id: gameId,
    p_round_id: round.id,
    p_player_id: player.id,
    p_word_index: currentIndex,
    p_now: new Date().toISOString(),
  })
  if (rpcError) {
    if (rpcError.code === 'WR001') {
      return NextResponse.json({ error: 'You have already finished this room' }, { status: 400 })
    }
    if (rpcError.code === 'WR002') {
      return NextResponse.json({ error: 'Not your current word' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to record hint' }, { status: 500 })
  }

  return NextResponse.json({ success: true, wordIndex: currentIndex, hint, cost: WORDLE_ROOM_HINT_COST })
}
