/**
 * Bots-in-room — the single registry of which games can seat a computer player.
 *
 * Two surfaces need this list and they must never disagree:
 *
 *   1. `/api/games/[code]/bots` — whether a host may seat a bot at all.
 *   2. `src/lib/game-tick.ts` — which games get a `/api/<slug>/bot-tick` poke, i.e. what
 *      actually makes a seated bot take its turn.
 *
 * A game in (1) but not (2) seats a bot that never moves and stalls the room on its turn;
 * a game in (2) but not (1) just wastes a poke. They used to be two hand-kept literals in
 * two files. Deriving the first from the second makes the bad state unrepresentable, which
 * is better than a test that notices it afterwards.
 *
 * This module is deliberately dependency-free so `game-tick.ts` can import it without
 * dragging anything into the edge-runtime compile of `src/instrumentation.ts`.
 *
 * ── Adding a game ─────────────────────────────────────────────────────────
 * Add one entry below, then ship the two things it promises:
 *   - `src/lib/<game>-bot-adapter.ts` — DB state → the solo bot's state shape
 *   - `src/lib/<game>-bot-driver.ts` + `src/app/api/<slug>/bot-tick/route.ts`
 * `bots-in-room.test.ts` fails CI if the route or driver is missing.
 *
 * Phase 1 shipped Whot, Phase 2 Monopoly, Phase 3 Crazy Eights. See
 * `docs/bots-in-room-plan.md`.
 */

/** game_type → URL slug for its `/api/<slug>/bot-tick` endpoint. */
export const BOT_TICK_SLUG: Record<string, string> = {
  whot: 'whot',
  monopoly: 'monopoly',
  crazy_eights: 'crazy-eights',
}

/**
 * Game types a host may seat a bot in. Derived from `BOT_TICK_SLUG`, so a game can only be
 * bot-seatable once something exists to drive its turns.
 */
export const BOTS_SUPPORTED_TYPES: ReadonlySet<string> = new Set(Object.keys(BOT_TICK_SLUG))

/** Whether this game type can seat bots today. */
export function gameSupportsBots(gameType: string): boolean {
  return BOTS_SUPPORTED_TYPES.has(gameType)
}
