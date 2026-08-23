import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard: no two migrations share a timestamp prefix.
 *
 * Supabase records applied migrations by the numeric prefix, not the full filename, so two
 * files stamped `20261026120000_*` are ONE version as far as `schema_migrations` is concerned:
 * whichever applies second is either skipped as already-applied or collides on the primary
 * key. Either way a migration silently never runs.
 *
 * This is a merge hazard rather than an authoring one — both files looked fine on their own
 * branches, and the clash only appeared when they met. It surfaced here by chance while
 * merging `dev`; nothing would have caught it before a deploy.
 */

const DIR = join(process.cwd(), 'supabase', 'migrations')

describe('migration filenames', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql'))

  it('finds the migrations (the guard is looking at something)', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('every filename starts with a numeric version', () => {
    // Two eras: the original 4-digit sequence (`0001_base_schema.sql`) and the current
    // `YYYYMMDDHHMMSS` timestamps. The old ones are applied everywhere and must never be
    // renamed, so this checks only that a version is parseable — CONTRIBUTING covers the
    // format for new ones.
    const malformed = files.filter((f) => !/^\d+_/.test(f))
    expect(malformed).toEqual([])
  })

  it('no two share a version', () => {
    const byStamp = new Map<string, string[]>()
    for (const file of files) {
      // The leading digit run, whatever its length — that is what Supabase records.
      const stamp = /^(\d+)_/.exec(file)![1]
      byStamp.set(stamp, [...(byStamp.get(stamp) ?? []), file])
    }
    const clashes = [...byStamp.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([stamp, names]) => `${stamp}: ${names.join(' + ')}`)
    expect(
      clashes,
      'Supabase keys schema_migrations on the prefix, so one of these would never run. ' +
        'Rename the one that has NOT been merged/applied yet.'
    ).toEqual([])
  })
})
