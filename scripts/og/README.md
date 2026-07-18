# Game OG images

Per-game Open Graph cards (1200×630 PNG) live in `public/og/<slug>.png` and are
mapped to landing pages by `GAME_LANDING_OG_BY_SLUG` in `src/lib/seo.ts`
(`gameLandingOgPath(slug)` falls back to the site-wide `/og.png` for any slug not
in the map). There is **no build step** — the PNGs are committed static assets.

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

## Adding a card for a new game

1. Add a `GAMES['<slug>']` entry in `og-template.html` (accent, eyebrow, title,
   titleSize, desc, pills, and a `panel` mockup — copy the closest existing game).
2. Render it (loop above) → `public/og/<slug>.png`.
3. Register it: add `'<slug>': '/og/<slug>.png'` to `GAME_LANDING_OG_BY_SLUG` in
   `src/lib/seo.ts`.

Typography note: the template uses the system font (San Francisco on macOS via
headless Chrome), not the site's web font — close but not pixel-identical.
