# Game OG images

Per-game Open Graph cards (1200×630 PNG) live in `public/og/<slug>.png` and are
mapped to landing pages by `GAME_LANDING_OG_BY_SLUG` in `src/lib/seo.ts`
(`gameLandingOgPath(slug)` falls back to the site-wide `/og.png` for any slug not
in the map). There is **no build step** — the PNGs are committed static assets.

> ⚠️ **`<slug>` means the LANDING slug** — the value in `GAME_TYPE_TO_SLUG`
> (`src/lib/game-landing.ts`), which is not always the game type. Estate Kings is
> `estate-kings`, not `monopoly`; Word Tiles is `scrabble`; Text Charades is
> `text-charades`. Keying the map by game type instead silently misses and ships the
> generic site card — which is how Estate Kings lost its art in the rename. The GAMES
> key in `og-template.html`, the PNG filename and the `GAME_LANDING_OG_BY_SLUG` key
> must all be that same landing slug, so the template's default URL line
> (`fateround.com/games/<slug>`) is correct too.
>
> `src/lib/seo-og.test.ts` fails CI when any game type or daily challenge has no card,
> when an entry points at a missing file, or when a retired game leaves an orphan entry.

## Template

`og-template.html` reproduces the house layout of the existing cards:

- **Left column:** FateRound logo · uppercase eyebrow pill · big title · one-line
  description · 3 feature pills · `fateround.com/games/<slug>` URL.
- **Right column:** a dark rounded card with a header bar + a game-specific mockup,
  tinted in that game's accent color.
- **Background:** two accent-tinted radial glows over a near-black gradient.

Each game is one entry in the `GAMES` object keyed by URL slug. Copy the accent
(`accent`/`soft`) from the game's `cfg.card` in `src/lib/game-types.ts`, and pull
`title` / `desc` / `pills` from `src/lib/game-landing.ts` (`heroTitle`,
`heroSubtitle`, `highlights`). The `eyebrow` is a short marketing tagline authored
per game (e.g. "Battle of Wits"). `titleSize` shrinks for longer names so the
title fits ~2 lines.

## Render to PNG

Rendered with **headless Chrome** (best fidelity for gradients/fonts). `?game=<slug>`
selects the entry:

```sh
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="public/og"
for g in mahjong checkers ayo; do        # ← slugs to render
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size=1200,630 \
    --default-background-color=00000000 --virtual-time-budget=1500 \
    --screenshot="$OUT/$g.png" "file://$PWD/scripts/og/og-template.html?game=$g"
done
# verify size: sips -g pixelWidth -g pixelHeight public/og/<slug>.png  → 1200×630
```

**On Linux / CI**, `--window-size` is not the viewport (window chrome eats ~90px, so the
card comes out clipped with a white band), and there is no San Francisco to fall back to.
Both are fixable:

1. Install **Inter** — it is metrically near-identical to SF Pro, so cards rendered on
   Linux match the committed macOS ones. Drop the static faces in `~/.local/share/fonts`
   and `fc-cache -f`, then prepend `Inter` to the template's `font-family`.
2. Drive the capture with a real viewport + clip rather than `--window-size`:

```js
// node shoot.mjs <abs-path-to-template.html> <out-dir> <slug…>
import { chromium } from 'playwright-core'
const [tpl, outDir, ...slugs] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
for (const slug of slugs) {
  await page.goto(`file://${tpl}?game=${slug}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${outDir}/${slug}.png`, clip: { x: 0, y: 0, width: 1200, height: 630 } })
}
await browser.close()
```

Sanity-check a new card by re-rendering an existing one (e.g. `yahtzee`) and eyeballing it
against the committed PNG before trusting the run.

## Adding a card for a new game

1. Add a `GAMES['<slug>']` entry in `og-template.html` (accent, eyebrow, title,
   titleSize, desc, pills, and a `panel` mockup — copy the closest existing game).
2. Render it (loop above) → `public/og/<slug>.png`.
3. Register it: add `'<slug>': '/og/<slug>.png'` to `GAME_LANDING_OG_BY_SLUG` in
   `src/lib/seo.ts`.
4. Run `pnpm test src/lib/seo-og.test.ts` — it verifies the file exists and that no game
   type is left on the generic card.

Watch the layout: the left column's `desc` should wrap to **two lines** (~85 characters at
the default size), otherwise the pills push down into the URL line. Keep the right-hand
panel under 470px tall or its last row clips.

Typography note: the template uses the system font — San Francisco on macOS via headless
Chrome, Inter if you followed the Linux setup above — not the site's web font (Geist), so
cards are close to the app's type but not pixel-identical.
