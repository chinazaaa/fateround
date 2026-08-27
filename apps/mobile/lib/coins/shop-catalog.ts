/**
 * Mobile mirror of `src/lib/coins/shop-catalog.ts`.
 *
 * Duplicated (not cross-package imported) so the mobile bundle stays
 * independent of the Next.js app tree; a change to any slug or price MUST
 * bump both files together. Only the code-side kinds live here — theme /
 * edition / library_pack come from the server catalog.
 *
 * These specs are read at tile-render time (name-color previews, animation
 * classes, frame ring color). Prices are only used for display / balance
 * math in the confirm dialog — the server resolves the true price on
 * purchase.
 */

export type ShopKind =
  | 'edition'
  | 'theme'
  | 'frame'
  | 'name_color'
  | 'animation'
  | 'card_template'
  | 'library_pack'
  | 'streak_freeze'

export type FrameSpec = {
  kind: 'frame'
  slug: string
  name: string
  price: number
  ring: {
    color?: string
    /** iOS/Android don't render arbitrary CSS shadows, so mobile draws a
     *  bordered ring only — this field is retained for parity with web
     *  and ignored by the tile preview. */
    shadow?: string
    decoration?: 'laurel' | 'stars' | null
  }
}

export type NameColorSpec = {
  kind: 'name_color'
  slug: string
  name: string
  price: number
  light: string
  dark: string
  /** Web renders these as CSS linear-gradient + text-clip. React Native
   *  can't clip a gradient into a Text on-device without a native lib,
   *  so mobile falls back to `dark`/`light` solids in the preview. */
  gradient?: { light: string; dark: string }
}

export type AnimationSpec = {
  kind: 'animation'
  slug: string
  name: string
  price: number
  /** Web hooks a CSS class here; retained for parity but ignored by the
   *  RN preview, which uses a slug-keyed color badge instead. */
  cssClass: string
}

export type CardTemplateSpec = {
  kind: 'card_template'
  slug: string
  name: string
  price: number
  cssClass: string
}

export type StreakFreezeSpec = {
  kind: 'streak_freeze'
  slug: 'streak-freeze-1'
  name: string
  price: number
}

export const FRAMES: FrameSpec[] = [
  {
    kind: 'frame',
    slug: 'frame-gold-ring',
    name: 'Gold Ring',
    price: 200,
    ring: { color: '#d4a017', shadow: '0 0 0 2px rgba(212,160,23,0.35)' },
  },
  {
    kind: 'frame',
    slug: 'frame-laurel',
    name: 'Laurel',
    price: 200,
    ring: { color: '#b78d3f', decoration: 'laurel' },
  },
  {
    kind: 'frame',
    slug: 'frame-neon-cyan',
    name: 'Neon Cyan',
    price: 200,
    ring: { color: '#22d3ee', shadow: '0 0 12px rgba(34,211,238,0.6)' },
  },
  {
    kind: 'frame',
    slug: 'frame-cosmic',
    name: 'Cosmic',
    price: 200,
    ring: { color: '#7c3aed', decoration: 'stars', shadow: '0 0 0 2px rgba(124,58,237,0.35)' },
  },
]

export const NAME_COLORS: NameColorSpec[] = [
  { kind: 'name_color', slug: 'name-coral', name: 'Coral', price: 150, light: '#c53030', dark: '#fda4af' },
  { kind: 'name_color', slug: 'name-teal', name: 'Teal', price: 150, light: '#0f766e', dark: '#5eead4' },
  { kind: 'name_color', slug: 'name-amber', name: 'Amber', price: 150, light: '#a16207', dark: '#fcd34d' },
  { kind: 'name_color', slug: 'name-violet', name: 'Violet', price: 150, light: '#6d28d9', dark: '#c4b5fd' },
  { kind: 'name_color', slug: 'name-crimson', name: 'Crimson', price: 150, light: '#9f1239', dark: '#fda4af' },
  { kind: 'name_color', slug: 'name-forest', name: 'Forest', price: 150, light: '#14532d', dark: '#86efac' },
  {
    kind: 'name_color',
    slug: 'name-sunset',
    name: 'Sunset',
    price: 300,
    light: '#c53030',
    dark: '#fda4af',
    gradient: {
      light: 'linear-gradient(45deg, #c53030, #a16207)',
      dark: 'linear-gradient(45deg, #fda4af, #fcd34d)',
    },
  },
  {
    kind: 'name_color',
    slug: 'name-ocean',
    name: 'Ocean',
    price: 300,
    light: '#0f766e',
    dark: '#5eead4',
    gradient: {
      light: 'linear-gradient(45deg, #0f766e, #1e40af)',
      dark: 'linear-gradient(45deg, #5eead4, #93c5fd)',
    },
  },
  {
    kind: 'name_color',
    slug: 'name-aurora',
    name: 'Aurora',
    price: 300,
    light: '#6d28d9',
    dark: '#c4b5fd',
    gradient: {
      light: 'linear-gradient(90deg, #6d28d9, #0f766e, #c53030)',
      dark: 'linear-gradient(90deg, #c4b5fd, #5eead4, #fda4af)',
    },
  },
]

export const ANIMATIONS: AnimationSpec[] = [
  { kind: 'animation', slug: 'winner-anim-confetti', name: 'Confetti', price: 300, cssClass: 'fr-anim-confetti' },
  { kind: 'animation', slug: 'winner-anim-fireworks', name: 'Fireworks', price: 300, cssClass: 'fr-anim-fireworks' },
  {
    kind: 'animation',
    slug: 'winner-anim-gold-shower',
    name: 'Gold Shower',
    price: 300,
    cssClass: 'fr-anim-gold-shower',
  },
]

export const CARD_TEMPLATES: CardTemplateSpec[] = [
  {
    kind: 'card_template',
    slug: 'card-template-gold-luxe',
    name: 'Gold Luxe',
    price: 250,
    cssClass: 'fr-card-gold-luxe',
  },
  { kind: 'card_template', slug: 'card-template-neon', name: 'Neon', price: 250, cssClass: 'fr-card-neon' },
]

export const STREAK_FREEZE: StreakFreezeSpec = {
  kind: 'streak_freeze',
  slug: 'streak-freeze-1',
  name: 'Streak freeze (1 use)',
  price: 500,
}

/** Flat 50 coins per bot per room; first bot is always free. */
export const EXTRA_BOT_COST = 50

export function findFrame(slug: string | null | undefined): FrameSpec | null {
  if (!slug) return null
  return FRAMES.find((f) => f.slug === slug) ?? null
}

export function findNameColor(slug: string | null | undefined): NameColorSpec | null {
  if (!slug) return null
  return NAME_COLORS.find((c) => c.slug === slug) ?? null
}

export function findAnimation(slug: string | null | undefined): AnimationSpec | null {
  if (!slug) return null
  return ANIMATIONS.find((a) => a.slug === slug) ?? null
}

export function findCardTemplate(slug: string | null | undefined): CardTemplateSpec | null {
  if (!slug) return null
  return CARD_TEMPLATES.find((t) => t.slug === slug) ?? null
}

/**
 * Free-forever grandfathered Monopoly editions (price 0 in `game_editions`).
 * Duplicated from `src/lib/coins/editions.ts` FREE_MONOPOLY_EDITION_SLUGS —
 * same reason as EXTRA_BOT_COST above.
 */
export const FREE_MONOPOLY_EDITION_SLUGS: ReadonlySet<string> = new Set(['london', 'naija', 'pirate', 'arctic'])

/**
 * Legacy `game.theme` id → `game_editions.slug` bridge for Monopoly.
 * Mirrors `MONOPOLY_THEME_TO_EDITION` in web.
 */
export const MONOPOLY_THEME_TO_EDITION: Record<string, string> = {
  default: 'london',
  naija: 'naija',
  pirate: 'pirate',
  arctic: 'arctic',
  america: 'america',
  christmas: 'christmas',
}

export function isMonopolyEditionAvailable(themeId: string, owned: Set<string>): boolean {
  const slug = MONOPOLY_THEME_TO_EDITION[themeId] ?? themeId
  if (FREE_MONOPOLY_EDITION_SLUGS.has(slug)) return true
  return owned.has(slug)
}
