import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Play Again reuses the game id (and can reuse the turn index) with a NEW word_rush_sessions row, so every UPDATE of a
 * session row made by code that inspected a session must name that session's id: a stale call then matches nothing.
 *
 * Audited on the TypeScript syntax tree (not on the text): a comment between the calls, a commented-out predicate or an
 * odd layout cannot hide an unbound update or fake a bound one. Only real `.update(...)` chains rooted at
 * `from('word_rush_sessions')` are inspected, and only their real `.eq('id', <session id>)` calls count.
 */
const FILE = join(process.cwd(), 'src', 'lib', 'word-rush-server.ts')
const source = ts.createSourceFile(FILE, readFileSync(FILE, 'utf8'), ts.ScriptTarget.Latest, true)

type Chain = { calls: Array<{ name: string; args: ts.NodeArray<ts.Expression> }>; fn: string; text: string }

/** Strips the wrappers that do not change what an expression IS: `(x)`, `x!`, `x as T`. */
function unwrap(node: ts.Expression): ts.Expression {
  let n = node
  while (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n) || ts.isAsExpression(n)) n = n.expression
  return n
}

/** The calls of one method chain, outermost first, down to the receiver that is not itself a call (parentheses are seen through). */
function chainOf(top: ts.CallExpression): Chain['calls'] {
  const calls: Chain['calls'] = []
  let node: ts.Expression = top
  for (;;) {
    node = unwrap(node)
    if (!(ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression))) break
    calls.push({ name: node.expression.name.text, args: node.arguments })
    node = node.expression.expression
  }
  return calls
}

function enclosingFunction(node: ts.Node): string {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text
  }
  return '<top level>'
}

/** Every chain that starts at `from('word_rush_sessions')` and contains an `.update(...)`, in the given source file. */
function sessionUpdateChains(sf: ts.SourceFile): Chain[] {
  const out: Chain[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      // Only the OUTERMOST call of a chain: climb through parentheses / `!` / `as`; its parent is not a property access
      // whose receiver it is.
      let top: ts.Node = node
      while (
        top.parent &&
        (ts.isParenthesizedExpression(top.parent) ||
          ts.isNonNullExpression(top.parent) ||
          ts.isAsExpression(top.parent))
      ) {
        top = top.parent
      }
      const parent = top.parent
      const isInner = parent !== undefined && ts.isPropertyAccessExpression(parent) && parent.expression === top
      if (!isInner) {
        const calls = chainOf(node)
        const from = calls.find(
          (c) =>
            c.name === 'from' &&
            c.args[0] &&
            ts.isStringLiteralLike(c.args[0]) &&
            c.args[0].text === 'word_rush_sessions'
        )
        if (from && calls.some((c) => c.name === 'update')) {
          out.push({ calls, fn: enclosingFunction(node), text: node.getText(sf).replace(/\s+/g, ' ') })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/** The member names that hold a SESSION id, by receiver: `session.id` and `pending.session_id` (the round-finalize marker). */
const SESSION_ID_MEMBERS: Record<string, string> = { session: 'id', pending: 'session_id' }

/** True when the expression is a property access `<session | pending>.<id | session_id>` on the syntax tree (spacing is irrelevant). */
function namesSessionId(expr: ts.Expression): boolean {
  const e = unwrap(expr)
  return (
    ts.isPropertyAccessExpression(e) &&
    ts.isIdentifier(e.expression) &&
    SESSION_ID_MEMBERS[e.expression.text] === e.name.text
  )
}

/** True when the chain has a real `.eq('id', <expression naming a session id>)` call. */
function bindsSessionId(chain: Chain): boolean {
  return chain.calls.some(
    (c) =>
      c.name === 'eq' &&
      c.args.length === 2 &&
      ts.isStringLiteralLike(c.args[0]) &&
      c.args[0].text === 'id' &&
      namesSessionId(c.args[1])
  )
}

describe('word_rush_sessions writes in word-rush-server.ts', () => {
  const chains = sessionUpdateChains(source)

  it('finds the statements', () => {
    expect(chains.length).toBeGreaterThanOrEqual(9)
  })

  it('every update names the session id, except the one initialization that replaces the row on purpose', () => {
    const unbound = chains.filter((c) => !bindsSessionId(c))
    // The exception creates the session state from the host's start request (it replaces the whole row on purpose): one
    // call site, in the initialization function, updating with the prepared `row`.
    expect(unbound.map((c) => c.fn)).toEqual(['initializeWordRushGame'])
    const update = unbound[0].calls.find((c) => c.name === 'update')!
    expect(update.args[0].getText(source)).toBe('row')
  })

  it.each(chains.map((c) => [c.text.slice(0, 80), c] as const))('%s', (_label, chain) => {
    if (!bindsSessionId(chain)) expect(chain.fn).toBe('initializeWordRushGame')
  })
})

describe('the scanner itself (self-checks on synthetic sources, through the same functions)', () => {
  const scan = (code: string) => sessionUpdateChains(ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, true))

  it('a comment-separated update with a commented-out predicate is found and is NOT bound', () => {
    const found = scan("await supabase.from('word_rush_sessions') /* c */ .update(patch) // .eq('id', session.id)\n")
    expect(found).toHaveLength(1)
    expect(bindsSessionId(found[0])).toBe(false)
  })

  it('an update through a PARENTHESIZED receiver is found and rejected as unbound', () => {
    const found = scan("void (supabase.from('word_rush_sessions')).update(patch).eq('game_id', gameId)\n")
    expect(found).toHaveLength(1)
    expect(bindsSessionId(found[0])).toBe(false)
    const wrapped = scan("void ((supabase.from('word_rush_sessions').update(patch)).eq('game_id', gameId))\n")
    expect(wrapped).toHaveLength(1)
    expect(bindsSessionId(wrapped[0])).toBe(false)
  })

  it('a bound update is recognised whatever its spacing or parentheses, by receiver and member', () => {
    for (const bound of [
      "supabase.from('word_rush_sessions').update(p).eq('id', session.id)",
      "supabase.from('word_rush_sessions').update(p).eq('id', session . id)",
      "supabase.from('word_rush_sessions').update(p).eq('id', (session.id))",
      "supabase.from('word_rush_sessions').update(p).eq('id', pending.session_id)",
      "(supabase.from('word_rush_sessions')).update(p).eq('id', session.id)",
    ]) {
      const found = scan(bound)
      expect(found, bound).toHaveLength(1)
      expect(bindsSessionId(found[0]), bound).toBe(true)
    }
  })

  it('a different receiver or member does not bind the session', () => {
    for (const unbound of [
      "supabase.from('word_rush_sessions').update(p).eq('id', other.id)",
      "supabase.from('word_rush_sessions').update(p).eq('id', session.game_id)",
      "supabase.from('word_rush_sessions').update(p).eq('id', pending.id)",
      "supabase.from('word_rush_sessions').update(p).eq('id', session)",
      "supabase.from('word_rush_sessions').update(p).eq('game_id', session.id)",
      "supabase.from('word_rush_sessions').update(p).eq('id', 'session.id')",
    ]) {
      const found = scan(unbound)
      expect(found, unbound).toHaveLength(1)
      expect(bindsSessionId(found[0]), unbound).toBe(false)
    }
  })
})
