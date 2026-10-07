import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `session.turn_order` is typed `string[]` — required and non-nullable — and production
 * disagrees. `WhotPlaySurface` threw `undefined is not an object (evaluating 'e.turn_order.filter')`
 * on /game/:code for 10 users, and `RummyBoard` had the identical unguarded shape.
 *
 * A session row reaches a client component in ways the type does not model: a realtime payload
 * carrying a partial row, or a row read before the column is populated. Every other call site in
 * `src/components` already spells `?? []`; these two were the outliers.
 *
 * This guards the CLASS rather than the two lines, because the type will keep saying the access
 * is safe and the next person has no reason to doubt it. Scoped to components deliberately —
 * server-side `src/lib` reads rows straight from Postgres, where the column is present.
 *
 * If you are here because this failed: write `(session.turn_order ?? []).map(...)`, or guard the
 * row earlier. Do not widen this allowlist without a reason you can state.
 */

const COMPONENTS = join(process.cwd(), 'src/components')

// `<anything>.turn_order` followed directly by a method call — i.e. not `?? []`-guarded and not
// optional-chained. `turn_order?.` and `(x.turn_order ?? [])` both pass.
const UNGUARDED = /\w+\.turn_order\.(?:filter|map|forEach|find|findIndex|indexOf|slice|some|every|reduce|includes|at)\b/

/**
 * Comments are stripped before scanning. Without this the guard flags its own documentation:
 * the fix in `WhotPlaySurface` quotes the production error text, which contains
 * `turn_order.filter` verbatim, and the regex cannot tell prose from code.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (_m, lead) => lead)
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

describe('turn_order access in client components', () => {
  it('is never called as a method without a nullish guard', () => {
    const offenders = walk(COMPONENTS)
      .map((file) => ({
        file,
        line: stripComments(readFileSync(file, 'utf8'))
          .split('\n')
          .findIndex((l) => UNGUARDED.test(l)),
      }))
      .filter(({ line }) => line !== -1)
      .map(({ file, line }) => `${relative(process.cwd(), file)}:${line + 1}`)

    expect(
      offenders,
      `Unguarded session.turn_order method call(s). The type says string[]; production has ` +
        `shipped rows without it. Use (session.turn_order ?? []) instead:\n  ${offenders.join('\n  ')}`
    ).toEqual([])
  })
})
