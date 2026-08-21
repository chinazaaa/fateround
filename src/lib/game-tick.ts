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
export const ROUND_ADVANCE_SLUG: Record<string, string> = {
  trivia: 'trivia',
  i_call_on: 'npat',
  two_truths: 'two-truths',
  quiplash: 'quiplash',
  quick_draw: 'quick-draw',
  describe_it: 'describe-it',
  word_rush: 'word-rush',
  landmine: 'landmine',
}

/**
 * game_type → URL slug for the `/api/<slug>/bot-tick` endpoints. Present only
 * for games where a bot-in-room driver has been shipped. Bots-in-room Phase 1
 * covered Whot; Phase 2 added Monopoly. Add entries here as other games'
 * drivers land.
 */
const BOT_TICK_SLUG: Record<string, string> = {
  whot: 'whot',
  monopoly: 'monopoly',
}

/**
 * game_type → URL slug for the turn-based `/api/<slug>/expire-turn` endpoints.
 *
 * Must list EVERY game whose `expire-turn` route is a tokenless system/timer route —
 * otherwise that game's clock only advances while some browser tab has the view open and
 * foregrounded, which is exactly the failure this ticker exists to prevent. The
 * `expire-turn-coverage.test.ts` guard fails CI when a route directory has no entry here
 * and isn't explicitly opted out.
 */
export const TURN_EXPIRE_SLUG: Record<string, string> = {
  whot: 'whot',
  crazy_eights: 'crazy-eights',
  chess: 'chess',
  checkers: 'checkers',
  checkers_international: 'checkers-international',
  checkers_nigeria: 'checkers-nigeria',
  monopoly: 'monopoly',
  tic_tac_toe: 'tic-tac-toe',
  yahtzee: 'yahtzee',
  snake_and_ladder: 'snake-and-ladder',
  codewords: 'codewords',
  ludo: 'ludo',
  scrabble: 'scrabble',
  uno: 'uno',
  ayo: 'ayo',
  mahjong: 'mahjong',
}

// Mafia, Bingo and Troll Run are driven through bespoke targets below rather than the two
// slug maps: their `/advance` routes are token-gated (host- or player-authorized), so each
// has its own tokenless system entry point that only applies clock-earned transitions.
export const HANDLED_GAME_TYPES = [
  ...Object.keys(ROUND_ADVANCE_SLUG),
  ...Object.keys(TURN_EXPIRE_SLUG),
  'mafia',
  'bingo',
  'troll_run',
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
  // Troll Run: `/advance` needs a host or player token, so the ticker uses the tokenless
  // `sync` sibling. It never forces a round — only transitions the clock already earned.
  if (gameType === 'troll_run') {
    return { path: `/api/troll-run/sync`, body: { gameId } }
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
      games.flatMap((g) => {
        const target = pokeTargetFor(g.game_type, g.id)
        // For each active game we may run TWO fire-and-forget pokes: the
        // regular timer poke (advance/expire-turn), and — for game types
        // that support bots-in-room — the bot driver poke. Both are
        // idempotent + self-gating on the receiving side, so a bot-free
        // Whot game just no-ops the second poke.
        const pokes: Promise<unknown>[] = []
        if (target) {
          pokes.push(
            fetch(base + target.path, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(target.body),
            }).catch(() => {
              // Swallow — a network blip / non-2xx (e.g. "not due yet") is
              // expected and self-heals on the next tick.
            })
          )
        }
        // Bot driver — only games with an implemented driver route. Kept as a
        // separate route (not imported directly here) so game-tick stays free
        // of web-push and other Node-only deps that would break the edge
        // compile of src/instrumentation.ts. See PR #878 post-mortem.
        if (BOT_TICK_SLUG[g.game_type]) {
          pokes.push(
            fetch(`${base}/api/${BOT_TICK_SLUG[g.game_type]}/bot-tick`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: g.id }),
            }).catch(() => {
              // Same as above — the route is idempotent and self-gates on
              // "does this game have any bots + is it the bot's turn".
            })
          )
        }
        return pokes
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
