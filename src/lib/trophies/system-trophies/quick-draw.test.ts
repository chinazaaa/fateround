import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildSystemCatalog } from '../system-catalog'
import { QUICK_DRAW } from './quick-draw'

/**
 * Quick Draw's spec ↔ seed-migration parity.
 *
 * Most game trophy sets reach a database only through the admin "Seed launch trophies"
 * button, so the code spec is their single source of truth. Wordle set the newer precedent
 * of ALSO shipping a seed migration, so a fresh `supabase db push` has the rows without an
 * admin click — `20261027120000_quick_draw_system_trophies.sql` follows it.
 *
 * Two sources of truth need a guard, or a trophy renamed in the spec quietly keeps its old
 * row in every fresh database. This asserts the migration covers exactly the spec.
 *
 * (Repo-wide, 605 of 649 system trophies still have no seed migration. Backfilling them is
 * its own task — this only holds the line on the set that has one.)
 */
const MIGRATION = 'supabase/migrations/20261027120000_quick_draw_system_trophies.sql'

describe('Quick Draw system trophies', () => {
  const catalog = buildSystemCatalog().filter((trophy) => trophy.game_type === 'quick_draw')
  const sql = readFileSync(MIGRATION, 'utf8')

  it('registers the spec under the quick_draw game type', () => {
    expect(catalog).toHaveLength(QUICK_DRAW.length)
    expect(QUICK_DRAW.length).toBeGreaterThanOrEqual(15)
  })

  it('covers both variants — neither track is empty', () => {
    const counters = QUICK_DRAW.map((spec) => spec.counter ?? '')
    // `lie` counters come from quick_draw_titles/votes; `guess` counters from the guess tables.
    const lie = counters.filter((counter) =>
      /fools|correct_reads|unmistakable|perfect_voter|drawings_submitted/.test(counter)
    )
    const guess = counters.filter((counter) =>
      /words_guessed|drawer_turns|words_landed|flawless_turn|twenty_guess/.test(counter)
    )
    expect(lie.length, 'no lie-variant trophies').toBeGreaterThanOrEqual(5)
    expect(guess.length, 'no guess-variant trophies').toBeGreaterThanOrEqual(5)
  })

  it('has unique suffixes and sort orders', () => {
    const suffixes = QUICK_DRAW.map((spec) => spec.suffix)
    expect(new Set(suffixes).size).toBe(suffixes.length)
    const orders = QUICK_DRAW.map((spec) => spec.sortOrder)
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('seeds every spec trophy in the migration', () => {
    const missing = catalog.filter((trophy) => !sql.includes(`'${trophy.id}'`)).map((trophy) => trophy.id)
    expect(missing, 'in the spec but not in the seed migration — a fresh DB would lack it').toEqual([])
  })

  it('seeds no trophy the spec dropped', () => {
    const known = new Set(catalog.map((trophy) => trophy.id))
    const orphans = [...sql.matchAll(/'(quick_draw\.sys\.[a-z0-9_]+)'/g)]
      .map((match) => match[1])
      .filter((id) => !known.has(id))
    expect([...new Set(orphans)], 'seeded but no longer in the spec — remove it in a migration').toEqual([])
  })

  it('seeds the same counter, threshold, title and points as the spec', () => {
    for (const trophy of catalog) {
      const row = sql.slice(sql.indexOf(`'${trophy.id}'`))
      const end = row.indexOf('),\n  (')
      const block = end === -1 ? row : row.slice(0, end)
      expect(block, `${trophy.id} criteria`).toContain(JSON.stringify(trophy.criteria))
      expect(block, `${trophy.id} title`).toContain(trophy.title.replace(/'/g, "''"))
      expect(block, `${trophy.id} tier`).toContain(`'${trophy.tier}'`)
    }
  })
})
