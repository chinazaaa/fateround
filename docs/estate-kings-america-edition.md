# Estate Kings — America Edition

First paid edition. See `docs/coins-and-shop-plan.md` for the shop wiring.

Mirrors the London Edition's 40-space board structure and price tiers.
Each color group represents an iconic American city or region, with the
most storied streets/landmarks concentrated in the high-tier groups.

**Trademark rule:** every name below is a real US street, terminal, or
landmark — geographic facts, not brand-owned. Street names cannot be
trademarked as street names; Hasbro can only protect its *specific
classic Monopoly list*, not the concept of naming a game space after a
street. **Do not** use any name from Hasbro's classic Monopoly board
anywhere (properties, stations, utilities, or card flavor text). The
full list to avoid:

- Properties: Mediterranean Ave, Baltic Ave, Oriental Ave, Vermont Ave,
  Connecticut Ave, St. Charles Place, States Ave, Virginia Ave,
  St. James Place, Tennessee Ave, New York Ave, Kentucky Ave,
  Indiana Ave, Illinois Ave, Atlantic Ave, Ventnor Ave, Marvin Gardens,
  Pacific Ave, North Carolina Ave, **Pennsylvania Avenue**, Park Place,
  Boardwalk
- Stations: Reading Railroad, Pennsylvania Railroad, B&O Railroad,
  Short Line
- Utilities: Electric Company, Water Works

## Property tiles by color group

Prices match the London Edition tiers.

### Brown — Detroit (60 / 60)
Motor-city starter tier.
- Woodward Avenue (60)
- Cass Avenue (60)

### Light Blue — Nashville (100 / 100 / 120)
Music city, next step up.
- Music Row (100)
- Demonbreun Street (100)
- Broadway (120)

### Pink — Philadelphia (140 / 140 / 160)
Historic mid-tier.
- South Street (140)
- Chestnut Street (140)
- Market Street (160)

### Orange — Miami (180 / 180 / 200)
Beach/nightlife bump.
- Ocean Drive (180)
- Lincoln Road (180)
- Collins Avenue (200)

### Red — Chicago (220 / 220 / 240)
Windy-city core.
- Wacker Drive (220)
- State Street (220)
- Michigan Avenue (240)

### Yellow — Los Angeles (260 / 260 / 280)
Glitz and image.
- Sunset Boulevard (260)
- Hollywood Boulevard (260)
- Rodeo Drive (280)

### Green — Washington DC (300 / 300 / 320)
Prestige and power. Note: **not** Pennsylvania Avenue (Hasbro).
- K Street (300)
- Massachusetts Avenue (300)
- Constitution Avenue (320)

### Dark Blue — New York (350 / 400)
Crown-jewel tier.
- Wall Street (350)
- Fifth Avenue (400)

## Extra property tiles (48-space mode only)

The expanded 48-space board uses four additional color groups the engine
already knows about: `indigo`, `violet`, `teal`, `coral`. Following the
London Edition's split, that's **10 extra properties** in a 3 / 2 / 2 /
3 layout across the four groups at these price bands.

### Indigo — Austin (140 / 150 / 160)
Between light blue and pink.
- South Congress Avenue (140)
- East Sixth Street (150)
- Rainey Street (160)

### Violet — Boston (210 / 220)
Between orange and red.
- Newbury Street (210)
- Beacon Street (220)

### Teal — Seattle & San Francisco (290 / 300)
Between yellow and green.
- Pike Place (290)
- Lombard Street (300)

### Coral — Manhattan upper (390 / 400 / 410)
Between green and dark blue. The luxe pre-crown tier. Note: "Park
Avenue" is the real Manhattan street and geographically distinct from
Hasbro's "Park Place."
- Madison Avenue (390)
- Park Avenue (400)
- Central Park South (410)

### 48-space totals

- 22 (base) + 10 (expansion) = **32 properties**
- 4 stations (same as 40-space)
- 2 utilities (same)
- 10 non-property spaces (corners, events, taxes)

## Stations (200 each)

Four iconic US rail terminals — one per side of the board (same
positions as the London Edition's stations). None appear on Hasbro's
classic Monopoly board.

- Grand Central Terminal (New York)
- Union Station (Washington DC)
- 30th Street Station (Philadelphia)
- Los Angeles Union Station

## Utilities (150 each)

Renamed away from Hasbro's "Water Works" / "Electric Company" pair.

- Hoover Dam Power
- Great Lakes Water

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
