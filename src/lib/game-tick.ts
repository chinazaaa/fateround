import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Server-side game ticker.
 *
 * Timed games (round-based and turn-based) only advance when a browser "pokes" the
 * game's `advance` / `expire-turn` endpoint — and those client pollers pause while the
 * tab is hidden (see {@link file://./../hooks/usePolling.ts}). So if every participant
 * backgrounds their tab, a round/turn can sit expired for minutes until someone returns.
 *
 * This ticker is the always-on backstop: a single loop inside the long-running Node
 * server (`output: 'standalone'` → `node server.js`) that pokes the same endpoints for
 * every active timed game, so the clock keeps moving with no browser attached. Those
 * endpoints are the existing tokenless "system/timer" routes — idempotent and
 * deadline-gated server-side, so a poke is a cheap no-op unless something is genuinely
 * due. We POST to them (rather than calling the lib functions directly) so all route
 * behavior — schemas, push-notification scheduling, result handling — is preserved
 * with zero duplication.
 *
 * Cost scales with *active* games, not wall-clock: each tick is one indexed
 * `status='active'` query, and it only fans out to games that exist. Zero active timed
 * games → zero pokes.
 */

/** game_type → URL slug for the round-based `/api/<slug>/advance` endpoints. */
const ROUND_ADVANCE_SLUG: Record<string, string> = {
  trivia: 'trivia',
  i_call_on: 'npat',
  two_truths: 'two-truths',
  quiplash: 'quiplash',
  quick_draw: 'quick-draw',
  describe_it: 'describe-it',
  word_rush: 'word-rush',
  landmine: 'landmine',
}

/** game_type → URL slug for the turn-based `/api/<slug>/expire-turn` endpoints. */
const TURN_EXPIRE_SLUG: Record<string, string> = {
  whot: 'whot',
  crazy_eights: 'crazy-eights',
  chess: 'chess',
  checkers: 'checkers',
  monopoly: 'monopoly',
  tic_tac_toe: 'tic-tac-toe',
  yahtzee: 'yahtzee',
  snake_and_ladder: 'snake-and-ladder',
  codewords: 'codewords',
}

// Bingo is deliberately excluded: its auto-call route requires the host token (it's a
// host-run game, not a tokenless system timer), so the ticker can't drive it.
export const HANDLED_GAME_TYPES = [
  ...Object.keys(ROUND_ADVANCE_SLUG),
  ...Object.keys(TURN_EXPIRE_SLUG),
  'mafia',
  'bingo',
]

type PokeTarget = { path: string; body: Record<string, unknown> }

export function pokeTargetFor(gameType: string, gameId: string): PokeTarget | null {
  if (ROUND_ADVANCE_SLUG[gameType]) {
    return { path: `/api/${ROUND_ADVANCE_SLUG[gameType]}/advance`, body: { gameId } }
  }
  if (TURN_EXPIRE_SLUG[gameType]) {
    return { path: `/api/${TURN_EXPIRE_SLUG[gameType]}/expire-turn`, body: { gameId } }
  }
  // Mafia's advance route lives under a dynamic segment and takes an `isAuto` flag
  // (authorized only once the phase deadline has passed).
  if (gameType === 'mafia') {
    return { path: `/api/mafia/${gameId}/advance`, body: { isAuto: true } }
  }
  // Bingo auto-call: the tokenless `sync` route calls the next number only once the
  // configured interval has elapsed (no-op in manual mode / before the interval).
  if (gameType === 'bingo') {
    return { path: `/api/bingo/sync`, body: { gameId } }
  }
  return null
}

function selfBaseUrl(): string {
  // In `output: 'standalone'` the server listens on PORT (default 3000). Loopback keeps
  // the poke on-box. Overridable in case the server binds elsewhere.
  return process.env.GAME_TICK_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`
}

let inFlight = false

/** One tick: poke every active timed game's system endpoint. Safe to call repeatedly. */
export async function tickActiveGames(): Promise<void> {
  if (inFlight) return // never let a slow tick stack on the next
  inFlight = true
  try {
    const supabase = getSupabaseAdmin()
    const { data: games, error } = await supabase
      .from('games')
      .select('id, game_type')
      .eq('status', 'active')
      .in('game_type', HANDLED_GAME_TYPES)

    if (error || !games || games.length === 0) return

    if (process.env.GAME_TICK_DEBUG === '1') {
      console.log(
        `[game-tick] poking ${games.length} active game(s): ${games.map((g) => `${g.game_type}:${g.id}`).join(', ')}`
      )
    }

    const base = selfBaseUrl()
    await Promise.all(
      games.map(async (g) => {
        const target = pokeTargetFor(g.game_type, g.id)
        if (!target) return
        try {
          await fetch(base + target.path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(target.body),
          })
        } catch {
          // Swallow — fire-and-forget. A network blip / non-2xx (e.g. "not due yet")
          // is expected and self-heals on the next tick.
        }
      })
    )
  } catch {
    // Never let a bad tick crash the loop.
  } finally {
    inFlight = false
  }
}

let started = false

/**
 * Starts the ticker interval. Idempotent per process (a repeated call is a no-op).
 *
 * Runs by default in production (the standalone `node server.js` deploy). In dev/test it
 * stays off unless GAME_TICK_ENABLED=1 — otherwise every developer's `next dev` would
 * poke the *shared* dev Supabase in parallel. Kill-switch: GAME_TICK_DISABLED=1. Tune
 * cadence with GAME_TICK_INTERVAL_MS.
 */
export function startGameTicker(): void {
  if (started) return
  if (process.env.GAME_TICK_DISABLED === '1') return
  const enabled = process.env.NODE_ENV === 'production' || process.env.GAME_TICK_ENABLED === '1'
  if (!enabled) return
  started = true
  const intervalMs = Number(process.env.GAME_TICK_INTERVAL_MS) || 2500
  console.log(`[game-tick] server ticker started (interval=${intervalMs}ms)`)
  const timer = setInterval(() => {
    void tickActiveGames()
  }, intervalMs)
  // Don't keep the process alive just for the ticker.
  timer.unref?.()
}
