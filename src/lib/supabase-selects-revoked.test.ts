import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as webSelects from './supabase-selects'

/**
 * PostgREST fails an ENTIRE select with 42501 if any requested column is revoked from anon.
 * This guard replays every column-list `revoke select (...) on public.games` / `grant select
 * (...)` in migration order and asserts no curated games select names a still-revoked column.
 */
const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations')

function revokedAnonGamesColumns(): Set<string> {
  const revoked = new Set<string>()
  const re = /\b(revoke|grant)\s+select\s*\(([^)]*)\)\s*on\s+(?:table\s+)?(?:public\.)?games\s+(?:from|to)\s+([^;]+);/gi
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[^\n]*/g, '')
    for (const m of sql.matchAll(re)) {
      if (!/\b(anon|public)\b/i.test(m[3])) continue
      const cols = m[2]
        .split(',')
        .map((c) => c.trim().replace(/"/g, '').toLowerCase())
        .filter(Boolean)
      for (const c of cols) {
        if (m[1].toLowerCase() === 'revoke') revoked.add(c)
        else revoked.delete(c)
      }
    }
  }
  return revoked
}

/** Mobile has its own tsconfig (not loadable from the root vitest), so read it as text. */
function mobileGameSelect(): string {
  const src = readFileSync(path.resolve(__dirname, '../../apps/mobile/lib/supabase-selects.ts'), 'utf8')
  const m = src.match(/export const GAME_SELECT\s*=\s*(['"`])([^'"`]*)\1/)
  if (!m) throw new Error('GAME_SELECT not found in apps/mobile/lib/supabase-selects.ts')
  return m[2]
}

function gamesSelects(label: string): Array<[string, string[]]> {
  const split = (v: string) => v.split(',').map((c) => c.trim().toLowerCase())
  if (label === 'mobile') return [['GAME_SELECT', split(mobileGameSelect())]]
  return [
    ['GAME_SELECT', split(webSelects.GAME_SELECT)],
    ['HOST_GAME_SELECT', split(webSelects.HOST_GAME_SELECT)],
  ]
}

describe('curated games selects never name columns revoked from anon', () => {
  const revoked = revokedAnonGamesColumns()

  it('parser finds the known revoked columns (sanity)', () => {
    expect(revoked.has('ai_questions_enabled')).toBe(true)
    expect(revoked.has('sessions_played')).toBe(true)
  })

  for (const label of ['web', 'mobile']) {
    it(`${label} games selects name no revoked column`, () => {
      const selects = gamesSelects(label)
      expect(selects.length).toBeGreaterThan(0)
      const offenders: string[] = []
      for (const [name, cols] of selects) {
        for (const c of cols) if (revoked.has(c)) offenders.push(`${name}: ${c}`)
      }
      expect(offenders).toEqual([])
    })
  }
})
