import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getGames } from '@/lib/community-data'
import { GAME_TYPE_CONFIG } from '@/lib/game-types'
import type { GameType } from '@/types'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function serviceGuard() {
  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is required to manage the leaderboard.' },
      { status: 503 }
    )
  }
  return null
}

export async function GET(req: NextRequest) {
  if (!(await assertAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const blocked = serviceGuard()
  if (blocked) return blocked
  try {
    return NextResponse.json({ games: await getGames() })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('admin/community/games', err, 'Failed') }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await assertAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const blocked = serviceGuard()
  if (blocked) return blocked

  const body = await req.json().catch(() => ({}))

  // Preferred path: admin picks a game type from the dropdown. We derive the
  // name/accent/slug from the game-type config so the leaderboard row maps
  // exactly to an in-app GameType. Name/accent overrides are still honoured.
  const rawType = typeof body.gameType === 'string' ? body.gameType : ''
  const cfg = rawType ? GAME_TYPE_CONFIG[rawType as GameType] : undefined
  if (rawType && !cfg) return NextResponse.json({ error: 'Unknown game type' }, { status: 400 })

  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : (cfg?.label ?? '')
  const accent = typeof body.accent === 'string' && body.accent.trim() ? body.accent.trim() : (cfg?.card.accent ?? null)
  const gameType = cfg?.id ?? null
  if (!name) return NextResponse.json({ error: 'Pick a game type' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const existing = await getGames()

  // One leaderboard row per game type — adding the same type twice is a no-op
  // that would only confuse the self-post mapping.
  if (gameType && existing.some((g) => g.game_type === gameType)) {
    return NextResponse.json({ error: `${name} is already on the leaderboard` }, { status: 409 })
  }

  // Unique slug (prefer the game type; append -2, -3, … on collision).
  const base = (gameType ? gameType : slugify(name)) || 'game'
  let slug = base
  let n = 2
  const slugs = new Set(existing.map((g) => g.slug))
  while (slugs.has(slug)) slug = `${base}-${n++}`
  const sortOrder = existing.reduce((max, g) => Math.max(max, g.sort_order), 0) + 1

  const { error } = await supabase
    .from('community_games')
    .insert({ name, slug, accent, game_type: gameType, sort_order: sortOrder })
  if (error) return NextResponse.json({ error: internalErrorMessage('admin/community/games', error) }, { status: 500 })
  return NextResponse.json({ games: await getGames() })
}

export async function PATCH(req: NextRequest) {
  if (!(await assertAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const blocked = serviceGuard()
  if (blocked) return blocked

  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim()
  if (typeof body.accent === 'string') update.accent = body.accent.trim() || null
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active
  if (typeof body.sort_order === 'number' && Number.isInteger(body.sort_order)) update.sort_order = body.sort_order
  if ('game_type' in body) {
    const gt = typeof body.game_type === 'string' ? body.game_type.trim() : ''
    if (gt && !GAME_TYPE_CONFIG[gt as GameType]) {
      return NextResponse.json({ error: 'Unknown game type' }, { status: 400 })
    }
    update.game_type = gt || null
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('community_games').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: internalErrorMessage('admin/community/games', error) }, { status: 500 })
  return NextResponse.json({ games: await getGames() })
}

export async function DELETE(req: NextRequest) {
  if (!(await assertAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const blocked = serviceGuard()
  if (blocked) return blocked

  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  // Don't destroy leaderboard history: games with recorded winners can't be
  // deleted (the FK is ON DELETE RESTRICT). Tell the admin to hide it instead.
  const { count } = await supabase
    .from('community_results')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', id)
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'This game has recorded winners. Hide it (toggle it off) instead of deleting to keep the history.' },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('community_games').delete().eq('id', id)
  if (error) return NextResponse.json({ error: internalErrorMessage('admin/community/games', error) }, { status: 500 })
  return NextResponse.json({ games: await getGames() })
}
