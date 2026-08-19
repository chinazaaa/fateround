import type { IconSvgElement } from '@hugeicons/react'

/**
 * Hand-authored icon art for the two themes the Hugeicons free set cannot cover.
 *
 * The free tier ships no country flags and no Jolly Roger — its only "flag"
 * icons are generic pennants, which would render Naija and Pirate as the same
 * blank shape and strip both themes of the identity their names carry. These
 * two are authored in Hugeicons' own `IconSvgElement` shape (a list of
 * `[tag, attrs]` pairs) so they flow through the same `Glyph` renderer and the
 * same `ThemeConfig.icon` field as every library icon.
 *
 * Geometry targets the library's 24×24 viewBox and 1.5 stroke width so these
 * sit at the same optical weight as their neighbours in the theme picker.
 */

/**
 * Jolly Roger — skull over crossbones.
 *
 * Stroke art in `currentColor`, so it inherits the surrounding text colour the
 * way the library icons do and needs no `iconFilled` treatment.
 */
export const PIRATE_ICON: IconSvgElement = [
  [
    'path',
    {
      d: 'M12 3C8.7 3 6 5.6 6 8.8c0 1.8.8 3.4 2.1 4.4v1.6c0 .7.6 1.3 1.3 1.3h5.2c.7 0 1.3-.6 1.3-1.3v-1.6c1.3-1 2.1-2.6 2.1-4.4C18 5.6 15.3 3 12 3Z',
      stroke: 'currentColor',
      strokeWidth: '1.5',
      strokeLinejoin: 'round',
      key: '0',
    },
  ],
  ['circle', { cx: '9.9', cy: '8.9', r: '1.4', stroke: 'currentColor', strokeWidth: '1.5', key: '1' }],
  ['circle', { cx: '14.1', cy: '8.9', r: '1.4', stroke: 'currentColor', strokeWidth: '1.5', key: '2' }],
  [
    'path',
    {
      d: 'M12 11.6v1.4',
      stroke: 'currentColor',
      strokeWidth: '1.5',
      strokeLinecap: 'round',
      key: '3',
    },
  ],
  [
    'path',
    {
      d: 'M6.3 17.9 17.7 21.1',
      stroke: 'currentColor',
      strokeWidth: '1.5',
      strokeLinecap: 'round',
      key: '4',
    },
  ],
  [
    'path',
    {
      d: 'M17.7 17.9 6.3 21.1',
      stroke: 'currentColor',
      strokeWidth: '1.5',
      strokeLinecap: 'round',
      key: '5',
    },
  ],
]

/**
 * Flag of Nigeria — green / white / green vertical bands, 3:2 ratio.
 *
 * Filled art: the bands carry the national colours rather than `currentColor`,
 * so this must be rendered with `<Glyph filled />` (see `Glyph.tsx` — a stroke
 * width would otherwise be forced onto every band). The trailing outline is
 * stroked in `currentColor` so the white centre band stays visible on light
 * surfaces.
 */
export const NAIJA_ICON: IconSvgElement = [
  ['rect', { x: '3', y: '6', width: '6', height: '12', fill: '#008751', key: '0' }],
  ['rect', { x: '9', y: '6', width: '6', height: '12', fill: '#FFFFFF', key: '1' }],
  ['rect', { x: '15', y: '6', width: '6', height: '12', fill: '#008751', key: '2' }],
  [
    'rect',
    {
      x: '3',
      y: '6',
      width: '18',
      height: '12',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '1.5',
      strokeLinejoin: 'round',
      key: '3',
    },
  ],
]
