import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * No browser code may read a per-player hand table directly.
 *
 * Phase 7 (docs/rls-hardening.md) replaced every client read of `*_player_hands` with
 * `POST /api/<game>/hands`, which returns the caller's own cards in full and everyone else's as
 * a `card_count`. Nothing enforced it: the Crazy Eights select was removed and replaced with a
 * comment tombstone in supabase-selects.ts *asking* nobody to reintroduce it, which is a
 * convention, not a guard. Rummy then shipped a year later with exactly that read — all hands in
 * the session, filtered on `game_id` alone — because no test said otherwise.
 *
 * A direct read is not a cosmetic regression. It hands every opponent's hand to every client, and
 * the column-level revoke that will eventually close it off at the database turns the same query
 * into a 42501 that fails the WHOLE select, taking the view down rather than degrading.
 *
 * Server code is exempt: `src/app/api/**` is where the redaction routes live and `src/lib/**`
 * runs the service-role game logic, both of which legitimately read the raw tables.
 */
const HAND_TABLES = [
  'whot_player_hands',
  'uno_player_hands',
  'crazy_eights_player_hands',
  'rummy_player_hands',
  'gofish_player_hands',
  'bingo_cards',
] as const

/** Browser-reachable roots. `src/app/api` is excluded below — it is the server. */
const ROOTS = ['src/components', 'src/hooks', 'src/app']

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (full.startsWith('src/app/api')) continue
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

/**
 * Strip comments only — NOT string contents.
 *
 * Blanking strings would blind the scan to exactly what it is looking for, since the table name
 * appears inside `.from('rummy_player_hands')`. An earlier guard in this directory blanked string
 * bodies and a stray apostrophe in JSX silently blinded it across six files.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('hand tables are never read from the browser', () => {
  const files = ROOTS.flatMap((r) => walk(r))

  it('scans a plausible number of files', () => {
    // A broken walk returning nothing would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(100)
  })

  it.each(HAND_TABLES)('no browser file queries %s', (table) => {
    const offenders = files.filter((f) => {
      const src = stripComments(readFileSync(f, 'utf8'))
      // `.from('<table>')` in any quote style, and the bare table name passed as a select target.
      return new RegExp(String.raw`\.from\(\s*['"\`]${table}['"\`]`).test(src)
    })
    expect(offenders).toEqual([])
  })

  it('names every table that has a redaction route', () => {
    // Anchors the list: emptying it would reduce the it.each above to zero registered tests.
    expect(HAND_TABLES).toHaveLength(6)
    expect(HAND_TABLES).toContain('rummy_player_hands')
  })

  it('catches a planted violation', () => {
    // Proves the regex matches the shape it claims to, rather than passing because it matches
    // nothing. A guard that cannot fail is not a guard.
    const planted = stripComments(`const r = await supabase.from('rummy_player_hands').select('*')`)
    expect(new RegExp(String.raw`\.from\(\s*['"\`]rummy_player_hands['"\`]`).test(planted)).toBe(true)
  })
})
