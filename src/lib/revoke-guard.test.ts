// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

// The revoke guard lives inline in .github/workflows/ci.yml and only runs on a push to dev/main, so
// no pull request ever executes it. This runs the REAL block (extracted between its sentinels) against
// a stubbed `supabase` CLI so a change to it is exercised before it reaches a deploy (#1173).

const ROOT = process.cwd()
const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')
const lines = ci.split('\n')
const begin = lines.findIndex((l) => l.includes('revoke-guard:begin'))
const end = lines.findIndex((l) => l.includes('revoke-guard:end'))
if (begin < 0 || end < begin) throw new Error('revoke-guard sentinels not found in .github/workflows/ci.yml')
const GUARD = [
  'case "${GITHUB_REF_NAME:-}" in',
  '  main) GUARD_ENV="Production" ;;',
  '  *)    GUARD_ENV="Preview" ;;',
  'esac',
  'GUARD_TARGET="$GUARD_ENV (ref ${GITHUB_REF_NAME:-unknown}, Supabase project $REF)"',
  ...lines.slice(begin, end),
].join('\n')

const row = (local: string, remote = local) => `   ${local.padEnd(14)} | ${remote.padEnd(14)} | 2026-01-01 00:00:00`
const listing = (...rows: string[]) =>
  [
    '   Local          | Remote         | Time (UTC)',
    '  ---------------|----------------|---------------------',
    ...rows,
  ].join('\n')

const dirs: string[] = []
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

function runGuard(opts: { cwd?: string; files?: Record<string, string>; listing: string; ack?: string; ref?: string }) {
  const work = mkdtempSync(join(tmpdir(), 'revoke-guard-'))
  dirs.push(work)
  const bin = join(work, 'bin')
  mkdirSync(bin)
  writeFileSync(join(work, 'listing.txt'), opts.listing)
  writeFileSync(
    join(bin, 'supabase'),
    '#!/bin/sh\nif [ "$1" = migration ]; then cat "$LISTING_FILE"; else echo "unexpected supabase $*" >&2; exit 99; fi\n'
  )
  chmodSync(join(bin, 'supabase'), 0o755)
  writeFileSync(join(work, 'guard.sh'), GUARD)
  let cwd = opts.cwd
  if (!cwd) {
    cwd = join(work, 'repo')
    mkdirSync(join(cwd, 'supabase/migrations'), { recursive: true })
    for (const [name, body] of Object.entries(opts.files ?? {}))
      writeFileSync(join(cwd, 'supabase/migrations', name), body)
  }
  const r = spawnSync('bash', ['-e', '-o', 'pipefail', join(work, 'guard.sh')], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      LISTING_FILE: join(work, 'listing.txt'),
      GITHUB_REF_NAME: opts.ref ?? 'dev',
      REF: 'testref',
      MOBILE_ROLLOUT_ACK: opts.ack ?? '',
    },
  })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}

const REVOKE = 'revoke select (secret_col) on public.games from anon;\n'
const files = {
  '0001_base.sql': 'create table public.games (id int);\n',
  '0129_hide_secret.sql': REVOKE,
  '20261201120000_additive.sql': 'alter table public.games add column note text;\n',
}

describe('revoke guard (ci.yml migrate job)', () => {
  it('passes when every migration is already applied, and reports all of them', () => {
    const r = runGuard({ files, listing: listing(row('0001'), row('0129'), row('20261201120000')) })
    expect(r.status).toBe(0)
    expect(r.out).toContain('Revoke guard: 3 migrations known')
  })

  it('blocks a pending revoke in a SHORT-prefix migration (#1173: the guard used to ignore these)', () => {
    const r = runGuard({ files, listing: listing(row('0001'), row('0129', ''), row('20261201120000')) })
    expect(r.status).toBe(1)
    expect(r.out).toContain('0129_hide_secret.sql (version 0129)')
  })

  it('lets that revoke through once its exact version is acknowledged', () => {
    const r = runGuard({
      files,
      ack: '0129',
      listing: listing(row('0001'), row('0129', ''), row('20261201120000')),
    })
    expect(r.status).toBe(0)
    expect(r.out).toContain('0129_hide_secret.sql acknowledged by MOBILE_ROLLOUT_ACK')
  })

  it('does not treat a pending ADDITIVE migration as a revoke', () => {
    const r = runGuard({ files, listing: listing(row('0001'), row('0129'), row('20261201120000', '')) })
    expect(r.status).toBe(0)
  })

  it('still blocks a long-prefix pending revoke', () => {
    const r = runGuard({
      files: { ...files, '20261202120000_hide.sql': REVOKE },
      listing: listing(row('0001'), row('0129'), row('20261201120000'), row('20261202120000', '')),
    })
    expect(r.status).toBe(1)
    expect(r.out).toContain('20261202120000_hide.sql')
  })

  it('does not let an earlier `--` on the same line hide a revoke', () => {
    const r = runGuard({
      files: { ...files, '0130_sneaky.sql': "select '--'; revoke select (x) on public.games from anon;\n" },
      listing: listing(row('0001'), row('0129'), row('0130', ''), row('20261201120000')),
    })
    expect(r.status).toBe(1)
    expect(r.out).toContain('0130_sneaky.sql')
  })

  it('ignores a whole-line comment that merely mentions revoke', () => {
    const r = runGuard({
      files: { ...files, '0130_note.sql': '-- we considered a revoke here but did not\nselect 1;\n' },
      listing: listing(row('0001'), row('0129'), row('0130', ''), row('20261201120000')),
    })
    expect(r.status).toBe(0)
  })

  it('fails closed when the listing shows fewer versions than there are files', () => {
    const r = runGuard({ files, listing: listing(row('0001'), row('20261201120000')) })
    expect(r.status).toBe(1)
    expect(r.out).toContain('saw 2 migration versions')
    expect(r.out).toContain('has 3 .sql files')
  })

  it('fails closed on an empty or unparseable listing', () => {
    expect(runGuard({ files, listing: '' }).status).toBe(1)
    expect(runGuard({ files, listing: 'something unexpected\n' }).status).toBe(1)
  })

  it('is not thrown off by prose lines around the table', () => {
    const r = runGuard({
      files,
      listing: `Connecting to remote database...\n${listing(row('0001'), row('0129'), row('20261201120000'))}\nA new version of Supabase CLI is available: v2.122.0 (currently v2.108.0)\n`,
    })
    expect(r.status).toBe(0)
    expect(r.out).toContain('3 migrations known')
  })

  it("sees every migration in this repo's own supabase/migrations directory", () => {
    const names = readdirSync(join(ROOT, 'supabase/migrations')).filter((n) => n.endsWith('.sql'))
    const versions = names.map((n) => n.split('_')[0])
    const r = runGuard({ cwd: ROOT, listing: listing(...versions.map((v) => row(v))) })
    expect(r.status).toBe(0)
    expect(r.out).toContain(`Revoke guard: ${names.length} migrations known`)
  })
})
