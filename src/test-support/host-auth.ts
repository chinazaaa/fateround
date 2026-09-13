/**
 * Shared scaffolding for the host-authorization characterization tests.
 *
 * ~43 API routes hand-roll the same three lines instead of calling the
 * `assertHost*` helpers in `src/lib/game-admin.ts`:
 *
 *     if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
 *     if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
 *     if (game.status !== '...') return NextResponse.json({ error: '<route-specific>' }, { status: 400 })
 *
 * The `*.host-auth.test.ts` files next to those routes pin the CURRENT status +
 * body of every one of those branches so a later swap to the shared helpers is
 * provably behaviour-preserving. The status-error STRINGS differ per route and
 * differ from the helper wrappers' (e.g. `start` says "Game already started"
 * where `assertHostGame` says "Game has already started"), which is exactly why
 * they are asserted literally in each test rather than derived here.
 *
 * This module deliberately holds only mechanical scaffolding — the Supabase
 * chain stub and request builders. Every asserted status/body stays visible in
 * the test that asserts it.
 */
import { NextRequest } from 'next/server'

export const GAME_CODE = 'abcd'
export const GAME_ID = 'ABCD'
export const HOST_TOKEN = 'host-token-correct'
export const WRONG_TOKEN = 'host-token-wrong'
/** A syntactically valid UUID for routes whose schema requires one. */
export const PLAYER_ID = '11111111-1111-4111-8111-111111111111'

/** The PostgREST verb that opened the chain, so a resolver can tell a read from a write. */
export type ChainOp = 'select' | 'insert' | 'update' | 'upsert' | 'delete'

/** One filter verb call on the chain, in the order it was made. */
export type FilterCall = {
  /** The builder method name — `eq`, `neq`, `in`, `is`, `not`, `gt`, `gte`, `lt`, `lte`. */
  method: string
  /** The arguments it was given, verbatim. */
  args: readonly unknown[]
}

export type ResolverContext = {
  table: string
  op: ChainOp
  /** Every `.eq(column, value)` recorded on the chain, so a resolver can branch on filters. */
  filters: Record<string, unknown>
  /** The payload handed to insert/update/upsert, if any. */
  payload: unknown
  /**
   * One entry per `.select(...)` call, in call order; the entry is that call's first
   * argument, or `undefined` when it was called with none. A write-then-return chain
   * (`.update({...}).select()`) therefore records two entries, so this is a list rather
   * than a single value.
   *
   * This is what makes a select-shape change (a narrow column list widening to `'*'`, or
   * the reverse) visible to a test instead of silently discarded.
   */
  selects: readonly (string | undefined)[]
  /**
   * Every filter verb call in order, including the non-`eq` ones that `filters` cannot
   * represent. `filters` stays the keyed view resolvers branch on; this is the record of
   * what the query layer actually asked for.
   */
  filterCalls: readonly FilterCall[]
}

export type Resolver = (ctx: ResolverContext) => unknown

/**
 * The subset of the PostgREST builder the covered routes actually call. Every filter
 * verb returns the same chain and records the call; only `eq` also lands in the keyed
 * `filters` map, and only the terminals (`maybeSingle` / `single` / `then`) hit the
 * resolver.
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

/**
 * Minimal PostgREST-shaped stub: `.from(t).select(...).eq(c, v).maybeSingle()`,
 * `.update({...}).eq(...).select().single()`, and bare `await`ed builders all
 * funnel into the resolver registered for that table.
 *
 * Unregistered tables resolve to `{ data: null, error: null }`, which is what a
 * route that never reaches them would see anyway.
 */
export function makeSupabaseStub(resolvers: Record<string, Resolver>) {
  const from = (table: string): StubChain => {
    const filters: Record<string, unknown> = {}
    const selects: (string | undefined)[] = []
    const filterCalls: FilterCall[] = []
    const state: { op: ChainOp; payload: unknown } = { op: 'select', payload: undefined }

    const resolve = async () => {
      const resolver = resolvers[table]
      if (!resolver) return { data: null, error: null }
      return await resolver({
        table,
        op: state.op,
        filters,
        payload: state.payload,
        // Snapshots: a resolver must see what the chain asked for at the moment it
        // resolved, not whatever a later chain reuse might append.
        selects: [...selects],
        filterCalls: [...filterCalls],
      })
    }

    const start =
      (op: ChainOp) =>
      (payload?: unknown): StubChain => {
        state.op = op
        if (payload !== undefined) state.payload = payload
        return chain
      }

    const passthrough = (): StubChain => chain

    /** A filter verb that changes nothing about the answer but is worth recording. */
    const recordFilter =
      (method: string) =>
      (...args: unknown[]): StubChain => {
        filterCalls.push({ method, args })
        return chain
      }

    const chain: StubChain = {
      // `select` never sets the op: PostgREST spells "write, then return the rows"
      // as `.update({...}).select()`, so a select after a write must not downgrade
      // the recorded op back to a read. The default op is already 'select'.
      select: (...args: unknown[]) => {
        selects.push(args.length > 0 ? (args[0] as string | undefined) : undefined)
        return chain
      },
      insert: start('insert'),
      update: start('update'),
      upsert: start('upsert'),
      delete: start('delete'),
      eq: (column: string, value: unknown) => {
        filters[column] = value
        filterCalls.push({ method: 'eq', args: [column, value] })
        return chain
      },
      neq: recordFilter('neq'),
      in: recordFilter('in'),
      is: recordFilter('is'),
      not: recordFilter('not'),
      gt: recordFilter('gt'),
      gte: recordFilter('gte'),
      lt: recordFilter('lt'),
      lte: recordFilter('lte'),
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
    rpc: async () => ({ data: null, error: null }),
  }
}

/** Resolver that always answers with the same row (the common `games` case). */
export function rowResolver(row: unknown): Resolver {
  return () => ({ data: row, error: null })
}

/** A `games` row with the fields the covered routes read. Override per test. */
export function gameRow(overrides: Record<string, unknown> = {}) {
  return {
    id: GAME_ID,
    host_token: HOST_TOKEN,
    status: 'active',
    game_type: 'smash_marry_kill',
    current_round_number: 1,
    rounds_count: 3,
    question_source: 'platform',
    max_players: 6,
    is_public: false,
    replay_pending: false,
    ...overrides,
  }
}

/** `{ params }` in the shape a `[code]` route handler receives it. */
export function codeParams(code: string = GAME_CODE) {
  return { params: Promise.resolve({ code }) }
}

/**
 * Build a request. `body` is JSON-encoded unless it is a string, which is sent
 * verbatim — that is how the "empty body" cases are expressed.
 */
export function jsonRequest(path: string, body: unknown, method: string = 'POST') {
  return new NextRequest(`https://test.local${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/**
 * Apply a PostgREST-style column projection to a row, the way the real server would.
 *
 * A narrowed read only returns the columns it asked for, so a stub that always hands back
 * the whole row cannot tell a right column list from a wrong one. Feeding the recorded
 * `select(...)` argument through here makes a route that reads a column it never selected
 * see `undefined`, exactly as it would in production.
 *
 * `'*'`, an empty list and `undefined` all mean "everything", matching `assertHost`'s own
 * fallback.
 */
export function projectRow(row: Record<string, unknown> | null, select: string | undefined) {
  if (!row) return null
  const columns = (select ?? '*')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
  if (columns.length === 0 || columns.includes('*')) return { ...row }
  return Object.fromEntries(columns.filter((c) => c in row).map((c) => [c, row[c]]))
}
