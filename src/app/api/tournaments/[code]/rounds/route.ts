import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { generateGameCode, generateToken } from '@/lib/utils'
import { startTournamentRoundSchema } from '@/lib/tournament-validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeRoundGroups, computeRoundPairings, resolveGroupSize } from '@/lib/tournament-bracket'

// Fallback for tournaments created before game_type was stored.
const DEFAULT_H2H_GAME_TYPE = 'chess'
const DEFAULT_TIMER_SECONDS = 600
// Per-turn timer for Whot/Scrabble group rooms, so a no-show can't stall a round.
const DEFAULT_GROUP_TURN_SECONDS = 45

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** A game code not already taken, or null after 10 attempts. */
async function uniqueGameCode(admin: SupabaseClient): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateGameCode()
    const { data: existing } = await admin.from('games').select('id').eq('id', candidate).maybeSingle()
    if (!existing) return candidate
  }
  return null
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
  if (tournament.format !== 'head-to-head' && tournament.format !== 'knockout') {
    return NextResponse.json({ error: 'This tournament does not run bracket rounds' }, { status: 400 })
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

  // Knockout: one group game per round with all survivors in it (no pairing).
  if (tournament.format === 'knockout') {
    const config = (tournament.game_config ?? {}) as {
      questionSource?: string
      roundsCount?: number
      timerSeconds?: number
    }

    const gameCode = await uniqueGameCode(admin)
    if (!gameCode) return NextResponse.json({ error: 'Failed to generate unique game code' }, { status: 500 })

    // Carry question usage from earlier rounds so players who advance never see a
    // repeated question — seed this round's game with prior rounds' usage, which
    // pickTriviaQuestions then avoids.
    const { data: priorTgames } = await admin
      .from('tournament_games')
      .select('game_id')
      .eq('tournament_id', tournamentId)
    const priorIds = (priorTgames ?? []).map((g) => g.game_id).filter((id): id is string => Boolean(id))
    const seededTriviaUsage: Record<string, number> = {}
    if (priorIds.length > 0) {
      const { data: priorGames } = await admin.from('games').select('pool_usage').in('id', priorIds)
      for (const g of priorGames ?? []) {
        const trivia = (g.pool_usage as { trivia?: Record<string, number> } | null)?.trivia ?? {}
        for (const [key, count] of Object.entries(trivia)) {
          seededTriviaUsage[key] = (seededTriviaUsage[key] ?? 0) + (count as number)
        }
      }
    }

    const { error: gameError } = await admin.from('games').insert({
      id: gameCode,
      host_token: generateToken(),
      title: `${tournament.title} — Round ${roundNumber}`,
      game_type: tournament.game_type ?? 'trivia',
      participant_mode: 'joiners',
      rounds_count: config.roundsCount ?? 5,
      timer_seconds: config.timerSeconds ?? 15,
      question_source: config.questionSource ?? 'platform',
      tournament_id: tournamentId,
      ...(Object.keys(seededTriviaUsage).length > 0 ? { pool_usage: { trivia: seededTriviaUsage } } : {}),
    })
    if (gameError) {
      return NextResponse.json({ error: internalErrorMessage('tournaments/code/rounds', gameError) }, { status: 500 })
    }

    const { error: tgError } = await admin.from('tournament_games').insert({
      tournament_id: tournamentId,
      game_id: gameCode,
      game_order: nextOrder,
      round_number: roundNumber,
      status: 'pending',
    })
    if (tgError) {
      await admin.from('games').delete().eq('id', gameCode)
      return NextResponse.json({ error: internalErrorMessage('tournaments/code/rounds', tgError) }, { status: 500 })
    }

    if (tournament.status === 'waiting') {
      await admin.from('tournaments').update({ status: 'active' }).eq('id', tournamentId)
    }
    return NextResponse.json({ roundNumber, players: survivorIds.length })
  }

  const groupSize = resolveGroupSize(tournament.game_config, tournament.game_type)

  // Group bracket (Whot/Scrabble): split survivors into rooms of up to `groupSize`
  // and spawn one game room per group. Only the room's winner advances; the rest
  // are eliminated when the game finishes (resolved in tournament-h2h).
  if (groupSize > 2) {
    const gameType = tournament.game_type ?? DEFAULT_H2H_GAME_TYPE
    const { groups, byes } = computeRoundGroups(shuffle(survivorIds), groupSize)
    let matchIndex = 0

    // Per-turn timer + the game's house rules / dictionary chosen at creation,
    // stamped onto every room so the whole bracket plays with the host's settings.
    const cfg = (tournament.game_config ?? {}) as {
      timerSeconds?: number
      gameDurationSeconds?: number
      whotPick3?: boolean
      whotCards?: boolean
      whotNumberCalls?: boolean
      whotPick2Stacking?: boolean
      scrabbleDictionary?: string
    }
    const roomTimer = typeof cfg.timerSeconds === 'number' ? cfg.timerSeconds : DEFAULT_GROUP_TURN_SECONDS
    // Overall room-length cap (0 = no limit); the games auto-finish past it.
    const roomDuration = typeof cfg.gameDurationSeconds === 'number' ? cfg.gameDurationSeconds : 0
    const gameSettings: Record<string, unknown> =
      gameType === 'whot'
        ? {
            whot_pick3_enabled: cfg.whotPick3 ?? true,
            whot_cards_enabled: cfg.whotCards ?? true,
            whot_number_calls_enabled: cfg.whotNumberCalls ?? true,
            whot_pick2_stacking: cfg.whotPick2Stacking ?? true,
          }
        : gameType === 'scrabble'
          ? { scrabble_dictionary_id: cfg.scrabbleDictionary ?? 'enable' }
          : {}

    for (const group of groups) {
      const gameCode = await uniqueGameCode(admin)
      if (!gameCode) return NextResponse.json({ error: 'Failed to generate unique game code' }, { status: 500 })

      const { error: gameError } = await admin.from('games').insert({
        id: gameCode,
        host_token: generateToken(),
        title: `${tournament.title} — Room ${matchIndex + 1}`,
        game_type: gameType,
        participant_mode: 'joiners',
        rounds_count: 1,
        timer_seconds: roomTimer,
        game_duration_seconds: roomDuration,
        tournament_id: tournamentId,
        ...gameSettings,
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
        member_ids: group,
        status: 'pending',
      })
      if (tgError) {
        await admin.from('games').delete().eq('id', gameCode)
        return NextResponse.json({ error: internalErrorMessage('tournaments/code/rounds', tgError) }, { status: 500 })
      }
      matchIndex++
    }

    // A lone survivor advances automatically — a finished, game-less room.
    for (const byeId of byes) {
      const { error: byeError } = await admin.from('tournament_games').insert({
        tournament_id: tournamentId,
        game_id: null,
        game_order: nextOrder++,
        round_number: roundNumber,
        match_index: matchIndex,
        member_ids: [byeId],
        player_a_id: byeId,
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
    return NextResponse.json({ roundNumber, rooms: groups.length, byes: byes.length })
  }

  // Who got a bye last round — so the pairing doesn't hand the same player a bye
  // two rounds running.
  const { data: priorByeRows } = await admin
    .from('tournament_games')
    .select('player_a_id')
    .eq('tournament_id', tournamentId)
    .eq('round_number', roundNumber - 1)
    .eq('is_bye', true)
  const priorByeIds = (priorByeRows ?? []).map((r) => r.player_a_id).filter((id): id is string => Boolean(id))

  const { matches, byes } = computeRoundPairings(shuffle(survivorIds), priorByeIds)
  // Prefer the per-player clock chosen at creation (0 = untimed is valid, so check
  // the type, not truthiness); fall back to a request override, then the default.
  const cfgTimer = (tournament.game_config as { timerSeconds?: number } | null)?.timerSeconds
  const timer = typeof cfgTimer === 'number' ? cfgTimer : (timerSeconds ?? DEFAULT_TIMER_SECONDS)
  const gameType = tournament.game_type ?? DEFAULT_H2H_GAME_TYPE

  let matchIndex = 0

  for (const [aId, bId] of matches) {
    const gameCode = await uniqueGameCode(admin)
    if (!gameCode) return NextResponse.json({ error: 'Failed to generate unique game code' }, { status: 500 })

    const { error: gameError } = await admin.from('games').insert({
      id: gameCode,
      host_token: generateToken(),
      title: `${tournament.title} — Match ${matchIndex + 1}`,
      game_type: gameType,
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
