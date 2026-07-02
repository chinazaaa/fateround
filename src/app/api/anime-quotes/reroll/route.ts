import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { fetchSingleAnimeQuote } from '@/lib/anime-quotes'
import { rerollAnimeQuoteSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, rerollAnimeQuoteSchema)
  if (bodyError) return bodyError

  const { gameId, quoteId, hostToken } = body
  const gameCode = gameId.toUpperCase()

  const admin = getSupabaseAdmin()

  const { data: game } = await admin.from('games').select('host_token, status').eq('id', gameCode).maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'waiting') return NextResponse.json({ error: 'Game already started' }, { status: 400 })

  const { error: removeError } = await admin
    .from('anime_quote_pool')
    .update({ removed: true })
    .eq('id', quoteId)
    .eq('game_id', gameCode)

  if (removeError)
    return NextResponse.json({ error: internalErrorMessage('anime-quotes/reroll', removeError) }, { status: 500 })

  try {
    const newQuote = await fetchSingleAnimeQuote()
    if (!newQuote) {
      return NextResponse.json({ error: 'Could not find a replacement quote — try again' }, { status: 502 })
    }

    const { error: insertError } = await admin.from('anime_quote_pool').insert({
      game_id: gameCode,
      quote_text: newQuote.quote_text,
      anime_name: newQuote.anime_name,
      correct_character: newQuote.correct_character,
      choices: newQuote.choices,
    })

    if (insertError)
      return NextResponse.json({ error: internalErrorMessage('anime-quotes/reroll', insertError) }, { status: 500 })

    const { data: pool } = await admin
      .from('anime_quote_pool')
      .select('*')
      .eq('game_id', gameCode)
      .eq('removed', false)
      .order('created_at')

    return NextResponse.json({ quotes: pool ?? [] })
  } catch (err) {
    const message = internalErrorMessage('anime-quotes/reroll', err, 'Failed to fetch replacement quote')
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
