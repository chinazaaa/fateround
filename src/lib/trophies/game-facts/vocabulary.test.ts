import { readFileSync, readdirSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { isKnownCounter } from '@/lib/trophies/counters'

/**
 * Every counter a facts builder emits must exist in the vocabulary.
 *
 * This is the worst failure mode the trophy system has. An unregistered key does not error: the
 * rule saves, the counter accumulates in `player_stats`, and the trophy reads as zero forever —
 * indistinguishable from a typo, with nothing in any log to explain it. A rename in a builder,
 * or a new counter someone forgot to register, produces exactly that.
 *
 * The test reads the builder SOURCE and finds the counters at their EMISSION points: an
 * ASSIGNMENT into the facts record, `<obj>.KEY = …` or `<obj>['KEY'] = …`. Two design choices:
 *  - It matches ANY object name, not just `facts`, because builders accumulate into differently
 *    named locals (`facts`, `f`, `out`). Keying off one name went blind the moment another was
 *    used (chess emits into `f`).
 *  - It matches ASSIGNMENTS only (`=`, not `==`), which is what separates a counter the builder
 *    WRITES from the raw per-play keys it merely READS out of the stored stats bag
 *    (`stats.c8_turns_taken`) — those are internal, never registered, and must not be flagged.
 */

describe('game-facts counters are all registered', () => {
  const dir = 'src/lib/trophies/game-facts'
  const builders = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts')

  it('finds at least one builder to check', () => {
    expect(builders.length).toBeGreaterThan(0)
  })

  for (const file of builders) {
    it(`${file} emits only known counters`, () => {
      const src = readFileSync(`${dir}/${file}`, 'utf8')

      const keys = new Set<string>()
      // `obj.some_key = …`  (assignment, not `==`/`=>`; the key must be snake_case with a digit
      // or underscore so plain camelCase locals like `foo.bar =` aren't swept in)
      for (const m of src.matchAll(/\b\w+\.([a-z][a-z0-9]*_[a-z0-9_]*)\s*=(?![=>])/g)) keys.add(m[1])
      // `obj['some_key'] = …`
      for (const m of src.matchAll(/\b\w+\['([a-z][a-z0-9]*_[a-z0-9_]*)'\]\s*=(?![=>])/g)) keys.add(m[1])

      expect(keys.size, `${file} emits no counters — did the emission syntax change?`).toBeGreaterThan(0)
      const unknown = [...keys].filter((k) => !isKnownCounter(k))
      expect(unknown, 'unregistered in counters.ts — these trophies could never be earned').toEqual([])
    })
  }
})

/**
 * Codewords builds four keys by template (`facts[`codewords_clue${n}_full`]`), which the literal
 * scan cannot see. Asserted explicitly so a rename there fails here too.
 */
describe('template-built counters', () => {
  it('codewords clue-for-N keys are registered', () => {
    for (const n of [2, 3, 4, 5]) {
      expect(isKnownCounter(`codewords_clue${n}_full`), `codewords_clue${n}_full`).toBe(true)
    }
  })

  /**
   * Mahjong copies its per-hand tallies out of the stored `game_counters` blob with a
   * `for (const key of TALLY_KEYS) facts[key] = …` loop, so the literal scan above never sees the
   * individual keys. If a name drifts between the blob writer (mahjong-hand-resolution.ts) and the
   * vocabulary, the trophy silently reads zero — the exact failure this file exists to catch.
   * Asserting the whole list here restores that guarantee for the templated keys.
   */
  it('mahjong per-hand tally keys are registered', () => {
    const src = readFileSync('src/lib/trophies/game-facts/mahjong.ts', 'utf8')
    const block = src.match(/const TALLY_KEYS = \[([\s\S]*?)\] as const/)
    expect(block, 'TALLY_KEYS not found — did the mahjong tally loop change shape?').not.toBeNull()
    const keys = [...block![1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])
    expect(keys.length, 'TALLY_KEYS is empty — the regex no longer matches its entries').toBeGreaterThan(10)
    const unknown = keys.filter((k) => !isKnownCounter(k))
    expect(unknown, 'mahjong tally key unregistered in counters.ts — trophy could never be earned').toEqual([])
  })
})
