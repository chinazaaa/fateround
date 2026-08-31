/** Append one measurement to the JSON file the compare step reads. */
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type Measurement = {
  claim: string
  scenario: string
  requests?: number
  bytes?: number
  rtFrames?: number
  rtBytes?: number
  notes?: string
  extra?: Record<string, unknown>
}

export function record(m: Measurement): void {
  const label = process.env.BENCH_LABEL ?? 'unlabelled'
  const out = process.env.BENCH_OUT ?? `scripts/bench/results/${label}.jsonl`
  mkdirSync(dirname(out), { recursive: true })
  appendFileSync(out, `${JSON.stringify({ label, ...m })}\n`)
  console.log(`[bench:${label}] ${m.claim} | ${m.scenario} | ${JSON.stringify({ ...m, claim: undefined, scenario: undefined })}`)
}
