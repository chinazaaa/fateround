import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard: every `advanceStreak` caller round-trips `streak_freezes`.
 *
 * This is the bug class the freeze mechanic shipped into. `profiles.streak_freezes` was created
 * in the very first identity migration, selected into every profile payload, and typed on both
 * platforms — and never read or written by anything. The engine computed a streak that ignored
 * it, so a player could hold two freezes and still lose a 40-day streak to one missed evening.
 *
 * A freeze only works if it survives the round trip: SELECTed into the state, and UPDATEd back
 * out. Half of that is worse than none — reading without writing spends a freeze that regrows
 * on the next read, making the streak unloseable.
 */

const SRC = join(process.cwd(), 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

const callers = walk(SRC)
  .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
  .filter((f) => !f.endsWith(join('trophies', 'streak.ts')))
  .filter((f) => /\badvanceStreak\s*\(/.test(readFileSync(f, 'utf8')))
  .map((f) => f.slice(process.cwd().length + 1))

describe('streak freeze persistence', () => {
  it('finds the callers (the guard is looking at something)', () => {
    expect(callers.length).toBeGreaterThanOrEqual(2)
  })

  /**
   * Counted, not merely present. `award.ts` holds TWO independent call sites (multiplayer and
   * solo); a version of this test that only asserted `toMatch` passed with one of the two
   * writes deleted, because the surviving one satisfied it. Every call site has to round-trip,
   * so every count has to line up.
   */
  const count = (src: string, re: RegExp) => src.match(re)?.length ?? 0

  it.each(callers)('%s round-trips the column at every call site', (rel) => {
    const src = readFileSync(join(process.cwd(), rel), 'utf8')
    const calls = count(src, /\badvanceStreak\s*\(/g)
    expect(calls).toBeGreaterThan(0)

    expect(count(src, /select\([^)]*streak_freezes/g), 'each call site must SELECT the column').toBe(calls)
    expect(
      count(src, /streak_freezes:\s*Number\(profile[?]?\.streak_freezes\)/g),
      'each call site must pass the stored value into the state'
    ).toBe(calls)
    expect(
      count(src, /streak_freezes:\s*streak\.streak_freezes/g),
      'each call site must persist the result — a freeze spent in memory and not written back ' +
        'regrows on the next read, which makes the streak unloseable'
    ).toBe(calls)
  })
})
