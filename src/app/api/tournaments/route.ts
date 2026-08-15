import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { generateGameCode, generateToken } from '@/lib/utils'
import {
  createTournamentSchema,
  H2H_ELIGIBLE_TYPES,
  KNOCKOUT_ELIGIBLE_TYPES,
  SCHOOL_ELIGIBLE_TYPES,
  TOURNAMENT_ELIGIBLE_TYPES,
} from '@/lib/tournament-validation'
import { buildTournamentGameConfig } from '@/lib/tournament-game-config'
import { parseStoredTriviaQuestions } from '@/lib/custom-questions'

export async function POST(req: NextRequest) {
  // Service role: `tournaments` is INSERT-locked for anon since 20260803120000, and the row
  // carries the host_token this route vends back to the creator. Resolved inside the handler
  // so a missing key surfaces as a request error rather than a module-load crash.
  const supabase = getSupabaseAdmin()

  const { data: body, error: bodyError } = await parseJsonBody(req, createTournamentSchema)
  if (bodyError) return bodyError

  const {
    title,
    format,
    gameType,
    gameConfig,
    placementPoints,
    targetGameCount,
    maxPlayers,
    eliminationConfig,
    gameQueue,
    customTriviaPack,
    branding,
    scheduledAt,
  } = body
  const hostToken = generateToken()

  // The pre-planned round-robin playlist. Only accepted for round-robin; other
  // formats have their game chosen at creation. Every entry must be an
  // eligible round-robin game type — the same whitelist the freestyle "add a
  // game" route enforces. Empty/omitted = freestyle mode (host picks live).
  const resolvedGameQueue = (() => {
    if (!gameQueue || gameQueue.length === 0) return null
    if (format && format !== 'round-robin') return null
    for (const entry of gameQueue) {
      if (!TOURNAMENT_ELIGIBLE_TYPES.includes(entry.gameType as (typeof TOURNAMENT_ELIGIBLE_TYPES)[number])) {
        return { error: `Game "${entry.gameType}" isn't available for tournament playlists` }
      }
    }
    return gameQueue
  })()
  if (resolvedGameQueue && 'error' in resolvedGameQueue) {
    return NextResponse.json({ error: resolvedGameQueue.error }, { status: 400 })
  }

  // Optional shared trivia question pack — CSV or AI upload attached at
  // creation. Re-validated through the same parser the /api/games trivia
  // create path uses, so a malformed upload never reaches the DB. Empty /
  // omitted means "use the platform bank" (today's behaviour). Only stored
  // for round-robin — other formats have their game chosen elsewhere.
  const parsedCustomTriviaPack =
    Array.isArray(customTriviaPack) && customTriviaPack.length > 0 && (format ?? 'round-robin') === 'round-robin'
      ? parseStoredTriviaQuestions(customTriviaPack)
      : []
  if (Array.isArray(customTriviaPack) && customTriviaPack.length > 0 && parsedCustomTriviaPack.length === 0) {
    return NextResponse.json(
      { error: 'Trivia pack had no valid questions — check the CSV format and try again' },
      { status: 400 }
    )
  }
  const resolvedCustomTriviaPack = parsedCustomTriviaPack.length > 0 ? parsedCustomTriviaPack : null

  // Event branding: drop any all-null branding blob so a "cleared" form
  // doesn't cost a jsonb row for no reason. Otherwise store as-is (schema
  // has already validated hex colours + URL shape).
  const brandingHasAny = branding && (branding.primaryColor || branding.accentColor || branding.logoUrl)
  const resolvedBranding = brandingHasAny ? branding : null

  // Head-to-head (1v1 bracket) and knockout (group elimination) are each played
  // with a single game chosen at creation; knockout also stores its per-round
  // group-game config (trivia: questions per round + timer).
  const isH2H = format === 'head-to-head'
  const isKnockout = format === 'knockout'
  const isSchool = format === 'school'
  const h2hGameType = gameType ?? H2H_ELIGIBLE_TYPES[0]
  const knockoutGameType = gameType ?? KNOCKOUT_ELIGIBLE_TYPES[0]
  const schoolGameType = gameType ?? SCHOOL_ELIGIBLE_TYPES[0]
  if (isH2H && !H2H_ELIGIBLE_TYPES.includes(h2hGameType as (typeof H2H_ELIGIBLE_TYPES)[number])) {
    return NextResponse.json({ error: `Game "${gameType}" isn't available for head-to-head` }, { status: 400 })
  }
  if (isKnockout && !KNOCKOUT_ELIGIBLE_TYPES.includes(knockoutGameType as (typeof KNOCKOUT_ELIGIBLE_TYPES)[number])) {
    return NextResponse.json({ error: `Game "${gameType}" isn't available for knockout` }, { status: 400 })
  }
  if (isSchool && !SCHOOL_ELIGIBLE_TYPES.includes(schoolGameType as (typeof SCHOOL_ELIGIBLE_TYPES)[number])) {
    return NextResponse.json({ error: `Game "${gameType}" isn't available for school mode` }, { status: 400 })
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

  // The game a bracket/knockout/school tournament is played with, and its per-round
  // config (house rules, dictionary, timers, ladder, trivia settings) — clamped by
  // the shared builder so creation and later host edits produce the same shape.
  const resolvedFormat = format ?? 'round-robin'
  const resolvedGameType = isH2H ? h2hGameType : isKnockout ? knockoutGameType : isSchool ? schoolGameType : null

  const { error } = await supabase.from('tournaments').insert({
    id: tournamentCode,
    host_token: hostToken,
    title,
    format: resolvedFormat,
    game_type: resolvedGameType,
    game_config: buildTournamentGameConfig(resolvedFormat, resolvedGameType, gameConfig),
    placement_points: placementPoints ?? [10, 7, 5, 3, 2, 1],
    target_game_count: targetGameCount ?? null,
    max_players: maxPlayers ?? null,
    elimination_config: eliminationConfig ?? null,
    game_queue: resolvedGameQueue,
    custom_trivia_pack: resolvedCustomTriviaPack,
    branding: resolvedBranding,
    scheduled_at: scheduledAt ?? null,
  })

  if (error) {
    return NextResponse.json({ error: internalErrorMessage('tournaments', error) }, { status: 500 })
  }

  return NextResponse.json({ tournamentCode, hostToken })
}
