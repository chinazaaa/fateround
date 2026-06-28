import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseGameType, isCodewordsGame } from '@/lib/game-types'
import { codewordsAllowsPlayerChanges, removeCodewordsPlayerRole } from '@/lib/codewords'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const hostRoleSchema = z.object({
  gameId: z.string().min(4).max(10),
  hostToken: z.string().min(1),
  playerId: z.string().uuid(),
  team: z.enum(['red', 'blue']),
  role: z.enum(['spymaster', 'operative']),
})

const hostUnassignSchema = z.object({
  gameId: z.string().min(4).max(10),
  hostToken: z.string().min(1),
  playerId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = hostRoleSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, hostToken, playerId, team, role } = parsed.data
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('host_token, game_type, status')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (!isCodewordsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a codewords game' }, { status: 400 })
  }
  if (!codewordsAllowsPlayerChanges(game.status)) {
    return NextResponse.json({ error: 'Teams can only be changed while the lobby or game is open' }, { status: 400 })
  }

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('game_id', code)
    .maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  if (role === 'spymaster') {
    const { data: existing } = await supabase
      .from('codewords_player_roles')
      .select('player_id')
      .eq('game_id', code)
      .eq('team', team)
      .eq('role', 'spymaster')
      .maybeSingle()

    if (existing && existing.player_id !== playerId) {
      await supabase
        .from('codewords_player_roles')
        .update({ role: 'operative' })
        .eq('game_id', code)
        .eq('player_id', existing.player_id)
    }
  }

  const { data: roleRow, error } = await supabase
    .from('codewords_player_roles')
    .upsert({ game_id: code, player_id: playerId, team, role }, { onConflict: 'game_id,player_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, role: roleRow })
}

export async function DELETE(req: NextRequest) {
  const raw = await req.json()
  const parsed = hostUnassignSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, hostToken, playerId } = parsed.data
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('host_token, game_type, status')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (!isCodewordsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a codewords game' }, { status: 400 })
  }
  if (!codewordsAllowsPlayerChanges(game.status)) {
    return NextResponse.json({ error: 'Players can only be moved while the lobby or game is open' }, { status: 400 })
  }

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('game_id', code)
    .maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const { data: role } = await supabase
    .from('codewords_player_roles')
    .select('id')
    .eq('game_id', code)
    .eq('player_id', playerId)
    .maybeSingle()
  if (!role) return NextResponse.json({ error: 'Player is not on a team' }, { status: 400 })

  const { error } = await removeCodewordsPlayerRole(supabase, code, playerId)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ success: true })
}
