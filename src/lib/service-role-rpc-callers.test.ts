// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * These database functions are granted to service_role ONLY (their migrations revoke them from public, anon and
 * authenticated): a call through the anon client fails at runtime, and does so only on the rarely-taken path that
 * reaches it (an expired room, a lost finish race). Two checks, stated for what they prove:
 *
 *   1. WHICH FILES call them (pinned below: a new call site must be added to the list, the moment to check its client).
 *   2. WHAT RECEIVES the call, per call site, on the syntax tree: never the anon client, whether it is called directly
 *      (`getSupabaseAnon().rpc(...)`) or through a module-level binding initialised from it (the `const supabase =
 *      getSupabaseAnon()` of the route files). A library helper that takes the client as a PARAMETER is not provable here:
 *      the helper's callers supply it, and passing an admin client to it is the contract (each caller is covered by its own
 *      route test).
 */
const ALLOWED: Record<string, string[]> = {
  settle_host_leave: ['src/app/api/players/route.ts'],
  end_game_if_host_alone: ['src/app/api/players/route.ts'],
  wipe_finished_session_rows: ['src/lib/session-clear.ts'],
  insert_anonymous_message_if_active: ['src/app/api/anonymous-messages/route.ts'],
  insert_codewords_message_if_active: ['src/app/api/codewords/chat/route.ts'],
  remove_player_if_game_open: ['src/lib/codewords.ts'],
  start_two_truths_game: ['src/app/api/games/[code]/start/route.ts'],
  word_rush_remove_player: ['src/lib/word-rush-server.ts', 'src/lib/pending-leave.ts'],
  finish_rounds_of_finished_session: ['src/lib/admin-end-game.ts'],
  activate_ttl_round: ['src/lib/two-truths-advance.ts'],
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

describe('service-role-only database functions', () => {
  const files = sourceFiles(join(process.cwd(), 'src'))

  it.each(Object.entries(ALLOWED))('%s is called only from the audited files', (fn, allowed) => {
    const callers = files
      .filter((f) => new RegExp(`\\.rpc\\(\\s*['"]${fn}['"]`).test(readFileSync(f, 'utf8')))
      .map((f) => relative(process.cwd(), f).replaceAll('\\', '/'))
      .sort()
    expect(callers).toEqual([...allowed].sort())
  })

  it('the anonymous-messages route never hands its anon client to a finisher that wipes', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/anonymous-messages/route.ts'), 'utf8')
    expect(route).not.toMatch(/finishExpiredAnonymousSession\(\s*supabase\b/)
  })

  /** Names bound at module level from `getSupabaseAnon()` in a file. */
  function anonBindings(sf: ts.SourceFile): Set<string> {
    const names = new Set<string>()
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue
      for (const d of st.declarationList.declarations) {
        if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          ts.isCallExpression(d.initializer) &&
          ts.isIdentifier(d.initializer.expression) &&
          d.initializer.expression.text === 'getSupabaseAnon'
        ) {
          names.add(d.name.text)
        }
      }
    }
    return names
  }

  /** The receivers of every `.rpc('<fn>', ...)` call in a source text, as source text. */
  function rpcReceivers(code: string, fns: string[]): Array<{ fn: string; receiver: string; anon: boolean }> {
    const sf = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, true)
    const anon = anonBindings(sf)
    const out: Array<{ fn: string; receiver: string; anon: boolean }> = []
    const visit = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === 'rpc' &&
        n.arguments[0] &&
        ts.isStringLiteralLike(n.arguments[0]) &&
        fns.includes(n.arguments[0].text)
      ) {
        const recv = n.expression.expression
        const text = recv.getText(sf)
        const direct = ts.isCallExpression(recv) && recv.expression.getText(sf) === 'getSupabaseAnon'
        out.push({ fn: n.arguments[0].text, receiver: text, anon: direct || (ts.isIdentifier(recv) && anon.has(text)) })
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
    return out
  }

  it('no call site of a service-role-only function is made on the anon client (per call site, on the syntax tree)', () => {
    const fns = Object.keys(ALLOWED)
    const offenders: string[] = []
    for (const f of files) {
      const code = readFileSync(f, 'utf8')
      // Cheap text filter first: parsing every source file is slow on CI.
      if (!fns.some((fn) => code.includes(fn))) continue
      for (const c of rpcReceivers(code, fns)) {
        if (c.anon) offenders.push(`${relative(process.cwd(), f)}: ${c.fn} on ${c.receiver}`)
      }
    }
    expect(offenders).toEqual([])
  }, 30_000)

  it('the receiver check sees the anon client (self-check: a second call through the anon client is caught)', () => {
    const code = `
      import { getSupabaseAnon } from '@/lib/supabase-anon'
      import { getSupabaseAdmin } from '@/lib/supabase-admin'
      const supabase = getSupabaseAnon()
      async function ok() { await getSupabaseAdmin().rpc('settle_host_leave', {}) }
      async function viaAdminVariable() { const admin = getSupabaseAdmin(); await admin.rpc('settle_host_leave', {}) }
      async function bad() { await supabase.rpc('settle_host_leave', {}) }
      async function worse() { await getSupabaseAnon().rpc('settle_host_leave', {}) }
    `
    const found = rpcReceivers(code, ['settle_host_leave'])
    expect(found.map((c) => [c.receiver, c.anon])).toEqual([
      ['getSupabaseAdmin()', false],
      ['admin', false],
      ['supabase', true],
      ['getSupabaseAnon()', true],
    ])
  })
})
