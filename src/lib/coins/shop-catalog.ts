/**
 * Curated code-side shop catalog for the Phase 3 launch cosmetics.
 *
 * Frames, name colors, winner animations, card templates and streak freeze
 * live here (not in a DB catalog table) because their palette is
 * DESIGN-CURATED per the plan doc's "curated over free-picker" principle —
 * adding one is a code review, not an admin panel toggle. Game themes and
 * game editions DO live in the DB (game_themes / game_editions) because
 * they have per-row art JSON that ships in art delivery PRs.
 *
 * Prices come straight from
 * docs/coins-and-shop-plan.md § "Proposed price bands". Change the number
 * here, not at the call site — purchase_item() re-reads the catalog on the
 * server side for DB-backed kinds; for code-side kinds this file IS the
 * catalog and the API/RPC trust the price up to a sane ceiling.
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

export type ShopCategory = ShopKind

export type FrameSpec = {
  kind: 'frame'
  slug: string
  name: string
  price: number
  /** CSS for the ring/decoration; consumed by <Avatar frameSlug=…>. */
  ring: {
    /** Solid ring color, applied via border. */
    color?: string
    /** Optional soft outer glow. */
    shadow?: string
    /** Extra decorative overlay class (e.g. laurel, star specks). */
    decoration?: 'laurel' | 'stars' | null
  }
}

export type NameColorSpec = {
  kind: 'name_color'
  slug: string
  name: string
  price: number
  /** CSS `color` in light mode. */
  light: string
  /** CSS `color` in dark mode. */
  dark: string
  /** When non-null, applied as `background-image: linear-gradient(...)` + text-clip. */
  gradient?: { light: string; dark: string }
}

export type AnimationSpec = {
  kind: 'animation'
  slug: string
  name: string
  price: number
  /** Class rendered by FinishedWinner. CSS lives in globals.css. */
  cssClass: string
}

export type CardTemplateSpec = {
  kind: 'card_template'
  slug: string
  name: string
  price: number
  /** Class applied to the ShareResults capture wrapper. */
  cssClass: string
}

export type StreakFreezeSpec = {
  kind: 'streak_freeze'
  slug: 'streak-freeze-1'
  name: string
  price: number
}

/**
 * Avatar frames — 4 at launch (`docs/coins-art-briefs.md` § "Avatar frames").
 * Every slug matches the brief so the eventual SVG delivery can drop in
 * without a code rename.
 */
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

/**
 * Name colors — 6 solids + 3 gradients. Every pair (light, dark) is tuned
 * to pass WCAG AA against the corresponding app-background token per the
 * art brief; contrast is verified in `PlayerName.contrast.test.ts`.
 */
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

/**
 * Winner animations — 3 at launch. Actual Lottie JSON is scoped for the
 * art PR (`docs/coins-art-briefs.md` § "Winner animations"); this ships
 * placeholder CSS overlays keyed on the slug so the ownership + equip
 * flow can be wired end-to-end today.
 */
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

/**
 * Card templates — 2 premium at launch. Default template stays free; these
 * are wrapper CSS classes on FinalResultsShareBlock's capture container.
 */
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
 * Server-authoritative price lookup for the code-side kinds
 * (frame, name_color, animation, card_template, streak_freeze). Returns
 * null for an unknown kind/slug so the caller can 400 rather than pass
 * a bogus price to the purchase RPC.
 *
 * Reviewer flagged that the /api/shop/purchase route used to trust the
 * client-supplied price for these kinds — a malicious client could POST
 * price:1 and walk out with any cosmetic. This helper is the "server is
 * the source of truth" fix: the route always overrides body.price with
 * whatever this returns.
 *
 * The RPC still trusts the price it receives (up to a 10k ceiling); the
 * ONLY caller is the shop route, which is SECURITY DEFINER-locked and now
 * resolves price here. DB-backed kinds (theme, edition, library_pack) are
 * re-checked inside the RPC against their catalog table, so they don't
 * need a lookup here.
 */
export function codeSidePrice(kind: ShopKind, slug: string): number | null {
  switch (kind) {
    case 'frame':
      return findFrame(slug)?.price ?? null
    case 'name_color':
      return findNameColor(slug)?.price ?? null
    case 'animation':
      return findAnimation(slug)?.price ?? null
    case 'card_template':
      return findCardTemplate(slug)?.price ?? null
    case 'streak_freeze':
      return slug === STREAK_FREEZE.slug ? STREAK_FREEZE.price : null
    default:
      return null
  }
}
