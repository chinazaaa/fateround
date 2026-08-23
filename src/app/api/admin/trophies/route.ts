import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAdminRequest } from '@/lib/admin-api'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { GAME_TYPE_CONFIG, gameTypeLabel } from '@/lib/game-types'
import { buildCatalogForGame, criteriaUsesLiveMeasures, scopeCriteriaToGame } from '@/lib/trophies/catalog'
import { buildSystemCatalog } from '@/lib/trophies/system-catalog'
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
    .select('id, game_type, tier, title, description, criteria, points, hidden, sort_order, is_active, is_system')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })

  if (error) return NextResponse.json({ error: internalErrorMessage('admin/trophies', error) }, { status: 500 })

  // What seeding would ADD right now. The button is not a one-time launch action — it is how
  // the catalog catches up after a new game type is registered — but "Seed launch trophies"
  // reads as something you do once, so it looked redundant the moment the catalog was full.
  // Reporting the number makes it obvious when it has work to do and when it is a no-op.
  const have = new Set((data ?? []).map((t) => t.id as string))
  const missingCount = [
    ...(Object.keys(GAME_TYPE_CONFIG) as GameType[]).flatMap((g) =>
      buildCatalogForGame(g, gameTypeLabel(g) ?? g, hasWinnerSource(g))
    ),
    ...buildSystemCatalog(),
  ].filter((t) => !have.has(t.id)).length

  return NextResponse.json({
    trophies: data ?? [],
    missingCount,
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

  // VALIDATE BEFORE SCOPING. `parseCriteria` is what bounds nesting depth and branch count on
  // admin-authored input; scoping walks the tree, so doing it first would walk an unbounded
  // payload before anything had checked its shape.
  const invalid = validateCriteria(body.criteria)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  // Filing a trophy under a game and leaving its rule counting every game is the easy mistake,
  // so the scope is applied to both from one choice.
  const criteria = scopeCriteriaToGame(body.criteria, body.game_type ?? null)

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
 * Seed the per-game trophy set for every game.
 *
 * Insert-only, deliberately: once seeded the TABLE is the source of truth, and re-seeding must
 * never overwrite a title someone reworded or a threshold someone tuned. Safe to run repeatedly,
 * and re-running after a new game ships adds just that game's trophies.
 */
export async function PUT(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = getSupabaseAdmin()
    const { data: existing, error: existingError } = await supabase.from('trophies').select('id')
    // Without this check a failed read looks like an empty catalog, so "seed what's missing"
    // becomes "insert everything" — contradicting the safe-to-re-run guarantee and hiding the
    // real failure behind a duplicate-key error.
    if (existingError) {
      return NextResponse.json({ error: internalErrorMessage('admin/trophies', existingError) }, { status: 500 })
    }
    const have = new Set((existing ?? []).map((r) => r.id as string))

    // Every game gets its own list. Win trophies are skipped where the server can't resolve a
    // winner, so no game is seeded with something nobody could ever earn.
    // Two catalogs, one table. The generic one is the same eight templates per game; the system
    // one is code-authored per game against that game's own facts builder. Both must be rows —
    // `player_trophies.trophy_id` references this table, so a definition that is not a row here
    // can never be awarded.
    const generic = (Object.keys(GAME_TYPE_CONFIG) as GameType[]).flatMap((gameType) =>
      buildCatalogForGame(gameType, gameTypeLabel(gameType) ?? gameType, hasWinnerSource(gameType))
    )
    const system = buildSystemCatalog()
    const full = [...generic, ...system]
    const systemIds = new Set(system.map((t) => t.id))
    const missing = full.filter((t) => !have.has(t.id))

    if (!missing.length) return NextResponse.json({ seeded: 0, skipped: full.length })

    const rows = missing.map((t) => ({
      id: t.id,
      is_system: systemIds.has(t.id),
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

    // Bulk insert first — the common path when the batch is clean.
    const bulk = await supabase.from('trophies').insert(rows)
    if (!bulk.error) {
      return NextResponse.json({ seeded: missing.length, skipped: full.length - missing.length })
    }

    // Bulk failed: retry one-by-one so a single bad row can't sink the batch,
    // and so the response can name what actually broke instead of "Something
    // went wrong". Duplicate-key errors (from a concurrent reseed) count as
    // already-there and are skipped without failing.
    console.error('[admin/trophies] bulk seed failed, falling back to per-row', bulk.error)
    let seeded = 0
    const failures: { id: string; message: string; code?: string }[] = []
    for (const row of rows) {
      const { error: rowErr } = await supabase.from('trophies').insert(row)
      if (!rowErr) {
        seeded++
        continue
      }
      if (rowErr.code === '23505') continue // already there
      failures.push({ id: row.id, message: rowErr.message, code: rowErr.code })
    }

    if (failures.length) {
      console.error('[admin/trophies] per-row failures', failures)
      const preview = failures
        .slice(0, 3)
        .map((f) => `${f.id}: ${f.message}`)
        .join('; ')
      return NextResponse.json(
        {
          error: `Seeded ${seeded}. ${failures.length} failed — ${preview}${failures.length > 3 ? '…' : ''}`,
          seeded,
          failures,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ seeded, skipped: full.length - seeded })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('admin/trophies', err) }, { status: 500 })
  }
}
