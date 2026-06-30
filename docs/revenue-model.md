# Revenue Model — Pro Host Accounts

> Status: **Draft / planning.** This document captures the monetization strategy and the
> full Free vs. Pro feature split. Nothing here is built yet — it's the spec we'll work
> from.

## TL;DR

There are **two separate things we sell** — keep them distinct in your head, because
they earn money in completely different ways:

1. **The $2 Pro Host unlock (utility).** A host pays once to remove limits and get
   host-only powers — bigger rooms, more concurrent rooms, add-time, longer games,
   bigger imports. **Pay once, owned on your account.** This is the *floor*: it's what
   makes the app worth a couple of dollars to a serious host. It is **not** a promise of
   "every future feature free forever" — it unlocks the **Pro Host feature set** (the
   utility rows below).
2. **Cosmetics (status & self-expression).** Themes, board/piece/card/dice skins, and
   **limited-time seasonal drops** (e.g. a "Wednesday"-style themed skin tied to whatever's
   trending that month). These are bought **individually**, are **cheap and impulse-priced**,
   and — unlike the unlock — can be sold to **players too, not just hosts**. This is the
   *repeatable, long-term* revenue line that keeps the app alive for years.

Guardrails that never move:

- **Playing is free, forever.** Joining a room and playing any game never costs anything.
- **We never charge to *play* — only to *unlock host powers* or to *look good*.** Selling
  an optional skin doesn't gate play (the default look stays free), so cosmetics can reach
  the whole player base without breaking this rule.
- **Cosmetic only — never pay-for-power.** No purchase ever buys a gameplay advantage. The
  app works because friends play *fairly*; selling an edge would poison that.

---

## Why this model

- **Zero friction for players.** A party-game app only works when the room fills up.
  Charging players would kill the network effect. Joins must stay free.
- **Hosts feel the limits.** The host is the one who hits the player cap, wants a longer
  Monopoly game, or runs back-to-back rooms. They're the ones with a reason to pay.
- **One-time price is an easy yes.** A couple of dollars, paid once, is an impulse buy. No
  recurring-billing anxiety, no churn, no "is this worth my subscription" second-guessing.
  Low support burden.
- **It scales with the catalogue.** We're at 20+ game modes. Every new game adds more
  surface area where Pro perks matter, without changing the price.

---

## What the $2 Pro Host unlock includes — master list

**This table is *only* the $2 unlock — the utility line.** Cosmetics (themes, skins,
seasonal drops) are a **separate purchase** and live in their own section:
[Cosmetics — themes, skins & seasonal drops](#cosmetics--themes-skins--seasonal-drops).
Keeping them apart is deliberate: if cosmetics were bundled into the $2 unlock, we'd
permanently give away our only *repeatable* revenue line.

Legend: ✅ included · ⛔ not available · 🔸 limited / capped

| # | Feature | Free Host | Pro Host ($2) |
|---|---------|:---------:|:--------:|
| **Core (always free)** |
| 1 | Join any room and play any game | ✅ | ✅ |
| 2 | Create rooms | ✅ | ✅ |
| 3 | All 20+ game modes | ✅ | ✅ |
| 4 | Real-time sync, history, leaderboards | ✅ | ✅ |
| **Capacity** |
| 5 | Player cap per game | 🔸 standard default | ✅ raised to game max |
| 6 | Concurrent active rooms | 🔸 1 | ✅ up to 3–5 |
| 7 | Spectator slots (watch without a seat) | ⛔ | ✅ |
| **Game control** |
| 8 | Monopoly per-turn timer (0–90s) | ✅ | ✅ |
| 9 | Monopoly game-length limit | 🔸 up to 2 hrs | ✅ up to 4 hrs |
| 10 | Monopoly "add time" mid-game | ⛔ | ✅ |
| 11 | Custom round/turn timers (timed games) | 🔸 presets only | ✅ fully custom |
| 12 | Monopoly house rules / starting balance | 🔸 defaults | ✅ customizable |
| 13 | Force-skip / kick an idle player | 🔸 basic | ✅ full host controls |
| **Content** |
| 14 | Custom question / participant CSV import | 🔸 small cap | ✅ large cap |
| 15 | Save & reuse question packs / player lists | ⛔ | ✅ |
| 16 | AI-generated questions (when shipped) | ⛔ | ✅ |
| 17 | Custom voting categories / game modes | ⛔ | ✅ |
| **Identity & polish** |
| 18 | Custom / vanity room codes | ⛔ | ✅ |
| 20 | Pro badge on profile & in lobby | ⛔ | ✅ |
| 21 | Remove "Made with Fate Round" footer | ⛔ | ✅ |
| **Perks** |
| 22 | Early access to new game modes | ⛔ | ✅ |
| 23 | Priority support | ⛔ | ✅ |

> **What the $2 buys, in one line:** *more* (bigger + more rooms), *longer* (add-time,
> 4-hr games), *more control* (custom timers, host powers, kick/skip), *more content*
> (big imports, saved packs), and a bit of *status* (Pro badge, no footer). It is the
> **utility** upgrade. Looking good is sold separately as cosmetics.

> Rows 19 (themes) and 19b (board/piece skins) from the old version have **moved** into the
> [Cosmetics](#cosmetics--themes-skins--seasonal-drops) section — they're no longer part of
> the unlock. Item 8 and the core rows already exist in the codebase today; most Pro rows
> are net-new gating work.

---

## Cosmetics — themes, skins & seasonal drops

**This is the second revenue line, and the long-term one.** The $2 unlock has a ceiling
(a host buys it once and is done). Cosmetics don't — they're repeatable, they scale with
the game catalogue, and they can be sold to the **whole player base**, not just hosts.
This is the answer to "will the model still work in 5 years."

### Two layers of theming — and yes, every game can be themed

There are **two different things** people mean by "theme," and they apply to different
games:

| Layer | What it themes | Which games | Already built? |
|-------|----------------|-------------|----------------|
| **1. Room themes** | The whole room UI — background, colours, accents, lobby look | **Every game**, no exceptions | ✅ Yes — [`src/lib/themes.ts`](../src/lib/themes.ts) ships 5 (Default, Neon, Retro, Elegant, Tropical) |
| **2. Component skins** | The actual play surface — board, pieces, tiles, cards, dice | Only games that draw a surface (table below) | ✅ Partly — Chess already has it ([`src/lib/chess-appearance.ts`](../src/lib/chess-appearance.ts): 8 boards, 5 piece sets) |

So **"all games can be themed" is true** — via room themes (layer 1). On top of that, the
games with a physical surface *also* get skins (layer 2). The infrastructure for both
already exists once in the codebase, which means new themes/skins are mostly **art + a
catalogue entry**, not new engineering.

### Which games can get component skins (layer 2)

Pulled from each game's actual render code. "Surface" = it draws a board/cards/dice we can
re-skin without touching any rules.

| Game | Board art — *you see your own* | Your piece / identity — *everyone sees yours* |
|------|-------------------------------|-----------------------------------------------|
| **Monopoly** | Board | Token |
| **Ludo** | Board | Tokens |
| **Snake & Ladder** | Board | Token |
| **Scrabble** | Board | Tile/rack style |
| **Bingo** | Card backdrop | Dauber / ball style |
| **Whot** | Table felt | Card-back |
| **Crazy Eights** | Table felt | Card-back |
| **Tic-Tac-Toe** | Board | Your mark (X/O style) |
| **Chess** | Board (already shipped) | Piece set (already shipped) |
| **Sudoku** | Grid theme | — (solo surface) |
| **Yahtzee** | — | Your dice |

Everything **not** on this list (Trivia, Two Truths, Describe It, Codewords, Word Hunt,
NPAT, Most Likely To, Never Have I Ever, Would You Rather, This or That, Who Said This,
Pick a Number, Hot Seat, Anonymous Messages, Anime Quotes, polls, etc.) has no physical
surface, so it monetizes through **room themes (layer 1) only** — which is plenty, because
the room theme is what everyone in the lobby sees.

### Who sees what — how skins resolve (the key design rule)

**Skins are always owned by the *player*, never by the host.** This is the most important
rule in the whole cosmetics system — it's what makes a skin worth buying even when you're
not the one hosting. A shared board is a *single object* everyone looks at, so "the host's
skin wins" would mean a non-host buyer never sees what they paid for. We avoid that entirely
by splitting every cosmetic into two kinds, **neither host-gated**:

| Kind | Who sees it | How it renders | Sells on |
|------|-------------|----------------|----------|
| **Board / surface art** | **You see your own** | Rendered **locally per viewer** — game *state* is shared, the decorative art is not. Exactly how [`chess-appearance.ts`](../src/lib/chess-appearance.ts) already works ("opponents are unaffected"). | Comfort / self-expression |
| **Your piece / token / card-back** | **Everyone sees yours** | A small "skin id" per player synced in the game record; every client renders *your* piece as you chose. It represents **you** at the table. | Status / identity |

So whether or not you host:

- Buy a **Monopoly board skin** → *you* see your board every game (others see their own). No host dependency.
- Buy a **gold token** → *everyone* sees your token is gold, every game, because it's your identity.

**There is no skin that only works when you host.** That scenario — the thing that would
stop a player buying — simply doesn't exist under this model. Chess and Sudoku aren't
special; they're just the first games that already render "you see your own." Every game
works the same way.

> **Technical split (falls out cleanly):**
> - *Board art* = purely **local**, no sync needed (localStorage, like chess today). Cheap.
> - *Your piece/token* = one **synced skin-id per player** in the game record so everyone
>   can render it. Light.

### The hard line: cosmetic, never content

A skin may only change **colour, art, and style**. The moment a "skin" changes a **label,
layout, or meaning** — e.g. a Monopoly board with renamed streets, or different tile values —
that is **content, not cosmetic**: it's part of the game, must be shared by everyone, and
can't be a per-player look. Our chess code already enforces exactly this boundary ("never
touches game state"). Keep it everywhere — it's also what keeps cosmetics safely on the
right side of the **never pay-for-power** rule.

### Seasonal / topical drops — the "Wednesday skin" idea

**Yes — we should do this, and it's one of the best ideas on the table.** When the
*Wednesday* show blew up, Fortnite shipped a Wednesday skin and rode the wave. Same play
for us: a **limited-time themed skin/room-theme tied to whatever's hot that month**, that
people unlock while it's available.

Why it works especially well here:

- **Urgency drives the impulse buy.** "Available this month only" converts far better than
  an always-on store item. It's the same psychology as add-time, applied to cosmetics.
- **It rides culture for free marketing.** A drop timed to a trending moment is its own ad.
- **Two flavours — and we should do both:**
  - **🌍 Global moments:** a hit show/movie launch (legally: *inspired-by* style, not
    licensed IP), Halloween, Christmas, Valentine's, New Year.
  - **🇳🇬 Local / Nigerian moments:** Detty December, Independence Day (Oct 1), BBNaija
    season, a big Afrobeats/AMVCA moment. **This is our edge** — global apps won't make a
    Naija-specific drop; we will, and our core community will feel seen. As we expand
    abroad, we add region-specific drops per market.
- **Mechanically it's the same engine as a normal skin** — just time-boxed availability.
  No new tech beyond a "available from/until" window on a cosmetic.

> **Important — keep drops cosmetic and inspired-by, never licensed IP.** We don't pay for
> or claim official movie/brand licenses. A drop is "spooky season" or "festive" styling,
> not a trademarked character. Cosmetic only, no gameplay change, same as every other skin.

### Who can buy cosmetics — players too, not just hosts

This is the big unlock for sustainability. The $2 utility upgrade is **host-only** (only a
host feels the limits). But cosmetics have **no reason to be host-only** — a *player* wants
their own chess set or a cool token just as much. And selling a player an optional skin
doesn't gate play (default look stays free), so it doesn't break "never charge to play."

> **Effect:** the paying base goes from *"1 host per room"* to *"potentially everyone in
> the room."* That's the single biggest lever for the app sustaining itself. The only
> requirement: a player buying a cosmetic needs an (optional, opt-in) account — they make
> one only when they want to buy.

### Cosmetics pricing

Same impulse logic as the unlock — **cheaper, because there are more of them**:

- **Per item: a snack price.** Roughly **$0.50–$1.50 / ₦300–₦800** per skin or theme.
  Cheap enough to tap without thinking.
- **Bundles / packs:** a themed bundle (e.g. "Festive pack: board + tokens + room theme")
  at a small discount to lift basket size.
- **Seasonal drops** can sit slightly higher than evergreen skins because scarcity justifies
  it — but still impulse territory.
- **Volume, not whales** (see the Nigeria note in the strategy discussion): the model is
  *many people buying cheap cosmetics*, which is exactly what a price-sensitive,
  Nigeria-first base supports. The same catalogue earns *more* per user as we expand abroad.
- **No virtual currency / coins at launch** — sell items directly for money. Coins add
  friction and only pay off at large scale; revisit only if volume gets huge.

### Cosmetics guardrails

- **Cosmetic only — never pay-for-power.** A skin never changes a rule, a score, or an odds.
- **Never make the default *worse* to push skins.** Free players keep a clean, good-looking
  default; cosmetics are *extra* on top, never a downgrade of what's free today.
- **Never gate language / accessibility as "cosmetic."** The Scrabble language editions are
  accessibility, not skins — they stay free.
- **No licensed IP.** Drops are *inspired-by* styling, not trademarked characters.

---

## Player caps — Free default vs. Pro ceiling

These are the **real numbers** from `src/lib/game-limits.ts`. "Free default" is what a
room is created with today; "Pro ceiling" is the game's hard `max`.

| Game | Free default | Pro ceiling | Pro gain |
|------|:---:|:---:|:---:|
| Two Truths & a Lie | 20 | 40 | **+20** |
| Codewords | 8 | 20 | **+12** |
| Bingo | 20 | 30 | **+10** |
| Trivia | 30 | 40 | **+10** |
| Describe It | 12 | 20 | **+8** |
| Anonymous Messages | 20 | 20 | — |
| I Call On (NPAT) | 20 | 20 | — |
| Word Hunt | 20 | 20 | — |
| Sudoku | 20 | 20 | — |
| Monopoly | 6 | 6 | — *(fixed by rules)* |
| Whot | 6 | 6 | — *(fixed)* |
| Yahtzee | 6 | 6 | — *(fixed)* |
| Ludo | 4 | 4 | — *(fixed)* |
| Scrabble | 4 | 4 | — *(fixed)* |
| Chess | 2 | 2 | — *(fixed)* |
| Tic-Tac-Toe | 2 | 2 | — *(fixed)* |

### ⚠️ Important design note

**"Raise the player cap" only helps 5 games** with the current numbers (the ones with a
gain above). Board games like Monopoly, Ludo, and Chess are capped by their own rules — Pro
can't add a 7th Monopoly player. For those games the real Pro lever is **time, control, and
content**, not headcount.

Two ways to do the capacity perk:

- **Option A — reuse `max` (✅ DECIDED for launch):** Free uses `default`, Pro uses the
  existing `max`. Helps 5 games, modest gains, but **zero new schema** — the `max` ceiling
  already exists and is already enforced server-side in `game-limits.ts`. Ship this first.
- **Option B — separate `proMax` (later upsell lever):** Introduce a higher Pro ceiling per
  game (e.g. Bingo 20→50, Trivia 30→60, Two Truths 20→60) above today's `max`. Stronger
  headline ("up to 60 players") but needs a new `proMax` field and a bump to
  `GAME_LIMIT_ABSOLUTE_MAX` (currently 100). Hold for after launch — it's a knob we can turn
  up later to make Pro feel even better without re-architecting anything.

**Decision:** launch with **Option A** (reuse `max`). It's the fastest path and the
add-time flagships + skins carry more of the "worth it" weight than raw player count anyway.

---

## Monopoly deep-dive (the flagship Pro game)

Monopoly already has the richest host controls in the codebase, which makes it the best
showcase for Pro. Current constants (`src/lib/monopoly.ts`):

- **Per-turn timer:** off / 30 / 45 / 60 / 90 seconds.
- **Game length:** no limit / 15 / 30 / 45 min / 1 / 1.5 / 2 hrs.
- **Mid-game add-time ceiling:** 4 hours.

Recommended Pro vs. Free split for Monopoly:

| Monopoly control | Free | Pro |
|---|:---:|:---:|
| Set per-turn timer | ✅ | ✅ |
| Game-length presets | 🔸 up to 2 hrs | ✅ up to 4 hrs |
| **Add time mid-game** (the headline ask) | ⛔ | ✅ |
| Custom starting balance / house rules | ⛔ | ✅ |
| Pause / resume game | 🔸 | ✅ |

"Add time to a Monopoly game" is exactly the kind of small, emotional, in-the-moment ask
that converts well — the host is mid-game, people are having fun, and one tap + a couple of
dollars keeps it going.

---

## Per-game Pro hooks

Monopoly gets the deep-dive above because it has the richest controls, but it's **not the
only game with game-specific Pro levers.** Most games map cleanly to the generic rows in the
master list (timers, round counts, imports), but a few have unique hooks worth gating. This
table is the full per-game view — pulled from each game's `src/lib/<game>.ts` constants.

| Game | Game-specific options that exist today | Recommended Pro hook |
|------|----------------------------------------|----------------------|
| **Monopoly** | turn timer, game length (→2 hr), **add-time (→4 hr)**, house rules | Add-time, 4-hr length, custom rules — *flagship* · **custom board skins** |
| **Scrabble** | turn timer, game length (→2 hr), **time-extension (10/15/30 min)** | **Extend game time** mid-match — *second flagship* · **custom board + tile skins** |
| **Whot** | game length, variant toggles: pick-3, whot-cards, number-calls, pick-2 stacking | Unlock **custom house-rule variants** · **custom card-deck skins** |
| **Trivia** | rounds **3–25** (default 10), timer 10–60s | Free capped at ~15 rounds; Pro full **25** |
| **Describe It** | teams **2–4**, rounds **2–10**, turn timer 60–120s | Pro unlocks **4 teams + 10 rounds** |
| **NPAT (I Call On)** | answer timer, marking timer, game length (→1 hr) | Pro unlocks **longer sessions + custom timers** |
| **Bingo** | call mode (auto/manual), call interval 3–15s | Pro unlocks **manual call mode + fast intervals** · **custom card/ball skins** |
| **Chess** | time control (off / 3 / 5 / 10 min) | Pro unlocks **longer clocks / custom time** · **custom board + piece sets** |
| **Two Truths** | timer 10–90s | Generic (custom timer) |
| **Word Hunt** | timer 60–300s | Generic (custom timer) |
| **Codewords** | timer 30–120s | Generic (custom timer) |
| **Sudoku** | session duration (default 15 min) | Pro unlocks **longer / custom duration** · **custom board themes** |
| **Ludo** | host mode only | **Custom board + token skins** (cap is fixed at 4) |
| **Yahtzee** | minimal config | Generic |
| **Tic-Tac-Toe** | minimal config | Generic |
| **Anonymous Messages** | room-level only | Generic |

**Takeaways:**

- **Two flagships, not one.** Scrabble's time-extension is the same emotional "keep the
  game going" moment as Monopoly's add-time — lead with both.
- **Whot is the only game with true variant toggles** (house rules). That's a distinctive
  "build your own game" Pro angle no other game offers.
- **Round/team counts** (Trivia, Describe It) are the cleanest content ceilings to gate —
  free gets a taste, Pro gets the full range.
- Everything else genuinely is generic — gating "custom timers" once (row 11) covers Two
  Truths, Word Hunt, Codewords, and the timer side of every other timed game at once.
- **Language / localization stays FREE — never gate it.** Scrabble now ships English,
  French, German & Spanish editions ([PR #116](https://github.com/chinazaaa/fateround/pull/116)),
  each with its own tiles, scoring, and dictionary, chosen from the lobby picker. These are
  **accessibility, not premium content** — a host should never have to pay to play in their
  own language, and keeping it free grows the player base (more languages = more people who
  can use the app at all). Monetize Scrabble through time-extension + skins instead. The only
  case for gating would be a long tail of dozens of niche editions later — major world
  languages stay free.
- **Cosmetic board/piece skins are a strong, low-risk Pro perk.** Chess (pieces + board),
  Scrabble (tiles + board), Ludo (tokens + board), Whot (card deck), Sudoku (board theme),
  Monopoly (board), and Bingo (cards/balls) all render their boards as components today, so
  themed skins are a purely visual swap — feasible for all seven, no gameplay impact, and
  they don't touch the "never make the free room worse" guardrail (free keeps the standard
  look; Pro adds extra skins on top). Bundle them under one "Game Skins" Pro perk (row 19b)
  rather than gating each separately. **Main cost is art/asset design, not code.**

---

## Pricing

**Recommendation: keep it cheap and impulse-priced — $2–3 one-time, with regional pricing.**

These are casual party games, not a productivity tool. The price has to be low enough that
a host taps "buy" mid-game without thinking. Anything that makes them pause to weigh it is
too high.

- **Global anchor price:** one-time **$2.99** (or just stick with **$2** for a rounder,
  even-easier number — both are fine; $2 is the safer impulse floor).
- **Regional pricing matters.** $2.99 is trivial in the US but meaningful in Naira. Charge a
  **locally-calibrated equivalent** per region rather than a flat USD figure — e.g. a
  ₦-priced tier via Paystack that *feels* like an impulse buy locally, not a direct FX
  conversion. Paystack/Stripe both support per-currency pricing.
- **One-time, per account.** Tied to the host's account, unlocked forever once paid.
- **No per-game purchases or consumables at launch.** One unlock, everything on. Fewer
  decisions for the buyer = higher conversion.
- **Why not higher?** At $2–3 the decision is "sure, why not." At $5+ people start asking
  "is this worth it" — and for party games the honest answer is often no. Volume of cheap
  one-time unlocks beats a higher price that converts a fraction as many hosts.
- **Later (optional):** a higher one-time "Founder / Lifetime+" tier for superfans, or a
  cheap recurring option *in addition to* (never replacing) the one-time unlock. Keep it
  simple at launch.

> **My pick:** launch at **$2 flat globally**, with a hand-set local price for Nigeria/Africa
> via Paystack. Round, friendly, unmistakably an impulse buy. Raise to $2.99 later only if
> conversion is strong and you want more margin.

---

## Launch set vs. roadmap

**Every feature row is assigned to a phase below — nothing is left unscheduled.**
Don't build it all at once; ship in this order.

### Free baseline — already live, no work (rows 1–4, 8)
Joining/playing, creating rooms, all game modes, real-time sync/history/leaderboards, and
the Monopoly per-turn timer already exist and stay free. These are the "✅ / ✅" rows in the
master list — listed here only so the coverage is complete.

### Phase 0 — Foundations (no perks yet, but nothing ships without these)
- **Accounts** (Supabase Auth + `profiles` table with `is_pro`) — see prerequisite above.
- **Payments**: Stripe (international) + Paystack (Africa), region-routed checkout.
- **Webhook** to flip `is_pro`, and the server-side gating helper every perk will call.

### Phase 1 — Launch (smallest set that's clearly worth $2)
- Raised player caps — **Option A, reuse `max`** — row 5
- Multiple concurrent rooms (1 → 3) — row 6
- **Both add-time flagships:** Monopoly add-time + 4-hr length (rows 9, 10), Scrabble time-extension
- Higher round/team counts (Trivia 25, Describe It 10) — content side of rows 5/16-ish
- Custom room themes unlocked — row 19
- Pro badge — row 20

### Phase 2 — Fast follows
- Spectator slots — row 7
- Custom timers across timed games — row 11 (covers Two Truths, Word Hunt, Codewords, NPAT)
- Whot custom house-rule variants (pick-3 / pick-2 stacking / etc.)
- Larger CSV imports — row 14
- Save & reuse question packs / player lists — row 15
- Vanity room codes — row 18
- **Game Skins** (Chess, Scrabble, Ludo, Whot, Sudoku, Monopoly, Bingo) — row 19b
- Remove "Made with Fate Round" footer — row 21

### Phase 3 — When the underlying features exist
- Monopoly house rules / custom starting balance — row 12
- Full force-skip / kick host controls — row 13
- AI-generated questions — row 16
- Custom voting categories / game modes — row 17
- Smaller per-game hooks: Bingo manual call mode, Chess custom clocks, Sudoku custom duration
- Early access to new modes — row 22
- Priority support — row 23

> **Coverage check:** rows 1–4 & 8 = free baseline; 5, 6, 9, 10, 19, 20 = Phase 1; 7, 11,
> 14, 15, 18, 19b, 21 = Phase 2; 12, 13, 16, 17, 22, 23 = Phase 3. All 23 (+19b) accounted
> for, on top of Phase 0 foundations.

---

## ⚠️ Prerequisite: there are no accounts yet (Phase 0)

**This is the single biggest dependency, so it's called out first.**

Today the app has **no user accounts at all.** Every game is owned by a `host_token` — a
random string kept in the browser's `localStorage` and checked server-side for host actions.
There is no users / auth / profiles table anywhere in the schema.

That model can't hold a paid "forever" unlock:

- A `localStorage` token is **per-device and per-browser**. Clear the cache, switch phones,
  or use a different browser and it's gone — along with any Pro status attached to it.
- You can't honestly sell "Pro forever" against something that disappears when someone
  reinstalls the app or logs in from a friend's phone.

**So real accounts are a hard prerequisite for the entire revenue model.** Nothing else in
this doc can ship without it. Recommended approach:

- Use **Supabase Auth** (it's already the backend) — email magic-link + Google sign-in is
  enough. Low friction, no passwords to manage.
- Add a `profiles` (or `hosts`) table keyed to the auth user, carrying the `is_pro` flag.
- **Keep playing — and hosting — 100% anonymous.** Players join with just a name and a room
  code, no account ever. **Hosts can also create rooms, host games, and use every free
  feature with no account at all** — exactly as they do today. Signing up is **only** ever
  prompted at the moment a host reaches for a *Pro* feature; that's when we say "create a
  free account to unlock Pro." Free hosting never requires login.
- **Migration nicety:** let an existing anonymous host "claim" their current device's
  `host_token` by signing up, so they don't lose their active rooms.

This is Phase 0 — build it before any Pro feature.

---

## How a host becomes Pro (flow)

1. **Host has (or creates) an account.** First time they want Pro, they sign in / sign up
   (email magic-link or Google — one tap). Playing *and* free hosting never require this —
   the account prompt only ever appears at the point of unlocking a Pro feature.
2. Free host hits a Pro-gated action (raise the cap, add Monopoly time, open a 2nd room) —
   or visits `/upgrade` directly.
3. Friendly upgrade prompt: *"Unlock Pro Host — one-time $2."*
4. Checkout, routed by region: **Stripe** for international cards, **Paystack** for
   Nigeria/Africa.
5. A signature-verified webhook flips the account's `is_pro` flag on successful payment.
6. Pro perks unlock immediately, everywhere they sign in, forever.

The upgrade prompt lives both inline (when they hit a wall) and on a dedicated `/upgrade`
page so hosts can buy proactively. Because Pro is tied to the **account** (not a device),
it follows them across every browser and phone they sign in on.

---

## Where Pro plugs into the code (high level)

Orientation for when we build it — not a final design.

- **Accounts first (Phase 0).** There is no user table today — hosts are just a
  `localStorage` `host_token`. Add Supabase Auth + a `profiles` table carrying `is_pro`; that
  flag becomes the single source of truth for every gate. See the prerequisite section above.
- **Limits already exist.** `src/lib/game-limits.ts` defines per-game `min/max/default` and
  a `GAME_LIMIT_ABSOLUTE_MAX` of 100, with admin overrides cached in `game_player_limits`.
  Pro caps slot in right here (Option A reuses `max`; Option B adds a `proMax`).
- **Monopoly controls exist.** `src/lib/monopoly.ts` already has timer/duration/add-time
  constants — gate the upper options behind `is_pro`.
- **Server-side gating.** Every Pro action (room-count, cap override, add-time, large
  import) must be checked in the **API route / server**, never just hidden in the UI. Hosts
  can't be trusted to self-report.
- **Payments + webhook.** Payment provider handles checkout; a signature-verified webhook
  flips `is_pro` to true on success.
- **UI gates.** Free hosts see locked perks with an upgrade nudge; Pro hosts see them
  unlocked. Everything reads off the one account flag.

### Build checklist

- [ ] **Phase 0:** Supabase Auth + `profiles`/`hosts` table with `is_pro` flag (+ migration).
- [ ] **Phase 0:** let anonymous hosts "claim" their `host_token` on sign-up (don't lose rooms).
- [ ] **Phase 0:** Stripe + Paystack checkout, region-routed.
- [ ] **Phase 0:** signature-verified webhook to set `is_pro` on payment success.
- [ ] **Phase 0:** shared server-side `requirePro()` gating helper for every perk to call.
- [ ] Caps via **Option A** (Pro reuses `max` in `game-limits.ts`) — no new schema.
- [ ] Gate the Monopoly/Scrabble add-time + long-duration options behind `is_pro`.
- [ ] Concurrent-room enforcement (count active rooms per account; free = 1, Pro = 3).
- [ ] Upgrade prompt component + `/upgrade` page.
- [ ] Pro badge in lobby / profile.
- [ ] (Phase 2) Game Skins — needs art assets + a theme selector per game.

---

## Guardrails / principles

- **Never charge to *play*.** Joining and playing is free, permanently. The $2 unlock only
  affects the host's powers; cosmetics are optional and never gate play.
- **Cosmetic only — never pay-for-power.** No purchase (unlock or skin) ever buys a
  gameplay advantage. Fair play is the whole reason friends show up.
- **Never make a free room *worse* to push Pro.** We add ceilings for Pro; we don't degrade
  today's free baseline.
- **Never gate language / accessibility.** Localization (e.g. the French/German/Spanish
  Scrabble editions) stays free — paying to play in your own language is the wrong line to
  draw and shrinks the audience.
- **Free hosting needs no account.** Accounts are only ever required to *buy or use* Pro,
  never to host a normal free game.
- **Gate on the server.** UI hiding is not security.
- **Keep the buy simple.** One unlock, one price, everything on.

---

## Decisions (resolved)

| Question | Decision | Notes |
|----------|----------|-------|
| Launch price | **$2 flat globally**, locally-calibrated price for Africa | See [Regional pricing](#regional-pricing-starting-points) table below |
| Player caps | **Option A — Pro reuses existing `max`** | No new schema; ship fast. Option B (`proMax`) later |
| Payment provider | **Stripe (international) + Paystack (Africa)** | Region-routed checkout |
| Concurrent rooms | **Free = 1, Pro = 3** | 3 is meaningful but abuse-resistant; can raise to 5 if hosts ask |
| Accounts | **Required for Pro; Supabase Auth (Phase 0)** | Playing stays anonymous forever |
| Phase-1 minimum | Caps + multi-room + both add-time flagships + themes + Pro badge | See below |
| Early access to new games | **Yes, long-term (Phase 3)** | Standing Pro perk once we ship games regularly |
| Founder / Lifetime+ tier | **Optional, later** | Premium one-time SKU for superfans; not at launch |
| **Two revenue lines** | **$2 unlock (utility) + cosmetics (status), kept separate** | Cosmetics are NOT bundled into the unlock — they're the repeatable, long-term line |
| **Cosmetics buyer** | **Hosts *and* players** (opt-in account to buy) | Unlock stays host-only; cosmetics open to everyone — biggest sustainability lever |
| **Skin ownership scope** | **Player-owned, never host-owned** | Board art renders locally (you see your own); your piece/token syncs (everyone sees yours). No skin is host-gated, so a non-host buyer always sees what they paid for |
| **Theming scope** | **Room themes = all games; component skins = surface games only** | Both already partly built (`themes.ts`, `chess-appearance.ts`) |
| **Seasonal / topical drops** | **Yes — limited-time, inspired-by, global *and* Naija-local** | Same engine as skins + an availability window; urgency drives the buy |
| **Virtual currency / coins** | **No at launch** — sell items directly | Coins add friction, only pay off at scale; revisit if volume is huge |
| **Pay-for-power** | **Never** | Cosmetic only, forever — protects fair-play, the whole reason the app works |

### Why these are the right Phase-1 minimum

For $2 to *feel* worth it, the perks should match the moments a host actually feels
constrained:

- **Add-time (Monopoly + Scrabble)** — the highest-emotion conversion moment: mid-game,
  everyone's having fun, one tap keeps it alive. This alone can justify the $2.
- **Multiple rooms** — the host running back-to-back game nights hits this constantly.
- **Raised caps** — the "we have one more friend who wants in" moment.
- **Themes + Pro badge** — cheap to ship, give instant *visible* value so the purchase feels
  real the second it completes.

Everything heavier (skins art, AI questions, custom modes) is deliberately Phase 2/3 so
launch isn't blocked on asset design or net-new features. **Game Skins are the most likely
thing to pull forward into Phase 1** if you want a stronger visual hook — the only cost is
art, the code wiring is trivial.

### Regional pricing (starting points)

Charge a **locally-calibrated impulse price**, not a raw FX conversion of $2. The numbers
below are friendly round figures meant to *feel* like a snack/data-bundle impulse buy
locally. **Verify against live FX at launch** — African rates move, so treat these as the
intended price *feel*, not locked figures.

| Region | Currency | Suggested price | Raw-FX of $2 (approx) | Why |
|--------|----------|----------------:|----------------------:|-----|
| 🌍 International | USD | **$2.00** | — | Global anchor |
| 🇳🇬 Nigeria | NGN | **₦1,500** | ~₦3,000 | Below FX on purpose — keeps it a true impulse buy locally |
| 🇬🇭 Ghana | GHS | **GH₵20** | ~GH₵25–30 | Round, snack-priced |
| 🇰🇪 Kenya | KES | **KSh 250** | ~KSh 260 | Roughly at FX, clean number |
| 🇿🇦 South Africa | ZAR | **R35** | ~R36 | Roughly at FX, clean number |

**Note on Naira:** I priced it *below* a straight conversion deliberately — ₦3,000 starts to
feel like a real purchase, while ₦1,500 stays in "sure, why not" territory and matches the
impulse-buy goal. Paystack lets you set the NGN price directly, so it's not tied to the USD
figure. Adjust if FX drifts hard.

### Founder / Lifetime+ tier — long-term, optional

A *higher-priced* one-time tier above the standard unlock, for superfans who want to pay
more. E.g. a **launch-only "Founder" edition** ($10–15 one-time) that bundles all of Pro + a
Founder badge + "everything we ever add to Pro, free forever" + early access. Same pay-once
model, just a premium SKU. **Not needed at launch** — add it later as an upsell once there's
a base of enthusiastic hosts. Limited-time framing ("Founder edition") creates urgency.

### Early access to new games — long-term YES

**Decision: yes, eventually.** Pro hosts get new game modes first (e.g. a 1–2 week head
start) as a standing perk — it's a recurring reason to stay Pro and a natural reward. Not a
Phase-1 priority (it only matters once we're shipping games at a steady cadence and have the
ops to stage a gated rollout), so it stays in **Phase 3**, but the long-run answer is yes.
