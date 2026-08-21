#!/usr/bin/env node
/**
 * Fails a `dev -> main` PR that would revoke a column installed mobile builds still select.
 *
 * WHY THIS EXISTS
 * `expo-updates` reads its update URL and runtimeVersion from config baked into the native
 * binary at build time, and no valid config has ever shipped (app.json's only `updates` block
 * was a `replace-with-eas-project-id` placeholder, added 2026-07-10 and removed the next day).
 * So a shipped build CANNOT be rolled forward over the air — only by a store release.
 *
 * PostgREST fails the WHOLE select on 42501, so revoking a column that an installed build names
 * does not degrade the feature, it takes the game offline for those users until they update.
 *
 * The repo's own mobile source being fixed proves nothing: the risk is what is already on
 * people's phones. That is why this gate cannot clear itself and needs a human acknowledgement.
 */
import { execFileSync } from 'node:child_process'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })
const ACK = 'MOBILE-ROLLOUT-ACK'

/** Columns a migration takes away, from either shape used in this repo. */
function revokedColumns(sql) {
  const cols = new Set()
  // 1. select public.sec_regrant_except('table', array['a', 'b']);
  for (const m of sql.matchAll(/sec_regrant_except\(\s*'[^']+'\s*,\s*array\[([^\]]*)\]/gi)) {
    for (const c of m[1].matchAll(/'([^']+)'/g)) cols.add(c[1])
  }
  // 2. hand-rolled do-block: ... column_name not in ('a', 'b') ... revoke select on public.x
  if (/revoke\s+select\s+on\s+public\./i.test(sql)) {
    for (const m of sql.matchAll(/column_name\s+not\s+in\s*\(([^)]*)\)/gi)) {
      for (const c of m[1].matchAll(/'([^']+)'/g)) cols.add(c[1])
    }
    for (const m of sql.matchAll(/column_name\s*<>\s*'([^']+)'/gi)) cols.add(m[1])
  }
  return [...cols]
}

const base = process.env.BASE_SHA
const head = process.env.HEAD_SHA
if (!base || !head) {
  console.error('BASE_SHA and HEAD_SHA are required')
  process.exit(1)
}

// Migrations this PR would ADD to main.
const added = git('diff', '--name-only', '--diff-filter=A', base, head, '--', 'supabase/migrations')
  .split('\n')
  .filter((f) => f.endsWith('.sql'))

// What installed builds select — mobile's selects as they exist on the BASE (already shipped).
let shippedSelects = ''
try {
  shippedSelects = git('show', `${base}:apps/mobile/lib/supabase-selects.ts`)
} catch {
  console.log('note: apps/mobile/lib/supabase-selects.ts absent on base — nothing to protect')
  process.exit(0)
}

const risky = []
for (const file of added) {
  let sql = ''
  try {
    sql = git('show', `${head}:${file}`)
  } catch {
    continue
  }
  for (const col of revokedColumns(sql)) {
    // Word-boundary match so `key` does not match `monkey` / `key_totals`.
    if (new RegExp(`\\b${col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(shippedSelects)) {
      risky.push({ file, col })
    }
  }
}

if (risky.length === 0) {
  console.log(`✅ No newly revoked column is named by mobile's shipped selects (${added.length} migration(s) checked).`)
  process.exit(0)
}

const body = process.env.PR_BODY ?? ''
const acked = body.includes(ACK)

console.log('Columns revoked by this PR that installed mobile builds still select:')
for (const r of risky) console.log(`  ${r.col.padEnd(22)} ${r.file}`)

if (acked) {
  console.log(`\n✅ ${ACK} present — rollout consciously accepted by the PR author.`)
  process.exit(0)
}

console.error(`
❌ BLOCKED — this promotion would break those games on every installed mobile build.

PostgREST fails the whole select on 42501, so affected users lose the game entirely
until they update from the store. OTA cannot rescue them: expo-updates config is baked
into the native binary and no valid one has ever shipped.

Choose one, then re-run:

  1. Ship the mobile build that stops selecting these columns, wait for adoption, then promote.
  2. Accept a recorded breakage window — add a line to the PR description:

       ${ACK}: <who decided, and why it is acceptable>

This gate cannot clear itself from repo state: fixing mobile's source here does not update
the binaries already on people's phones.
`)
process.exit(1)
