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
 * So this test reads the builder SOURCE rather than calling it: the point is to catch a key that
 * exists in code and nowhere else, which no amount of behavioural testing would surface.
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
      const game = file.replace('.ts', '')
      const keys = new Set<string>()
      // `facts.game_key = …`
      for (const m of src.matchAll(new RegExp(`facts\\.(${game}_[a-z0-9_]+)`, 'g'))) keys.add(m[1])
      // `facts['game_key'] = …`
      for (const m of src.matchAll(new RegExp(`facts\\['(${game}_[a-z0-9_]+)'\\]`, 'g'))) keys.add(m[1])

      expect(keys.size, `${file} emits no counters — did the naming change?`).toBeGreaterThan(0)
      const unknown = [...keys].filter((k) => !isKnownCounter(k))
      expect(unknown, 'unregistered in counters.ts — these trophies could never be earned').toEqual([])
    })
  }
})

/**
 * Codewords builds four keys by template (`codewords_clue<n>_full`), which the source scan above
 * cannot see. They are asserted explicitly so a rename there fails here too.
 */
describe('template-built counters', () => {
  it('codewords clue-for-N keys are registered', () => {
    for (const n of [2, 3, 4, 5]) {
      expect(isKnownCounter(`codewords_clue${n}_full`), `codewords_clue${n}_full`).toBe(true)
    }
  })
})
