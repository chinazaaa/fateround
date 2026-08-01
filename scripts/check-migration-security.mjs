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
//
// The FOR clause is OPTIONAL in Postgres and defaults to ALL — so `create policy x on t
// using (true)` is fully anon-writable. An earlier version of this pattern required `for
// <cmd>`, which meant the single most dangerous statement it could encounter was the one
// shape it silently ignored (flagged in review on PR #738). An absent clause is now read
// as ALL.
//
// Terminator is `;` OR end-of-input, so a final statement without a trailing semicolon
// can't slip past either.
// Matches a whole CREATE POLICY statement; the command is parsed out of the captured body
// rather than baked into this pattern.
//
// Two traps this shape avoids, both found in review on PR #738:
//   * The FOR clause is OPTIONAL in Postgres and defaults to ALL, so `create policy x on t
//     using (true)` is fully anon-writable — the single most dangerous statement the gate
//     can meet was the one shape an earlier `\bfor\s+(...)` pattern silently skipped.
//   * That clause is routinely on a LATER LINE than `on <table>`, so anything that stops at
//     a newline misreads a real `for select` policy as an implicit ALL and cries wolf.
// Terminating on `;` OR end-of-input also stops a final unterminated statement slipping by.
const CREATE_POLICY_RE = /create\s+policy\s+"?([a-z0-9_]+)"?\s+on\s+([\s\S]*?)(?=;|$)/gi

/** The command a policy applies to. An absent FOR clause means ALL (Postgres default). */
function policyCommand(statementBody) {
  const m = /\bfor\s+(all|insert|update|delete|select)\b/i.exec(statementBody)
  return m ? m[1].toLowerCase() : 'all'
}

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
    const [, name, body] = match
    if (ALLOWLIST.has(name)) continue
    const cmd = policyCommand(body)
    // A SELECT-only policy grants no writes; reads staying open is the documented decision in
    // docs/rls-hardening.md, so those are not violations.
    if (cmd === 'select') continue
    const implicit = !/\bfor\s+(all|insert|update|delete|select)\b/i.test(body)
    if (isAnonReachable(body)) {
      violations.push(
        `${file}: policy "${name}" is FOR ${cmd.toUpperCase()}${implicit ? ' (implicit — no FOR clause)' : ''} and anon/PUBLIC-reachable with USING/CHECK(true)`
      )
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
