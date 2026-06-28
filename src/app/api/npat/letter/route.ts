import { NextRequest, NextResponse } from 'next/server'
import { isICallOnGame, parseGameType } from '@/lib/game-types'
import { parseNpatMetadata, availableLettersForPick, ensureBlankAnswers } from '@/lib/npat'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'

const LETTER_RE = /^[A-Za-z]$/

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const gameId = typeof raw.gameId === 'string' ? raw.gameId.toUpperCase() : ''
  const resumeToken = typeof raw.resumeToken === 'string' ? raw.resumeToken : ''
  const roundId = typeof raw.roundId === 'string' ? raw.roundId : ''
  const letter = typeof raw.letter === 'string' ? raw.letter.trim().toUpperCase() : ''

  if (!gameId || !roundId || !LETTER_RE.test(letter)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isICallOnGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not an I Call On game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('id', roundId)
    .eq('game_id', gameId)
    .maybeSingle()
  if (!round || round.status !== 'active') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  }

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, gameId, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // The caller is the player whose turn it is — only they may pick the letter.
  if (round.submitter_player_id !== auth.player.id) {
    return NextResponse.json({ error: 'Only the letter caller can pick the letter' }, { status: 403 })
  }

  const metadata = parseNpatMetadata(round.npat_metadata)
  if (!metadata || metadata.phase !== 'letter_pick') {
    return NextResponse.json({ error: 'Not in letter pick phase' }, { status: 400 })
  }

  const { data: allRounds } = await supabase.from('rounds').select('npat_metadata').eq('game_id', gameId)
  const available = availableLettersForPick(allRounds ?? [])
  if (!available.includes(letter)) {
    return NextResponse.json({ error: 'That letter was already used' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('rounds')
    .update({
      npat_metadata: {
        ...metadata,
        letter,
        phase: 'writing',
        phase_started_at: now,
      },
    })
    .eq('id', roundId)
    .eq('status', 'active')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: players } = await supabase.from('players').select('id').eq('game_id', gameId).eq('spectator', false)
  await ensureBlankAnswers(
    supabase,
    gameId,
    roundId,
    (players ?? []).map((p) => p.id)
  )

  return NextResponse.json({ success: true, letter })
}
