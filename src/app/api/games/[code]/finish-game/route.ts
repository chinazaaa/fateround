import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { finishMonopolyGameEarly } from '@/lib/monopoly'
import { finishAnonymousRoomSession, finishSecretMessageBoard } from '@/lib/anonymous-messages'
import { finishCodewordsGame } from '@/lib/codewords'
import { finishScrabbleGameEarly } from '@/lib/scrabble'
import { markGameFinished } from '@/lib/game-finish'
import { awardTournamentPlacements } from '@/lib/tournament-scoring'
import {
  parseGameType,
  isAnonymousMessagesGame,
  isSecretMessageGame,
  isCodewordsGame,
  isMonopolyGame,
  isScrabbleGame,
} from '@/lib/game-types'
import { hostActionSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { data, error: bodyError } = await parseJsonBody(req, hostActionSchema)
  if (bodyError) return bodyError

  const { hostToken } = data
  const gameId = code.toUpperCase()

  const admin = getSupabaseAdmin()

  const { data: game } = await admin.from('games').select('*').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'active' && game.status !== 'waiting') {
    return NextResponse.json({ error: 'Game already ended' }, { status: 400 })
  }

  const gameType = parseGameType(game.game_type)
  const inLobby = game.status === 'waiting'
  const now = new Date().toISOString()

  const { error: roundError } = await admin
    .from('rounds')
    .update({ status: 'finished', ended_at: now })
    .eq('game_id', gameId)
    .eq('status', 'active')

  if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

  if (isAnonymousMessagesGame(gameType)) {
    const { error } = await finishAnonymousRoomSession(admin, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isSecretMessageGame(gameType)) {
    const { error } = await finishSecretMessageBoard(admin, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isCodewordsGame(gameType)) {
    const { error } = await finishCodewordsGame(admin, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isMonopolyGame(gameType) && !inLobby) {
    const { error } = await finishMonopolyGameEarly(admin, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Scrabble finalizes its own session (tally scores + pick a winner) when ended
  // mid-game. In the lobby there's no session yet, so fall through to markGameFinished.
  if (isScrabbleGame(gameType) && !inLobby) {
    const { error } = await finishScrabbleGameEarly(admin, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Save snapshot for rematch history
  const [votesRes, participantsRes, snapshotCountRes] = await Promise.all([
    admin.from('votes').select('*').eq('game_id', gameId),
    admin.from('participants').select('*').eq('game_id', gameId),
    admin
      .from('game_snapshots')
      .select('session_number')
      .eq('game_id', gameId)
      .order('session_number', { ascending: false })
      .limit(1),
  ])

  const snapshotVotes = votesRes.data ?? []
  const snapshotParticipants = participantsRes.data ?? []
  const lastSession = snapshotCountRes.data?.[0]?.session_number ?? 0

  if (snapshotVotes.length > 0) {
    const { error: snapErr } = await admin.from('game_snapshots').insert({
      game_id: gameId,
      session_number: lastSession + 1,
      snapshot_data: {
        votes: snapshotVotes,
        participants: snapshotParticipants,
        gameType: game.game_type,
      },
    })
    if (snapErr) console.error('Failed to save game snapshot:', snapErr.message)
  }

  const { error } = await markGameFinished(admin, gameId, now)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await awardTournamentPlacements(admin, gameId)
  } catch {
    // Tournament scoring is best-effort — never block game finish
  }

  return NextResponse.json({ success: true })
}
