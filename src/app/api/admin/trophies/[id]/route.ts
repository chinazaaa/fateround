import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAdminRequest } from '@/lib/admin-api'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { criteriaUsesLiveMeasures, scopeCriteriaToGame } from '@/lib/trophies/catalog'
import { parseCriteria } from '@/lib/trophies/criteria'

/**
 * Edit or retire a single trophy.
 *
 * RETIREMENT IS A FLAG, NOT A DELETE. `player_trophies.trophy_id` is `ON DELETE RESTRICT`, so
 * a trophy anyone has earned cannot be removed — deleting it would erase their award history
 * and silently desync the cached `profiles.trophy_points` / `trophy_level`, which have no
 * recompute trigger. `is_active = false` hides it from the catalog and from future award passes
 * while leaving earned copies intact. DELETE therefore soft-deletes, and only hard-deletes a
 * trophy nobody has.
 *
 * EDITS APPLY GOING FORWARD. Changing a threshold does not re-evaluate people who already
 * earned it — raising the bar must never take a trophy off someone who met the old one. A
 * deliberate recalculation is a separate action, not a side effect of typing in a form.
 */

const patchSchema = z.object({
  game_type: z.string().max(64).nullable().optional(),
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum']).optional(),
  title: z.string().min(1).max(80).optional(),
  description: z.string().min(1).max(300).optional(),
  criteria: z.unknown().optional(),
  points: z.number().int().min(0).max(1000).optional(),
  hidden: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(100000).optional(),
  is_active: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data: body, error: bodyError } = await parseJsonBody(req, patchSchema)
  if (bodyError) return bodyError

  // `criteria` is only validated when it is actually being changed — an edit that only renames
  // a trophy shouldn't fail because the rule predates a vocabulary change.
  if (body.criteria !== undefined) {
    if (!parseCriteria(body.criteria)) {
      return NextResponse.json({ error: 'That rule is not valid.' }, { status: 400 })
    }
    const { ok, unknown } = criteriaUsesLiveMeasures(body.criteria)
    if (!ok) {
      return NextResponse.json(
        { error: `This rule uses ${unknown.join(', ')}, which nothing measures yet — it would never be earned.` },
        { status: 400 }
      )
    }
  }

  const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined))
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  // Re-scope whenever either half of the pairing moves. Creating scoped the rule to the game;
  // editing did not, so two paths could desync it: changing the rule alone left it counting
  // every game, and changing the game alone left it measuring the old one. Both produce a
  // trophy that looks right in the list and counts the wrong thing.
  if (body.criteria !== undefined || body.game_type !== undefined) {
    const { data: current } = await supabase.from('trophies').select('game_type, criteria').eq('id', id).maybeSingle()
    const gameType = body.game_type !== undefined ? (body.game_type ?? null) : ((current?.game_type as string) ?? null)
    const criteria = body.criteria !== undefined ? body.criteria : current?.criteria
    patch.criteria = scopeCriteriaToGame(criteria, gameType)
    patch.game_type = gameType
  }

  const { error } = await supabase.from('trophies').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: internalErrorMessage('admin/trophies', error) }, { status: 500 })

  return NextResponse.json({ ok: true })
}

/**
 * Retire a trophy. Soft by default; hard only when nobody has earned it.
 *
 * The database would refuse the hard delete anyway (RESTRICT), but checking first lets us
 * return "retired, N players keep it" instead of a foreign-key error nobody can act on.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  try {
    const { count } = await supabase
      .from('player_trophies')
      .select('trophy_id', { count: 'exact', head: true })
      .eq('trophy_id', id)

    if ((count ?? 0) > 0) {
      const { error } = await supabase.from('trophies').update({ is_active: false }).eq('id', id)
      if (error) return NextResponse.json({ error: internalErrorMessage('admin/trophies', error) }, { status: 500 })
      return NextResponse.json({ retired: true, earnedBy: count })
    }

    const { error } = await supabase.from('trophies').delete().eq('id', id)
    if (error) return NextResponse.json({ error: internalErrorMessage('admin/trophies', error) }, { status: 500 })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('admin/trophies', err) }, { status: 500 })
  }
}
