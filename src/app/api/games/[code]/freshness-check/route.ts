import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseGameType } from '@/lib/game-types'
import { parseQuestionSource } from '@/lib/custom-questions'
import { loadPlatformEntries } from '@/lib/platform-content'
import { fetchSeenContentForPlayers } from '@/lib/seen-content'

const HARDCODED_POOL_SIZES: Record<string, number> = {
  trivia: 100,
  most_likely_to: 200,
  would_you_rather: 200,
  never_have_i_ever: 120,
  pick_a_number: 80,
  this_or_that: 120,
  quiplash: 50,
  quick_draw: 50,
  codewords: 200,
  crossword: 150,
  word_search: 150,
  word_scramble: 100,
  word_grouping: 48,
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()

  let body: { hostToken?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const hostToken = typeof body?.hostToken === 'string' ? body.hostToken : ''
  if (!hostToken) return NextResponse.json({ error: 'Missing hostToken' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('host_token, status, game_type, question_source')
    .eq('id', gameId)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'waiting') return NextResponse.json({ error: 'Game not in waiting state' }, { status: 400 })

  const gameType = parseGameType(game.game_type)
  const questionSource = parseQuestionSource(game.question_source, gameType)

  const emptyResult = (totalPlayers: number, authPlayers: number) => ({
    fresh: true,
    totalPool: 0,
    seenByMost: 0,
    seenPercent: 0,
    authenticatedPlayers: authPlayers,
    totalPlayers,
  })

  if (questionSource !== 'platform') {
    return NextResponse.json(emptyResult(0, 0))
  }

  const { data: playersData } = await supabase.from('players').select('profile_id').eq('game_id', gameId)

  const totalPlayers = playersData?.length ?? 0
  const profileIds = (playersData ?? [])
    .map((p) => p.profile_id as string | null)
    .filter((id): id is string => id != null)

  if (profileIds.length < 2) {
    return NextResponse.json(emptyResult(totalPlayers, profileIds.length))
  }

  const seenCounts = await fetchSeenContentForPlayers(supabase, profileIds, gameType)

  const platformEntries = await loadPlatformEntries<unknown>(supabase, gameType)
  const poolSize = platformEntries.length > 0 ? platformEntries.length : (HARDCODED_POOL_SIZES[gameType] ?? 100)

  const halfPlayers = profileIds.length / 2
  let seenByMost = 0
  for (const count of seenCounts.values()) {
    if (count > halfPlayers) seenByMost++
  }

  const seenPercent = poolSize > 0 ? Math.round((seenByMost / poolSize) * 100) : 0

  return NextResponse.json({
    fresh: seenPercent < 60,
    totalPool: poolSize,
    seenByMost,
    seenPercent,
    authenticatedPlayers: profileIds.length,
    totalPlayers,
  })
}
