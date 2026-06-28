import { NextRequest, NextResponse } from 'next/server'
import { ttlStatementSchema } from '@/lib/validation'
import { parseGameType, isTwoTruthsGame } from '@/lib/game-types'
import { TTL_MAX_STATEMENT_LENGTH } from '@/lib/two-truths'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = ttlStatementSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, resumeToken, statementA, statementB, statementC, lieIndex } = parsed.data
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isTwoTruthsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a two truths game' }, { status: 400 })
  }
  if (game.status !== 'waiting') {
    return NextResponse.json({ error: 'Statements can only be submitted in the lobby' }, { status: 400 })
  }

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const statements = [statementA.trim(), statementB.trim(), statementC.trim()]
  if (statements.some((s) => s.length > TTL_MAX_STATEMENT_LENGTH)) {
    return NextResponse.json(
      { error: `Each statement must be ${TTL_MAX_STATEMENT_LENGTH} characters or less` },
      { status: 400 }
    )
  }
  if (new Set(statements.map((s) => s.toLowerCase())).size < 3) {
    return NextResponse.json({ error: 'All three statements must be different' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('ttl_statements')
    .upsert(
      {
        game_id: code,
        player_id: auth.player.id,
        statement_a: statements[0],
        statement_b: statements[1],
        statement_c: statements[2],
        lie_index: lieIndex,
        updated_at: now,
      },
      { onConflict: 'game_id,player_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, statement: data })
}
