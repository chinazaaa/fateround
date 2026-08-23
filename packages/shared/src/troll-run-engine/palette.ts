/**
 * Troll Run stage palettes.
 *
 * One entry per lobby "Visual Palette" choice. Shared rather than living beside the canvas
 * renderer because the Expo app draws the same stage out of react-native-svg and has to agree
 * with web on what a spike or a door looks like — a mobile runner and a web runner are in the
 * same race, watching each other's ghosts.
 */

/** Flat-shaded material: a body, a lit face where it meets open air, an outline, and a shadow. */
export interface MassPalette {
  body: string
  top: string
  edge: string
  shade: string
}

export interface RenderTheme {
  bgTop: string
  bgBottom: string
  bgGrid: string
  solid: MassPalette
  ice: MassPalette
  bounce: MassPalette
  block: MassPalette
  spike: { body: string; lit: string; socket: string }
  hazard: { body: string; lit: string }
  saw: { blade: string; teeth: string; hub: string }
  door: { frame: string; body: string; glow: string; lit: string }
  coin: { body: string; lit: string }
  player: { body: string; top: string; outline: string; eye: string }
  ghostOutline: string
  ghostTagText: string
}

/**
 * One palette per lobby "Visual Palette" choice. These are deliberately far apart — the previous
 * set differed by two hex values, so picking a theme changed nothing anyone could see. Each is
 * tuned against the matching app theme in `globals.css` so the canvas and its chrome agree.
 *
 * Platforms are mid-tone on purpose: filling ~40% of the screen with near-white glares and
 * flattens every hazard drawn on top of it.
 */
export const THEMES: Record<string, RenderTheme> = {
  dark: {
    bgTop: '#0b1120',
    bgBottom: '#182338',
    bgGrid: 'rgba(148, 163, 184, 0.06)',
    solid: { body: '#475569', top: '#94a3b8', edge: '#0f172a', shade: '#334155' },
    ice: { body: '#0ea5e9', top: '#a5f3fc', edge: '#082f49', shade: '#0369a1' },
    bounce: { body: '#be185d', top: '#f9a8d4', edge: '#4c0519', shade: '#9d174d' },
    block: { body: '#57534e', top: '#a8a29e', edge: '#1c1917', shade: '#44403c' },
    spike: { body: '#e11d48', lit: '#fda4af', socket: '#4c0519' },
    hazard: { body: '#e11d48', lit: '#fda4af' },
    saw: { blade: '#cbd5e1', teeth: '#f1f5f9', hub: '#e11d48' },
    door: { frame: '#a16207', body: '#facc15', glow: '#fde047', lit: '#fefce8' },
    coin: { body: '#eab308', lit: '#fef9c3' },
    player: { body: '#38bdf8', top: '#bae6fd', outline: '#082f49', eye: '#04121f' },
    ghostOutline: 'rgba(8, 47, 73, 0.85)',
    ghostTagText: '#f8fafc',
  },
  retro: {
    bgTop: '#241a12',
    bgBottom: '#3b2a1a',
    bgGrid: 'rgba(232, 145, 43, 0.07)',
    solid: { body: '#8a6a44', top: '#d1a86b', edge: '#1a1109', shade: '#6b5133' },
    ice: { body: '#7ea8b8', top: '#d6ecf2', edge: '#1e3038', shade: '#5c8593' },
    bounce: { body: '#a8481f', top: '#f0a97a', edge: '#2b0f05', shade: '#83350f' },
    block: { body: '#6f5a3e', top: '#b39364', edge: '#1a1109', shade: '#54432d' },
    spike: { body: '#b91c1c', lit: '#f0846f', socket: '#2b0805' },
    hazard: { body: '#b91c1c', lit: '#f0846f' },
    saw: { blade: '#c1a684', teeth: '#f2e4cd', hub: '#b91c1c' },
    door: { frame: '#7c4a10', body: '#e8912b', glow: '#f6c46a', lit: '#fff3dc' },
    coin: { body: '#d97706', lit: '#fde9c0' },
    player: { body: '#f2e4cd', top: '#fffaf0', outline: '#2b1c0d', eye: '#2b1c0d' },
    ghostOutline: 'rgba(43, 28, 13, 0.85)',
    ghostTagText: '#fff8ee',
  },
  neon: {
    bgTop: '#05050f',
    bgBottom: '#120a24',
    bgGrid: 'rgba(0, 229, 255, 0.08)',
    solid: { body: '#3b2a63', top: '#a855f7', edge: '#0a0618', shade: '#2a1d49' },
    ice: { body: '#0e7490', top: '#67e8f9', edge: '#062b33', shade: '#0b5567' },
    bounce: { body: '#9d174d', top: '#f472b6', edge: '#2b0316', shade: '#7a0f3c' },
    block: { body: '#312e5c', top: '#8b7fd6', edge: '#0a0618', shade: '#241f45' },
    spike: { body: '#ff1744', lit: '#ff8aa3', socket: '#2b0310' },
    hazard: { body: '#ff1744', lit: '#ff8aa3' },
    saw: { blade: '#00e5ff', teeth: '#b3f7ff', hub: '#ff1744' },
    door: { frame: '#2f7a12', body: '#76ff03', glow: '#b6ff6b', lit: '#eaffd6' },
    coin: { body: '#00e5ff', lit: '#d6feff' },
    player: { body: '#00e5ff', top: '#c8feff', outline: '#04202b', eye: '#04202b' },
    ghostOutline: 'rgba(4, 32, 43, 0.85)',
    ghostTagText: '#e0ffe0',
  },
}
