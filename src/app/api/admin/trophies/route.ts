import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAdminRequest } from '@/lib/admin-api'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { GAME_TYPE_CONFIG } from '@/lib/game-types'
import { LAUNCH_CATALOG, criteriaUsesLiveMeasures, scopeCriteriaToGame } from '@/lib/trophies/catalog'
import { hasWinnerSource, isWinnerlessByDesign } from '@/lib/trophies/outcome'
import type { GameType } from '@/types'
import { liveCounters, liveDistinctSets } from '@/lib/trophies/counters'
import { parseCriteria } from '@/lib/trophies/criteria'

/**
 * Trophy catalog CRUD (`docs/trophies-and-streaks.md` §6A).
 *
 * This is what makes trophies admin-editable: a new trophy is a row, not a deploy. What admin
 * cannot do is invent a new *measurement* — so every write is validated against the live
 * vocabulary, and GET returns that vocabulary so the UI can show what's composable rather than
 * leaving someone to remember counter names.
 *
 * WHY VALIDATION MATTERS MORE THAN USUAL HERE: a rule referencing an unknown counter is not
 * rejected at runtime — it reads as zero, so the trophy simply never fires. A typo and a
 * deliberate-but-unbuilt measure produce the identical silent outcome. Refusing at save time is
 * the only place that difference can be surfaced.
 *
 * Auth is asserted in every handler, not in middleware — one matcher edit from being skipped.
 */

const criteriaSchema = z.unknown()

const trophySchema = z.object({
  id: z
    .string()
    .min(2)
    .max(64)
    // Ids appear in URLs and in `player_trophies`, and are permanent once earned.
    .regex(/^[a-z0-9_.]+$/, 'Use lowercase letters, numbers, dots and underscores'),
  game_type: z.string().max(64).nullable().optional(),
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum']),
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(300),
  criteria: criteriaSchema,
  points: z.number().int().min(0).max(1000),
  hidden: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(100000).optional(),
  is_active: z.boolean().optional(),
})

/** Shared validation for create and edit: the rule must parse AND target live measures. */
function validateCriteria(criteria: unknown): string | null {
  if (!parseCriteria(criteria)) {
    return 'That rule is not valid. Use a counter, a distinct set, or all/any of them.'
  }
  const { ok, unknown } = criteriaUsesLiveMeasures(criteria)
  if (!ok) {
    return `This rule uses ${unknown.join(', ')}, which nothing measures yet — the trophy would never be earned.`
  }
  return null
}

/** List the catalog, plus the vocabulary the UI needs to offer meaningful choices. */
export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await getSupabaseAdmin()
    .from('trophies')
    .select('id, game_type, tier, title, description, criteria, points, hidden, sort_order, is_active')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })

  if (error) return NextResponse.json({ error: internalErrorMessage('admin/trophies', error) }, { status: 500 })

  return NextResponse.json({
    trophies: data ?? [],
    // The vocabulary travels with the list so the editor can render pickers instead of a bare
    // JSON box. Without it "admin-editable" means "editable if you remember the counter names".
    vocabulary: { counters: liveCounters(), distinct: liveDistinctSets() },
    // Which games a trophy can be filed under, and whether a WIN rule would ever fire for each.
    // Without this the editor cannot warn that "win 5 Never Have I Ever games" is unearnable.
    games: (Object.keys(GAME_TYPE_CONFIG) as GameType[])
      .map((id) => ({
        id,
        label: GAME_TYPE_CONFIG[id]?.label ?? id,
        canScoreWins: hasWinnerSource(id),
        winnerless: isWinnerlessByDesign(id),
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  })
}

/** Create a trophy. */
export async function POST(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: body, error: bodyError } = await parseJsonBody(req, trophySchema)
  if (bodyError) return bodyError

  // Filing a trophy under a game and leaving its rule counting every game is the easy mistake,
  // so the scope is applied to both from one choice.
  const criteria = scopeCriteriaToGame(body.criteria, body.game_type ?? null)
  const invalid = validateCriteria(criteria)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const { error } = await getSupabaseAdmin()
    .from('trophies')
    .insert({
      id: body.id,
      game_type: body.game_type ?? null,
      tier: body.tier,
      title: body.title,
      description: body.description,
      criteria,
      points: body.points,
      hidden: body.hidden ?? false,
      sort_order: body.sort_order ?? 0,
      is_active: body.is_active ?? true,
    })

  if (error) {
    // 23505 = the id is taken. That is a user mistake, not a server fault.
    if (error.code === '23505') return NextResponse.json({ error: 'That trophy id already exists.' }, { status: 409 })
    return NextResponse.json({ error: internalErrorMessage('admin/trophies', error) }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}

/**
 * Seed any launch trophies that are missing.
 *
 * Insert-only, deliberately: once seeded the TABLE is the source of truth, and re-seeding must
 * never overwrite a title someone reworded or a threshold someone tuned. Safe to run repeatedly.
 */
export async function PUT(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = getSupabaseAdmin()
    const { data: existing } = await supabase.from('trophies').select('id')
    const have = new Set((existing ?? []).map((r) => r.id as string))
    const missing = LAUNCH_CATALOG.filter((t) => !have.has(t.id))

    if (!missing.length) return NextResponse.json({ seeded: 0, skipped: LAUNCH_CATALOG.length })

    const { error } = await supabase.from('trophies').insert(
      missing.map((t) => ({
        id: t.id,
        game_type: t.game_type,
        tier: t.tier,
        title: t.title,
        description: t.description,
        criteria: t.criteria,
        points: t.points,
        hidden: t.hidden,
        sort_order: t.sort_order,
        is_active: true,
      }))
    )
    if (error) return NextResponse.json({ error: internalErrorMessage('admin/trophies', error) }, { status: 500 })

    return NextResponse.json({ seeded: missing.length, skipped: LAUNCH_CATALOG.length - missing.length })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('admin/trophies', err) }, { status: 500 })
  }
}
