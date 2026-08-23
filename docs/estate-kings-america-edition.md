# Estate Kings — America Edition

First paid edition. See `docs/coins-and-shop-plan.md` for the shop wiring.

Mirrors the London Edition's 40-space board structure and price tiers.
Each color group represents an iconic American city or region, with the
most storied streets/landmarks concentrated in the high-tier groups.

**Trademark rule (strict):** no trademarked names, no real street
names, no real landmark names. Every property, station, and utility
below is **fully invented** with American flavor — evocative but not
tied to any actual place. This is the safest possible IP posture and
also gives the edition its own distinct identity instead of feeling
like a knock-off of any real board. **Do not** introduce Hasbro's
classic Monopoly names anywhere (Boardwalk, Park Place, Marvin
Gardens, Baltic Avenue, Reading Railroad, Water Works, Electric
Company, etc.), including in card flavor text.

## Property tiles by color group

Prices match the London Edition tiers.

### Brown — Rust Belt vibe (60 / 60)
Working-class starter tier.
- Boiler Row (60)
- Rusty Nail Lane (60)

### Light Blue — Small-town Americana (100 / 100 / 120)
Diner-and-trolley next-step-up.
- Trolley Lane (100)
- Diner Row (100)
- Main Street Crossing (120)

### Pink — Historic quarter (140 / 140 / 160)
Founders / colonial flavor.
- Cobblestone Row (140)
- Founders Alley (140)
- Old Town Square (160)

### Orange — Coastal resort (180 / 180 / 200)
Beach / boardwalk-adjacent (but never named Boardwalk).
- Palm Palm Drive (180)
- Sunshine Avenue (180)
- Ocean Vista (200)

### Red — Downtown industrial (220 / 220 / 240)
Freight-and-ironworks big-city core.
- Ironworks Avenue (220)
- Freight Row (220)
- Union Yards (240)

### Yellow — Neon strip (260 / 260 / 280)
Glitz and image.
- Neon Alley (260)
- Sunset Row (260)
- Starlight Boulevard (280)

### Green — Capital prestige (300 / 300 / 320)
Marble halls and power players.
- Statesman Drive (300)
- Marble Row (300)
- Capitol Boulevard (320)

### Dark Blue — Crown tier (350 / 400)
Top-of-the-board landmarks.
- Golden Mile (350)
- Liberty Plaza (400)

## Extra property tiles (48-space mode only)

The expanded 48-space board uses four additional color groups the engine
already knows about: `indigo`, `violet`, `teal`, `coral`. Following the
London Edition's split, that's **10 extra properties** in a 3 / 2 / 2 /
3 layout across the four groups at these price bands.

### Indigo — Riverside district (140 / 150 / 160)
Between light blue and pink.
- Riverwalk Lane (140)
- Old Mill Road (150)
- Founders Way (160)

### Violet — Brownstone quarter (210 / 220)
Between orange and red.
- Chapel Hill Drive (210)
- Brownstone Row (220)

### Teal — Modern district (290 / 300)
Between yellow and green.
- Innovation Boulevard (290)
- Skyline Terrace (300)

### Coral — Uptown luxe (390 / 400 / 410)
Between green and dark blue. The pre-crown tier.
- Chandelier Court (390)
- Grand Meridian (400)
- Silver Terrace (410)

### 48-space totals

- 22 (base) + 10 (expansion) = **32 properties**
- 4 stations (same as 40-space)
- 2 utilities (same)
- 10 non-property spaces (corners, events, taxes)

## Stations (200 each)

Fictional rail terminals — one per side of the board (same positions
as the London Edition's stations). Themed as regional lines.

- Freedom Line Terminal
- Independence Rail Depot
- Liberty Line Junction
- Republic Rail Terminal

## Utilities (150 each)

Fictional, non-trademarked utility companies.

- National Power Co.
- Continental Water Co.

## Corner & special tiles (flavor rename only)

Mechanics unchanged; just American-flavored copy.

- GO → **PAYDAY** (matches existing London Edition — keep for consistency)
- Jail / Just Visiting → **County Jail**
- Free Parking → **Roadside Diner**
- Go To Jail → **Squad Car** (or keep "Go To Jail" — simpler)

## Chance & Community Chest — card flavor renames

Mechanics unchanged. Sample rewrites of a few cards so the flavor
matches the edition (the full deck follows the same treatment):

| Original mechanic | America flavor |
|---|---|
| Advance to GO | "Payday down at the docks. Advance to PAYDAY." |
| Advance to Boardwalk | "Advance to Fifth Avenue." |
| Bank pays you dividend | "IRS refund lands — collect $50." |
| Doctor's fees | "ER copay — pay $50." |
| Go back 3 spaces | "Wrong turn on the freeway. Go back 3 spaces." |
| Get out of jail free | "Cousin knows a lawyer. Keep this card until needed." |
| Building repairs | "Windstorm damage — $25 per house, $100 per hotel." |
| You inherit $100 | "Estate lawyer calls — inherit $100." |

Keep the total count of each card type identical to the London Edition
so probability distributions and testability don't change.

## Currency & typography

- Currency symbol: `$` (London edition uses £)
- Font: match the London edition's serif for headings; body remains the
  app's standard token
- Card back art: subtle US-motif watermark (eagle silhouette, star field,
  or interstate shield — one motif, understated). Not the flag itself —
  reads too political.

## Engine wiring (short version)

- Add `game.edition_slug = 'america'` when the host picks this edition
  at room creation.
- `game_editions.content` JSONB for this row holds:
  - `properties[]` — the 22 property tiles above, each with
    `{ index, name, price, rent, rentTable, houseCost, color }`
  - `stations[]` — the 4 stations with `{ index, name, price }`
  - `utilities[]` — the 2 utilities with `{ index, name, price }`
  - `corner_labels` — `{ go, jail, free_parking, go_to_jail }`
  - `card_flavor` — mapping from mechanic ids to America-flavored text
  - `currency_symbol` — `'$'`
  - `art_slug` — for the card back / theme art reference
- The engine reads `game.edition_slug`, looks up the row, and merges
  content over the default London edition's schema. Rules code
  (`monopoly-board.ts`, `monopoly-rent-*.ts`, etc.) doesn't change —
  it consumes the same shape.

## What's next after America ships

Future editions in priority order:
1. **Christmas** — seasonal drop, high engagement window
2. **Lagos** — West African market resonance (Naija is Nigeria-wide;
   Lagos is city-specific and can go deeper)
3. **London Premium** — a paid variant of the current free London
   edition with fancier art (careful — this is close to "take away what
   was free"; only ship if the free London stays fully playable and the
   premium is visibly a *different* deck)
4. **Tokyo**
5. **Arctic** (novelty)
6. **Campus / School Championship** (targets school championship
   tournament format that already exists)
