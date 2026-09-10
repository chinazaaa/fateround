import type { SupabaseClient } from '@supabase/supabase-js'
import { secretMatches } from '@/lib/secret-compare'
import type { Tournament } from '@/types/tournament'

/**
 * Host authorization for `tournaments`, the counterpart to `assertHost*` in
 * `src/lib/game-admin.ts`.
 *
 * Tournaments cannot reuse the games helper: different table, and a different status
 * vocabulary — `waiting | active | finished | scheduled` (see
 * `supabase/migrations/0097_tournaments.sql`, which defaults `status` to `'waiting'`).
 * Sharing one function across both would mean a table-name parameter and a status
 * vocabulary that is the union of two unrelated ones; two small parallel helpers is the
 * cheaper shape.
 *
 * Fourteen call sites across thirteen tournament route files currently hand-roll
 * `tournament.host_token !== hostToken`. This exists so they can stop.
 *
 * CALLERS MUST PASS A SERVICE-ROLE CLIENT (`getSupabaseAdmin()`), as all fourteen already do.
 * `anon`/`authenticated` hold COLUMN-level SELECT on `tournaments` that deliberately excludes
 * `host_token` (`supabase/migrations/20260803120000_lockdown_tournaments.sql`), so the
 * `select('*')` below ERRORS under the anon key. That fails closed — the error surfaces as
 * `data: null` and the helper returns 404, never a bypass — but it 404s every tournament,
 * which reads as "wrong code" rather than "wrong client". Hence this line.
 */

/**
 * Every `tournaments` column, including `host_token`.
 *
 * `select('*')` (as the games helper does) rather than a column list, because the callers
 * that will adopt this go on to read wildly different columns off the returned row —
 * `format`, `game_config`, `game_queue`, `elimination_config`, `branding`, `title` — and a
 * fixed list would have to be the union of all of them, i.e. `*` with extra maintenance.
 *
 * This row is for the ROUTE, never for the response body. Callers must not spread it into a
 * `NextResponse.json` payload: `host_token` is the host credential, and anon SELECT on it is
 * revoked at the database level precisely so it cannot leak
 * (`supabase/migrations/20260803120000_lockdown_tournaments.sql`). See the explicit
 * `TOURNAMENT_PUBLIC_SELECT` in `src/app/api/tournaments/[code]/route.ts` for the shape a
 * public response is allowed to have.
 */
const TOURNAMENT_SELECT = '*'

/**
 * The three non-terminal tournament statuses — i.e. "anything but `finished`".
 *
 * Four of the call sites gate on exactly this, each spelled as `status === 'finished'` with
 * its own 400 message. The status vocabulary is closed and enumerated in the migrations, so
 * the allowlist below is equivalent to that denylist while keeping the helper's gate an
 * ALLOW-list — a status added later must be opted in deliberately rather than silently
 * inheriting host write access.
 */
export const TOURNAMENT_UNFINISHED_STATUSES = ['waiting', 'active', 'scheduled'] as const

/**
 * A `tournaments` row as returned by {@link TOURNAMENT_SELECT}.
 *
 * The Supabase client is untyped, so the row arrives as `any`. `Tournament` is the best
 * description of it the codebase already has, and the open index signature covers the rest:
 * `TOURNAMENT_SELECT` is `'*'`, so the row carries columns `Tournament` does not model and
 * routes read those raw columns off it. They keep the `any` they have today — narrowing the
 * select, and with it this row, is a separate change.
 *
 * The job of this type here is only to give the success arm of {@link TournamentAuthResult}
 * a row that is provably not `null`. It carries `host_token`, the host CREDENTIAL — see the
 * `TOURNAMENT_SELECT` doc above; never respond with it.
 */
export interface TournamentRow extends Omit<Tournament, 'status'> {
  /**
   * Widened from `Tournament['status']`: the DB vocabulary also has `'scheduled'`
   * (`supabase/migrations/0097_tournaments.sql`), which the client-facing type omits.
   */
  status: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [column: string]: any
}

/**
 * Discriminated result of the `assertTournamentHost*` family — the counterpart to
 * `HostAuthResult` in `src/lib/game-admin.ts`, and deliberately the same shape: these two
 * helpers must not diverge.
 *
 * `E` is the caller-supplied message(s) — `statusError` and/or `missingTokenError` — threaded
 * through so the failure arm's `error` stays a union of string LITERALS. That is what makes
 * the union discriminate under the callers' `if (auth.error) return …` idiom: TypeScript can
 * only drop the failure arm on the false branch when every `error` it could hold is definitely
 * truthy, and `string` is not (it includes `''`). `never` contributes nothing to the union,
 * which is what the un-gated, no-message call shapes get.
 *
 * So keep these messages string LITERALS at the call site. Passing a `string`-typed variable
 * still type-checks and still behaves identically at runtime; it just widens `E` back to
 * `string` and costs that caller its narrowing.
 */
export type TournamentAuthResult<E extends string = never> =
  | { error: null; status: 200; tournament: TournamentRow; id: string }
  | { error: 'Tournament not found' | 'Unauthorized' | E; status: 400 | 403 | 404; tournament: null; id: string }

export type TournamentHostAccessOptions<E extends string = string> = {
  /** Statuses the tournament may be in. Omit the gate entirely via `assertTournamentHostAny`. */
  allowedStatuses: readonly string[]
  /** 400 body returned when the status gate rejects. */
  statusError: E
  /**
   * When set, an absent/blank `hostToken` short-circuits to a 400 with this message BEFORE
   * the tournament is looked up.
   *
   * Three sites do this today (`transfer-host`, and both methods of `branding/logo`), all
   * with the string `'Missing hostToken'`, and for `branding/logo` POST it is load-bearing:
   * the check runs before `formData()` so an unauthenticated caller cannot make the server
   * buffer a multipart upload. Without this option those three could not adopt the helper
   * without changing a response, so it is an option rather than a convention.
   *
   * Leave it unset to keep the default ladder, where a missing token is simply a token that
   * fails to match and yields 403 (or 404 first, if the code does not exist).
   */
  missingTokenError?: E
}

/** The status gate, split from `missingTokenError` so "no gate" is a real `null`. */
type StatusGate<E extends string = string> = Pick<TournamentHostAccessOptions<E>, 'allowedStatuses' | 'statusError'>

async function assertTournamentHost<E extends string = never>(
  supabase: SupabaseClient,
  code: string,
  hostToken: string | null | undefined,
  gate: StatusGate<E> | null,
  missingTokenError?: E
): Promise<TournamentAuthResult<E>> {
  const id = code.toUpperCase()

  // Opt-in rung, ahead of everything else: see `missingTokenError`. It is deliberately the
  // ONLY thing allowed to precede the 404, because it leaks nothing about the tournament —
  // it is decided without reading the database at all.
  if (missingTokenError && !hostToken) {
    return { error: missingTokenError, status: 400 as const, tournament: null, id }
  }

  const { data: tournament } = await supabase.from('tournaments').select(TOURNAMENT_SELECT).eq('id', id).maybeSingle()
  if (!tournament) return { error: 'Tournament not found', status: 404 as const, tournament: null, id }

  // Constant-time, matching `[code]/restart/route.ts` (the one site that already got this
  // right) and every other secret comparison in the app — see src/lib/secret-compare.ts.
  //
  // `tournaments.host_token` is `text not null` (migration 0097_tournaments.sql line 5, never
  // relaxed — no later migration alters the column), and every write mints a token: the
  // create route inserts one, and the `claim-host` / `transfer-scheduled-host` rotations
  // write a freshly generated one. So `secretMatches`'s one behavioural difference from
  // `!==` — an empty supplied token matching a NULL stored one — is unreachable here. It is
  // pinned in the tests anyway: an empty token authorizing a host would be a total bypass.
  if (!(await secretMatches(hostToken, tournament.host_token))) {
    return { error: 'Unauthorized', status: 403 as const, tournament: null, id }
  }

  if (gate && !gate.allowedStatuses.includes(tournament.status)) {
    return { error: gate.statusError, status: 400 as const, tournament: null, id }
  }

  return { error: null, status: 200 as const, tournament, id }
}

/**
 * Host authorization with a caller-supplied status gate.
 *
 * The failure ladder is ordered on purpose and must stay that way: missing tournament (404)
 * beats bad token (403) beats bad status (400). Reversing any rung would tell an
 * unauthenticated caller which tournament codes exist and what state they are in — the code
 * is the only thing gating this whole surface, and it is shared publicly.
 */
export async function assertTournamentHostWith<E extends string>(
  supabase: SupabaseClient,
  code: string,
  hostToken: string | null | undefined,
  opts: TournamentHostAccessOptions<E>
) {
  return assertTournamentHost(supabase, code, hostToken, opts, opts.missingTokenError)
}

/**
 * Host authorization with NO status gate: the 404/403 ladder only.
 *
 * For host actions valid whatever state the tournament is in (`restart`), and for the sites
 * whose own gate the options bag cannot express — a gate that is not purely about `status`
 * (`rounds`, `rounds/start`, which reject on `format` FIRST), or one that returns a
 * different message per rejected status (`cancel-scheduled`), or one applied conditionally
 * far below the auth check (`[code]` PATCH). Those keep their checks inline, immediately
 * after this call, and still stop hand-rolling the token comparison.
 *
 * `opts` may still be passed for `missingTokenError` alone — that is how `branding/logo`
 * gets its 400 rung with no status gate behind it.
 */
export async function assertTournamentHostAny<M extends string = never>(
  supabase: SupabaseClient,
  code: string,
  hostToken: string | null | undefined,
  opts?: Pick<TournamentHostAccessOptions<M>, 'missingTokenError'>
) {
  // `null` gate — genuinely no status rung, not an `allowedStatuses` listing every status
  // (which would silently start rejecting the day a status is added to the vocabulary).
  return assertTournamentHost(supabase, code, hostToken, null, opts?.missingTokenError)
}

/**
 * Host authorization on a tournament that has not finished — the single most common gate
 * (`finish`, `games`, `remove-player`, `transfer-host`). The 400 message stays per-caller
 * because each of those sites words it differently today, and adopting this must not change
 * a response body.
 */
export async function assertTournamentHostUnfinished<S extends string, M extends string = never>(
  supabase: SupabaseClient,
  code: string,
  hostToken: string | null | undefined,
  statusError: S,
  opts?: Pick<TournamentHostAccessOptions<M>, 'missingTokenError'>
) {
  return assertTournamentHost<S | M>(
    supabase,
    code,
    hostToken,
    { allowedStatuses: TOURNAMENT_UNFINISHED_STATUSES, statusError },
    opts?.missingTokenError
  )
}

/**
 * Host authorization on a tournament that has not started — `reschedule` and
 * `transfer-scheduled-host`, which both reject `active` and `finished`. Named because
 * "before kickoff" is a real phase of the tournament lifecycle, not an arbitrary pair.
 *
 * `opts` is accepted, though no caller passes it yet, so this stays signature-compatible with
 * `assertTournamentHostUnfinished` — the two are used interchangeably (they are iterated as
 * one list in `tournament-admin.test.ts`), and a union of two differently-shaped generic
 * signatures is not callable.
 */
export async function assertTournamentHostBeforeStart<S extends string, M extends string = never>(
  supabase: SupabaseClient,
  code: string,
  hostToken: string | null | undefined,
  statusError: S,
  opts?: Pick<TournamentHostAccessOptions<M>, 'missingTokenError'>
) {
  return assertTournamentHost<S | M>(
    supabase,
    code,
    hostToken,
    { allowedStatuses: ['waiting', 'scheduled'], statusError },
    opts?.missingTokenError
  )
}
