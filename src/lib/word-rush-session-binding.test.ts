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

/** The calls of one method chain, outermost first, down to the receiver that is not itself a call. */
function chainOf(top: ts.CallExpression): Chain['calls'] {
  const calls: Chain['calls'] = []
  let node: ts.Expression = top
  while (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
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

/** Every chain that starts at `from('word_rush_sessions')` and contains an `.update(...)`. */
function sessionUpdateChains(): Chain[] {
  const out: Chain[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      // Only the OUTERMOST call of a chain (its parent is not a property access that is itself called).
      const parent = node.parent
      const isInner = ts.isPropertyAccessExpression(parent) && parent.expression === node
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
          out.push({ calls, fn: enclosingFunction(node), text: node.getText(source).replace(/\s+/g, ' ') })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return out
}

/** True when the chain has a real `.eq('id', <expression naming a session id>)` call. */
function bindsSessionId(chain: Chain): boolean {
  return chain.calls.some(
    (c) =>
      c.name === 'eq' &&
      c.args.length === 2 &&
      ts.isStringLiteralLike(c.args[0]) &&
      c.args[0].text === 'id' &&
      /^(session\.id|pending\.session_id)$/.test(c.args[1].getText(source))
  )
}

describe('word_rush_sessions writes in word-rush-server.ts', () => {
  const chains = sessionUpdateChains()

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

  it('the scanner sees a comment-separated, unbound update (self-check on a synthetic source)', () => {
    const synthetic = ts.createSourceFile(
      'x.ts',
      "await supabase.from('word_rush_sessions') /* c */ .update(patch) // .eq('id', session.id)\n",
      ts.ScriptTarget.Latest,
      true
    )
    let found = 0
    const visit = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === 'update'
      ) {
        found += 1
        expect(chainOf(n).some((c) => c.name === 'eq')).toBe(false)
      }
      ts.forEachChild(n, visit)
    }
    visit(synthetic)
    expect(found).toBe(1)
  })
})
