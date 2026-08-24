import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Single source of truth for per-game visual theme slugs seeded into
 * `game_themes` by supabase/migrations/20261101120600_coins_shop_phase3.sql.
 * Mirrors the pattern in `editions.ts` for Estate Kings: everything that
 * needs to map between the seeded theme slug and its owning game type
 * (create/PATCH ownership checks, the shop tile, the host picker) reads
 * from here so adding a new theme lands in one place.
 *
 * `default` is the free grandfathered theme that ships with every game
 * — always visible in the picker, never in this table.
 */
export const GAME_THEMES_BY_GAME: Record<string, readonly string[]> = {
  whot: ['whot-neon', 'whot-naija'],
  ludo: ['ludo-wooden', 'ludo-naija'],
  sudoku: ['sudoku-minimalist', 'sudoku-newsprint'],
}

/** Reverse map: theme slug → owning game type. */
export const GAME_THEME_TO_GAME_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(GAME_THEMES_BY_GAME).flatMap(([gameType, slugs]) => slugs.map((slug) => [slug, gameType]))
)

/** True for slugs seeded into `game_themes` (paid, per-game visual reskins). */
export function isGameThemeSlug(slug: string): boolean {
  return slug in GAME_THEME_TO_GAME_TYPE
}

export type GameThemeEntitlement =
  | { ok: true }
  /** Slug isn't a known game_themes row for the given game type. */
  | { ok: false; reason: 'unknown_theme' }
  /** Slug exists and is paid; the profile has no owned-row. */
  | { ok: false; reason: 'not_owned' }
  /** No signed-in profile but the picked theme is priced. */
  | { ok: false; reason: 'needs_profile' }

/**
 * Verify that `profileId` may host a room of `gameType` with `themeSlug`.
 *
 * The rule mirrors `checkMonopolyEditionEntitlement`: content that costs
 * coins is only playable by profiles that own it. For themes, "playing"
 * starts at room create/patch — the host picks the theme and every seat
 * at the table experiences it (docs/coins-and-shop-plan.md § "Themes").
 * Free themes (price 0 — none of the six [LAUNCH] rows fall in this
 * bucket today, but future drops might) pass unconditionally. Paid
 * themes need an owned-row in `profile_owned_themes`. Anything not in
 * `game_themes` at all (typo, retired slug) is rejected outright.
 *
 * `themeSlug` MUST already be recognised as a game_themes slug — the
 * caller filters to that via `isGameThemeSlug` so the legacy app-wide
 * themes (`default`, `dark`, `neon`, …) don't get sent through here.
 */
export async function checkGameThemeEntitlement(
  admin: SupabaseClient,
  profileId: string | null,
  gameType: string,
  themeSlug: string
): Promise<GameThemeEntitlement> {
  // Sanity-check the slug scopes to this game type. Cheap in-code guard
  // that also stops a cross-game payload (a Ludo host trying to pick
  // `whot-neon`) from getting past ownership just because the row exists.
  if (GAME_THEME_TO_GAME_TYPE[themeSlug] !== gameType) {
    return { ok: false, reason: 'unknown_theme' }
  }

  const { data: catalog, error: catalogErr } = await admin
    .from('game_themes')
    .select('price_coins, is_active')
    .eq('game_type', gameType)
    .eq('slug', themeSlug)
    .maybeSingle()
  if (catalogErr) throw catalogErr
  if (!catalog) return { ok: false, reason: 'unknown_theme' }

  const price = Number(catalog.price_coins ?? 0)
  const active = catalog.is_active !== false
  if (price === 0) {
    return active ? { ok: true } : { ok: false, reason: 'unknown_theme' }
  }

  if (!profileId) return { ok: false, reason: 'needs_profile' }

  const { data: owned, error: ownedErr } = await admin
    .from('profile_owned_themes')
    .select('theme_slug')
    .eq('profile_id', profileId)
    .eq('theme_slug', themeSlug)
    .maybeSingle()
  if (ownedErr) throw ownedErr
  if (owned) return { ok: true }
  return active ? { ok: false, reason: 'not_owned' } : { ok: false, reason: 'unknown_theme' }
}

export function gameThemeEntitlementError(reason: Exclude<GameThemeEntitlement, { ok: true }>['reason']): {
  status: number
  error: string
} {
  switch (reason) {
    case 'unknown_theme':
      return { status: 400, error: 'Unknown theme' }
    case 'not_owned':
      return { status: 403, error: "You don't own that theme — visit the shop to unlock it." }
    case 'needs_profile':
      return { status: 401, error: 'Sign in to host a paid theme.' }
  }
}
