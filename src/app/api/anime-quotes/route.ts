import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchAnimeQuotes } from '@/lib/anime-quotes'
import { fetchAnimeQuotesSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = fetchAnimeQuotesSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { count, gameId, hostToken } = parsed.data
  const gameCode = gameId.toUpperCase()

  const admin = getSupabaseAdmin()

  const { data: game } = await admin
    .from('games')
    .select('host_token, status, game_type')
    .eq('id', gameCode)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'waiting') return NextResponse.json({ error: 'Game already started' }, { status: 400 })
  if (game.game_type !== 'who_said_this')
    return NextResponse.json({ error: 'Game is not Who Said This' }, { status: 400 })

  try {
    const quotes = await fetchAnimeQuotes(count)

    if (quotes.length > 0) {
      const rows = quotes.map((q) => ({
        game_id: gameCode,
        quote_text: q.quote_text,
        anime_name: q.anime_name,
        correct_character: q.correct_character,
        choices: q.choices,
      }))

      const { error } = await admin.from('anime_quote_pool').insert(rows)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: pool } = await admin
      .from('anime_quote_pool')
      .select('*')
      .eq('game_id', gameCode)
      .eq('removed', false)
      .order('created_at')

    return NextResponse.json({ quotes: pool ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch anime quotes'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

// Host removes one anime quote from the lobby pool. anime_quote_pool is RLS-locked to anon
// writes, so this must run host-authorized through the service role.
export async function DELETE(req: NextRequest) {
  const raw = await req.json().catch(() => ({}))
  const gameId = typeof raw?.gameId === 'string' ? raw.gameId : ''
  const hostToken = typeof raw?.hostToken === 'string' ? raw.hostToken : ''
  const quoteId = typeof raw?.quoteId === 'string' ? raw.quoteId : ''
  if (!gameId || !hostToken || !quoteId) {
    return NextResponse.json({ error: 'gameId, hostToken and quoteId are required' }, { status: 400 })
  }
  const gameCode = gameId.toUpperCase()
  const admin = getSupabaseAdmin()

  const { data: game } = await admin
    .from('games')
    .select('host_token, status, game_type')
    .eq('id', gameCode)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'waiting') return NextResponse.json({ error: 'Game already started' }, { status: 400 })
  if (game.game_type !== 'who_said_this')
    return NextResponse.json({ error: 'Game is not Who Said This' }, { status: 400 })

  const { data: removed, error } = await admin
    .from('anime_quote_pool')
    .update({ removed: true })
    .eq('id', quoteId)
    .eq('game_id', gameCode)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!removed || removed.length === 0) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
