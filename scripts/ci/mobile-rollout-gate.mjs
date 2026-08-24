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

/**
 * Columns a migration takes away, PAIRED WITH THE RELATION they belong to.
 *
 * The relation matters. An earlier version returned bare column names and matched them against
 * the whole mobile selects file, so revoking `id` from any table matched the `id` in every
 * select — and `id`, `game_id`, `player_id` and `status` appear in most of them. That gate
 * blocked nearly every revoke regardless of table, and a gate that cries wolf gets ignored.
 */
function revokedColumns(sql) {
  const pairs = []
  // 1. select public.sec_regrant_except('table', array['a', 'b']);
  for (const m of sql.matchAll(/sec_regrant_except\(\s*'([^']+)'\s*,\s*array\[([^\]]*)\]/gi)) {
    const relation = m[1]
    for (const c of m[2].matchAll(/'([^']+)'/g)) pairs.push({ relation, col: c[1] })
  }
  // 2. hand-rolled do-block: ... column_name not in ('a','b') ... revoke select on public.x
  //    The relation comes from the revoke statement in the same file.
  const revoked = [...sql.matchAll(/revoke\s+select\s+on\s+(?:table\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi)].map(
    (m) => m[1]
  )
  if (revoked.length > 0) {
    const cols = new Set()
    for (const m of sql.matchAll(/column_name\s+not\s+in\s*\(([^)]*)\)/gi)) {
      for (const c of m[1].matchAll(/'([^']+)'/g)) cols.add(c[1])
    }
    for (const m of sql.matchAll(/column_name\s*<>\s*'([^']+)'/gi)) cols.add(m[1])
    for (const relation of new Set(revoked)) for (const col of cols) pairs.push({ relation, col })
  }
  return pairs
}

/**
 * The mobile select constants that read a given relation, as `{ name, value }`.
 *
 * Mobile names them after the table — `uno_sessions` -> `UNO_SESSION_SELECT`,
 * `bingo_cards` -> `BINGO_CARD_SELECT` — so match on the table's words, singularising the last
 * one. Returning the matched constants (rather than the whole file) is what makes the column
 * check relation-scoped.
 */
function selectsForRelation(source, relation) {
  const words = relation.toLowerCase().split('_').filter(Boolean)
  const last = words[words.length - 1]
  const variants = new Set([words.join('_'), [...words.slice(0, -1), last.replace(/s$/, '')].join('_')])
  const out = []
  for (const m of source.matchAll(/export const ([A-Z0-9_]+_SELECT)\s*=\s*\n?\s*'([^']*)'/g)) {
    const norm = m[1].replace(/_SELECT$/, '').toLowerCase()
    if (variants.has(norm)) out.push({ name: m[1], value: m[2] })
  }
  return out
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
  for (const { relation, col } of revokedColumns(sql)) {
    const selects = selectsForRelation(shippedSelects, relation)
    if (selects.length > 0) {
      // Word-boundary match so `key` does not match `monkey` / `key_totals`.
      const re = new RegExp(`\\b${col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
      for (const sel of selects) {
        if (re.test(sel.value)) risky.push({ file, relation, col, via: sel.name })
      }
      continue
    }
    // No select constant maps to this relation. If the table name appears nowhere in the shipped
    // mobile source, installed builds cannot be querying it and the revoke is safe. If it DOES
    // appear (an inline select, say), we cannot prove which columns are read — fail closed,
    // because the cost of being wrong is a store release.
    let mentioned = ''
    try {
      mentioned = git('grep', '-l', relation, base, '--', 'apps/mobile')
    } catch {
      mentioned = ''
    }
    if (mentioned.trim()) {
      risky.push({ file, relation, col, via: 'mobile source mentions this table (no named select to check)' })
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
