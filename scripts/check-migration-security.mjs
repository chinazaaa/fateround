#!/usr/bin/env node
// Static supply-chain / RLS regression gate for NEW Supabase migrations.
//
// The 2026-07 audit root cause: the RLS lockdown was a one-time manual sweep, and
// every game mode / table added afterwards silently shipped anon-writable. This gate
// runs on every PR (no DB, no secrets) and fails if a migration dated after the
// hardening cutoff reintroduces a permissive, anon-reachable write policy — the exact
// regression class. Existing history is untouched (only files past the cutoff are
// checked), and the deep runtime assertions live in scripts/security-invariants.sql.
//
// If a new table genuinely needs an anon write policy, add its create-policy name to
// ALLOWLIST below with a comment justifying it (e.g. anonymous feedback insert).

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')

// Only files with a numeric version strictly greater than this are enforced, so we
// never re-litigate shipped history. Bump this alongside a deliberate exception.
const CUTOFF_VERSION = '20260803120500'

// Policy names that are intentionally anon-writable (narrow, justified inserts).
const ALLOWLIST = new Set([
  // e.g. 'app_feedback_insert' — anonymous feedback submission (INSERT only).
])

// Flags a CREATE POLICY that is FOR ALL (or a write command) reachable by anon/public
// with an unconditional USING(true)/WITH CHECK(true). SELECT-only policies are ignored.
const CREATE_POLICY_RE =
  /create\s+policy\s+"?([a-z0-9_]+)"?\s+on\s+[^\n]*?\bfor\s+(all|insert|update|delete)\b([\s\S]*?)(?=;)/gi

function versionOf(filename) {
  const m = filename.match(/^(\d+)_/)
  return m ? m[1] : null
}

function isAnonReachable(policyBody) {
  const body = policyBody.toLowerCase()
  // Explicit anon/public target, or no `to <role>` clause at all (defaults to PUBLIC).
  const namesAnon = /\bto\s+[^\n]*\b(anon|public)\b/.test(body)
  const hasToClause = /\bto\s+(anon|authenticated|public|service_role|postgres)\b/.test(body)
  const permissive = /using\s*\(\s*true\s*\)/.test(body) || /with\s+check\s*\(\s*true\s*\)/.test(body)
  return permissive && (namesAnon || !hasToClause)
}

const violations = []
for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
  const version = versionOf(file)
  if (!version || version <= CUTOFF_VERSION) continue
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
  for (const match of sql.matchAll(CREATE_POLICY_RE)) {
    const [, name, cmd, body] = match
    if (ALLOWLIST.has(name)) continue
    if (isAnonReachable(body)) {
      violations.push(`${file}: policy "${name}" is FOR ${cmd.toUpperCase()} and anon/PUBLIC-reachable with USING/CHECK(true)`)
    }
  }
}

if (violations.length > 0) {
  console.error('Migration security gate FAILED — anon-writable policy introduced:')
  for (const v of violations) console.error(`  ✗ ${v}`)
  console.error(
    '\nGameplay tables must be SELECT-only for anon (writes go through the service-role\n' +
      'server routes). If this is intentional, add the policy name to ALLOWLIST in\n' +
      'scripts/check-migration-security.mjs with a justification.'
  )
  process.exit(1)
}

console.log('Migration security gate passed — no new anon-writable policies.')
