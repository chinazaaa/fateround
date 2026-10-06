import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the crash that ran in production from 2026-08-28 to 2026-10-04.
 *
 * `game-facts/index.ts` builds its `BUILDERS` table at MODULE SCOPE, reading one binding per
 * game. That is only safe while the barrel sits outside any runtime import cycle. It did not:
 * each `game-facts/<game>.ts` imported a helper from `@/lib/<game>`, which imports
 * `@/lib/game-finish` -> `@/lib/trophies/round-facts` -> back to this barrel. Entering that loop
 * from the game-logic side evaluated `BUILDERS` while `ludoFacts` and friends were still in
 * their temporal dead zone, producing `ReferenceError: Cannot access 'i' before initialization`
 * on `/`, `/daily-challenges/:gameType`, `/history/:code` and `/daily-challenges/:gameType/answers`.
 *
 * Nothing in the suite could catch that — the modules import fine in isolation, and the cycle
 * only bites in the bundler's evaluation order. So this walks the real runtime import graph.
 *
 * `import type` is excluded deliberately: TypeScript erases those, so they cannot create a
 * runtime cycle. Counting them inflates the graph and reports cycles that cannot crash.
 */

const SRC = join(process.cwd(), 'src')
const BARREL = join(SRC, 'lib/trophies/game-facts/index.ts')

// Skips `import type` / `export type`, which are erased before the bundle exists.
const IMPORT_RE = /^\s*(?:import|export)\s+(?!type\s)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm

function resolve(spec: string, fromFile: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = normalize(join(dirname(fromFile), spec))
  else return null // node_modules — cannot close a cycle back into src/
  for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(cand)) return cand
  }
  return null
}

function runtimeImports(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const out: string[] = []
  for (const m of src.matchAll(IMPORT_RE)) {
    const target = resolve(m[1], file)
    if (target && target !== file) out.push(target)
  }
  return out
}

/** Depth-first search for a path from `start` back to `start`, returning it for the failure message. */
function findCycleBackTo(start: string): string[] | null {
  const seen = new Set<string>()
  const stack: { file: string; path: string[] }[] = [{ file: start, path: [start] }]
  while (stack.length) {
    const { file, path } = stack.pop()!
    for (const next of runtimeImports(file)) {
      if (next === start) return [...path, next]
      if (seen.has(next)) continue
      seen.add(next)
      stack.push({ file: next, path: [...path, next] })
    }
  }
  return null
}

describe('trophies game-facts barrel', () => {
  it('is not reachable from its own transitive runtime imports', () => {
    const cycle = findCycleBackTo(BARREL)
    const rendered = cycle?.map((f) => relative(process.cwd(), f)).join('\n  -> ')
    expect(
      cycle,
      `The game-facts barrel is in a runtime import cycle again. It builds BUILDERS at module ` +
        `scope, so this crashes production with "Cannot access 'X' before initialization".\n\n  ` +
        `${rendered}\n\nBreak the cycle by moving whatever the trophies layer needs into a leaf ` +
        `module (see src/lib/ludo-pieces.ts), not by making BUILDERS lazy.`
    ).toBeNull()
  })
})
