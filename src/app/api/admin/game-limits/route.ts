import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import {
  fetchGamePlayerLimits,
  GAME_LIMIT_CODE_DEFAULTS,
  invalidateGamePlayerLimitsCache,
  type LobbyLimitGameType,
} from '@/lib/game-limits'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'
import { patchGamePlayerLimitsSchema } from '@/lib/validation'

export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required to manage game limits.' }, { status: 503 })
  }

  const supabase = getSupabaseAdmin()
  const limits = await fetchGamePlayerLimits(supabase)
  return NextResponse.json({ limits })
}

export async function PATCH(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required to manage game limits.' }, { status: 503 })
  }

  const raw = await req.json()
  const parsed = patchGamePlayerLimitsSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  for (const entry of parsed.data.limits) {
    const gameType = entry.game_type as LobbyLimitGameType
    const { min, max } = GAME_LIMIT_CODE_DEFAULTS[gameType]
    if (entry.max_players < min) {
      return NextResponse.json({ error: `${gameType} max players must be at least ${min}` }, { status: 400 })
    }
    if (entry.max_players > max) {
      return NextResponse.json({ error: `${gameType} max players can't exceed ${max}` }, { status: 400 })
    }

    const { error } = await supabase.from('game_player_limits').upsert(
      {
        game_type: gameType,
        max_players: entry.max_players,
        updated_at: now,
      },
      { onConflict: 'game_type' }
    )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  invalidateGamePlayerLimitsCache()
  const limits = await fetchGamePlayerLimits(supabase)
  return NextResponse.json({ limits })
}
