/**
 * Shared helpers for the redaction playtests.
 *
 * These four scripts were near-identical copies, and the same review finding had to be fixed in
 * each of them THREE separate times — a fix applied to one copy is a fix the other three miss.
 * Anything that decides whether an assertion passes belongs here, so there is one place to get
 * it right.
 */

export const APP = process.env.PLAYTEST_APP_URL ?? 'http://127.0.0.1:3000'
export const REST = `${process.env.PLAYTEST_SUPABASE_URL ?? 'http://127.0.0.1:54321'}/rest/v1`

/**
 * Read a required key from the environment.
 *
 * These were once hard-coded. They were Supabase's public local demo keys (`iss: supabase-demo`,
 * identical on every machine), so nothing secret was committed — but a `service_role` string in
 * the repo is a bad pattern, and hard-coding pinned the scripts to a local stack. Failing loudly
 * beats defaulting: a silently-wrong key would make every redaction assertion pass for the wrong
 * reason.
 */
export function requireEnv(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing ${name}. Export it before running (see scripts/playtest/README.md):`)
    console.error(`  export ${name}="$(supabase status -o env | grep ${name} | cut -d= -f2-)"`)
    process.exit(2)
  }
  return v
}

export const ANON = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
export const SRV = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

export const h = (k) => ({ apikey: k, Authorization: `Bearer ${k}` })

export const post = async (u, b) => {
  const r = await fetch(u, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  })
  let d = null
  try {
    d = await r.json()
  } catch {
    /* empty body is fine; callers assert on status */
  }
  return { status: r.status, d }
}

export const get = async (u, k) => {
  const r = await fetch(u, { headers: h(k) })
  let d = null
  try {
    d = await r.json()
  } catch {
    /* empty body is fine */
  }
  return { status: r.status, d }
}

/** The statuses that actually PROVE a column-level denial. */
const DENIAL_STATUSES = [401, 403]

/**
 * Assert that anon was DENIED — not merely that it did not succeed.
 *
 * A 200 is a leak. But "not 200" is not the same as "denied": a 404, 429 or 500 would otherwise
 * sail through as if the column were protected, so an outage or a rate limit could be mistaken
 * for a working security boundary. Locally PostgREST answers a column revoke with 401 and hosted
 * with 403; anything else is inconclusive and must fail loudly.
 */
export function assertDenied(res, label, fail) {
  if (res.status === 200) {
    fail.push(`LEAK: anon read ${label} (200) ${JSON.stringify(res.d ?? null).slice(0, 120)}`)
  } else if (!DENIAL_STATUSES.includes(res.status)) {
    fail.push(`INCONCLUSIVE ${label} -> ${res.status} (expected a ${DENIAL_STATUSES.join('/')} denial, not an error)`)
  }
}

/**
 * Assert that anon CAN still read the non-secret columns, and actually got rows.
 *
 * A 200 with `[]` proves nothing: it is what an RLS regression that hides every row looks like,
 * and it would let the denial checks above pass against empty state — vacuously.
 */
export function assertReadableRows(res, label, fail) {
  if (res.status !== 200) {
    fail.push(`BREAK: anon cannot read ${label} -> ${res.status}`)
  } else if (!Array.isArray(res.d) || res.d.length === 0) {
    fail.push(`BREAK: anon read ${label} but got 0 rows — the redaction assertions would be vacuous`)
  }
}

/**
 * Assert a service-role query is TRUSTWORTHY before its answer is used.
 *
 * A 401/500/malformed body/empty result yields `undefined` downstream, which silently skips
 * whatever check depended on it — hiding, for example, a revoked `games` privilege while every
 * other assertion still passes.
 */
export function assertQueryUsable(res, label, fail) {
  if (res.status !== 200) {
    fail.push(`${label} query failed (${res.status}) — its answer cannot be trusted`)
    return null
  }
  const row = Array.isArray(res.d) ? res.d[0] : null
  if (!row) {
    fail.push(`${label} query returned no row — its answer cannot be trusted`)
    return null
  }
  return row
}
