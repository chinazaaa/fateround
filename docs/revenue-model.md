# Revenue Model — Pricing & Launch Plan

> ⚠️ **Superseded by [`revenue-model-v3.md`](./revenue-model-v3.md) (Aug 2026).** v3 replaces the
> consumer-subscription strategy below with an organiser-facing, pay-per-event model. **This file
> is retained for its still-valid research**, which v3 carries forward by reference: §1 (Naira-first
> pricing, Paystack + Stripe rails, IP detection) and §4 (refunds, VAT, dunning, invoicing). The
> tier structure in §2 and the launch timeline in §3 are **no longer the plan**.
>
> Status: **Revised strategy (Aug 2026), v2.** Supersedes the earlier "Pro Host + Cosmetics"
> one-time-purchase model that previously lived in this file (see git history if you need it).
> Companion docs: [`account-tiers.md`](./account-tiers.md) · [`clubs-spec.md`](./clubs-spec.md) ·
> [`trophies-and-streaks.md`](./trophies-and-streaks.md) · [`pricing-implementation-plan.md`](./pricing-implementation-plan.md)
>
> Nothing here is fully built yet — this is the spec we ship from. `pricing-implementation-plan.md`
> tracks what has to be built (accounts → billing → entitlements) before any of this can be charged for.

## The one-line strategy

Nigeria is FateRound's best market by a factor of twelve. Price for it, take payment locally,
and launch in three phases rather than one — soft launch to the community in August, public
pricing in September, B2B pilots closing in October.

---

## Why Nigeria leads the pricing

Six months of Search Console data:

| Market | Clicks | Impressions | CTR | Avg. position |
|---|---|---|---|---|
| **Nigeria** | 33 | 243 | **13.58%** | **7.8** |
| United States | 24 | 2,089 | 1.15% | 35.9 |
| Philippines | 7 | 43 | 16.28% | 23.6 |
| United Kingdom | 6 | 214 | 2.80% | 25.7 |

Nigeria produces more clicks than the US from **one-ninth the impressions**. The Whot, Ayo,
Nigerian Draughts and Naija Monopoly content is doing real work, and that audience already
trusts the product.

Pricing the platform in USD and taking payment only through international cards would
functionally exclude the people most likely to pay. That is the single biggest risk this
plan is built around fixing.

---

## 1. Currency and payment — decisions

**Three price books, not one converted list.** Prices are set to local willingness to pay,
not FX maths.

| | Nigeria (₦) | UK (£) | International ($) |
|---|---|---|---|
| **FateRound+** monthly | ₦1,000 | £2.49 | $2.99 |
| **FateRound+** annual | ₦7,500 | £19.99 | $19.99 |
| **Club Pro** per season, per club | ₦1,500 | £3.49 | $3.99 |
| **Season Pass** per season | ₦800 | £1.49 | $1.99 |
| **Classroom+** per teacher/mo (annual) | ₦1,000 | £2.49 | $3.00 |
| **Team** per seat/mo (annual, min 10) | ₦1,500 | £3.49 | $4.00 |

Benchmarks used for the Naira column: Spotify Nigeria ~₦1,300/mo, YouTube Premium ~₦1,100/mo,
Netflix Mobile ~₦2,200/mo. FateRound is more discretionary than a daily streaming service, so
it sits just under Spotify. ₦1,000 is also a clean, memorable number, which matters more than
optimising to ₦1,150.

**Payment rails — both, not one.**
- **Paystack** (or Flutterwave) for Naira. Non-negotiable. Nigerian cards fail on
  international processors at high rates, and the failure looks like "nobody wants to pay" in
  your dashboard rather than "checkout is broken."
- **Stripe** for GBP and USD.

**Detect currency by IP, but let the user switch.** A Nigerian in London may want either.
Never hard-lock by geography.

**Verify these FX-sensitive numbers before launch.** The Naira column reflects a rough
~₦1,500/$ environment. Check the rate the week you launch and adjust if it has moved sharply —
but adjust the *dollar* column, not the Naira one. Naira prices should feel stable to Nigerian
users even when the rate swings; that stability is a feature.

---

## 2. Tier structure

### Free (Forever)
**₦0 / £0 / $0**

The free tier stays generous. It is the growth engine and nothing here should feel like a
crippled version of the product.

- Host and play unlimited games — **play any game up to its full player count, up to 8
  players per room**
- Full public game library (all 38+ games)
- Voice chat in rooms
- Daily challenge — today's puzzle and today's leaderboard, always free
- Browse and use the public custom-content library
- Join unlimited clubs · create 1
- 2 saved templates per game

> **Copy note:** the player cap is a ceiling, not a per-game rule. Chess (2), Whot (2–6),
> Mahjong (4) and every other small-format game are **never** affected by tier limits. The cap
> only bites on Trivia (40), Bingo (30), Word Hunt / Word Rush / I Call On / Text Charades /
> Sudoku (20) and Codewords (12). Write it as *"play any game up to its full player count, up
> to 8 on the free plan"* — a flat "rooms up to 8 players" reads like Chess is limited, which
> is false and will cost you trust.

### FateRound+ (Individual)
**₦1,000/mo · ₦7,500/yr** (£2.49 / £19.99 · $2.99 / $19.99)

For people who host regularly and want their content and their record to persist.

- **Rooms up to 25 players**
- **Unlimited custom decks** — create, save, and CSV-upload your own trivia, charades,
  Codewords and Landmine content
- **Daily challenge archive + streak tracking** — full history and stats
- **Premium and seasonal game packs** — spicy packs, holiday packs, early access to new games
- **Trophy case and profile customisation** — rare trophies, badges, cosmetic flair
- **Premium themes**
- **Extended game clocks** — add time to Monopoly, Whot and other timed games
- Join unlimited clubs · create up to 3, larger club sizes
- 4 saved templates per game

**Custom decks are the hero feature, listed second.** Player count is a weak lead — most
sessions are under 8 people, so the cap rarely bites and the upgrade reason feels abstract.
Custom content is concrete, and the content pipeline (trivia banks, Charades lists, Codenames
codewords, Landmine pools) already exists to make the library genuinely worth paying for.

**"Priority TV-display mode" and "No ads" are not in launch copy.** Never sell a tier whose
feature list includes things that don't exist — it generates refunds and erodes trust at the
worst possible moment. If either ships later, add it under a clearly separated "Coming to
FateRound+" block, not the paid list itself.

On "No ads": there is no ad system on the free tier, so don't advertise the absence of a
downside that doesn't exist — it just plants the idea that free users should expect ads.

### Club Pro
**₦1,500/season per club** (£3.49 / $3.99), paid by the club owner when registering for a season

> **2026-08-07 — redesigned for the competitive club system.** The club concept has been
> completely rebuilt around inter-club matches, leagues, transfer markets, and a virtual economy.
> [`clubs-spec.md`](./clubs-spec.md) §24 is now the canonical, detailed monetization spec for
> Club Pro and all club-related revenue (Season Pass, Cosmetic Shop). This section retains the
> pricing and anti-loophole rules; for the full feature breakdown, see the clubs spec.
>
> **Billing is per-season, not monthly.** Seasons are the natural billing cycle — "pay for
> Season 8" is clearer than "pay monthly forever." If a club skips a season, they don't pay.
> ₦1,500 is an impulse price — the captain can ask 5 members to chip in ₦300 each. Start low,
> prove the value, raise later.

The competitive-advantage model — turns a casual crew into a league-ready squad.

**The paying owner gets:**
- FateRound+ bundled at no extra cost
- **Roster expansion: 15 → 25** (the biggest competitive lever — more depth across a season)
- **Scouting & analytics** (opponent stats, player search filters, transfer value history)
- **Custom crest** (image upload, not just emoji+colour) + club branding
- **Treasury bonus (+10%)** on all club earnings (match wins, prizes, sales)
- **Match replays** (round-by-round review of past matches for strategy)

**Regular members get, free:**
- The full competitive experience — league, cup, matches, transfers, chat
- Their personal account stays on the Free tier (15-roster club, emoji crest, no scouting)

**Member upgrade discount:**
- Any member of an active Club Pro club can upgrade to FateRound+ at **50% off** —
  ₦500/mo (£1.24 / $1.49)
- **Rounding: half of list, rounded DOWN to the nearest minor unit.** £2.49 → £1.245 → **£1.24**;
  $2.99 → $1.495 → **$1.49**. Down rather than nearest, so the charged amount is never more than
  half of list — "50% off" that bills £1.25 is a complaint, and rounding down costs a penny.
  These exact figures are the contract: checkout, renewal and entitlement copy must all use the
  charged amount, never recompute `list / 2` and land on a different penny.
- The discount holds only while they remain in an active Club Pro club; it reverts at next
  renewal if they leave
- It does **not** stack — one 50% discount per person regardless of how many Club Pro clubs
  they belong to

**Additional revenue streams (detailed in [`clubs-spec.md`](./clubs-spec.md) §24):**
- **Season Pass** (~₦800 / £1.49 / $1.99 per season) — battle-pass-style personal purchase with
  bonus rewards, exclusive seasonal cosmetics, and milestone coins. Resets each season.
- **Cosmetic Shop** (à la carte) — a separate purchased currency ("Stars") for crest packs,
  profile effects, seasonal kits, victory celebrations. Completely separate from FateRound Coins
  (the competitive currency, which is earned-only and never sold for real money).

> **Anti-loophole rule — load-bearing, do not relax.** A flat club fee granting all members full
> premium would destroy the individual tier. Only the paying owner gets + bundled.
>
> **Competitive integrity rule — load-bearing, do not relax.** FateRound Coins (used for
> transfers, recruitment, and all competitive actions) are **never sold for real money.** The
> cosmetic currency is a separate economy. A Division 4 club can beat a Division 1 club on
> merit. This line must not blur.

> **Phased monetization — validate before billing.**
> Club Pro and Season Pass are **Phase C** revenue — they only ship after 2-3 free club seasons
> prove genuine engagement. FateRound+ and the Cosmetic Shop (sticker packs, seasonal kits) are
> **Phase A** — they convert independently of whether the club system thrives. See
> [`clubs-spec.md`](./clubs-spec.md) §24 "Launch phases" for the full phasing plan and the
> engagement signals that gate Phase C.

### Schools

**Classroom — Free**
- Up to 40 players per room
- Safe-content mode only (party and spicy games hidden)
- Word and logic games: Codewords, Sudoku, Word Hunt, Scrabble, Trivia, Crossword, Word Search
- Basic leaderboard

**Classroom+ — ₦1,000/teacher/month, billed annually** (£2.49 / $3.00)
- Unlimited custom decks + CSV upload for teacher-made content
- Classroom daily-challenge leaderboard
- Basic engagement reporting

**School Site Licence — contact for pricing**
- Unlimited teacher seats
- Admin roster and class management
- Branded inter-class and inter-school tournaments (the **School Whot Championship**,
  formalised as a product)
- Full analytics dashboard
- Priority support, annual invoicing and PO support

### Corporate / Teams

**Team — ₦1,500/seat/month, min 10 seats, billed annually** (£3.49 / $4.00)
- Branded company club — logo, colours, custom URL
- Admin engagement analytics
- Private company tournaments and leaderboards
- Slack / Teams / Zoom / Discord one-click launch
- Company trophy case

**Enterprise — contact for pricing**
- AI-personalised content from real team names, projects and inside jokes
- Dedicated account manager
- Sponsorable prize slots for all-hands and holiday events
- SSO, custom contracts, invoicing and PO support
- White-label option

---

## 3. Launch timeline — firm dates

Do **not** put a public pricing page live in the first half of August. Two reasons: the SEO
consolidation work (redirects, merged posts, Yahtzee internal linking) needs 3–4 weeks to be
reflected in rankings, and the reachable paying audience today is essentially the ~100-person
WhatsApp community. Launching wide into thin traffic produces a discouraging number that tells
you nothing useful about pricing.

### Phase 0 — Build week: 3–16 August
Nothing customer-facing ships. Complete:

- [ ] Paystack integration live and tested with a real Naira card
- [ ] Three-currency price book implemented, IP detection + manual switcher
- [ ] Brand audit: **"FateRound"** (one word, capital R) everywhere — site, pricing page,
      checkout, receipts, emails. No "Fate Round" anywhere.
- [ ] Refund policy written and published before any payment is taken
- [ ] Invoicing / PO flow scoped for schools and corporates (this is the actual blocker on
      B2B deals, not price)
- [ ] Speak to an accountant about UK VAT on digital services and EU VAT OSS obligations —
      see note below
- [ ] Remove v2 features from paid tier copy
- [ ] Player-cap copy rewritten per the note above

### Phase 1 — Founding Member soft launch: 17 August
Community only. No public pricing page, no announcement beyond your channels.

- Offer **Founding Member** annual FateRound+ at **₦4,999/year** (£12.99 / $14.99) — roughly
  33% off the standard annual rate
- Open to the WhatsApp community and existing players only
- **Cap it: first 100 subscribers, or two weeks, whichever comes first.** A cap creates real
  urgency; an open-ended "early bird" doesn't.
- Price held for **two years** from signup, then moves to the standard annual rate with 30
  days' notice

> **Not "locked in for life."** Do not commit to that in writing — you'll want to raise prices
> once you have retention data, and an unbounded lifetime promise is a permanent liability on
> the exact number you intend to move. Two years is generous, feels like a real reward, and
> leaves you free.

The goal of Phase 1 is not revenue. It is three answers: does anyone convert, which tier, and
what do the non-converters say when you ask them directly? Message every person who looked and
didn't buy — that conversation is worth more than the subscriptions.

### Phase 2 — Public pricing page: 8 September
By now the SEO work has had a month to settle and organic traffic should be materially higher.

- Pricing page live at `/pricing`, linked from the header and the game pages
- Standard pricing (Founding Members grandfathered)
- Announcement post on the blog + TikTok using the rose/violet brand template
- Watch: visit-to-checkout rate, and where people drop

### Phase 3 — B2B pilots: September–October
**This is where the money actually is, and it deserves more August–October attention than the
consumer funnel.**

At ₦1,000/month you need roughly 300 individual subscribers to clear ₦300,000/month. One
School Site Licence or one 20-seat corporate contract gets you a comparable number from a
single conversation.

Unusual advantages here vs. most consumer game platforms:
- A `/school-whot-championship` page and a formalised championship concept
- A teaching relationship through Ìmòye
- Real consulting and client-delivery experience — already know how to run a B2B conversation

**Concrete plan:**
1. Pick **one school** and **one company**. Not five.
2. Give the pilot free for a term / a quarter. Charge nothing.
3. In exchange, get: a named testimonial, participation numbers, and permission to write a
   case study.
4. Use that case study to sell the next ten. Cold B2B outreach without a reference customer is
   brutally hard; with one it becomes a normal sales conversation.

Nigerian schools are the natural first target — strongest market, Whot Championship is a
genuinely differentiated hook, and there is no equivalent local product.

---

## 4. Things to check before you take a single payment

**Existing users.** Has anyone been using features that are about to become paid, or been
promised anything? Grandfather them explicitly and tell them so in writing before launch.
Quietly taking away something someone already had is the fastest way to lose your most
engaged players.

**VAT and tax.** UK-based selling digital services internationally. UK VAT registration has a
turnover threshold, but EU B2C digital-services rules can apply from the first sale. Nigerian
VAT on digital services is its own question. Book an hour with an accountant during Phase 0 —
this is cheap to set up correctly and expensive to fix retroactively.

**Refund policy.** Published before the first payment, not after the first complaint. A simple
14-day no-questions refund on annual plans costs very little and removes the main objection to
paying annually.

**Failed-payment handling.** Card failures are common in Nigeria even with Paystack. Build
dunning emails and a grace period from day one — don't let a failed renewal silently downgrade
someone who wanted to stay.

---

## 5. What to watch after launch

| Metric | Why it matters |
|---|---|
| Naira vs USD conversion rate | Directly tests the core thesis of this document |
| Which tier converts first | If Club Pro leads, the community model is the product |
| Checkout drop-off by currency | Isolates payment-rail problems from pricing problems |
| Free → paid time lag | Tells you whether to push trials or leave the free tier alone |
| Daily-challenge return rate | The strongest retention signal available; predicts subscription survival |

---

## Guardrails that carry over from the prior model

- **Playing is free, forever.** Joining, spectating, tournaments, trophy hunting, the daily
  challenge itself — all free, on every tier.
- **Trophies and streaks are earned, never sold** as line items — FateRound+ unlocks case/
  cosmetics and archive access, but the underlying achievement is always earned by playing.
- **Gate on the server**, not just the UI — `assertEntitlement()` / equivalent in every API
  route that checks plan.

---

## Changes from the original (subscription) draft

1. **Naira-first pricing** with three genuine price books and Paystack — the highest-leverage
   change here
2. **Custom decks promoted to the lead FateRound+ benefit**, ahead of player count
3. **Version-2 features removed** from paid launch copy; "No ads" cut entirely
4. **"Locked in for life" → two years**, with a hard cap of 100 Founding Members
5. **Phased launch** (17 Aug soft → 8 Sept public → Sept/Oct B2B) instead of a single August
   date
6. **B2B pilots elevated** from a later consideration to the main revenue focus
7. **Player-cap copy corrected** so small-format games aren't misrepresented as limited
8. **FateRound** used consistently throughout
9. Refunds, VAT, dunning and invoicing added as pre-launch blockers rather than afterthoughts

Club Pro's loophole fix, the free-forever daily challenge, and the overall tier shape are
unchanged from the original subscription draft — they were right.

---

## Build dependencies

See [`pricing-implementation-plan.md`](./pricing-implementation-plan.md) for what has to be
built before any of this can be charged for (accounts → billing → entitlements → clubs →
trophies/daily-challenge persistence → schools/corporate org layer). Nothing here is billable
until Phase 0 of that doc is done.
