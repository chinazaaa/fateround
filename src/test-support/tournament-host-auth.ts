/**
 * Shared scaffolding for the tournament host-authorization characterization tests.
 *
 * Fourteen call sites across the `/api/tournaments/[code]/*` routes hand-roll the same
 * three lines instead of calling the `assertTournamentHost*` helpers in
 * `src/lib/tournament-admin.ts`:
 *
 *     if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
 *     if (tournament.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
 *     if (tournament.status === 'finished') return NextResponse.json({ error: '<route-specific>' }, { status: 400 })
 *
 * The `route.host-auth.test.ts` files next to those routes pin the CURRENT status + body of
 * every one of those branches (plus, where a route has one, the interaction between its
 * status gate and its format/type gate) so the swap onto the shared helper is provably
 * behaviour-preserving. The status-error STRINGS differ per route, which is exactly why they
 * are asserted literally in each test rather than derived here.
 *
 * This module deliberately holds only mechanical scaffolding — the Supabase chain stub and
 * request builders. Every asserted status/body stays visible in the test that asserts it.
 *
 * Sibling note: the games slice has its own `src/test-support/host-auth.ts` on the
 * `refactor/host-auth-adopt-games` branch. It is not on this branch's base (nor on `dev`),
 * and it is games-shaped throughout — `GAME_CODE`, `gameRow`, `games`-specific defaults — so
 * this is the tournaments counterpart rather than an edit to a file that is not here yet.
 */
import { NextRequest } from 'next/server'

export const TOURNAMENT_CODE = 'abcd'
export const TOURNAMENT_ID = 'ABCD'
export const HOST_TOKEN = 'tournament-host-correct'
export const WRONG_TOKEN = 'tournament-host-wrong'
/** A syntactically valid UUID for routes whose schema requires one. */
export const PLAYER_ID = '11111111-1111-4111-8111-111111111111'

/** The PostgREST verb that opened the chain, so a resolver can tell a read from a write. */
export type ChainOp = 'select' | 'insert' | 'update' | 'upsert' | 'delete'

export type ResolverContext = {
  table: string
  op: ChainOp
  /** Every `.eq(column, value)` recorded on the chain, so a resolver can branch on filters. */
  filters: Record<string, unknown>
  /** The payload handed to insert/update/upsert, if any. */
  payload: unknown
}

export type Resolver = (ctx: ResolverContext) => unknown

/**
 * The subset of the PostgREST builder the covered routes actually call. Every filter verb
 * returns the same chain; only `eq` records anything, and only the terminals
 * (`maybeSingle` / `single` / `then`) hit the resolver.
 */
export type StubChain = {
  select: (...args: unknown[]) => StubChain
  insert: (...args: unknown[]) => StubChain
  update: (...args: unknown[]) => StubChain
  upsert: (...args: unknown[]) => StubChain
  delete: (...args: unknown[]) => StubChain
  eq: (column: string, value: unknown) => StubChain
  neq: (...args: unknown[]) => StubChain
  in: (...args: unknown[]) => StubChain
  is: (...args: unknown[]) => StubChain
  not: (...args: unknown[]) => StubChain
  gt: (...args: unknown[]) => StubChain
  gte: (...args: unknown[]) => StubChain
  lt: (...args: unknown[]) => StubChain
  lte: (...args: unknown[]) => StubChain
  order: (...args: unknown[]) => StubChain
  limit: (...args: unknown[]) => StubChain
  range: (...args: unknown[]) => StubChain
  maybeSingle: () => Promise<unknown>
  single: () => Promise<unknown>
  then: (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => Promise<unknown>
}

export type SupabaseStubOptions = {
  /** Answer for `supabase.rpc(...)`. Defaults to `{ data: null, error: null }`. */
  rpc?: (fn: string, args: unknown) => unknown
}

/**
 * Minimal PostgREST-shaped stub: `.from(t).select(...).eq(c, v).maybeSingle()`,
 * `.update({...}).eq(...)`, and bare `await`ed builders all funnel into the resolver
 * registered for that table.
 *
 * Unregistered tables resolve to `{ data: null, error: null }`, which is what a route that
 * never reaches them would see anyway.
 */
export function makeSupabaseStub(resolvers: Record<string, Resolver>, options: SupabaseStubOptions = {}) {
  const from = (table: string): StubChain => {
    const filters: Record<string, unknown> = {}
    const state: { op: ChainOp; payload: unknown } = { op: 'select', payload: undefined }

    const resolve = async () => {
      const resolver = resolvers[table]
      if (!resolver) return { data: null, error: null }
      return await resolver({ table, op: state.op, filters, payload: state.payload })
    }

    const start =
      (op: ChainOp) =>
      (payload?: unknown): StubChain => {
        state.op = op
        if (payload !== undefined) state.payload = payload
        return chain
      }

    const passthrough = (): StubChain => chain

    const chain: StubChain = {
      // `select` never sets the op: PostgREST spells "write, then return the rows" as
      // `.update({...}).select()`, so a select after a write must not downgrade the recorded
      // op back to a read. The default op is already 'select'.
      select: () => chain,
      insert: start('insert'),
      update: start('update'),
      upsert: start('upsert'),
      delete: start('delete'),
      eq: (column: string, value: unknown) => {
        filters[column] = value
        return chain
      },
      neq: passthrough,
      in: passthrough,
      is: passthrough,
      not: passthrough,
      gt: passthrough,
      gte: passthrough,
      lt: passthrough,
      lte: passthrough,
      order: passthrough,
      limit: passthrough,
      range: passthrough,
      maybeSingle: resolve,
      single: resolve,
      // Makes a bare `await builder` work, the way PostgREST builders are thenable.
      then: (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        resolve().then(onFulfilled, onRejected),
    }
    return chain
  }

  return {
    from,
    rpc: async (fn: string, args: unknown) => (options.rpc ? options.rpc(fn, args) : { data: null, error: null }),
  }
}

/** Resolver that always answers with the same row (the common `tournaments` case). */
export function rowResolver(row: unknown): Resolver {
  return () => ({ data: row, error: null })
}

/**
 * A `tournaments` row with the fields the covered routes read. Override per test.
 *
 * `format: 'round-robin'` because that is the format the migrated routes' own gates treat as
 * ordinary; the bracket-only routes (`rounds`, `rounds/start`) are deliberately NOT migrated.
 */
export function tournamentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TOURNAMENT_ID,
    host_token: HOST_TOKEN,
    status: 'waiting',
    title: 'Cup',
    format: 'round-robin',
    game_type: 'trivia',
    game_config: {},
    game_queue: null,
    elimination_config: null,
    branding: null,
    scheduled_at: null,
    ...overrides,
  }
}

/** `{ params }` in the shape a `[code]` route handler receives it. */
export function codeParams(code: string = TOURNAMENT_CODE) {
  return { params: Promise.resolve({ code }) }
}

/**
 * Build a request. `body` is JSON-encoded unless it is a string, which is sent verbatim —
 * that is how the "empty body" cases are expressed.
 */
export function jsonRequest(
  path: string,
  body: unknown,
  method: string = 'POST',
  headers: Record<string, string> = {}
) {
  return new NextRequest(`https://test.local${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
