import type { SupabaseClient } from '@supabase/supabase-js'
import type { ThemeId } from '@/lib/themes'

/**
 * Single source of truth for the Monopoly theme ↔ edition slug bridge.
 * Everything that maps between the legacy `game.theme` id and the Phase 4
 * `game.edition_slug` catalog key imports from here — POST /api/games,
 * PATCH /api/games/[code], and the client-side picker hook. Adding a new
 * edition (Christmas, Lagos, …) means touching one file, not three, so
 * a partial update can't silently drift the two columns.
 */
export const MONOPOLY_THEME_TO_EDITION: Record<string, string> = {
  default: 'london',
  naija: 'naija',
  pirate: 'pirate',
  arctic: 'arctic',
  america: 'america',
}

export const MONOPOLY_EDITION_TO_THEME: Record<string, ThemeId> = {
  london: 'default',
  naija: 'naija',
  pirate: 'pirate',
  arctic: 'arctic',
  america: 'america',
}

/** Free-forever grandfathered editions (price 0 in `game_editions`). */
export const FREE_MONOPOLY_EDITION_SLUGS: ReadonlySet<string> = new Set(['london', 'naija', 'pirate', 'arctic'])

/**
 * Server-authoritative entitlement checks for `game_editions` selection.
 *
 * The rule the whole shop enforces: content that costs coins is only
 * playable by profiles that own it. For editions, "playing" starts at
 * room create/patch — the host picks the edition and every seat at the
 * table experiences it (docs/coins-and-shop-plan.md § "Decisions" → §5).
 * So the check has to run at edition_slug write time, on the server,
 * before the row lands.
 *
 * Free grandfathered editions (`price_coins = 0` in `game_editions`) are
 * always allowed — the plan's "never take away what was free" rule. Paid
 * editions need an owned-row in `profile_owned_editions`. Anything not in
 * `game_editions` at all (typo, retired slug) is rejected outright.
 *
 * Same pattern as the Phase 3 shop route: never trust the client on
 * price or entitlement. Put this in `src/lib/coins/` so every current
 * and future edition-adjacent endpoint (Christmas Phase 5, edition
 * switcher, previews) can call the same guard.
 */

export type EditionEntitlement =
  | { ok: true }
  /** Slug isn't in `game_editions` — likely a typo or a retired edition. */
  | { ok: false; reason: 'unknown_edition' }
  /** Slug exists and is paid; the profile has no owned-row. */
  | { ok: false; reason: 'not_owned' }
  /** No signed-in profile but the picked edition is priced. Guests can
   *  only host free editions. */
  | { ok: false; reason: 'needs_profile' }

/**
 * Verify that `profileId` may host a Monopoly room with `editionSlug`.
 *
 * Reads `game_editions` for the price and `profile_owned_editions` for
 * ownership. Both reads via the passed admin client so RLS never hides a
 * row from the entitlement check.
 */
export async function checkMonopolyEditionEntitlement(
  admin: SupabaseClient,
  profileId: string | null,
  editionSlug: string
): Promise<EditionEntitlement> {
  // Cheap short-circuit: the four grandfathered slugs are FREE forever and
  // do not need a round-trip to the catalog. >95% of Monopoly rooms use
  // one of these, so skipping the two SELECTs keeps the create-game hot
  // path snappy. Trade-off: `game_editions.is_active = false` is IGNORED
  // for slugs in this set — ops cannot sunset a grandfathered edition by
  // flipping the DB flag alone; they also have to remove the slug from
  // FREE_MONOPOLY_EDITION_SLUGS in a code deploy. Deliberate: "never take
  // away what was free" (docs/coins-and-shop-plan.md) means the free four
  // are effectively permanent, so the DB toggle isn't the right lever.
  if (FREE_MONOPOLY_EDITION_SLUGS.has(editionSlug)) return { ok: true }

  // Catalog lookup — price is the source of truth. is_active=false hides
  // a retired edition from new selections without deleting existing
  // profile_owned_editions rows.
  const { data: catalog, error: catalogErr } = await admin
    .from('game_editions')
    .select('price_coins')
    .eq('game_type', 'monopoly')
    .eq('slug', editionSlug)
    .eq('is_active', true)
    .maybeSingle()
  if (catalogErr) throw catalogErr
  if (!catalog) return { ok: false, reason: 'unknown_edition' }

  const price = Number(catalog.price_coins ?? 0)
  if (price === 0) return { ok: true }

  if (!profileId) return { ok: false, reason: 'needs_profile' }

  const { data: owned, error: ownedErr } = await admin
    .from('profile_owned_editions')
    .select('edition_slug')
    .eq('profile_id', profileId)
    .eq('edition_slug', editionSlug)
    .maybeSingle()
  if (ownedErr) throw ownedErr
  if (!owned) return { ok: false, reason: 'not_owned' }

  return { ok: true }
}

/**
 * Map a check outcome to an HTTP status + user-facing message. Kept here
 * so every route surfacing an edition write returns the same envelope
 * (matches the shop route's 402 for insufficient funds, 403 for
 * not-yours).
 */
export function editionEntitlementError(reason: Exclude<EditionEntitlement, { ok: true }>['reason']): {
  status: number
  error: string
} {
  switch (reason) {
    case 'unknown_edition':
      return { status: 400, error: 'Unknown edition' }
    case 'not_owned':
      return { status: 403, error: "You don't own that edition — visit the shop to unlock it." }
    case 'needs_profile':
      return { status: 401, error: 'Sign in to host a paid edition.' }
  }
}
