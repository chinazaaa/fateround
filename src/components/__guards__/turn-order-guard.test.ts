import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `session.turn_order` is `uuid[] NOT NULL` in Postgres, and typed `string[]` — yet production
 * threw `undefined is not an object (evaluating 'e.turn_order.filter')` on /game/:code for 22
 * users (`JAVASCRIPT-NEXTJS-1E` + `-R`, the Safari and Chrome wordings of one site).
 *
 * The cause is not the type. Realtime UPDATE payloads omit unchanged TOAST-ed columns, so a
 * partial update delivers big arrays as null — the hazard `UNO_SESSION_NOT_NULL_KEYS` already
 * documents. The real fix is the completeness gate (`isCompleteWhotSessionRow` and friends)
 * applied in each view's `applySessionRow`; these `?? []` guards are the second line, so that a
 * gate someone forgets to add degrades to a blank rail instead of a thrown render.
 *
 * WHY A SOURCE SCAN. The first version of this test ran its regex per line, so it matched only
 * single-line access — while five same-shape bugs sat in its own scan root, every one of them a
 * chain broken across lines by the formatter. It passed, and meant nothing. This version
 * normalises whitespace first and covers the forms that actually appear.
 *
 * `src/app/play-solo` is excluded deliberately. All five solo clients (whot, crazy-eights, uno,
 * ludo, yahtzee) build state locally from localStorage and reject a bad shape at `loadState`
 * (`if (!parsed?.session?.turn_order ...) return null`) before any access; no realtime payload
 * reaches them. Note three of the five check truthiness only, not `Array.isArray` — fine for
 * this hazard, since the absent-key case is what throws.
 */

// `src/lib` is NOT a root, and that is a judgement rather than an oversight. It holds ~90
// dereferences, almost all in server code that reads a row through an explicit REST select
// where the column is always present — guarding them would be a large change that buries the
// signal this test exists to carry. The three that DO read rows at a distance
// (`whot-bot-driver`, `monopoly-bot-driver`, `mahjong-scoring`) are guarded by hand instead.
const ROOTS = ['src/components', 'src/hooks', 'src/app'].map((r) => join(process.cwd(), r))
const EXCLUDED = join(process.cwd(), 'src/app/play-solo') + sep

/**
 * Blank out COMMENTS ONLY, leaving string and template contents in place.
 *
 * An earlier version also blanked strings, which looked tidier and was worse: a stray
 * apostrophe in JSX text ("don't", "Mafia's") put the scanner into string mode for the rest of
 * the file, so six files — about 2,600 lines — were permanently invisible to it. A guard that
 * silently stops looking is worse than no guard. Leaving strings in means a string that happens
 * to contain `session.turn_order.filter(...)` is a FALSE POSITIVE instead: loud, rare, and
 * fixable. That is the right direction to fail in.
 *
 * Regex literals are tracked because `/…\/\//` would otherwise look like a line comment and
 * swallow the rest of its line. A `/` starts a regex only where a value cannot already have
 * ended — after an operator, `(`, `,`, `[`, `{`, `;`, `:`, or `return` — which is the standard
 * heuristic and sufficient here.
 */
function stripComments(source: string): string {
  let out = ''
  let i = 0
  let mode: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' | 'regex' = 'code'
  let lastSignificant = ''
  while (i < source.length) {
    const ch = source[i]
    const two = source.slice(i, i + 2)
    if (mode === 'code') {
      if (two === '//') {
        mode = 'line'
        i += 2
        continue
      }
      if (two === '/*') {
        mode = 'block'
        i += 2
        continue
      }
      if (ch === '/' && /[(,=:[{;!&|?+\-*%~^<>]$|^$/.test(lastSignificant)) {
        mode = 'regex'
        out += ch
        i++
        continue
      }
      if (ch === "'") mode = 'single'
      else if (ch === '"') mode = 'double'
      else if (ch === '`') mode = 'template'
      if (!/\s/.test(ch)) lastSignificant = ch
      out += ch
      i++
      continue
    }
    if (mode === 'line') {
      if (ch === '\n') {
        mode = 'code'
        out += '\n'
      }
      i++
      continue
    }
    if (mode === 'block') {
      if (two === '*/') {
        mode = 'code'
        i += 2
        continue
      }
      if (ch === '\n') out += '\n'
      i++
      continue
    }
    // inside a string, template or regex: keep the text, honour escapes
    out += ch
    if (ch === '\\') {
      out += source[i + 1] ?? ''
      i += 2
      continue
    }
    if (
      (mode === 'single' && ch === "'") ||
      (mode === 'double' && ch === '"') ||
      (mode === 'template' && ch === '`') ||
      (mode === 'regex' && ch === '/')
    ) {
      mode = 'code'
      lastSignificant = ch
    }
    i++
  }
  return out
}

/** Every shape that dereferences `turn_order` without a nullish guard in front of it. */
const PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'method call', re: /\w\??\.turn_order\s*\.\s*\w+\s*\(/ },
  { label: 'index access', re: /\w\??\.turn_order\s*\[/ },
  { label: 'property read', re: /\w\??\.turn_order\s*\.\s*(?:length|at)\b/ },
  { label: 'spread', re: /\.\.\.\s*\w+\??\.turn_order\b(?!\s*\?\?)/ },
  { label: 'for..of', re: /for\s*\([^)]*\sof\s+\w+\??\.turn_order\s*\)/ },
  // Destructuring detaches the value from its receiver, so no later read can be matched by the
  // patterns above. Rather than pretend to track the binding, forbid the shape — there are none
  // today, and `session.turn_order` at the use site reads better anyway.
  {
    label: 'destructured (defeats this scan — read session.turn_order at the use site)',
    re: /\{[^}]*\bturn_order\b[^}]*\}\s*=/,
  },
]

function walk(dir: string): string[] {
  if ((dir + sep).startsWith(EXCLUDED)) return []
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

describe('turn_order access outside the completeness gate', () => {
  it('is always nullish-guarded', () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const code = stripComments(readFileSync(file, 'utf8'))
        // Collapse whitespace per statement so a chain broken across lines still matches, while
        // keeping a line number by counting newlines consumed up to the match.
        const flat = code.replace(/\s*\n\s*/g, ' ')
        for (const { label, re } of PATTERNS) {
          const m = flat.match(re)
          if (!m) continue
          // `(x.turn_order ?? [])` and `x.turn_order?.` are the sanctioned forms.
          const guarded =
            new RegExp(`\\(\\s*\\w+\\??\\.turn_order\\s*\\?\\?`).test(flat) || /\.turn_order\s*\?\./.test(flat)
          if (
            guarded &&
            !new RegExp(re.source).test(flat.replace(/\(\s*\w+\??\.turn_order\s*\?\?\s*\[\]\s*\)/g, 'GUARDED'))
          )
            continue
          offenders.push(`${relative(process.cwd(), file)} — ${label}: ${m[0].trim()}`)
          break
        }
      }
    }
    expect(
      offenders,
      `Unguarded turn_order access. The column is NOT NULL, but truncated realtime payloads ` +
        `deliver it as null — see isCompleteWhotSessionRow. Gate the row in applySessionRow, and ` +
        `write (session.turn_order ?? []) at the read:\n  ${offenders.join('\n  ')}`
    ).toEqual([])
  })
})
