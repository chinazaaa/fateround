import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Play Again reuses the game id (and can reuse the turn index) with a NEW word_rush_sessions row, so every UPDATE of a
 * session row made by code that inspected a session must name that session's id: a stale call then matches nothing.
 * Audited statically so a new write cannot silently skip it.
 */
const SRC = readFileSync(join(process.cwd(), 'src', 'lib', 'word-rush-server.ts'), 'utf8')

/** The index just after the parenthesis group opening at `open` (balanced; strings and comments are not special-cased). */
function closeOf(src: string, open: number): number {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')' && --depth === 0) return i + 1
  }
  return src.length
}

/** `from('word_rush_sessions').update(...)` plus every chained call after it (`.eq(...)`, `.select(...)`, ...). */
function chains(): string[] {
  const out: string[] = []
  const re = /from\('word_rush_sessions'\)\s*\.update\(/g
  for (let m = re.exec(SRC); m; m = re.exec(SRC)) {
    let end = closeOf(SRC, m.index + m[0].length - 1)
    for (;;) {
      const next = /^(?:\s|\/\/[^\n]*)*\.\w+\(/.exec(SRC.slice(end))
      if (!next) break
      end = closeOf(SRC, end + next[0].length - 1)
    }
    out.push(SRC.slice(m.index, end))
  }
  return out
}

describe('word_rush_sessions writes in word-rush-server.ts', () => {
  const statements = chains()

  it('finds the statements', () => {
    expect(statements.length).toBeGreaterThanOrEqual(9)
  })

  it.each(statements.map((s) => [s.replace(/\s+/g, ' ').slice(0, 70), s]))(
    '%s names the session id',
    (_label, stmt) => {
      // The one exception creates the session state from the host's start request (it replaces the whole row on purpose).
      if (/\.update\(row\)/.test(stmt)) return
      expect(stmt).toMatch(/\.eq\('id', (session\.id|pending\.session_id)\)/)
    }
  )
})
