import type { SupabaseClient } from '@supabase/supabase-js'
import { secretMatches } from '@/lib/secret-compare'

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

export type TournamentHostAccessOptions = {
  /** Statuses the tournament may be in. Omit the gate entirely via `assertTournamentHostAny`. */
  allowedStatuses: readonly string[]
  /** 400 body returned when the status gate rejects. */
  statusError: string
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
  missingTokenError?: string
}

/** The status gate, split from `missingTokenError` so "no gate" is a real `null`. */
type StatusGate = Pick<TournamentHostAccessOptions, 'allowedStatuses' | 'statusError'>

async function assertTournamentHost(
  supabase: SupabaseClient,
  code: string,
  hostToken: string | null | undefined,
  gate: StatusGate | null,
  missingTokenError?: string
) {
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
export async function assertTournamentHostWith(
  supabase: SupabaseClient,
  code: string,
  hostToken: string | null | undefined,
  opts: TournamentHostAccessOptions
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
export async function assertTournamentHostAny(
  supabase: SupabaseClient,
  code: string,
  hostToken: string | null | undefined,
  opts?: Pick<TournamentHostAccessOptions, 'missingTokenError'>
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
export async function assertTournamentHostUnfinished(
  supabase: SupabaseClient,
  code: string,
  hostToken: string | null | undefined,
  statusError: string,
  opts?: Pick<TournamentHostAccessOptions, 'missingTokenError'>
) {
  return assertTournamentHost(
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
 */
export async function assertTournamentHostBeforeStart(
  supabase: SupabaseClient,
  code: string,
  hostToken: string | null | undefined,
  statusError: string
) {
  return assertTournamentHost(supabase, code, hostToken, {
    allowedStatuses: ['waiting', 'scheduled'],
    statusError,
  })
}
