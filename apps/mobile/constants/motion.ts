/**
 * Motion tokens — timings + easings used across the app.
 *
 * Deliberately named-by-intent, not by number. `press` is "how a button
 * responds to a tap", not "150 milliseconds". Consumers reference the
 * intent; premium arc can retune the numbers without a component rewrite.
 *
 * Today these feed React Native's built-in `Animated`. The Premium arc
 * (see docs/mobile-revamp-plan.md) will introduce Reanimated 3 for
 * gesture-driven work; these names stay stable and re-target the newer
 * runtime with the same semantics.
 */

/** Duration in milliseconds. Consumers read `motion.duration.press`, never `120`. */
export const duration = {
  /** Immediate feedback — button press-down, ripple, chip toggle. */
  press: 120,
  /** Everyday transitions — modal fade, list item enter. */
  short: 180,
  /** Screen-level or emphasised changes — sheet slide-in, hero swap. */
  medium: 260,
  /** Deliberate, hero-level motion. Use sparingly. */
  long: 380,
} as const

/**
 * Easing "shapes." String tokens because RN's Easing API + Reanimated
 * both accept these curves via named calls; components pass the intent,
 * platform code picks the runtime call.
 */
export const easing = {
  /** Symmetric, use for reversible transitions like a modal fade in/out. */
  standard: 'ease-in-out' as const,
  /** Content entering — slow-out. Screens sliding into place. */
  decelerate: 'ease-out' as const,
  /** Content leaving — fast-in. Dismiss motions. */
  accelerate: 'ease-in' as const,
  /** Emphatic accent motion — used sparingly for reward moments (win screen). */
  emphasize: 'ease-in-out' as const,
} as const

export type MotionDuration = keyof typeof duration
export type MotionEasing = keyof typeof easing

export const motion = { duration, easing } as const
