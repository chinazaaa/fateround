import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard: every custom-content editor can be emptied.
 *
 * Importing a CSV APPENDS to whatever is already in the list, so "start over with my own
 * file" needs a way to clear it first. Two of the four editors (puzzle, list) had a "Clear
 * all" header; trivia and pairs did not — leaving a host deleting question cards one at a
 * time, and unable to delete the last one at all, because the per-row delete button is hidden
 * when only one row remains. Reported as "in your own I can't clear all so I can import my own".
 */

const PANEL = readFileSync(
  join(process.cwd(), 'apps', 'mobile', 'components', 'create', 'CustomContentPanel.tsx'),
  'utf8'
)

/** The four editors the panel routes to, one per content kind. */
const EDITORS = ['PuzzleEditor', 'ListEditor', 'PairEditor', 'TriviaEditor']

function bodyOf(name: string): string {
  const start = PANEL.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`${name} not found — did it get renamed?`)
  // Up to the next top-level `function ` declaration, or the end of the file.
  const next = PANEL.indexOf('\nfunction ', start + 1)
  return PANEL.slice(start, next < 0 ? undefined : next)
}

describe('custom-content editors can all be cleared', () => {
  it.each(EDITORS)('%s renders the shared Clear all header', (name) => {
    expect(bodyOf(name), `${name} has no way to empty its list before an import`).toMatch(/<ListHeader/)
  })

  it('the header appears while a single entry still has content', () => {
    // The gate used to be `length > 1`, which is exactly the case with no way out: one
    // leftover question, no per-row delete, no clear.
    expect(PANEL).toMatch(/if \(filled === 0 && total <= 1\) return null/)
  })

  it('clearing leaves something to type into where the editor has no add-first affordance', () => {
    expect(bodyOf('TriviaEditor'), 'an empty trivia array renders no card at all').toMatch(
      /onClear=\{\(\) => onChange\(\{ trivia: \[emptyTriviaDraft\(\)\] \}\)\}/
    )
  })

  it('import still appends, so clearing is the only way to replace', () => {
    // Not a bug — appending is what lets a host build a pool from several files. It is the
    // reason Clear all has to exist, so pin it: if this ever becomes a replace, revisit above.
    expect(PANEL).toMatch(/onChange\(\{ trivia: \[\.\.\.existing, \.\.\.rows\] \}\)/)
  })
})
