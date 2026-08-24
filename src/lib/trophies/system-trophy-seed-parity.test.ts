import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSystemCatalog } from './system-catalog'
import type { CatalogTrophy } from './catalog'

/**
 * Guard for "the trophy exists in code but not in any database built from the migrations".
 *
 * System trophies are authored in code and assembled by `buildSystemCatalog()`. For most of
 * their life they reached a database only when an admin clicked "Seed launch trophies", so a
 * freshly migrated project was missing 606 of 649 of them: the facts builders emitted the
 * counters at finish, but with no `trophies` row the award pass had nothing to match and
 * nothing could ever unlock. README and CONTRIBUTING both say the migrations are the only
 * source of schema truth, so `20261028120000_system_trophies_backfill.sql` seeds the whole
 * catalog and reconciles it on re-run.
 *
 * Two sources of truth need a guard, and the drift is real rather than theoretical: the
 * Wordle set's sort orders were renumbered in code by 20261018122000 while the rows an
 * earlier migration had already inserted kept their old values, so the list rendered in the
 * wrong order in every environment seeded before that. This test is what makes that class
 * of drift fail CI instead of shipping.
 *
 * The reconcile migration is generated from the catalog, so its format is uniform and
 * parseable. Earlier per-game seed migrations are hand-written with varying layouts — they
 * are only checked for WHICH ids they seed, not their contents, which is sound because the
 * reconcile migration runs last and its `ON CONFLICT DO UPDATE` is the final word.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

/**
 * The newest full-catalog reconcile migration.
 *
 * Discovered rather than named, because merged migrations are immutable: adding a game means
 * REGENERATING into a new file (see `system-trophy-migration.gen.test.ts`), and the old one
 * stays on disk untouched. Migrations run in filename order, so the last match is the one whose
 * `ON CONFLICT DO UPDATE` has the final word — and therefore the one whose contents must match
 * the specs. A hard-coded filename here would have quietly kept checking a superseded file.
 */
const RECONCILE = (() => {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /_system_trophies_(backfill|reconcile)\.sql$/.test(f))
    .sort()
  const last = files[files.length - 1]
  if (!last) throw new Error('no system-trophy reconcile migration found')
  return last
})()

type SeededRow = {
  id: string
  gameType: string
  tier: string
  title: string
  description: string
  criteria: unknown
  points: number
  hidden: boolean
  sortOrder: number
}

function migrationSql(file: string): string {
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
}

/** Every `<game>.sys.<suffix>` id that some migration INSERTs (not merely mentions). */
function insertedIds(): Set<string> {
  const ids = new Set<string>()
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    if (!file.endsWith('.sql')) continue
    for (const statement of migrationSql(file).matchAll(/INSERT\s+INTO\s+trophies\b[\s\S]*?;/gi)) {
      for (const row of statement[0].matchAll(/\(\s*'([a-z_0-9]+\.sys\.[a-z0-9_]+)'/g)) ids.add(row[1])
    }
  }
  return ids
}

/** Parse the generated reconcile migration's rows back into objects. */
function reconcileRows(): Map<string, SeededRow> {
  const sql = migrationSql(RECONCILE)
  const pattern = new RegExp(
    [
      /\(\s*'([a-z_0-9]+\.sys\.[a-z0-9_]+)',\s*/, // id
      /'([a-z_0-9]+)',\s*/, // game_type
      /'(bronze|silver|gold|platinum)',\s*/, // tier
      /'((?:[^']|'')*)',\s*/, // title
      /'((?:[^']|'')*)',\s*/, // description
      /'(\{(?:[^']|'')*\})'::jsonb,\s*/, // criteria
      /(\d+),\s*(true|false),\s*(\d+),\s*true\s*\)/, // points, hidden, sort_order, is_system
    ]
      .map((part) => part.source)
      .join(''),
    'g'
  )
  const rows = new Map<string, SeededRow>()
  const unquote = (value: string) => value.replace(/''/g, "'")
  for (const m of sql.matchAll(pattern)) {
    rows.set(m[1], {
      id: m[1],
      gameType: m[2],
      tier: m[3],
      title: unquote(m[4]),
      description: unquote(m[5]),
      criteria: JSON.parse(unquote(m[6])),
      points: Number(m[7]),
      hidden: m[8] === 'true',
      sortOrder: Number(m[9]),
    })
  }
  return rows
}

/** Key order is not meaningful in jsonb — compare canonically. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, canonical(inner)])
    )
  }
  return value
}

describe('system trophy seed parity', () => {
  const catalog = buildSystemCatalog()
  const seeded = insertedIds()
  const rows = reconcileRows()

  it('has a catalog worth checking', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(600)
  })

  it('every system trophy in code is seeded by a migration', () => {
    const missing = catalog.filter((trophy) => !seeded.has(trophy.id)).map((trophy) => trophy.id)
    expect(
      missing,
      'authored in code but no migration inserts it, so a database built from the migrations ' +
        'alone can never award it. Add it to a new seed migration.'
    ).toEqual([])
  })

  it('seeds no trophy the code no longer defines', () => {
    const known = new Set(catalog.map((trophy) => trophy.id))
    const orphans = [...seeded].filter((id) => !known.has(id))
    expect(orphans, 'seeded but absent from the catalog — remove it in a migration').toEqual([])
  })

  it('the reconcile migration parses (its generated format has not drifted)', () => {
    expect(rows.size, `no rows parsed out of ${RECONCILE} — did the generator change shape?`).toBe(catalog.length)
  })

  it('every seeded row matches its spec field for field', () => {
    const mismatches: string[] = []
    for (const trophy of catalog as CatalogTrophy[]) {
      const row = rows.get(trophy.id)
      if (!row) {
        mismatches.push(`${trophy.id}: not in ${RECONCILE}`)
        continue
      }
      const checks: [string, unknown, unknown][] = [
        ['game_type', row.gameType, trophy.game_type],
        ['tier', row.tier, trophy.tier],
        ['title', row.title, trophy.title],
        ['description', row.description, trophy.description],
        ['points', row.points, trophy.points],
        ['hidden', row.hidden, trophy.hidden],
        ['sort_order', row.sortOrder, trophy.sort_order],
      ]
      for (const [field, seededValue, specValue] of checks) {
        if (seededValue !== specValue) {
          mismatches.push(
            `${trophy.id}.${field}: seeded ${JSON.stringify(seededValue)} vs spec ${JSON.stringify(specValue)}`
          )
        }
      }
      if (JSON.stringify(canonical(row.criteria)) !== JSON.stringify(canonical(trophy.criteria))) {
        mismatches.push(
          `${trophy.id}.criteria: seeded ${JSON.stringify(row.criteria)} vs spec ${JSON.stringify(trophy.criteria)}`
        )
      }
    }
    expect(
      mismatches.slice(0, 20),
      `${mismatches.length} seeded row(s) drifted from the spec. Regenerate the seed migration ` +
        'from buildSystemCatalog() in a NEW migration — never hand-edit the generated one.'
    ).toEqual([])
  })

  it('respects the table CHECK constraints', () => {
    for (const trophy of catalog) {
      expect(trophy.title.length, `${trophy.id} title > 80`).toBeLessThanOrEqual(80)
      expect(trophy.description.length, `${trophy.id} description > 300`).toBeLessThanOrEqual(300)
      expect(trophy.points, `${trophy.id} points`).toBeGreaterThanOrEqual(0)
      expect(trophy.points, `${trophy.id} points`).toBeLessThanOrEqual(1000)
      expect(['bronze', 'silver', 'gold', 'platinum'], `${trophy.id} tier`).toContain(trophy.tier)
    }
  })

  it('leaves is_active alone on conflict — deactivating a trophy is an admin decision', () => {
    const sql = migrationSql(RECONCILE)
    const onConflict = sql.slice(sql.lastIndexOf('ON CONFLICT'))
    expect(onConflict).toContain('DO UPDATE')
    expect(onConflict, 'the reconcile must not overwrite an admin-deactivated trophy').not.toContain('is_active')
  })
})
