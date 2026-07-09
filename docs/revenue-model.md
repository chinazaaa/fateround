# Revenue Model — Pro Host, Cosmetics & Retention

> Status: **Revised strategy (Jul 2026).** Companion docs:
> [`account-tiers.md`](./account-tiers.md) · [`trophies-and-streaks.md`](./trophies-and-streaks.md)
>
> Nothing here is fully built yet — this is the spec we ship from.

## TL;DR

**The business is volume in Nigeria, not whales abroad.** A $2 one-time unlock alone is a
tip jar. The real model is:

| Line | Who pays | Price (Nigeria anchor) | Role |
|------|----------|------------------------|------|
| **1. Pro Host** (utility) | Hosts only | **₦1,000** (~$2 international) | Removes host friction at the moment they feel it — add-time, bigger rooms, 2nd room/tournament. **Pay once, forever.** Floor revenue. |
| **2. Cosmetics** (status) | Any account — hosts *and* players | **₦200–600** per item | **Primary engine.** Themes, skins, profile frames, tournament podium art. Repeatable, impulse-priced. |
| **3. Season drops** (urgency) | Any account | **₦500–1,200** per drop | Limited-time Naija-local + global-inspired styling. Same engine as cosmetics + a time window. |
| **4. Season Pass** (optional, later) | Any account | **₦2,500 / quarter** | Bundle of that season's drops at a discount — *not* a subscription to play. |

**Retention flywheel (not a revenue line, but required for #2–3 to work):**

```
Play free → earn trophies / streaks → save to account → see cosmetics on profile
         → buy a skin or drop → show off in the next game night
```

**Tournaments** and **trophies** are free to use and free to earn. They drive return visits
and account signups, which is what makes cosmetics purchasable. Monetize *around* them —
never *on* them.

**Guardrails that never move:**

- **Playing is free, forever.** Joining, spectating, tournaments, trophy hunting — all free.
- **Never pay-for-power.** No purchase buys a gameplay edge.
- **Pro = host utility only.** Themes and skins are **never** bundled into Pro.
- **Trophies and streaks are earned, never sold.**

---

## Why this model (Nigeria-first)

- **Zero friction for players.** A party app dies if the room doesn't fill. Joins stay free.
- **₦1,000 Pro is one airtime top-up, not a decision.** At ₦3,000+ people pause and churn.
  Price for *feel*, not FX parity.
- **Many people × small amounts beats few people × large amounts.** Nigeria is not a rich
  market — design for 5–10% of accounts buying a ₦400 skin, not 0.5% buying ₦5,000 bundles.
- **Hosts convert on emotion; players convert on identity.** Add-time mid-Monopoly sells Pro.
  A Detty December room theme sells to the whole room.
- **Cosmetics scale with the catalogue.** Every new game mode is new skin surface area
  without raising the Pro price.

---

## The retention flywheel

Trophies, streaks, tournaments, and clubs are **not** paywalled. They exist so people come
back and create an account — because you can't sell cosmetics to a ghost.

| System | Status | Role in revenue |
|--------|--------|-----------------|
| **Trophies** | Spec'd — [`trophies-and-streaks.md`](./trophies-and-streaks.md) | Drives account signup ("save this trophy"). Cosmetic upsell: profile frames, showcase borders. **Never sell trophies or progress.** |
| **Streaks** | Spec'd — same doc | Daily return habit. Base streak freezes stay **free**. Optional extra freeze = cosmetic/convenience purchase later, not required. |
| **Tournaments** | **Shipped** — `src/lib/tournament-*`, `/tournament` | Game-night playlists with running leaderboards. Free to run and join. Pro unlocks *host power*; cosmetics sell podium/bracket styling. |
| **Clubs** | Planned — [`account-tiers.md`](./account-tiers.md) | Persistent teams + seasons. Free to join/create (≤20). Crests/banners = cosmetics later. |
| **Accounts** | **Not built** — Phase 0 | Anonymous-first play; email OTP to save progress. Required to buy anything. |

**Signup moments (when we ask for an account):**

1. Post-win: *"Save this trophy to your profile."*
2. Streak day 2+: *"Don't lose your 🔥 streak."*
3. Tournament finish: *"Save your standing on the leaderboard."*
4. Cosmetic shop: inherent — can't charge a ghost.
5. Pro unlock: inherent — can't attach ₦1,000 to a `localStorage` token.

---

## What Pro Host includes (utility only)

**Pro is host powers and ceilings — nothing visual.** Themes, skins, frames, and seasonal
drops are the **cosmetics line**, sold separately to any account.

Legend: ✅ included · ⛔ not available · 🔸 limited / capped

| # | Feature | Free Host | Pro Host |
|---|---------|:---------:|:--------:|
| **Core (always free)** |
| 1 | Join, play, spectate any game | ✅ | ✅ |
| 2 | Create rooms & tournaments | ✅ | ✅ |
| 3 | All game modes | ✅ | ✅ |
| 4 | Real-time sync, history, leaderboards | ✅ | ✅ |
| 5 | Earn trophies & streaks | ✅ | ✅ |
| **Capacity** |
| 6 | Player cap per game | 🔸 `default` | ✅ raised to `max` |
| 7 | Concurrent active rooms **or tournaments** | 🔸 1 | ✅ 2 (raise to 3 if abuse stays low) |
| 8 | Spectator slots | ⛔ | ✅ (Phase 2) |
| **Game control** |
| 9 | Monopoly per-turn timer | ✅ | ✅ |
| 10 | Monopoly game-length limit | 🔸 up to 2 hrs | ✅ up to 4 hrs |
| 11 | Monopoly / Scrabble add-time mid-game | ⛔ | ✅ |
| 12 | Custom round/turn timers (timed games) | 🔸 presets | ✅ fully custom (Phase 2) |
| 13 | Monopoly house rules / starting balance | ⛔ | ✅ (Phase 3) |
| 14 | Force-skip / kick idle player | 🔸 basic | ✅ full (Phase 3) |
| **Content** |
| 15 | Custom question / participant CSV import | 🔸 small cap | ✅ large cap (Phase 2) |
| 16 | Save & reuse question packs / player lists | ⛔ | ✅ (Phase 2) |
| 17 | AI-generated questions | ⛔ | ✅ (Phase 3) |
| 18 | Custom voting categories / game modes | ⛔ | ✅ (Phase 3) |
| **Host identity** |
| 19 | Vanity room / tournament codes | ⛔ | ✅ (Phase 2) |
| 20 | Pro badge on profile & in lobby | ⛔ | ✅ |
| 21 | Remove "Made with Fate Round" footer | ⛔ | ✅ (Phase 2) |
| **Tournament host powers** |
| 22 | Run tournaments (basic) | ✅ | ✅ |
| 23 | Custom placement-points array | ⛔ | ✅ |
| 24 | Pre-planned multi-game playlist (unlimited games) | 🔸 up to 5 games | ✅ unlimited |
| 25 | Tournament season history on profile | ⛔ | ✅ (Phase 2) |

**Explicitly NOT in Pro:**

- Room themes (beyond the free set everyone gets)
- Board / piece / card / dice skins
- Profile frames or trophy showcase borders
- Seasonal / limited-time drops
- Extra streak freezes (sold as cosmetics later, if at all)
- Early access to new game modes (all modes stay free for everyone)
- Priority support (not viable at ₦1,000; community/help docs only)

> **One line:** Pro = *more room*, *longer games*, *more control*, *better tournaments*.
> Looking good is bought separately.

---

## Cosmetics — the primary revenue engine

**Cosmetics are sold to any account (host or player), not bundled in Pro.**

### Two layers of theming

| Layer | What it themes | Which games | Built? |
|-------|----------------|-------------|--------|
| **Room themes** | Lobby UI — background, colours, accents | **Every game** | ✅ `src/lib/themes.ts` — 5 free themes today |
| **Component skins** | Board, pieces, tiles, cards, dice | Surface games only | ✅ Partly — Chess (`chess-appearance.ts`) |

**Free tier gets:** Default + **2–3 room themes** (e.g. Default, Neon, Retro). Clean,
good-looking — never degraded to push sales.

**Paid tier gets:** Everything else — premium evergreen themes + all seasonal drops +
component skins + profile/tournament cosmetics.

### Who sees what (player-owned, never host-gated)

| Kind | Who sees it | How it renders |
|------|-------------|----------------|
| **Board / surface art** | You see your own | Local per viewer (like chess today) |
| **Your piece / token / card-back** | Everyone sees yours | Synced `skin_id` per player in game record |
| **Room theme** | Everyone in the room sees the **host's** room theme | Host picks; free hosts use free themes only |
| **Profile frame / trophy border** | Everyone on leaderboards & lobby | Synced on profile |

> **Room themes are the one host-visible cosmetic.** A host buys premium themes to style
> their game night. Players buy skins and frames for themselves. Neither gates play.

### Seasonal / topical drops

Limited-time themes and skins tied to cultural moments. **Inspired-by styling only — no
licensed IP.**

- **🇳🇬 Nigeria-first (our edge):** Detty December, Independence Day (Oct 1), BBNaija
  season, Afrobeats festival moments, campus week vibes.
- **🌍 Global:** Halloween, Christmas, Valentine's, back-to-school — generic festive styling.

Urgency converts: *"Available until Jan 5"* beats an always-on store item.

**What a single drop contains** — usually 3–4 items, sold **à la carte or as a pack**:

| Slot | What it is | Typical price (NGN) |
|------|------------|--------------------:|
| 1 | Room theme (host-visible) | ₦600–800 |
| 2 | Component skin (player token / card-back / dice) | ₦400–500 |
| 3 | Profile frame | ₦400–500 |
| 4 | Optional extra (tournament podium, streak flame) | ₦300–500 |
| **Pack** | All items in that drop bundled | ~15–20% off vs buying separately |

Items are also listed individually in the shop during the drop window — nobody is forced to
buy the full pack.

### Cosmetics catalogue (launch → grow)

| Category | Examples | Price (NGN) |
|----------|----------|-------------|
| Room theme (evergreen) | Elegant, Tropical, Midnight Lagos | ₦400–600 |
| Room theme (seasonal drop) | Detty December, Spooky Season | ₦600–1,200 |
| Component skin | Chess set, Whot card-back, Ludo tokens | ₦300–600 |
| Profile frame | Bronze/Silver/Gold/Platinum borders | ₦400–800 |
| Trophy showcase | Animated border when viewing your Platinum | ₦600–1,000 |
| Tournament podium | Winner's stand styling after a tournament | ₦500–800 |
| Streak flame style | Custom 🔥 animation on profile | ₦300 (later) |
| Bundle / pack | "Festive: room + tokens + frame" | ₦1,000–1,500 (small discount) |

- **No virtual currency at launch.** Direct NGN/USD checkout via Paystack/Stripe.
- **Volume, not whales.** Target: many accounts each buying 1–3 items per year.

---

## Tournaments — free to play, monetize around the edges

Tournaments are **already shipped** (bracket & head-to-head across 13 competitive game types).
They are a retention and social engine, not a paywall.

### Free (everyone)

- Create and join tournaments
- Running leaderboard with placement points
- Up to **5 games** in a pre-planned playlist
- Default placement points `[10, 7, 5, 3, 2, 1]`
- Share tournament code via WhatsApp

### Pro (host utility)

- **Unlimited games** in a tournament playlist
- **Custom placement-points** array
- **Vanity tournament code**
- **2 concurrent** rooms/tournaments (vs 1 free)
- Tournament history persisted on host profile (Phase 2)

### Cosmetics (any account)

- Tournament **bracket theme** (visual styling of the standings screen)
- **Winner podium** art shown on the final leaderboard
- **Champion frame** on profile for 30 days after winning a tournament (cosmetic, not power)

### Trophies (earned, free)

Add tournament trophies to the catalog ([`trophies-and-streaks.md`](./trophies-and-streaks.md)):

| Trophy | Tier | Criteria |
|--------|------|----------|
| First Tournament Win | 🥉 | Win a tournament |
| Tournament Regular | 🥈 | Play 10 tournament games |
| Game Night Host | 🥈 | Host 5 tournaments |
| Triple Crown | 🥇 | Win tournaments in 3 different game types |
| **Tournament Master** | 🏆 | Platinum (all above) |

Trophy unlock → account signup prompt → cosmetic shop exposure. **Never sell tournament
wins or points.**

---

## Trophies & streaks — retention, not revenue

Full spec: [`trophies-and-streaks.md`](./trophies-and-streaks.md).

**Hard rules:**

- Trophies and streak progress are **earned by playing, never purchased.**
- Base streak forgiveness (freezes) stays **free** — punishing daily players kills retention.
- Optional **extra streak freeze** may be sold later as a ₦300 convenience cosmetic. Never
  required to maintain a streak.
- **Profile frames tied to trophy tier** (e.g. a Gold-border frame) are cosmetics — you
  still have to *earn* the trophy; the frame is optional flair.

**How trophies feed revenue:**

1. Guest earns a trophy → prompt to save → creates account.
2. Account sees cosmetic shop on profile.
3. Player buys a frame to show off their Platinum.
4. Friends see it in the next game → social proof → more cosmetic impressions.

---

## Clubs (planned)

Persistent named groups for recurring teams. Spec in [`account-tiers.md`](./account-tiers.md).

| Capability | Tier |
|------------|------|
| Join a club | Free account |
| Create a club (≤ 20 members) | Free account |
| Club crest / banner | Cosmetic purchase |
| Rosters > 20, vanity club code, seasons/leagues | Pro or future Club+ (later) |

Clubs move the community off WhatsApp into FateRound. Monetize **crests and seasons**, not
membership, until clubs are sticky.

---

## Player caps — Free default vs. Pro ceiling

From `src/lib/game-limits.ts`. Free uses `default`; Pro uses `max`.

| Game | Free default | Pro ceiling | Pro gain |
|------|:---:|:---:|:---:|
| Two Truths & a Lie | 20 | 40 | **+20** |
| Codewords | 8 | 20 | **+12** |
| Bingo | 20 | 30 | **+10** |
| Trivia | 30 | 40 | **+10** |
| Describe It | 12 | 20 | **+8** |
| Snake & Ladder | 4 | 6 | **+2** |
| Board games (Monopoly, Ludo, Chess, etc.) | rules cap | rules cap | — |

**Honest note:** cap raises only matter for ~6 party games. For board games, Pro sells
**add-time, control, and tournaments** — not headcount.

**Decision:** launch with **Option A** (Pro reuses existing `max`). Option B (`proMax` field
above today's `max`) is a later upsell knob.

---

## Per-game Pro hooks (utility only — skins are cosmetics)

| Game | Pro hook (utility) | Monetize visually via |
|------|-------------------|----------------------|
| **Monopoly** | Add-time, 4-hr length, house rules | Board + token skins (cosmetic) |
| **Scrabble** | Time-extension mid-match | Board + tile skins (cosmetic) |
| **Whot** | Custom house-rule variants | Card-back skins (cosmetic) |
| **Trivia** | Rounds capped ~15 free → 25 Pro | Room themes (cosmetic) |
| **Describe It** | 4 teams + 10 rounds | Room themes (cosmetic) |
| **Tournaments** | Unlimited playlist, custom points | Bracket + podium (cosmetic) |
| **Chess** | Custom clocks (Phase 3) | Board + piece sets (cosmetic) |

**Language editions stay free forever** (Scrabble EN/FR/DE/ES, etc.) — accessibility, not
premium.

---

## Pricing

### Pro Host — one-time

| Region | Currency | Price | Notes |
|--------|----------|------:|-------|
| 🌍 International | USD | **$2.00** | Anchor |
| 🇳🇬 Nigeria | NGN | **₦1,000** | Primary market — one snack/data-bundle impulse |
| 🇬🇭 Ghana | GHS | **GH₵15** | Below FX on purpose |
| 🇰🇪 Kenya | KES | **KSh 200** | Round, impulse |
| 🇿🇦 South Africa | ZAR | **R30** | Round, impulse |

**Payment:** Paystack (Nigeria/Africa — cards, bank transfer, USSD where supported) +
Stripe (international). Region-routed checkout.

### Cosmetics — per item

| Region | Range |
|--------|-------|
| 🇳🇬 Nigeria | **₦200–1,200** per item; bundles **₦800–1,500** |
| 🌍 International | **$0.49–2.99** per item |

### Season Pass (Phase 2+, optional)

**₦2,500 / quarter** — all cosmetic **drops** in that calendar quarter, bundled at ~30% off
vs buying each drop's pack separately. Opt-in, not required to play. Better fit for Nigeria
than a monthly subscription.

**Includes:** every seasonal drop pack in the quarter (room theme + skins + frames in each
drop). **Excludes:** Pro Host, evergreen shop items, Founder cosmetics, trophies/streaks.

See [Worked example — Q4 2026](#worked-example--q4-2026-octdec) below for exact items and
math.

### Worked example — Q4 2026 (Oct–Dec)

A full quarter calendar with **exact items, IDs, prices, and Season Pass math.** Use this
as the template for every future quarter.

#### Quarter overview

| Drop | Window (WAT) | Cultural hook | Pack price |
|------|----------------|---------------|----------:|
| **Independence '26** | 28 Sep – 5 Oct | Nigeria @ 66 | ₦1,000 |
| **Spooky Season** | 20 Oct – 2 Nov | Halloween / Detty pre-party | ₦900 |
| **Detty December '26** | 1 Dec – 5 Jan 2027 | Detty December / NYE | ₦1,200 |
| **Q4 Season Pass** | 28 Sep – 5 Jan | All three packs | **₦2,500** |

Buying all three packs separately: **₦3,100** → Pass saves **₦600 (~19%)**.

---

#### Drop 1 — Independence '26 🇳🇬

*Available 28 Sep – 5 Oct 2026 · inspired-by green-white styling, no official coat of arms
or government marks*

| ID | Item | Type | Solo price |
|----|------|------|----------:|
| `drop-q4-ind-room` | **Green & Gold Room** — white lobby, green accents, gold trim | Room theme | ₦700 |
| `drop-q4-ind-ludo` | **Eagle Tokens** — gold Ludo pieces with green base | Component skin (Ludo) | ₦450 |
| `drop-q4-ind-frame` | **Independence Frame '26** — green ring, small 🇳🇬 chip (generic) | Profile frame | ₦450 |
| `drop-q4-ind-pack` | **Independence Pack** — all three above | Bundle | **₦1,000** |

**Shop copy:** *"Celebrate the season — available one week only."*

**Who buys what:** hosts lean room theme; players lean frame + tokens. Pack is for crews
doing a game night that week.

---

#### Drop 2 — Spooky Season 🎃

*Available 20 Oct – 2 Nov 2026 · generic spooky styling, no branded characters*

| ID | Item | Type | Solo price |
|----|------|------|----------:|
| `drop-q4-spooky-room` | **Midnight Manor** — deep purple lobby, faint lantern glow | Room theme | ₦650 |
| `drop-q4-spooky-whot` | **Phantom Deck** — dark card-back with silver edge | Component skin (Whot) | ₦400 |
| `drop-q4-spooky-frame` | **Spooky Frame** — purple border, subtle bat silhouette | Profile frame | ₦400 |
| `drop-q4-spooky-podium` | **Haunted Podium** — tournament winner stand styling | Tournament cosmetic | ₦350 |
| `drop-q4-spooky-pack` | **Spooky Pack** — room + deck + frame + podium | Bundle | **₦900** |

**Shop copy:** *"Two weeks only — gone after Nov 2."*

**Note:** this drop adds a **podium** (4 items) because Halloween overlaps with office
tournament season — hosts running brackets are a natural buyer.

---

#### Drop 3 — Detty December '26 🎄

*Available 1 Dec 2026 – 5 Jan 2027 · the flagship Q4 drop — longest window, highest price*

| ID | Item | Type | Solo price |
|----|------|------|----------:|
| `drop-q4-detty-room` | **Detty Nights** — Lagos nightlife palette, gold + neon accents | Room theme | ₦800 |
| `drop-q4-detty-ludo` | **Detty Gold Tokens** — metallic gold Ludo pieces | Component skin (Ludo) | ₦500 |
| `drop-q4-detty-dice` | **Champagne Dice** — gold Yahtzee dice with sparkle idle | Component skin (Yahtzee) | ₦450 |
| `drop-q4-detty-frame` | **Detty '26 Frame** — gold ring, confetti accent | Profile frame | ₦500 |
| `drop-q4-detty-podium` | **NYE Podium** — gold winner's stand for tournament finals | Tournament cosmetic | ₦450 |
| `drop-q4-detty-pack` | **Detty December Pack** — all five above | Bundle | **₦1,200** |

**Shop copy:** *"The Detty drop — Dec 1 to Jan 5. Your game night look for the holidays."*

**Why the highest price:** longest availability, most items, peak usage (Dec game nights,
NYE tournaments, homecoming crews). Still impulse territory — one snack run, not a grocery
trip.

**À la carte totals if bought separately:** ₦2,700 → pack saves **₦1,500 (~56%)** on the
full set. Most people buy 1–2 items; the pack targets hosts doing a Detty game night.

---

#### Q4 2026 Season Pass

| | |
|---|---|
| **Price** | **₦2,500** (one payment, covers 28 Sep – 5 Jan window) |
| **You get** | Independence Pack + Spooky Pack + Detty Pack — all items, all drops |
| **Separate total** | ₦1,000 + ₦900 + ₦1,200 = **₦3,100** |
| **You save** | **₦600** |
| **Who it's for** | Regular players who buy every drop; friend groups splitting cost |
| **Who it's NOT for** | Someone who only wants Detty — buy that pack alone (₦1,200) |

**Pass rules:**

- Purchase anytime during the quarter; you receive **all drops immediately** (including
  past drops still in-window — e.g. buy Pass on 1 Dec, you still get Independence if we
  re-enable it as "legacy" is **not** automatic; only active-window drops count).
- **Clarification for implementation:** on Pass purchase, grant every drop pack whose
  `available_until` is still in the future at time of purchase. Drops whose window already
  closed are **not** retroactively granted — buy early or buy à la carte.
- Pass does **not** include Pro Host, evergreen themes, or Founder items.
- Pass is **cosmetic only** — no gameplay, caps, or add-time.

**International pricing (Q4 Pass):** **$4.99** (same ~20% savings vs $1.99 + $1.79 + $2.49
drop packs).

---

#### Q4 marketing beats (free — drives shop impressions)

| Date | Beat | Purpose |
|------|------|---------|
| 28 Sep | Independence drop live + push | First Q4 urgency |
| 1 Oct | Independence last day | FOMO |
| 20 Oct | Spooky drop live | Second beat |
| 1 Dec | Detty drop live + Pass reminder | Flagship |
| 26 Dec | "Detty week — 10 days left" | Mid-window nudge |
| 2 Jan | "Last 3 days of Detty drop" | Final urgency |

Trophy tie-in (free): platform trophy **"Detty Regular"** — play any game on 5 separate
days in December. Drives return visits; frame is still sold separately.

---

#### 2027 calendar sketch (future quarters — not priced yet)

| Quarter | Drops (draft) |
|---------|----------------|
| **Q1** | Valentine's · Easter / Eid (generic spring) |
| **Q2** | Children's Day · Summer / Rainy season |
| **Q3** | Back to School · BBNaija-inspired lounge |
| **Q4** | Independence · Spooky · Detty (annual recurrence) |

Annual drops (Independence, Detty) can return each year with a new year suffix (`'27`) so
last year's cosmetics become **legacy** — collectors keep them; new players get fresh art.

### Founder tier (optional, much later)

**₦5,000–8,000 one-time** — Pro + exclusive Founder frame + early cosmetic drops. Limited
quantity. **Do not promise "everything free forever"** — scope it to Pro utility + Founder
cosmetics only.

---

## Honest unit economics (plan with eyes open)

Illustrative monthly scenario — **verify with real metrics after launch:**

| Assumption | Value |
|------------|-------|
| Monthly active users | 10,000 |
| Account conversion (guest → account) | 25% → 2,500 accounts |
| Pro conversion (of hosts, ~20% of MAU = 2,000 hosts) | 3% → 60 sales |
| Pro revenue | 60 × ₦1,000 = **₦60,000** (~$40) one-time that month |
| Cosmetic buyers (of accounts) | 8% → 200 buyers |
| Avg cosmetic spend | ₦500 |
| Cosmetic revenue | 200 × ₦500 = **₦100,000** (~$65) |

**Takeaway:** Pro alone doesn't fund the product. Cosmetics + seasonal drops must work, which
means **accounts + trophies + tournaments must ship first** (or alongside) the shop. LiveKit
voice, Supabase, and art production have real costs — track CAC and conversion from day one.

**Target metrics to prove the model:**

- Guest → account conversion ≥ 20% (post-trophy prompt)
- Account → cosmetic buyer ≥ 5% within 90 days
- Host → Pro conversion ≥ 2% when hitting a gated action
- Repeat cosmetic purchase ≥ 15% of buyers within 6 months

---

## Launch phases

### Phase 0 — Foundations (block everything else)

Aligned with [`trophies-and-streaks.md`](./trophies-and-streaks.md) §9:

- Supabase Auth — **anonymous-first**, email OTP upgrade (not separate login/signup)
- `profiles` table: `is_pro`, `is_anonymous`, trophy/streak fields
- Stripe + Paystack checkout + webhooks (`is_pro`, `owned_cosmetics`)
- Server-side `requirePro()` + `requireOwned(cosmeticId)` helpers
- Anonymous host can claim `host_token` on signup

### Phase 1 — First money (ship together, not Pro alone)

**Pro (minimal, high-emotion):**

- Monopoly + Scrabble add-time / long duration
- Raised caps (Option A)
- 2 concurrent rooms/tournaments
- Pro badge
- Tournament: unlimited playlist + custom placement points

**Cosmetics (first shop — this is the engine):**

- 2–3 **paid** room themes + keep 2–3 **free**
- 1 **Naija seasonal drop** at launch (e.g. Detty December or a generic festive pack)
- 1 component skin (Chess set — code already exists)
- Profile frame (basic)

**Retention (drives the shop):**

- Trophies Phase 1 (top 5 games + platform set) — [`trophies-and-streaks.md`](./trophies-and-streaks.md)
- Streaks + profile button
- Post-win / post-trophy account prompts

### Phase 2 — Expand

- Vanity room/tournament codes
- Spectator slots, custom timers, larger CSV imports
- Save & reuse question packs
- More component skins (Scrabble, Ludo, Whot, Monopoly, Bingo)
- Tournament history on profile
- Season Pass (if drop cadence is steady)
- Clubs MVP (free, ≤20 members)

### Phase 3 — Depth

- Monopoly house rules, full kick/skip
- AI-generated questions (Pro)
- Club crests, seasons/leagues
- Extra streak-freeze cosmetic (optional)
- Founder tier (if demand exists)

---

## Prerequisite: accounts (Phase 0)

Today there are **no user accounts** — only `host_token` in `localStorage`. You cannot sell
"forever" against that.

**Approach** (matches trophies spec):

- `supabase.auth.signInAnonymously()` on first play — trophies attach immediately
- Email + 6-digit OTP to upgrade anonymous → permanent (same `auth.uid()`, no progress loss)
- **Playing and free hosting need no email.** Prompt only at earned value or purchase.
- See [`trophies-and-streaks.md`](./trophies-and-streaks.md) §2 for merge logic and OTP rationale.

---

## Purchase flows

### Pro Host

1. Host hits a Pro gate (add-time, 2nd room, cap raise) or visits `/upgrade`
2. If no account → email OTP signup (10 seconds)
3. Checkout: **₦1,000** via Paystack (NG) or **$2** via Stripe
4. Webhook sets `is_pro = true`
5. Perk unlocks immediately, all devices

### Cosmetics

1. User opens shop from profile or post-game
2. If guest → email OTP signup
3. Tap item → checkout at listed price
4. Webhook adds to `owned_cosmetics`
5. Equip from profile or game appearance settings

### Season drop

Same as cosmetics, with `available_from` / `available_until` enforced server-side. Miss the
window → gone (may return next year as a "legacy" drop at a premium).

---

## Where this plugs into the code

| Area | File / pattern |
|------|----------------|
| Player limits | `src/lib/game-limits.ts` — Pro uses `max` |
| Monopoly / Scrabble timers | `src/lib/monopoly.ts`, `src/lib/scrabble.ts` |
| Tournaments | `src/lib/tournament-*`, `src/app/tournament/` |
| Room themes (free vs paid) | `src/lib/themes.ts` — add `tier: 'free' \| 'paid'` |
| Component skins | `src/lib/chess-appearance.ts` — extend pattern per game |
| Trophies | `src/lib/trophies/` (to build) — award on `finish-game` |
| Gating | `requirePro()` / `requireOwned()` in API routes — never UI-only |
| Payments | Webhook routes under `src/app/api/billing/` |

### Build checklist

- [ ] Phase 0: anonymous auth + `profiles` + `owned_cosmetics` table
- [ ] Phase 0: Paystack + Stripe checkout + webhooks
- [ ] Phase 0: `requirePro()` + `requireOwned()` server helpers
- [ ] Phase 1: Gate add-time, caps, concurrent rooms/tournaments
- [ ] Phase 1: Cosmetic shop + 3–5 launch items
- [ ] Phase 1: Trophies + streaks + profile button
- [ ] Phase 1: Upgrade prompt + `/upgrade` page
- [ ] Phase 2: Component skins expansion + season pass

---

## Guardrails

- **Never charge to play.** Joining, hosting free games, tournaments, earning trophies — free.
- **Never pay-for-power.** Cosmetics and Pro convenience only.
- **Never bundle cosmetics into Pro.** Pro = utility; shop = identity.
- **Never sell trophies, streaks, or tournament points.**
- **Never gate language / accessibility.**
- **Never degrade the free default** to push sales.
- **Gate on the server.** UI hiding is not security.
- **No priority support at ₦1,000.** Help docs + community only.

---

## Decisions (resolved)

| Question | Decision |
|----------|----------|
| Primary market | **Nigeria first** — price for impulse (₦1,000 Pro, ₦200–600 cosmetics) |
| Pro price (NG) | **₦1,000** one-time |
| Pro price (intl) | **$2** one-time |
| Themes in Pro? | **No** — free set for everyone; premium themes are cosmetics |
| Skins in Pro? | **No** — sold à la carte to any account |
| Player caps | **Option A** — Pro reuses `max` |
| Concurrent rooms | **Free = 1, Pro = 2** (3 later if safe) |
| Payments | **Paystack (Africa) + Stripe (intl)** |
| Accounts | **Anonymous-first; email OTP to save/buy** |
| Trophies / streaks | **Earned only, never sold** |
| Tournaments | **Free to play; Pro = host power; cosmetics = styling** |
| Early access to games | **No** — all modes free for everyone |
| Priority support | **No** — not viable at this price |
| Virtual currency | **No at launch** |
| Season Pass | **Optional Phase 2** — quarterly, not monthly sub |
| Founder tier | **Optional, much later** — scoped narrowly, no "forever everything" |
