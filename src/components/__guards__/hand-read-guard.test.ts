import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
 * ## What this guard does NOT cover
 *
 * Stated plainly so nobody mistakes a green run for proof the hands are private:
 *
 *  - **Realtime.** Both Rummy views still subscribe to `rummy_player_hands` as a reload trigger,
 *    and `postgres_changes` has no column projection, so every hand row still reaches every
 *    subscribed client over the websocket. Only the column-level revoke closes that. A
 *    `{ table: '…' }` watch string is therefore deliberately NOT an offence here.
 *  - **Indirection.** `.from(SOME_CONSTANT)`, a template literal, or a string built by
 *    concatenation all evade the pattern below. The historical regression this guard
 *    commemorates involved a select *constant*, so this is the gap most worth closing next; it
 *    needs more than a regex.
 *  - **`apps/mobile`.** Out of scope on purpose: mobile ships no Rummy view (only the slug in
 *    `lib/game-rules.ts`). Its Whot/UNO/Crazy Eights views are unguarded and
 *    `apps/mobile/lib/supabase-selects.ts` still defines hand selects.
 */
const HAND_TABLES = [
  'whot_player_hands',
  'uno_player_hands',
  'crazy_eights_player_hands',
  'rummy_player_hands',
  'gofish_player_hands',
  'bingo_cards',
] as const

/** Repo root, derived from this file rather than `process.cwd()` so the scan cannot silently
 *  narrow if vitest's working directory ever changes. */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/**
 * Browser-reachable roots, each with the minimum file count it must yield.
 *
 * Per-root minimums, not one aggregate: `src/components` alone is ~550 files, so a single
 * `files.length > 100` assertion stays green even if `src/hooks` or `src/app` stops being
 * scanned entirely — which a directory rename would do silently.
 */
const ROOTS: ReadonlyArray<[string, number]> = [
  ['src/components', 300],
  ['src/hooks', 80],
  ['src/app', 80],
]

/** `src/app/api` is the server: the redaction routes themselves live there. */
const SERVER_DIR = join(REPO, 'src', 'app', 'api')

function walk(dir: string, out: string[] = []): string[] {
  // Deliberately NOT swallowing errors: a missing root must fail the run, not quietly scan less.
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (full === SERVER_DIR) continue
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

/**
 * Remove comments while leaving string CONTENTS intact.
 *
 * Both halves matter. Blanking string bodies would blind the scan to the very text it hunts,
 * since the table name lives inside `.from('rummy_player_hands')` — that is how an earlier guard
 * in this directory lost six files to a stray apostrophe in JSX. But a naive
 * `//[^\n]*` strip has the mirror-image bug: a `//` inside a string (`'/api//x'`, a
 * protocol-relative URL) eats the rest of a real line of code. So this tracks quote state
 * character by character instead of pattern-matching either one.
 */
function stripComments(src: string): string {
  let out = ''
  let quote: string | null = null
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      out += c
      if (c === '\\') {
        out += src[++i] ?? ''
      } else if (c === quote) {
        quote = null
      }
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      out += c
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++
      out += '\n'
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2)
      i = close === -1 ? src.length : close + 1
      continue
    }
    out += c
  }
  return out
}

const directRead = (table: string) => new RegExp(String.raw`\.from\(\s*['"\`][^'"\`]*${table}['"\`]`)

/** Files under src/lib that reach the browser's anon client. See the src/lib finding below. */
function browserLibFiles(): string[] {
  return walk(join(REPO, 'src', 'lib')).filter((f) => /from '@\/lib\/supabase'/.test(readFileSync(f, 'utf8')))
}

describe('hand tables are never read from the browser', () => {
  const files = ROOTS.flatMap(([r]) => walk(join(REPO, r)))

  it.each(ROOTS)('scans %s', (root, min) => {
    // Vacuity guard, per root. A broken or renamed root fails here instead of passing silently.
    expect(walk(join(REPO, root)).length).toBeGreaterThan(min)
  })

  it.each(HAND_TABLES)('no browser file queries %s', (table) => {
    const offenders = files.filter((f) => directRead(table).test(stripComments(readFileSync(f, 'utf8'))))
    expect(offenders.map((f) => f.slice(REPO.length + 1))).toEqual([])
  })

  /**
   * `src/lib` is excluded from the sweep above because the service-role game logic (`rummy.ts`,
   * `whot.ts`, `uno.ts`) legitimately reads the raw tables. But `src/lib` ALSO holds the
   * browser's anon Supabase singleton, so "it's in src/lib" is not a safety argument: a new
   * `src/lib/rummy-hands.ts` importing `@/lib/supabase` and selecting `cards` would restore the
   * leak and pass every assertion above. The two are distinguishable — service-role readers take
   * their client as a parameter, browser modules import the singleton.
   */
  it.each(HAND_TABLES)('no src/lib file with the anon client queries %s', (table) => {
    const offenders = browserLibFiles().filter((f) => directRead(table).test(stripComments(readFileSync(f, 'utf8'))))
    expect(offenders.map((f) => f.slice(REPO.length + 1))).toEqual([])
  })

  it('names every table that has a redaction route', () => {
    // Anchors the list: emptying it would reduce both it.each sweeps to zero registered tests.
    expect(HAND_TABLES).toEqual([
      'whot_player_hands',
      'uno_player_hands',
      'crazy_eights_player_hands',
      'rummy_player_hands',
      'gofish_player_hands',
      'bingo_cards',
    ])
  })

  it('fails on a violating file planted in a scanned root', () => {
    // Exercises the whole pipeline — walk, read, stripComments, match — not just the regex. A
    // guard that has never been seen to fail is not known to work.
    const dir = join(REPO, 'src', 'components', '__guard_fixture__')
    const file = join(dir, 'Planted.tsx')
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        file,
        [
          "import { supabase } from '@/lib/supabase'",
          '// a decoy comment naming rummy_player_hands must not count',
          "const href = '/api//double-slash'",
          'export async function bad(code: string) {',
          "  return supabase.from('rummy_player_hands').select('cards').eq('game_id', code)",
          '}',
        ].join('\n')
      )
      const rescanned = walk(join(REPO, 'src', 'components'))
      const offenders = rescanned.filter((f) =>
        directRead('rummy_player_hands').test(stripComments(readFileSync(f, 'utf8')))
      )
      expect(offenders).toContain(file)
      // And the decoy comment on its own does not trip it.
      expect(directRead('rummy_player_hands').test(stripComments('// rummy_player_hands\n'))).toBe(false)
    } finally {
      try {
        unlinkSync(file)
      } catch {
        /* already gone */
      }
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps string contents but drops comments', () => {
    // The two mirror-image blindness bugs, pinned. First: a `//` inside a string must not eat
    // the code after it. Second: a stray apostrophe must not blind the rest of the file.
    expect(stripComments(`const u = '/api//x'; supabase.from('rummy_player_hands')`)).toContain('rummy_player_hands')
    expect(stripComments(`/* block */ supabase.from('uno_player_hands')`)).toContain('uno_player_hands')
    expect(stripComments(`// just a comment\nsupabase.from('whot_player_hands')`)).toContain('whot_player_hands')
    expect(stripComments(`// naming uno_player_hands in a comment\n`)).not.toContain('uno_player_hands')
  })
})
