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

let anon: SupabaseClient
let service: SupabaseClient

async function listTables(): Promise<string[]> {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: serviceKey!, Authorization: `Bearer ${serviceKey}` },
  })
  const spec = (await res.json()) as { definitions?: Record<string, unknown> }
  return Object.keys(spec.definitions ?? {}).sort()
}

/**
 * Try a SAME-VALUE update of one column on one real row, as `client`.
 *
 * Same-value so the probe never changes data. The returned row count is the signal: PostgREST
 * reports 0 rows when RLS refuses the row, and an error when the role lacks the privilege
 * outright — either is "cannot write". A count of 1 means the write took effect.
 */
async function canWrite(client: SupabaseClient, table: string): Promise<boolean | null> {
  const { data: row } = await service.from(table).select('*').limit(1).maybeSingle()
  if (!row) return null // nothing to probe against in this environment

  const keys = Object.keys(row)
  const pk = keys.includes('id') ? 'id' : keys[0]
  const candidate = Object.entries(row).find(
    ([k, v]) => k !== pk && v !== null && (typeof v === 'string' || typeof v === 'number')
  )
  if (!candidate) return null

  const { data, error } = await client
    .from(table)
    .update({ [candidate[0]]: candidate[1] })
    .eq(pk, row[pk] as string)
    .select(pk)
  if (error) return false
  return (data?.length ?? 0) > 0
}

describe.skipIf(!hasCreds)('RLS boundaries (live)', () => {
  let tables: string[]

  beforeAll(async () => {
    anon = createClient(url!, anonKey!, { auth: { persistSession: false } })
    service = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    tables = await listTables()
    expect(tables.length).toBeGreaterThan(50)
  }, 60_000)

  // A passing check proves nothing until you've seen it fail. `canWrite` must report TRUE for a
  // role that genuinely can write, or every assertion below is vacuously green. The service role
  // bypasses RLS by definition, so it is the known-positive control.
  it('the write probe detects a write that really happens', async () => {
    const detected = await canWrite(service, 'games')
    expect(detected).toBe(true)
  })

  it(
    'anon cannot write any table',
    async () => {
      const writable: string[] = []
      for (const table of tables) {
        if (await canWrite(anon, table)) writable.push(table)
      }
      expect(
        writable,
        'anon key can UPDATE these tables — every write must go through a server route holding the service role (docs/rls-hardening.md)'
      ).toEqual([])
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
        if (!error) insertable.push(table)
        else if (error.code === '23502' || error.code === '23503' || error.code === '23505') {
          // Constraint error => the INSERT privilege was granted and RLS admitted it.
          insertable.push(table)
        }
      }
      expect(insertable, 'anon key can INSERT into these tables').toEqual([])
    },
    SWEEP_TIMEOUT_MS
  )

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
