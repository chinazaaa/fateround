import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import { getGames } from '@/lib/community-data'
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
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await assertAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const blocked = serviceGuard()
  if (blocked) return blocked

  const body = await req.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const accent = typeof body.accent === 'string' && body.accent.trim() ? body.accent.trim() : null
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const existing = await getGames()
  // Unique slug (append -2, -3, … on collision).
  const base = slugify(name) || 'game'
  let slug = base
  let n = 2
  const slugs = new Set(existing.map((g) => g.slug))
  while (slugs.has(slug)) slug = `${base}-${n++}`
  const sortOrder = existing.reduce((max, g) => Math.max(max, g.sort_order), 0) + 1

  const { error } = await supabase.from('community_games').insert({ name, slug, accent, sort_order: sortOrder })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('community_games').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ games: await getGames() })
}
