import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseGameType } from '@/lib/game-types'
import { isGameGenderBased } from '@/lib/gender-based'
import { normalizeGender } from '@/lib/participants'
import { lobbyAllowsPlayerNameSubmissions } from '@/lib/player-participant-pool'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').trim()

const submitNameSchema = z.object({
  gameId: z.string().min(1),
  resumeToken: z.string().min(4),
  name: z.string().min(1).max(50),
  gender: z.enum(['male', 'female']).optional(),
})

const deleteNameSchema = z.object({
  participantId: z.string().uuid(),
  resumeToken: z.string().min(4),
})

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, submitNameSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, name: rawName, gender: rawGender } = body
  const upperGameId = gameId.toUpperCase()
  const name = stripHtml(rawName)
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', upperGameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  // Authorize by the secret resume_token; the resolved player is authoritative (the client
  // no longer supplies its own playerId).
  const auth = await assertPlayer(supabase, upperGameId, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

  if (game.status !== 'waiting') {
    return NextResponse.json({ error: 'Names can only be submitted before the game starts' }, { status: 400 })
  }

  parseGameType(game.game_type)
  if (!lobbyAllowsPlayerNameSubmissions(game)) {
    return NextResponse.json({ error: 'Player name submissions are disabled for this game' }, { status: 400 })
  }

  const genderBased = isGameGenderBased(game)
  const gender = genderBased ? normalizeGender(String(rawGender ?? '')) : 'female'
  if (genderBased && !gender) {
    return NextResponse.json({ error: 'Gender must be male or female' }, { status: 400 })
  }

  const { count } = await supabase
    .from('participants')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', upperGameId)
    .eq('submitted_by_player_id', playerId)
  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'You can submit up to 10 names per game' }, { status: 400 })
  }

  const { data: existing } = await supabase.from('participants').select('name').eq('game_id', upperGameId)
  const taken = (existing ?? []).some((p) => p.name.toLowerCase() === name.toLowerCase())
  if (taken) {
    return NextResponse.json({ error: `"${name}" is already on the list` }, { status: 400 })
  }

  const { data: lastRow } = await supabase
    .from('participants')
    .select('display_order')
    .eq('game_id', upperGameId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: created, error } = await supabase
    .from('participants')
    .insert({
      game_id: upperGameId,
      name,
      gender: gender ?? 'female',
      display_order: (lastRow?.display_order ?? -1) + 1,
      submitted_by_player_id: playerId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ participant: created })
}

export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get('gameId')?.toUpperCase()
  if (!gameId) {
    return NextResponse.json({ error: 'gameId is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('game_id', gameId)
    .not('submitted_by_player_id', 'is', null)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ participants: data ?? [] })
}

export async function DELETE(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, deleteNameSchema)
  if (bodyError) return bodyError

  const { participantId, resumeToken } = body

  const supabase = getSupabaseAdmin()

  const { data: participant } = await supabase
    .from('participants')
    .select('id, submitted_by_player_id, game_id')
    .eq('id', participantId)
    .maybeSingle()

  if (!participant) return NextResponse.json({ error: 'Name not found' }, { status: 404 })
  if (!participant.submitted_by_player_id) {
    return NextResponse.json({ error: 'Only player-submitted names can be removed this way' }, { status: 403 })
  }

  // Authorize by the secret resume_token; the resolved player is authoritative (the client
  // no longer supplies its own playerId).
  const auth = await assertPlayer(supabase, participant.game_id, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (participant.submitted_by_player_id !== auth.player.id) {
    return NextResponse.json({ error: 'You can only remove your own submissions' }, { status: 403 })
  }

  const { data: game } = await supabase.from('games').select('status').eq('id', participant.game_id).maybeSingle()
  if (game?.status !== 'waiting') {
    return NextResponse.json({ error: 'Names can only be removed before the game starts' }, { status: 400 })
  }

  const { error } = await supabase.from('participants').delete().eq('id', participantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
