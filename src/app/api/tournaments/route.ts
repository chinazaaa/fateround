import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { generateGameCode, generateToken } from '@/lib/utils'
import {
  createTournamentSchema,
  H2H_ELIGIBLE_TYPES,
  h2hGroupSize,
  KNOCKOUT_ELIGIBLE_TYPES,
} from '@/lib/tournament-validation'

const supabase = getSupabaseAnon()

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, createTournamentSchema)
  if (bodyError) return bodyError

  const { title, format, gameType, gameConfig, placementPoints, targetGameCount, maxPlayers, eliminationConfig } = body
  const hostToken = generateToken()

  // Head-to-head (1v1 bracket) and knockout (group elimination) are each played
  // with a single game chosen at creation; knockout also stores its per-round
  // group-game config (trivia: questions per round + timer).
  const isH2H = format === 'head-to-head'
  const isKnockout = format === 'knockout'
  const h2hGameType = gameType ?? H2H_ELIGIBLE_TYPES[0]
  const knockoutGameType = gameType ?? KNOCKOUT_ELIGIBLE_TYPES[0]
  if (isH2H && !H2H_ELIGIBLE_TYPES.includes(h2hGameType as (typeof H2H_ELIGIBLE_TYPES)[number])) {
    return NextResponse.json({ error: `Game "${gameType}" isn't available for head-to-head` }, { status: 400 })
  }
  if (isKnockout && !KNOCKOUT_ELIGIBLE_TYPES.includes(knockoutGameType as (typeof KNOCKOUT_ELIGIBLE_TYPES)[number])) {
    return NextResponse.json({ error: `Game "${gameType}" isn't available for knockout` }, { status: 400 })
  }

  let tournamentCode = ''
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateGameCode()
    const { data: existing } = await supabase.from('tournaments').select('id').eq('id', candidate).maybeSingle()
    if (!existing) {
      tournamentCode = candidate
      break
    }
  }

  if (!tournamentCode) {
    return NextResponse.json({ error: 'Failed to generate unique code' }, { status: 500 })
  }

  const { error } = await supabase.from('tournaments').insert({
    id: tournamentCode,
    host_token: hostToken,
    title,
    format: format ?? 'round-robin',
    game_type: isH2H ? h2hGameType : isKnockout ? knockoutGameType : null,
    game_config: isKnockout
      ? {
          questionSource: gameConfig?.questionSource ?? 'platform',
          roundsCount: gameConfig?.roundsCount ?? 5,
          timerSeconds: gameConfig?.timerSeconds ?? 15,
        }
      : isH2H
        ? // Fixes the bracket room size for the whole tournament (chess: 2, Whot/Scrabble: 4).
          { groupSize: h2hGroupSize(h2hGameType) }
        : null,
    placement_points: placementPoints ?? [10, 7, 5, 3, 2, 1],
    target_game_count: targetGameCount ?? null,
    max_players: maxPlayers ?? null,
    elimination_config: eliminationConfig ?? null,
  })

  if (error) {
    return NextResponse.json({ error: internalErrorMessage('tournaments', error) }, { status: 500 })
  }

  return NextResponse.json({ tournamentCode, hostToken })
}
