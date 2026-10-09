import { createHandsRoute } from '@/lib/hands-route'

/**
 * Rummy hands, with every hand but the caller's own reduced to a card count.
 *
 * The shared implementation lives in lib/hands-route.ts (see docs/rls-hardening.md § "Phase 7 —
 * hand redaction"). Rummy has no wrinkle: no Team-Up partner to reveal and no per-hand state
 * beyond `cards`, so naming the table is the whole configuration.
 */
export const POST = createHandsRoute({
  table: 'rummy_player_hands',
  tag: 'rummy/hands',
})
