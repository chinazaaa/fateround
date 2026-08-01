import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

const supabase = getSupabaseAnon()

/**
 * Per-session snapshots for a game code.
 *
 * ⚠️ STILL UNAUTHENTICATED, deliberately (audit finding M4). Adding a token check here would
 * be theatre on its own: `game_snapshots` is anon-SELECTable at the DB, and `/history/[code]`
 * — a public, shareable results page — reads the same rows directly with the anon key. Both
 * follow the "reads stay public" decision recorded in docs/rls-hardening.md.
 *
 * Genuinely closing this means deciding whether shared results pages stay public (audit
 * finding H5). That is a product call, not a code change, and it has to be made before the
 * table can be locked. Until then this endpoint gets a flood backstop and nothing more —
 * do not read the rate limit as an access control.
 */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, RATE_LIMITS.gameSnapshots)
  if (limited) return limited

  const gameId = req.nextUrl.searchParams.get('gameId')?.toUpperCase()
  if (!gameId) {
    return NextResponse.json({ error: 'gameId is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('game_snapshots')
    .select('*')
    .eq('game_id', gameId)
    .order('session_number', { ascending: true })

  if (error) return NextResponse.json({ error: internalErrorMessage('game-snapshots', error) }, { status: 500 })
  return NextResponse.json({ snapshots: data ?? [] })
}
