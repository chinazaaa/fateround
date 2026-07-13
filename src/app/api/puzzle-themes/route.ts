import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isPuzzleThemeGameType, toPuzzleThemeMeta } from '@/lib/puzzle-themes'

/**
 * Public list of admin-authored themes for a game type, for the create-game theme dropdown
 * (web + mobile). Returns METADATA ONLY (id, name, difficulty, count) — never `entries`, which
 * hold crossword/scramble answers. The entries are folded into the game server-side at create.
 *
 * Reads via the service role because `puzzle_themes` has RLS with no anon policy, and the
 * response is explicitly narrowed to non-secret columns.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const gameType = searchParams.get('game_type')
  if (!isPuzzleThemeGameType(gameType)) {
    return NextResponse.json({ error: 'game_type must be crossword, word_search, or word_scramble' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('puzzle_themes')
    .select('id, game_type, name, difficulty, entry_count')
    .eq('game_type', gameType)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: internalErrorMessage('puzzle-themes', error) }, { status: 500 })
  return NextResponse.json({ themes: (data ?? []).map(toPuzzleThemeMeta) })
}
