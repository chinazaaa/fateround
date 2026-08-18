/**
 * The check that would have caught findings C1, C2, H1 and H2 on the commit that introduced
 * each of them.
 *
 * docs/rls-hardening.md establishes the rule: the publishable anon key may READ game state, and
 * may write NOTHING — every write goes through a server route holding the service role. That
 * rule was enforced by a per-object checklist, so four things added after the checklist was
 * written (tournaments, public_profiles, four late games, the codewords key) were open by
 * default and nobody noticed for months.
 *
 * This asserts the OUTCOME ("can an anonymous caller actually write this row?"), not the shape
 * ("does a policy with the right name exist"). Structural checks are exactly the ones that pass
 * while the hole is open — `tournaments` had an RLS policy the whole time; it just said
 * `USING (true)`.
 *
 * Requires live credentials, so it does not run in the default `pnpm test` pass — see the
 * `rls-boundaries` job in .github/workflows/ci.yml, which runs it against the environment's own
 * Supabase project immediately after migrations are applied.
 */
import { describe, expect, it, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** The sweeps make two round-trips per table across ~120 tables, so the 5s default is short. */
const SWEEP_TIMEOUT_MS = 180_000

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasCreds = Boolean(url && anonKey && serviceKey)

/**
 * Columns that must never be selectable by the public roles. These are the credentials the
 * whole authorization model rests on: if any becomes readable, token-based authz is decorative.
 */
const SECRET_COLUMNS: ReadonlyArray<[table: string, column: string]> = [
  ['games', 'host_token'],
  ['players', 'resume_token'],
  ['rooms', 'creator_token'],
  ['room_members', 'member_code'],
  ['tournaments', 'host_token'],
  ['codewords_boards', 'key'],
]

/**
 * Tables the public roles are allowed to INSERT into — the anonymous-play entry points that
 * legitimately accept a write from a browser. Everything else must be read-only.
 * Deliberately tiny: adding to it is a security decision, not a convenience.
 */
const ANON_INSERT_ALLOWED = new Set<string>(['app_feedback'])

/**
 * Tables no public role may read AT ALL — not one column, not one row.
 *
 * These carry progression that underpins the paid tiers, so read access is not merely a
 * privacy question: the catalog reveals hidden trophies before they're earned, and
 * `awarded_sessions` is the idempotency ledger. They are served exclusively by API routes
 * holding the service role (20260804000000_trophies_streaks.sql), which is what lets the
 * server filter `hidden`/`is_active` rather than shipping them and trusting the client.
 *
 * The sweeps above only probe WRITES, plus reads of secret-SHAPED column names. Neither
 * would notice `player_trophies` becoming world-readable, because nothing in it is called
 * `token`. Hence this list.
 */
const SERVICE_ROLE_ONLY_TABLES: ReadonlyArray<string> = [
  'trophies',
  'trophy_rarity',
  'player_stats',
  'player_distinct',
  'player_trophies',
  'awarded_sessions',
]

let anon: SupabaseClient
let service: SupabaseClient

async function listTables(): Promise<string[]> {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: serviceKey!, Authorization: `Bearer ${serviceKey}` },
  })
  // A non-2xx here is almost always a credential/URL mismatch — a service key issued for a
  // different project than NEXT_PUBLIC_SUPABASE_URL names. Say that, instead of letting it degrade
  // into a bare "0 tables" that looks like an empty database. (See the Aug 2026 release: the
  // Production environment's URL was right but its keys pointed at the Preview project.)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Could not read the schema: GET ${url}/rest/v1/ returned ${res.status}. ` +
        `NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must point at the SAME project. ${body.slice(0, 200)}`
    )
  }
  // PostgREST <12 (Swagger 2.0) lists tables under `definitions`; newer (OpenAPI 3.0) under
  // `components.schemas`. Accept either so a PostgREST upgrade doesn't read as "no tables".
  const spec = (await res.json()) as {
    definitions?: Record<string, unknown>
    components?: { schemas?: Record<string, unknown> }
  }
  return Object.keys(spec.definitions ?? spec.components?.schemas ?? {}).sort()
}

/**
 * Result of a write probe. `unknown` exists because this is a security gate: a probe that
 * cannot reach a verdict must never be folded into "safe", or the suite reports green while
 * the boundary is open.
 */
type WriteProbe = 'writable' | 'denied' | 'unknown' | 'skipped'

/**
 * Try a SAME-VALUE update of one column on one real row, as `client`.
 *
 * Same-value so the probe never changes data. The AFFECTED-ROW COUNT is the signal — requested
 * via `{ count: 'exact' }`, which sends `Prefer: return=minimal` so PostgREST does not attach a
 * SELECT to the statement. That matters: an earlier version used `.select(pk)`, and on a table
 * where the role holds UPDATE but not SELECT the write COMMITTED while the trailing select
 * errored, which the probe scored as "denied" — a false green on exactly the case it exists to
 * catch (flagged in review on PR #736).
 */
async function canWrite(client: SupabaseClient, table: string): Promise<WriteProbe> {
  const { data: row } = await service.from(table).select('*').limit(1).maybeSingle()
  if (!row) return 'skipped' // nothing to probe against in this environment

  const keys = Object.keys(row)
  // The filter column must have a non-null value, or `.eq()` matches nothing and every table
  // scores "denied" regardless of its grants. Prefer `id`, else the first usable column.
  const filterKey = keys.find((k) => k === 'id' && row[k] != null) ?? keys.find((k) => row[k] != null)
  if (!filterKey) return 'skipped'

  const candidate = Object.entries(row).find(
    ([k, v]) => k !== filterKey && v !== null && (typeof v === 'string' || typeof v === 'number')
  )
  if (!candidate) return 'skipped'

  const { count, error } = await client
    .from(table)
    .update({ [candidate[0]]: candidate[1] }, { count: 'exact' })
    .eq(filterKey, row[filterKey] as string)

  // 42501 = the role lacks the privilege. That is the one error that genuinely proves "denied";
  // anything else (unknown column, trigger failure, transport) leaves the question open.
  if (error) return error.code === '42501' ? 'denied' : 'unknown'
  return (count ?? 0) > 0 ? 'writable' : 'denied'
}

describe.skipIf(!hasCreds)('RLS boundaries (live)', () => {
  let tables: string[]

  beforeAll(async () => {
    anon = createClient(url!, anonKey!, { auth: { persistSession: false } })
    service = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    tables = await listTables()
    // Positive control (verification rule 3): the privileged client must SEE the schema before any
    // "anon cannot read X" negative below can be trusted. A low count here is NOT a passing security
    // result — it means this job is pointed at an empty or wrong project and can verify nothing.
    expect(
      tables.length,
      `service role saw ${tables.length} tables at ${url} — expected the full schema (>50). ` +
        `The URL and service-role key are probably not the same project as the migrated one.`
    ).toBeGreaterThan(50)
  }, 60_000)

  // A passing check proves nothing until you've seen it fail. `canWrite` must report `writable`
  // for a role that genuinely can write, or every assertion below is vacuously green. The service
  // role bypasses RLS by definition, so it is the known-positive control.
  //
  // The control runs against `api_rate_limit_attempts`, NOT `games`. An earlier version probed a
  // real game row: harmless in content (the update is same-value) but it still emits a realtime
  // UPDATE to every client subscribed to that game — on production, mid-match. This table is
  // internal, ephemeral and not in the realtime publication, so a same-value update on any row
  // in it is invisible to users. We seed a row first only to guarantee the table is non-empty,
  // so the probe can't come back `skipped` (flagged in review on #736).
  it('the write probe detects a write that really happens', async () => {
    const key = 'rls-boundaries:positive-control'
    await service.from('api_rate_limit_attempts').delete().eq('key', key)
    const { error: seedError } = await service.from('api_rate_limit_attempts').insert({ key, count: 1 })
    expect(seedError, 'could not seed the positive-control row').toBeNull()
    try {
      expect(await canWrite(service, 'api_rate_limit_attempts')).toBe('writable')
    } finally {
      await service.from('api_rate_limit_attempts').delete().eq('key', key)
    }
  }, 30_000)

  it(
    'anon cannot write any table',
    async () => {
      const writable: string[] = []
      const unknown: string[] = []
      for (const table of tables) {
        const verdict = await canWrite(anon, table)
        if (verdict === 'writable') writable.push(table)
        if (verdict === 'unknown') unknown.push(table)
      }
      expect(
        writable,
        'anon key can UPDATE these tables — every write must go through a server route holding the service role (docs/rls-hardening.md)'
      ).toEqual([])
      // An inconclusive probe is not a pass. Surfacing it keeps the gate honest rather than
      // letting an unexpected error masquerade as a closed boundary.
      expect(unknown, 'the write probe could not reach a verdict for these tables — investigate').toEqual([])
    },
    SWEEP_TIMEOUT_MS
  )

  it(
    'anon cannot insert except at the sanctioned entry points',
    async () => {
      const insertable: string[] = []
      for (const table of tables) {
        if (ANON_INSERT_ALLOWED.has(table)) continue
        // A row of `{}` is rejected by NOT NULL / FK constraints (23xxx) if the privilege exists,
        // and by 42501 / RLS if it does not. Only a permission-shaped failure counts as safe.
        const { error } = await anon.from(table).insert({}).select()
        // Any 23xxx is an integrity-constraint violation (not_null, foreign_key, unique, check,
        // exclusion, restrict …), which means the statement got PAST privileges and RLS — so the
        // INSERT was permitted. Matching only three specific codes let a table whose empty-row
        // insert trips a CHECK (23514) score as safe (flagged in review on #736).
        if (!error) insertable.push(table)
        else if (error.code?.startsWith('23')) insertable.push(table)
      }
      expect(insertable, 'anon key can INSERT into these tables').toEqual([])
    },
    SWEEP_TIMEOUT_MS
  )

  // Deliberately asserts EXISTENCE first. Without that this passes vacuously on any
  // environment where the migration hasn't been applied — green because the table is missing,
  // which is exactly the "assertion encodes an assumption about fixture state" trap.
  it.each(SERVICE_ROLE_ONLY_TABLES)('anon cannot read %s at all', async (table) => {
    const { error: serviceError } = await service.from(table).select('*').limit(1)
    expect(serviceError, `${table} does not exist — this assertion would pass vacuously`).toBeNull()

    const { data, error } = await anon.from(table).select('*').limit(1)
    // "Denied", "empty" and "not found" look identical from the outside, so score on the error
    // code: a successful read of zero rows is a FAILURE here, not a pass.
    expect(error, `${table} is readable by the anon key`).not.toBeNull()
    // 42501 = the role lacks the privilege. PGRST205 = PostgREST won't expose the table to this
    // role at all, which is the same denial one layer out. PGRST106 ("schema not configured") is
    // deliberately NOT accepted: it signals a misconfigured request, and treating it as denial is
    // how a broken probe scores green against an open boundary.
    expect(
      ['42501', 'PGRST205'],
      `${table} failed for an unexpected reason (${error?.code}) — investigate rather than assume denied`
    ).toContain(error?.code)
    expect(data, `${table} returned rows to the anon key`).toBeNull()
  })

  it.each(SECRET_COLUMNS)('anon cannot read %s.%s', async (table, column) => {
    const { error } = await anon.from(table).select(`${column}`).limit(1)
    expect(error?.code, `${table}.${column} is readable by the anon key`).toBe('42501')
  })

  it(
    'no anon-readable table exposes a secret-shaped column',
    async () => {
      const suspicious = /(^|_)(token|secret|password|api_key)$/i
      const leaks: string[] = []
      for (const table of tables) {
        const { data, error } = await anon.from(table).select('*').limit(1)
        if (error || !data?.[0]) continue
        for (const column of Object.keys(data[0])) {
          if (suspicious.test(column)) leaks.push(`${table}.${column}`)
        }
      }
      expect(leaks, 'secret-shaped columns readable with the publishable key').toEqual([])
    },
    SWEEP_TIMEOUT_MS
  )
})
