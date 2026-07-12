/**
 * Maximum readable content width. On wide screens (iPad/tablet) the app centers
 * its main content within this instead of stretching edge-to-edge, so buttons,
 * cards and text don't look like a blown-up phone layout. Phones are narrower
 * than this, so they're unaffected.
 */
export const CONTENT_MAX_WIDTH = 720

/** Style fragment to center a flex container and cap its width (fills height). */
export const centeredContent = {
  width: '100%',
  maxWidth: CONTENT_MAX_WIDTH,
  alignSelf: 'center',
} as const
