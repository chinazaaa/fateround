import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TRIVIA_CATEGORY_OPTIONS, triviaCategoryLabel } from '@/lib/trivia-questions'
import { triviaCategoryFromGame } from '@/lib/trivia'
import type { TriviaCategory } from '@/types'

/**
 * Guard for the "picked Maths, told General knowledge" bug class.
 *
 * `trivia_category` has seventeen values, but several READ sites had collapsed it to a
 * binary `=== 'tech' ? 'Tech' : 'General knowledge'`. The stored value was always correct;
 * every display of it was wrong for the other fifteen categories. Worse, mobile's lobby
 * settings sheet coerced the same way into its own state, so re-opening the settings of a
 * Maths room showed "General" preselected — one tap from writing that back.
 *
 * These tests pin the three things that made it possible: an incomplete label map, an
 * incomplete picker, and a read site rendering the column with its own inline conditional.
 */

const REPO = process.cwd()

/** The union, read off the type so a new category fails here rather than silently defaulting. */
function categoriesFromType(): string[] {
  const src = readFileSync(join(REPO, 'src', 'types', 'index.ts'), 'utf8')
  // Union members only: stop at the first line that isn't a `| 'value'` continuation,
  // or the next `export type` swallows its members too.
  const match = /export type TriviaCategory =\n((?:\s*\|\s*'[a-z_]+'\n)+)/.exec(src)
  if (!match) throw new Error('could not find the TriviaCategory union in src/types/index.ts')
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

describe('trivia category labels', () => {
  const categories = categoriesFromType()

  it('reads the union from the type (the guard is looking at something)', () => {
    expect(categories.length).toBeGreaterThanOrEqual(17)
    expect(categories).toContain('math')
  })

  it('every category has its own label — none falls through to the general one', () => {
    const general = triviaCategoryLabel('general')
    const missing = categories.filter((c) => c !== 'general' && triviaCategoryLabel(c) === general)
    expect(missing, 'these categories render as the general label — add them to TRIVIA_CAT_LABELS').toEqual([])
  })

  it('labels are distinct, so two categories are never indistinguishable in a chip', () => {
    const labels = categories.map((c) => triviaCategoryLabel(c))
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('the picker offers every category', () => {
    const offered = new Set(TRIVIA_CATEGORY_OPTIONS.map((o) => o.value as string))
    const missing = categories.filter((c) => !offered.has(c))
    expect(missing, 'not selectable in the create page or lobby edit sheet').toEqual([])
  })

  it('an unknown or absent value still renders a label, never a raw enum value', () => {
    expect(triviaCategoryLabel(null)).toBe(triviaCategoryLabel('general'))
    expect(triviaCategoryLabel('not_a_category')).toBe(triviaCategoryLabel('general'))
  })

  it('the label survives the round trip a lobby chip actually makes', () => {
    // How GameInfoChips gets there: a raw column off the game row, through the reader.
    const cat = triviaCategoryFromGame({ trivia_category: 'math' } as { trivia_category: TriviaCategory })
    expect(triviaCategoryLabel(cat)).toBe('Math')
  })
})

describe('no read site collapses the category to a tech/general binary', () => {
  // The exact shape of the original bug, in every file that used to carry it. Matching on
  // the pattern rather than the file list means a NEW site that reinvents it also fails.
  const BINARY = /trivia_category\s*===\s*'tech'\s*\?/

  const FILES = [
    'src/components/game-lobby/GameInfoChips.tsx',
    'apps/mobile/components/GameInfoChips.tsx',
    'apps/mobile/components/host/HostLobbySettingsSheet.tsx',
    'packages/shared/src/trivia.ts',
    'src/lib/trivia.ts',
  ]

  it.each(FILES)('%s reads the column through a label/clamp helper', (rel) => {
    const src = readFileSync(join(REPO, rel), 'utf8')
    expect(BINARY.test(src), `${rel} still branches on trivia_category === 'tech'`).toBe(false)
  })

  // Same bug, different column: pickers that offer two of the seventeen. The lobby sheets are
  // covered by the "picker offers every category" test above (they share the options list);
  // these two hand-rolled their own two-item arrays.
  const PICKERS = [
    'apps/mobile/components/create/CustomContentPanel.tsx',
    'apps/mobile/components/host/lobby-settings/TriviaLobbySection.tsx',
    'apps/mobile/components/create/PartyRoomSettingsPanel.tsx',
    'src/components/trivia/TriviaPlayAgainSetup.tsx',
    'src/app/create/page.tsx',
  ]

  it.each(PICKERS)('%s feeds its category picker from the shared options list', (rel) => {
    const src = readFileSync(join(REPO, rel), 'utf8')
    expect(src, `${rel} must use TRIVIA_CATEGORY_OPTIONS`).toMatch(/TRIVIA_CATEGORY_OPTIONS/)
    // The exact shape that was there before: a literal pair of General/Tech options.
    expect(
      /\{\s*value: '(general|tech)'[\s\S]{0,80}?\{\s*value: '(general|tech)'[\s\S]{0,80}?\]/.test(src) &&
        !/TRIVIA_CATEGORY_OPTIONS/.test(src),
      `${rel} still hand-rolls a two-option category picker`
    ).toBe(false)
  })

  it('imported questions are tagged with the game category, not always general', () => {
    // Web has always passed the game's category into its importer; mobile hardcoded 'general',
    // so a Maths room that imported its own CSV got a pool tagged General.
    const parser = readFileSync(join(REPO, 'apps/mobile/lib/file-import.ts'), 'utf8')
    expect(parser).toMatch(/parseTriviaCsv\(text: string, category: TriviaCategory/)
    expect(parser, 'must stamp the passed category').not.toMatch(/correctIndex, category: 'general'/)
    const panel = readFileSync(join(REPO, 'apps/mobile/components/create/CustomContentPanel.tsx'), 'utf8')
    expect(panel).toMatch(/parseTriviaCsv\(text, triviaCategory/)
  })

  it('the shared metadata parser keeps a non-binary category', () => {
    expect(readFileSync(join(REPO, 'packages/shared/src/trivia.ts'), 'utf8')).not.toMatch(
      /m\.category === 'tech' \|\| m\.category === 'general'/
    )
  })
})
