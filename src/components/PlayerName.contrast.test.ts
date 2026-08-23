import { describe, expect, it } from 'vitest'
import { NAME_COLORS } from '@/lib/coins/shop-catalog'

/**
 * WCAG AA guard for the curated name-color palette
 * (`docs/coins-art-briefs.md` § "Name colors": must pass 4.5:1 against
 * both the light and dark app-surface tokens).
 *
 * The app surfaces vary by context, but the two backdrops a PlayerName
 * MUST always be legible on are the canonical body backgrounds:
 * light-mode #ffffff and dark-mode near-black. Contrast is checked
 * against those. If a future palette tweak drops below 4.5:1, this
 * test fails loudly instead of the accessibility regression shipping
 * silently.
 *
 * Gradients are exempt from a mechanical contrast check — they blend
 * two stops across the glyph area — so we only sanity-check that each
 * gradient's endpoint stops are themselves legible; the mid-band is
 * inherently between them.
 */

const LIGHT_BG = '#ffffff'
const DARK_BG = '#0a0a0a'
const AA_LARGE = 3.0
const AA_NORMAL = 4.5

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16
  )
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function relLum([r, g, b]: [number, number, number]): number {
  const chan = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
}

function contrast(a: string, b: string): number {
  const la = relLum(hexToRgb(a))
  const lb = relLum(hexToRgb(b))
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe('PlayerName palette contrast', () => {
  for (const spec of NAME_COLORS) {
    it(`${spec.slug} — light color meets AA large on white`, () => {
      // Names in scoreboards/chat can be small; we require the tighter
      // 4.5:1 for solids to stay safely legible in every surface. Large-
      // text (3:1) is used only as the floor for gradient endpoints,
      // which typically render at hero sizes on the winner screen.
      expect(contrast(spec.light, LIGHT_BG)).toBeGreaterThanOrEqual(AA_NORMAL)
    })
    it(`${spec.slug} — dark color meets AA normal on near-black`, () => {
      expect(contrast(spec.dark, DARK_BG)).toBeGreaterThanOrEqual(AA_NORMAL)
    })
    if (spec.gradient) {
      // Extract the two hex stops from each gradient string. The palette
      // authors two-stop or three-stop gradients — check every stop.
      const light = spec.gradient.light.match(/#[0-9a-fA-F]{3,8}/g) ?? []
      const dark = spec.gradient.dark.match(/#[0-9a-fA-F]{3,8}/g) ?? []
      for (const stop of light) {
        it(`${spec.slug} — gradient light stop ${stop} meets AA large on white`, () => {
          expect(contrast(stop, LIGHT_BG)).toBeGreaterThanOrEqual(AA_NORMAL)
        })
      }
      for (const stop of dark) {
        it(`${spec.slug} — gradient dark stop ${stop} meets AA large on near-black`, () => {
          expect(contrast(stop, DARK_BG)).toBeGreaterThanOrEqual(AA_NORMAL)
        })
      }
    }
  }
})
