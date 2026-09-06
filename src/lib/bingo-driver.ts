import type { Player } from '@/types'

/**
 * Who drives bingo's auto-call, and when.
 *
 * ## Why this exists
 *
 * Bingo has no per-round deadline row to reconcile against: numbers only appear
 * because *something* POSTs `/api/bingo/sync`, and that route calls the next number
 * once `bingo_call_interval_seconds` has genuinely elapsed since the newest
 * `bingo_called_numbers` row (see {@link file://./bingo.ts} `syncBingoAutoCall`).
 * The poke is idempotent and interval-gated, so an early poke is a no-op — but it is
 * NOT free: every poke reads the `games` row plus the game's entire called-number
 * history (up to 75 rows) before deciding it is not due yet.
 *
 * There are three independent things that can poke it:
 *
 *   1. **The server ticker** (`src/lib/game-tick.ts`) — an always-on in-process loop
 *      that pokes every active bingo game every `GAME_TICK_INTERVAL_MS` (2.5s) with
 *      no browser attached. This is the PRIMARY clock in the production deploy.
 *   2. **The host view.**
 *   3. **Player views.**
 *
 * Before this module, (2) and (3) each polled unconditionally every 2s — the host
 * plus a two-player elected quorum (`isAdvanceDriver`), so 3 clients × 0.5 POST/s,
 * every one of them a full games+history read, *and* each success triggered a full
 * client reload (4 more queries). All of it duplicating a server ticker that had
 * already called the number.
 *
 * ## The rule
 *
 * Clients are a STANDBY for the server ticker, not a co-driver. A client only pokes
 * when the next call is *overdue* — i.e. the ticker demonstrably has not run — and
 * the two client tiers are staggered so exactly ONE of them pokes in any given
 * overdue window:
 *
 * | driver          | fires when now ≥                          |
 * |-----------------|-------------------------------------------|
 * | server ticker   | dueAt                                     |
 * | host client     | dueAt + {@link BINGO_HOST_GRACE_MS}       |
 * | one elected player | dueAt + {@link BINGO_PLAYER_GRACE_MS}  |
 *
 * where `dueAt = lastCalledAt + bingo_call_interval_seconds`.
 *
 * Failover has no gap and needs no host-presence signal (players cannot observe
 * whether a host tab is open, so nothing is gated on that): if the ticker is down
 * AND the host tab is closed or backgrounded, the call simply stays overdue past the
 * player grace and the elected player takes over. If the host is alive it always wins
 * the race by {@link BINGO_PLAYER_GRACE_MS} - {@link BINGO_HOST_GRACE_MS}, so the
 * player tier stays silent. If the elected player leaves, the roster changes and the
 * next-earliest player is elected automatically — the same deterministic election
 * `isAdvanceDriver` uses, narrowed to a quorum of one because the server ticker, not
 * a second browser, is the redundancy here.
 *
 * In the production deploy where the ticker is healthy, the steady-state client poke
 * rate is ZERO.
 */

/** Grace before the host client assumes the server ticker did not fire. */
export const BINGO_HOST_GRACE_MS = 3_000

/**
 * Grace before the elected player client takes over. Strictly greater than
 * {@link BINGO_HOST_GRACE_MS} so a live host always pre-empts the player tier.
 */
export const BINGO_PLAYER_GRACE_MS = 6_000

export type BingoDriverRole = 'host' | 'player' | 'none'

/**
 * Which standby tier this client occupies.
 *
 * @param players     the game's players, any order (a stable total order is imposed
 *                    internally so every client elects the same player)
 * @param myPlayerId  this client's player id, or null for a seatless client
 * @param isHost      pass true from the host view
 */
export function bingoDriverRole({
  players,
  myPlayerId,
  isHost = false,
}: {
  players: readonly Player[]
  myPlayerId?: string | null
  isHost?: boolean
}): BingoDriverRole {
  if (isHost) return 'host'
  if (!myPlayerId) return 'none'

  const elected = [...players]
    .filter((p) => p.spectator !== true && p.is_eliminated !== true)
    // Deterministic total order by (joined_at, id) so every client elects the same
    // player regardless of how its local array happens to be sorted.
    .sort((a, b) => {
      const ja = a.joined_at ?? ''
      const jb = b.joined_at ?? ''
      if (ja !== jb) return ja < jb ? -1 : 1
      return a.id < b.id ? -1 : 1
    })[0]

  return elected && elected.id === myPlayerId ? 'player' : 'none'
}

/** Grace applied to each tier. `none` never fires. */
export function bingoDriverGraceMs(role: BingoDriverRole): number {
  if (role === 'host') return BINGO_HOST_GRACE_MS
  if (role === 'player') return BINGO_PLAYER_GRACE_MS
  return Number.POSITIVE_INFINITY
}

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * Should this client POST `/api/bingo/sync` right now?
 *
 * @param lastCalledAt      ISO timestamp of the newest called number, or null/undefined
 *                          when none has been called yet
 * @param baselineMs        epoch ms to measure from when nothing has been called yet —
 *                          the moment this client saw the game go active. Without it a
 *                          freshly-started game would look infinitely overdue and every
 *                          standby would poke at once.
 * @param callIntervalSeconds  the game's configured seconds between numbers
 */
export function shouldRequestBingoCall({
  role,
  lastCalledAt,
  baselineMs,
  callIntervalSeconds,
  now,
}: {
  role: BingoDriverRole
  lastCalledAt?: string | null
  baselineMs: number
  callIntervalSeconds: number
  now: number
}): boolean {
  if (role === 'none') return false

  const anchor = toMs(lastCalledAt) ?? baselineMs
  const dueAt = anchor + callIntervalSeconds * 1000
  return now >= dueAt + bingoDriverGraceMs(role)
}

/**
 * Poll cadence for the standby check.
 *
 * A tick is now a local timestamp comparison that only reaches the network when a call
 * is genuinely overdue, so tick rate no longer drives cost — it only bounds how late a
 * takeover can be when the server ticker is down. Tracking the game's own cadence keeps
 * that bound proportional: a 15s game does not need a 2s heartbeat.
 */
export function bingoAutoCallPollIntervalMs(callIntervalSeconds: number): number {
  return Math.max(4_000, Math.min(8_000, callIntervalSeconds * 1_000))
}

/**
 * Newest `called_at` in a called-numbers array, or null when empty.
 *
 * Both bingo views keep the array ascending by `called_at` (the load orders by it and
 * the realtime INSERT handler appends), but this scans rather than trusting the tail —
 * the array is at most 75 entries, and a mis-ordered tail would silently make the
 * standby driver think a call was overdue and poke on every tick.
 */
export function newestCalledAtOf(rows: readonly { called_at: string }[]): string | null {
  let newest: string | null = null
  for (const row of rows) {
    if (newest === null || row.called_at > newest) newest = row.called_at
  }
  return newest
}
