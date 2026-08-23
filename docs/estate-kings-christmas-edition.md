# Estate Kings — Christmas Edition

Seasonal paid edition. See `docs/coins-and-shop-plan.md` for shop wiring
and `docs/estate-kings-america-edition.md` for the base edition template
this mirrors.

## Meta

- **Internal slug:** `christmas`
- **User-facing label (proposed):** `Christmas` (short, self-explanatory
  in a picker row; matches the Naija / USA place-noun pattern).
- **Price:** **800 coins** (edition tier).
- **Release cadence:** annual seasonal drop — first appearance in the
  shop early December, remains permanently owned by anyone who buys it.
  A `seasonal` badge on the shop tile through mid-January drives urgency.
- **Board sizes supported:** 40-space (base) and 48-space (expanded).
- **Currency symbol shown in play:** `$` — the star goes into the art
  (card backs, corner motifs, ornaments) rather than the currency
  symbol. Keeps the engine simple; no per-edition currency-symbol swap
  needed.

## IP posture

Christmas iconography is overwhelmingly public domain — Santa, elves,
reindeer, sleighs, candy canes, gingerbread, mistletoe, holly, stockings,
wreaths, snowflakes, ornaments, chimneys, presents. All free to use.

**Watch out for these owned properties:**

- **Rudolph the Red-Nosed Reindeer** — owned by Character Arts LLC.
  Never name a property Rudolph. Generic "Reindeer" is fine.
- **Frosty the Snowman** — copyrighted. Generic "Snowman" is fine.
- **The Grinch, Charlie Brown, Elf on the Shelf, Nightmare Before
  Christmas characters** — all owned. Avoid.
- **Coca-Cola's specific red-suited Santa likeness** — Santa himself is
  public domain, but Coca-Cola's specific illustration style isn't.
  Design art distinct from Coca-Cola's Santa.

Standard Hasbro-forbidden list also applies — same as the America
edition, see that doc's header.

## Property tiles by color group

Same 40-space structure and price tiers as the base game. Themed
top-to-bottom around Christmas ascending from small-holiday-cheer to
North-Pole-royalty.

### Brown — Neighborhood cheer (60 / 60)
Small-scale festive starter.
- Stocking Row (60)
- Chimney Lane (60)

### Light Blue — Village square (100 / 100 / 120)
Small-town holiday charm.
- Carolers' Corner (100)
- Wreath Way (100)
- Village Green (120)

### Pink — Sweet street (140 / 140 / 160)
Candy and treats.
- Gingerbread Lane (140)
- Cocoa Court (140)
- Candy Cane Boulevard (160)

### Orange — Toy district (180 / 180 / 200)
Workshop and playthings.
- Toybox Alley (180)
- Wooden Soldier Row (180)
- Nutcracker Square (200)

### Red — Snow country (220 / 220 / 240)
Winter woodland.
- Pine Ridge (220)
- Fir Forest Road (220)
- Snowfall Boulevard (240)

### Yellow — Golden season (260 / 260 / 280)
Warm-glow tier.
- Firelight Lane (260)
- Golden Bell Row (260)
- Angel's Terrace (280)

### Green — Evergreen estates (300 / 300 / 320)
Prestige of the pines.
- Mistletoe Manor Drive (300)
- Holly Grove (300)
- Evergreen Boulevard (320)

### Dark Blue — North Pole (350 / 400)
Crown-jewel tier.
- Santa's Workshop (350)
- North Pole Plaza (400)

## Extra property tiles (48-space mode only)

Same `3 / 2 / 2 / 3` split as the base game across
indigo/violet/teal/coral, following the London Edition's price bands.

### Indigo — Reindeer meadow (140 / 150 / 160)
Between light blue and pink.
- Reindeer Trail (140)
- Sleigh Bell Lane (150)
- Prancer's Path (160)

### Violet — Frost quarter (210 / 220)
Between orange and red.
- Icicle Row (210)
- Snowflake Terrace (220)

### Teal — Aurora district (290 / 300)
Between yellow and green.
- Aurora Boulevard (290)
- Starlight Circle (300)

### Coral — Palace approach (390 / 400 / 410)
Between green and dark blue. The luxe pre-crown tier.
- Ornament Court (390)
- Tinsel Terrace (400)
- Grand Sleigh Approach (410)

### 48-space totals

- 22 (base) + 10 (expansion) = **32 properties**
- 4 stations (same as 40-space)
- 2 utilities (same)
- 10 non-property spaces (corners, events, taxes)

## Stations (200 each)

Sleigh routes replace rail terminals thematically — mechanically
identical. Locked-in names:

- Northern Sleigh Depot
- Frostwind Junction
- Silverbell Terminal
- Winterhaven Depot

## Utilities (150 each)

Renamed to Christmas-flavored equivalents.

- Northern Lights Co. (power)
- Frostwater Springs (water)

## Corner & special tiles (flavor rename only)

Mechanics unchanged.

- GO → **PAYDAY** (keep consistent with existing editions)
- Jail / Just Visiting → **Coal Bin** (naughty list holding cell)
- Free Parking → **Cozy Fireside**
- Go To Jail → **On the Naughty List**

## Chance & Community Chest — card flavor renames

Mechanics unchanged. Sample rewrites:

| Original mechanic | Christmas flavor |
|---|---|
| Advance to GO | "Sleigh lift back to PAYDAY. Advance and collect." |
| Advance to Boardwalk-equivalent | "Whisked to North Pole Plaza." |
| Bank pays you dividend | "Christmas bonus — collect $50." |
| Doctor's fees | "Cold from the caroling — pay $50." |
| Go back 3 spaces | "Blizzard detour. Go back 3 spaces." |
| Get out of jail free | "Santa vouched for you. Off the Naughty List." |
| Building repairs | "Roof damage from a heavy sleigh — $25 per house, $100 per hotel." |
| You inherit $100 | "A generous secret Santa — collect $100." |
| Chance drawn | Draw a **Stocking Stuffer** card |
| Community Chest drawn | Draw a **Gift Under the Tree** card |

Keep card counts identical to the London Edition so probability
distributions don't shift.

## Currency, art, typography

- **Currency symbol:** ★ (star) or `$` — engine call
- **Fonts:** headline in a warm serif; body remains the app's standard
  token
- **Card back art:** simple snowflake pattern in gold/cream on deep red
  or forest green (single motif, understated — not busy)
- **Board palette:** warm reds and greens with cream neutrals; ensure
  color contrast still passes for the colorblind-friendly color-group
  identifiers (the 8 color groups still need to be distinguishable —
  don't let "Christmas red" swallow the red property group)
- **Corner tile art:** small snowflakes / holly / stocking motifs, not
  literal Santa illustrations (keeps the art bill small and reads as
  tasteful rather than cartoonish)

## Engine wiring

Identical to the America edition — see
`docs/estate-kings-america-edition.md` § "Engine wiring." The
`game_editions.content` JSONB slot is the same shape; only the values
change:

- `slug: 'christmas'`
- `properties[]`, `stations[]`, `utilities[]` — the 32 / 4 / 2 above
- `corner_labels` — the Christmas-flavor corner names
- `card_flavor` — Christmas-themed card text mapped from mechanic ids
- `currency_symbol` — `'★'` or `'$'`
- `art_slug` — for the Christmas card back / board palette

No rules code changes.

## Launch cadence

- **Ships:** early December of the year it drops
- **Marketed:** "Christmas Edition is here — 800 coins, yours forever"
- **Owned forever:** yes, standard rule. Someone who buys it in
  December 2026 can still host it in July 2028 if they want.
- **Not re-released annually as a new SKU** — one Christmas Edition,
  refreshed with new card art or new corner tiles if desired in future
  years (which is free content for existing owners, further reinforcing
  "coins buy things you keep").
