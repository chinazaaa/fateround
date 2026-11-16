import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const FILE = '20261130130000_sec_gofish_hide_hands_and_ocean.sql'
const sql = readFileSync(join(ROOT, 'supabase', 'migrations', FILE), 'utf8')

describe('Go Fish hide hands + ocean migration', () => {
  it('passes the migration security gate', () => {
    const out = execFileSync('node', [join(ROOT, 'scripts', 'check-migration-security.mjs')], { encoding: 'utf8' })
    expect(out).toContain('passed')
  })

  it('is stamped after 20261130120000', () => {
    expect(FILE.slice(0, 14) > '20261130120000').toBe(true)
  })

  it('revokes exactly the secret columns via the validating helper', () => {
    expect(sql).toMatch(/sec_regrant_except\('gofish_sessions',\s*array\['ocean'\]\)/)
    expect(sql).toMatch(/sec_regrant_except\('gofish_player_hands',\s*array\['cards'\]\)/)
  })

  it('skips cleanly when the tables are absent and drops nothing', () => {
    expect(sql).toMatch(/to_regclass\('public\.gofish_sessions'\) is null/)
    expect(sql).not.toMatch(/drop\s+(table|column)/i)
  })

  it('keeps service_role access explicit', () => {
    expect(sql).toMatch(/grant all on table public\.gofish_sessions to service_role/)
    expect(sql).toMatch(/grant all on table public\.gofish_player_hands to service_role/)
  })
})
