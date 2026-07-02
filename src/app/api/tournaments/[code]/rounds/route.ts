import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { generateGameCode, generateToken } from '@/lib/utils'
import { startTournamentRoundSchema } from '@/lib/tournament-validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { computeRoundPairings } from '@/lib/tournament-bracket'

// Head-to-head matches are chess games for now.
const H2H_GAME_TYPE = 'chess'
const DEFAULT_TIMER_SECONDS = 600

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Stage the next head-to-head bracket round: pair the surviving players, create
 * a chess room per match (players auto-join by name from the lobby), and record
 * bye players who advance automatically. Matches start as `pending`; the host
 * then starts them together via the round-start endpoint once players are seated.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const { data: body, error: bodyError } = await parseJsonBody(req, startTournamentRoundSchema)
  if (bodyError) return bodyError

  const { hostToken, timerSeconds } = body
  const admin = getSupabaseAdmin()

  const { data: tournament } = await admin.from('tournaments').select('*').eq('id', tournamentId).maybeSingle()
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  if (tournament.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (tournament.format !== 'head-to-head') {
    return NextResponse.json({ error: 'Not a head-to-head tournament' }, { status: 400 })
  }
  if (tournament.status === 'finished') return NextResponse.json({ error: 'Tournament has ended' }, { status: 400 })

  // Only one round runs at a time — refuse if any match is still staged or live.
  const { data: liveMatch } = await admin
    .from('tournament_games')
    .select('id')
    .eq('tournament_id', tournamentId)
    .in('status', ['pending', 'active'])
    .limit(1)
    .maybeSingle()
  if (liveMatch) return NextResponse.json({ error: 'A round is already in progress' }, { status: 400 })

  // Survivors = players still in the bracket. (Advancement — eliminating losers —
  // lands in the next phase; for round 1 this is simply everyone who joined.)
  const { data: survivorRows } = await admin
    .from('tournament_players')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('is_eliminated', false)
    .order('joined_at', { ascending: true })

  const survivorIds = (survivorRows ?? []).map((p) => p.id)
  if (survivorIds.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 players to start a round' }, { status: 400 })
  }

  const { data: lastRow } = await admin
    .from('tournament_games')
    .select('round_number, game_order')
    .eq('tournament_id', tournamentId)
    .order('game_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const roundNumber = (lastRow?.round_number ?? 0) + 1
  let nextOrder = (lastRow?.game_order ?? 0) + 1

  const { matches, byes } = computeRoundPairings(shuffle(survivorIds))
  const timer = timerSeconds ?? DEFAULT_TIMER_SECONDS

  let matchIndex = 0

  for (const [aId, bId] of matches) {
    let gameCode = ''
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateGameCode()
      const { data: existing } = await admin.from('games').select('id').eq('id', candidate).maybeSingle()
      if (!existing) {
        gameCode = candidate
        break
      }
    }
    if (!gameCode) return NextResponse.json({ error: 'Failed to generate unique game code' }, { status: 500 })

    const { error: gameError } = await admin.from('games').insert({
      id: gameCode,
      host_token: generateToken(),
      title: `${tournament.title} — Match ${matchIndex + 1}`,
      game_type: H2H_GAME_TYPE,
      participant_mode: 'joiners',
      rounds_count: 1,
      timer_seconds: timer,
      tournament_id: tournamentId,
    })
    if (gameError) {
      return NextResponse.json({ error: internalErrorMessage('tournaments/code/rounds', gameError) }, { status: 500 })
    }

    const { error: tgError } = await admin.from('tournament_games').insert({
      tournament_id: tournamentId,
      game_id: gameCode,
      game_order: nextOrder++,
      round_number: roundNumber,
      match_index: matchIndex,
      player_a_id: aId,
      player_b_id: bId,
      status: 'pending',
    })
    if (tgError) {
      // Roll back the orphan game row.
      await admin.from('games').delete().eq('id', gameCode)
      return NextResponse.json({ error: internalErrorMessage('tournaments/code/rounds', tgError) }, { status: 500 })
    }

    matchIndex++
  }

  // Bye players advance automatically — a finished, game-less match row.
  for (const byeId of byes) {
    const { error: byeError } = await admin.from('tournament_games').insert({
      tournament_id: tournamentId,
      game_id: null,
      game_order: nextOrder++,
      round_number: roundNumber,
      match_index: matchIndex,
      player_a_id: byeId,
      player_b_id: null,
      is_bye: true,
      winner_player_id: byeId,
      status: 'finished',
    })
    if (byeError) {
      return NextResponse.json({ error: internalErrorMessage('tournaments/code/rounds', byeError) }, { status: 500 })
    }
    matchIndex++
  }

  if (tournament.status === 'waiting') {
    await admin.from('tournaments').update({ status: 'active' }).eq('id', tournamentId)
  }

  return NextResponse.json({ roundNumber, matches: matches.length, byes: byes.length })
}
