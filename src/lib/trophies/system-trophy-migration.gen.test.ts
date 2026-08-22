import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSystemCatalog } from './system-catalog'

/**
 * GENERATOR, not a test — it writes the reconcile migration from the catalog.
 *
 * It lives as a vitest file because the catalog is TypeScript behind an `@/` path alias, and
 * vitest is the only TS runner this repo has. It is inert unless `GEN_TROPHY_MIGRATION` names
 * the migration to write, so a normal `vitest run` skips it and CI never writes files.
 *
 * The first reconcile migration (20261028120000) was produced ad hoc, which is why adding one
 * game meant hand-assembling 21 SQL rows. Regenerating is now:
 *
 *   GEN_TROPHY_MIGRATION=20261029120000_system_trophies_reconcile.sql npx vitest run \
 *     src/lib/trophies/system-trophy-migration.gen.test.ts
 *
 * ALWAYS A NEW FILE. Migrations that have been merged are immutable — editing one leaves every
 * environment that already ran it silently behind. Each regeneration supersedes the last, and
 * `ON CONFLICT DO UPDATE` makes the newest file the final word.
 */

const OUT = process.env.GEN_TROPHY_MIGRATION

/** SQL single-quote escaping. */
const q = (value: string | null) => `'${String(value ?? '').replace(/'/g, "''")}'`

const HEADER = `-- Reconcile every per-game SYSTEM trophy with its code spec.
--
-- GENERATED from \`buildSystemCatalog()\` by src/lib/trophies/system-trophy-migration.gen.test.ts.
-- Do not hand-edit rows here. To change a trophy, edit its spec and regenerate into a NEW
-- migration; \`system-trophy-seed-parity.test.ts\` fails CI when the specs and the seeded rows
-- diverge, and it reads whichever reconcile migration sorts last.
--
-- Supersedes 20261028120000_system_trophies_backfill.sql, which is left untouched because a
-- merged migration is immutable. This one carries the same rows plus everything added since,
-- and its \`ON CONFLICT DO UPDATE\` makes it the final word on every field it names.
--
-- WHY DO UPDATE, NOT DO NOTHING. \`is_system = true\` rows are CODE-OWNED — /admin/trophies
-- renders them read-only — so there is no hand-edit to protect, and DO NOTHING would let the
-- database drift from the spec silently. It already had once: 20261018122000 renumbered the
-- Wordle sort orders in code while the already-seeded rows kept their old values.
--
-- \`is_active\` is deliberately NOT overwritten: deactivating a trophy is a legitimate
-- operational action with no counterpart in the spec, so an admin's choice survives. New rows
-- default to active via the INSERT.

INSERT INTO trophies (id, game_type, tier, title, description, criteria, points, hidden, sort_order, is_system)
VALUES
`

const FOOTER = `
ON CONFLICT (id) DO UPDATE
SET
  game_type = EXCLUDED.game_type,
  tier = EXCLUDED.tier,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  criteria = EXCLUDED.criteria,
  points = EXCLUDED.points,
  hidden = EXCLUDED.hidden,
  sort_order = EXCLUDED.sort_order,
  is_system = true;
`

describe('system trophy migration generator', () => {
  it.skipIf(!OUT)(`writes ${OUT ?? '(set GEN_TROPHY_MIGRATION to enable)'}`, () => {
    const catalog = buildSystemCatalog()
    expect(catalog.length).toBeGreaterThan(600)

    const rows = catalog
      .map(
        (t) =>
          `  (${q(t.id)}, ${q(t.game_type)}, ${q(t.tier)}, ${q(t.title)}, ${q(t.description)},\n` +
          `    ${q(JSON.stringify(t.criteria))}::jsonb,\n` +
          `    ${t.points}, ${t.hidden}, ${t.sort_order}, true)`
      )
      .join(',\n')

    writeFileSync(join(process.cwd(), 'supabase', 'migrations', OUT!), HEADER + rows + FOOTER, 'utf8')
  })
})
