import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseGameType, isWhoSaidThis } from '@/lib/game-types'
import { assertHostGame, assertPlayer } from '@/lib/game-admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/** Validate a player/host-submitted Who Said This question: a quote plus 2–4 answer options
 *  with one marked correct. Returns the normalised value or an error message. */
function parseSubmittedQuestion(body: {
  quoteText?: unknown
  options?: unknown
  correctIndex?: unknown
}): { quote: string; options: string[]; correctIndex: number } | { error: string } {
  const quote = typeof body.quoteText === 'string' ? body.quoteText.trim() : ''
  if (!quote) return { error: 'Enter a quote before submitting' }
  if (quote.length > 500) return { error: 'Quote is too long (500 characters max)' }

  const rawOptions = Array.isArray(body.options) ? body.options : []
  const options = rawOptions
    .map((o) => (typeof o === 'string' ? o.trim() : ''))
    .filter(Boolean)
    .slice(0, 4)
  if (options.length < 2) return { error: 'Add at least 2 answer options' }
  if (options.some((o) => o.length > 200)) return { error: 'An option is too long (200 characters max)' }

  const correctIndex = Number(body.correctIndex)
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    return { error: 'Mark which option is the correct answer' }
  }
  return { quote, options, correctIndex }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { resumeToken, hostToken, gameId, quoteId } = body

  if (!gameId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const isHostRequest = typeof hostToken === 'string' && hostToken.trim().length > 0
  if (!isHostRequest && (typeof resumeToken !== 'string' || !resumeToken.trim())) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const parsed = parseSubmittedQuestion(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { quote, options, correctIndex } = parsed

  const gameIdUpper = gameId.toUpperCase()
  const quoteIdTrimmed = typeof quoteId === 'string' ? quoteId.trim() : ''
  const now = new Date().toISOString()

  // Resolve auth (host or player) + the owning player_id (null for host-added questions).
  let ownerPlayerId: string | null = null
  if (isHostRequest) {
    const auth = await assertHostGame(supabase, gameIdUpper, hostToken.trim())
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (!isWhoSaidThis(parseGameType(auth.game!.game_type))) {
      return NextResponse.json({ error: 'This game type does not use a quote pool' }, { status: 400 })
    }
  } else {
    const playerAuth = await assertPlayer(supabase, gameIdUpper, resumeToken)
    if (playerAuth.error) return NextResponse.json({ error: playerAuth.error }, { status: playerAuth.status })
    ownerPlayerId = playerAuth.player.id
    const { data: game } = await supabase.from('games').select('status, game_type').eq('id', gameIdUpper).maybeSingle()
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    if (!isWhoSaidThis(parseGameType(game.game_type))) {
      return NextResponse.json({ error: 'This game type does not use a quote pool' }, { status: 400 })
    }
    if (game.status !== 'waiting') {
      return NextResponse.json({ error: 'Submissions are closed — the game has already started' }, { status: 400 })
    }
  }

  // Edit an existing question (own for players; host-added for the host).
  if (quoteIdTrimmed) {
    const { data: existing } = await supabase
      .from('wst_quote_pool')
      .select('id, player_id')
      .eq('id', quoteIdTrimmed)
      .eq('game_id', gameIdUpper)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    if (isHostRequest ? existing.player_id != null : existing.player_id !== ownerPlayerId) {
      return NextResponse.json({ error: 'You can only edit your own questions' }, { status: 403 })
    }
    const { data, error } = await supabase
      .from('wst_quote_pool')
      .update({ quote_text: quote, options, correct_index: correctIndex, updated_at: now })
      .eq('id', quoteIdTrimmed)
      .select()
      .single()
    if (error) return NextResponse.json({ error: internalErrorMessage('wst-quotes', error) }, { status: 500 })
    return NextResponse.json({ success: true, entry: data })
  }

  const { data, error } = await supabase
    .from('wst_quote_pool')
    .insert({
      game_id: gameIdUpper,
      player_id: ownerPlayerId,
      quote_text: quote,
      options,
      correct_index: correctIndex,
      author_participant_id: null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: internalErrorMessage('wst-quotes', error) }, { status: 500 })
  return NextResponse.json({ success: true, entry: data })
}

export async function DELETE(req: NextRequest) {
  const { resumeToken, hostToken, gameId, quoteId } = await req.json()

  if (!gameId || !quoteId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const isHostRequest = typeof hostToken === 'string' && hostToken.trim().length > 0
  if (!isHostRequest && (typeof resumeToken !== 'string' || !resumeToken.trim())) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const gameIdUpper = gameId.toUpperCase()
  const quoteIdTrimmed = typeof quoteId === 'string' ? quoteId.trim() : ''
  if (!quoteIdTrimmed) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (isHostRequest) {
    const auth = await assertHostGame(supabase, gameIdUpper, hostToken.trim())
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { data: existing } = await supabase
      .from('wst_quote_pool')
      .select('id, player_id')
      .eq('id', quoteIdTrimmed)
      .eq('game_id', gameIdUpper)
      .maybeSingle()

    if (!existing) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    if (existing.player_id != null) {
      return NextResponse.json({ error: 'You can only remove host-added quotes here' }, { status: 403 })
    }

    const { error } = await supabase.from('wst_quote_pool').delete().eq('id', quoteIdTrimmed)
    if (error) return NextResponse.json({ error: internalErrorMessage('wst-quotes', error) }, { status: 500 })

    return NextResponse.json({ success: true })
  }

  // Player path: authorize by the secret resume_token; the resolved player is authoritative.
  const playerAuth = await assertPlayer(supabase, gameIdUpper, resumeToken)
  if (playerAuth.error) return NextResponse.json({ error: playerAuth.error }, { status: playerAuth.status })
  const player = playerAuth.player

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', gameIdUpper).maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'waiting') {
    return NextResponse.json({ error: 'Quote pool is closed' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('wst_quote_pool')
    .select('id, player_id')
    .eq('id', quoteIdTrimmed)
    .eq('game_id', gameIdUpper)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
  if (existing.player_id !== player.id) {
    return NextResponse.json({ error: 'You can only remove your own quotes' }, { status: 403 })
  }

  const { error } = await supabase.from('wst_quote_pool').delete().eq('id', quoteIdTrimmed)

  if (error) return NextResponse.json({ error: internalErrorMessage('wst-quotes', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
