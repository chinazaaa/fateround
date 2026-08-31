#!/usr/bin/env node
/**
 * Entry point for the egress bench.
 *
 *   node scripts/bench/egress-bench.mjs run <label>            # measure, into results/<label>.jsonl
 *   node scripts/bench/egress-bench.mjs compare <a.jsonl> <b.jsonl>
 *
 * The measuring itself lives in the `*.bench.tsx` files, which need a DOM to mount the real
 * hooks — this script is the runner and the diff. `compare` matches rows on claim+scenario and
 * refuses to invent a delta for a scenario that only one side measured: a missing row usually
 * means that run crashed, and silently reporting it as "0" would score a crash as a saving.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const [, , cmd, ...args] = process.argv

const read = (p) =>
  readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))

const key = (r) => `${r.claim} :: ${r.scenario}`
const pct = (a, b) => (a === 0 ? (b === 0 ? '0%' : 'n/a') : `${(((b - a) / a) * 100).toFixed(1)}%`)
const fmt = (n) => (n === undefined || n === null ? '—' : n.toLocaleString('en-US'))

if (cmd === 'run') {
  const label = args[0]
  if (!label) {
    console.error('usage: egress-bench.mjs run <label>')
    process.exit(2)
  }
  const res = spawnSync(
    'npx',
    ['vitest', 'run', '--config', 'scripts/bench/vitest.bench.config.ts', ...args.slice(1)],
    { stdio: 'inherit', env: { ...process.env, BENCH_LABEL: label } }
  )
  process.exit(res.status ?? 1)
}

if (cmd === 'compare') {
  const [aPath, bPath] = args
  if (!aPath || !bPath) {
    console.error('usage: egress-bench.mjs compare <baseline.jsonl> <branch.jsonl>')
    process.exit(2)
  }
  const a = new Map(read(aPath).map((r) => [key(r), r]))
  const b = new Map(read(bPath).map((r) => [key(r), r]))
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort()

  const rows = []
  let unmatched = 0
  for (const k of keys) {
    const x = a.get(k)
    const y = b.get(k)
    if (!x || !y) {
      unmatched += 1
      rows.push({ scenario: k, baseline: x ? 'measured' : 'MISSING', branch: y ? 'measured' : 'MISSING', delta: 'NOT COMPARABLE' })
      continue
    }
    for (const metric of ['requests', 'bytes', 'rtFrames', 'rtBytes']) {
      if (x[metric] === undefined && y[metric] === undefined) continue
      rows.push({
        scenario: `${k} [${metric}]`,
        baseline: fmt(x[metric]),
        branch: fmt(y[metric]),
        delta: `${fmt((y[metric] ?? 0) - (x[metric] ?? 0))} (${pct(x[metric] ?? 0, y[metric] ?? 0)})`,
      })
    }
  }
  console.table(rows)
  if (unmatched > 0) {
    console.error(
      `\n${unmatched} scenario(s) were measured on only one side. A missing row is not a zero — ` +
        `re-run the side that is short before drawing any conclusion from this table.`
    )
    process.exit(1)
  }
  process.exit(0)
}

console.error('usage: egress-bench.mjs run <label> | compare <a.jsonl> <b.jsonl>')
process.exit(2)
