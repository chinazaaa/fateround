# Revenue Model v3 — Sell the Event, Not the Subscription

> Status: **Current strategy (Aug 2026).** Supersedes [`revenue-model.md`](./revenue-model.md) (v2)
> and the tier structure in [`account-tiers.md`](./account-tiers.md).
> The v2 doc is kept for the pricing research (Naira benchmarks, payment rails, VAT/refund
> checklist) — that work is still good and is carried forward here by reference.
>
> Companion docs: [`pricing-implementation-plan.md`](./pricing-implementation-plan.md) ·
> [`schools-education-market.md`](./schools-education-market.md) · [`clubs-spec.md`](./clubs-spec.md)

## The one-line strategy

Nobody pays to *play* a free party game. People pay to **run an event without it going wrong**.
Sell one-off, branded, AI-content-filled game events to organisers — churches, schools,
companies, MCs — and only sell a subscription to the ones who turn out to host every month.

---

## 1. Why v2 doesn't work

v2's own Phase 3 says it: *"At ₦1,000/month you need roughly 300 individual subscribers to
clear ₦300,000/month. One School Site Licence or one 20-seat corporate contract gets you a
comparable number from a single conversation."* Then it spends 200 lines building the 300-subscriber
plan and 20 lines on the single conversation.

Four specific reasons the consumer subscription fails:

**Episodic use, recurring charge.** Party games happen when six people are free at the same
time — a few times a month at best. A monthly card mandate prices a habit the product doesn't
create. The mismatch, not the price, is the problem; ₦500 would fail the same way.

**The free tier is (correctly) excellent.** v2 promises "the free tier stays generous… nothing
here should feel like a crippled version." That's the right call for growth and it means the
listed paid features — a bigger player cap, premium themes, a trophy case — are all *nice*, none
are *needed*. The upgrade never becomes urgent.

**Base rates.** Good freemium consumer products convert 1–3% globally, lower in Nigeria where
the free alternative is right there. The reachable audience today is roughly a 100-person
WhatsApp community. That is one to three subscriptions. It is not a signal you can learn
anything from.

**Recurring card auth in Nigeria is genuinely unreliable.** v2 already flags this and prescribes
dunning emails and grace periods. That's a real infrastructure burden to build in order to chase
₦1,000/month. Avoid the whole category of problem instead of engineering around it.

None of this means Nigerians don't pay. They pay for data, betting, Showmax, Netflix Mobile —
utilities, and things with a social or status payoff. FateRound has a version of that. It isn't
the player's subscription.

---

## 2. The reframe: the payer is the organiser

Kahoot's revenue is teachers and administrators, not students. Jackbox's revenue is whoever is
buying the party, not the eight people playing. The pattern holds here.

**The person who pays for FateRound is whoever is running the event, and what they are buying is
not features — it is not being embarrassed in front of forty people.**

Concretely, five buyers who already exist in this market:

| Buyer | Occasion | Why they pay |
|---|---|---|
| Youth pastor / church programme lead | Youth week, retreat, Christmas programme | Has a budget line, a fixed date, and no plan B if it flops |
| Teacher / head of year | Inter-house week, end of term, club day | Needs it to work on a projector, and needs proof it happened |
| HR / office culture lead | End-of-year, onboarding, remote team hangout | Genuinely paid to make this go well; expenses ₦20k without blinking |
| MC / event host | Wedding reception, birthday, hangout | It's their professional reputation on the night |
| Club captain / crew organiser | Recurring games night | The only one of the five who might actually want a subscription |

Every one of them has a **date**, a **budget**, and **anxiety**. That is a willingness to pay.
"I would like a rarer trophy" is not.

This reframe changes what to build. Not "what makes a player upgrade" but **"what would make an
organiser afraid to run their event without us."**

---

## 3. What we already built and aren't selling

### Tournaments are event mode, positioned as a feature

[`0097_tournaments.sql`](../supabase/migrations/0097_tournaments.sql) already gives us sequenced
games, players persisting across games, configurable placement points, and one cumulative
leaderboard — plus four formats in [`tournament-validation.ts`](../src/lib/tournament-validation.ts)
(round-robin, head-to-head bracket, knockout, and a school class-ladder).

That *is* the product an organiser wants: **one code, one afternoon, one champion.** It is
currently presented as a mode inside a free games site.

**The gap:** a tournament runs a single game type. Round-robin is trivia-only
(`TOURNAMENT_ELIGIBLE_TYPES = ['trivia']`), knockout is trivia + scrabble, school ladder is Whot.
A church youth night is not five rounds of trivia — it's trivia, then charades, then Whot, then a
word game, with one running scoreboard. **Mixed-game events are the single biggest product gap.**

### AI generation is behind a wall nobody in our audience can climb

[`AiQuestionsGenerator.tsx`](../src/components/ui/AiQuestionsGenerator.tsx) requires the host to
paste **their own Claude API key** ("Generation runs on your own Claude API key, so you only pay
for what you use"). Essentially zero organisers in our market have an Anthropic account.

So the highest-perceived-value capability in the entire product — *"make me thirty questions
about my church / my class / my company's inside jokes, in twenty seconds"* — is functionally
unavailable, and it costs us nothing today because nobody can use it.

This is the paid unlock. It's cheap per generation, it's instantly legible as valuable, and it is
the thing an organiser will reach for a card over. v2 was directionally right to lead with
"custom decks" — but a CSV upload is homework, and generation is magic.

### What does not exist yet (confirmed)

- **No billing of any kind.** No Paystack, no Stripe, no entitlement/plan column anywhere. This
  is good news: nothing has to be unwound, and v2's Phase 0 build week has not been spent.
- **No branding layer** — no way to put a church/school/company logo or colours on a room.
- **No big-screen mode** — nothing projector-specific.
- **No post-event artifact** beyond the in-app share leaderboard
  ([`TournamentShareLeaderboard.tsx`](../src/components/tournament/TournamentShareLeaderboard.tsx)).

---

## 4. The build list

Ranked by (revenue unlocked) ÷ (effort). Every item serves the organiser. Nothing here is a
player-facing perk.

### P0 — Hosted AI deck generation
Drop the bring-your-own-key requirement. Server-side key, our cost, rate-limited and metered per
host. Prompt or paste-a-document → a trivia / charades / codewords / Landmine deck, editable
before it goes live.

- Free: **1 generated deck**, capped at ~10 items, watermarked in the room as "generated on
  FateRound".
- Paid: unlimited generation, full length, no watermark.
- Guard the spend: hard per-host and per-day ceilings, plus the existing rate limiter in
  [`ai-questions/route.ts`](../src/app/api/ai-questions/route.ts). Keep the BYO-key path as an
  option for power users — it costs us nothing to leave in.

This is the demo. When someone asks "why would I pay", this is the answer you show them on a
phone in thirty seconds.

### P1 — Mixed-game events
Let one tournament contain different game types in sequence, scored into a single leaderboard.
The scoring layer already handles this — placements per game, points into `tournament_players`.
The work is relaxing the single-`gameType` assumption on the tournament and its create flow, and
defining a placement mapping for game types that don't currently report clean placements.

Sell it as a **run-of-show**: "Youth Night — 5 games, 90 minutes, one champion."

### P2 — Event branding
Logo upload + two colours, applied to the lobby, the in-game header, the big screen and the
results card. Small build, disproportionate perceived value, and it is the first thing every B2B
buyer asks for. Ties into the existing game-theme system.

### P3 — Big-screen mode
A projector/TV route: giant QR to join, giant current-question, giant scoreboard, no host chrome.
The QR pieces already exist ([`GameLinkQrCode.tsx`](../src/components/GameLinkQrCode.tsx)). If the
room has a screen, the person who booked the room is a payer — this is the feature that gets us
into halls and classrooms.

### P4 — The post-event pack
Final standings as a shareable image + PDF, a winner certificate, and a CSV of participation.
Teachers and HR need **proof the event happened** — it's their internal justification for having
spent the money. Cheap to build, and it's the artifact that gets forwarded to the next buyer.

### P5 — Scheduled events
Create the event days ahead, share a link, let people pre-register, host opens it on the day.
Converts "I hope this works tonight" into "this is handled", which is the emotion we're selling.

**Explicitly not on this list:** premium themes, trophy-case cosmetics, extended game clocks,
larger player caps as a headline benefit. They're fine as bundled extras; none of them close a sale.

---

## 5. Pricing shape

### The Event Pass — the primary product

**One event. One payment. No mandate.**

| | Nigeria (₦) | UK (£) | International ($) |
|---|---|---|---|
| **Event Pass** — single event | ₦3,000 | £6.99 | $7.99 |
| **Event Pass 3-pack** | ₦7,500 | £17.99 | $19.99 |
| **Host Plan** — monthly | ₦2,500/mo | £5.99 | $6.99 |
| **Host Plan** — annual | ₦20,000/yr | £49 | $59 |
| **School / Team site licence** | contact | contact | contact |

An Event Pass covers one event (a 24-hour window from first game start), up to 60 players, and
includes: mixed-game run-of-show, unlimited AI decks for that event, branding, big-screen mode,
and the post-event pack.

Why this shape:

- **It matches the behaviour.** Someone hosts a Christmas programme in December and nothing in
  March. A pass fits that; a subscription punishes it.
- **No recurring card auth**, so no dunning, no grace periods, no silent downgrades — the entire
  category of Nigerian card-mandate failure disappears. A single Paystack charge either works or
  it doesn't, and the buyer is standing right there when it happens.
- **It's an event budget line, not a personal subscription.** ₦3,000 against a church programme
  or an office end-of-year is a rounding error; ₦1,000/month out of someone's own pocket forever
  is a decision.
- **No churn metric to manage** in year one, when we have no retention data to manage it with.

The **Host Plan** exists only for the minority who host monthly — recurring behaviour deserves a
recurring price. Position it as the upgrade *after* someone has bought two or three passes, not as
the front door. Everything in a pass, unlimited events, plus saved branding and content library.

### Prices carried over from v2 unchanged

The Naira-first thesis, the three genuine price books (not FX conversion), **Paystack for Naira +
Stripe for GBP/USD**, IP detection with a manual switcher, and the pre-launch checklist (refund
policy published first, VAT conversation with an accountant, invoicing/PO flow for B2B) are all
still correct. See [`revenue-model.md`](./revenue-model.md) §1 and §4 — that research doesn't need
redoing.

### Free stays free

Unchanged and load-bearing: playing, joining, spectating, hosting ordinary rooms, the full game
library, the daily challenge, voice, trophies and streaks are free forever. Trophies are earned,
never sold. The paid layer sits entirely on top, on the organiser side, and takes nothing away
from anyone who has it today.

---

## 6. Pricing page — publish-ready content

Everything below is written to be lifted onto `/pricing` more or less as-is. Three public cards
plus a contact tier. **Nothing ships to the page until it exists in the product** — see the copy
rules at the end of this section, and the availability column in §6.5.

### 6.1 Free — "Play as much as you like"

**₦0 / £0 / $0 · forever**

> For everyone. Playing FateRound is free and always will be.

- Host and play **all 38+ games** — no game is locked
- **Up to 20 players** in a room
- Voice chat in any room
- Today's **daily challenge** and today's leaderboard
- **Trophies, streaks and your public profile** — earned by playing, never sold
- Browse and play the **public custom-content library**
- Single-game tournaments — round-robin, knockout and bracket formats
- Upload your own questions by **CSV**
- **1 AI-generated deck** to try it out (up to 10 items)
- 2 saved game templates

*Card footer:* No account needed to play. No card, no trial, no ads.

### 6.2 Event Pass — "Run one event, properly" **← highlight this card**

**₦3,000 · £6.99 · $7.99 — one payment, one event**

> For the person running the thing: church programmes, inter-house week, the office end-of-year,
> a wedding reception. Pay once, for the day you need it.

Everything in Free, plus:

- **Unlimited AI-generated decks for your event** — describe your church, class, team or theme
  and get a ready-to-play round in seconds. Edit anything before it goes live.
- **Mixed-game events** — line up several different games in one run-of-show with a single
  running scoreboard and one overall champion
- **Up to 60 players**
- **Your branding** — your logo and colours on the lobby, the game screen and the results
- **Big-screen mode** — projector-ready giant scoreboard with a join QR code
- **Event pack afterwards** — final standings image, PDF results sheet, winner certificate and a
  participation CSV
- **Schedule it in advance** — set it up days ahead and share a join link

*Card footer:* Covers one event, from your first game for the next 24 hours. No subscription,
nothing to cancel.

*Add-on line under the card:* **3 events for ₦7,500 · £17.99 · $19.99** — save on a term, a
season or a year of programmes.

### 6.3 Host Plan — "You do this every month"

**₦2,500/mo · ₦20,000/yr** (£5.99 / £49 · $6.99 / $59)

> For people who host regularly — games-night organisers, youth leaders, teachers, community
> managers.

Everything in Event Pass, on **unlimited events**, plus:

- **Saved branding** — set your logo and colours once, applied to every event
- **Your content library** — every deck you generate or upload, saved, searchable and reusable
- **Event history** — every past event's standings kept and re-shareable
- **Up to 100 players** per room
- Unlimited saved templates
- Priority support

*Card footer:* Cancel any time. Annual works out at under two events a month.

### 6.4 Schools & Teams — "Contact us"

**Custom pricing · invoiced annually, PO supported**

> For schools, churches and companies who need this across a whole institution.

- Unlimited teacher / organiser seats
- Admin dashboard, roster and class management
- Safe-content mode — party and 18+ games hidden institution-wide
- Branded inter-class, inter-department and inter-school tournaments — including the
  **School Whot Championship**
- Engagement and participation reporting
- Invoicing, PO support and priority support

*Card CTA:* **Book a call** → contact form, not a checkout.

### 6.5 Comparison table

For the "compare all features" section beneath the cards. The **Status** column is internal —
strip it before publishing, and do not publish a row until its status is *Live*.

| | Free | Event Pass | Host Plan | Schools & Teams | Status |
|---|---|---|---|---|---|
| All 38+ games | ✓ | ✓ | ✓ | ✓ | Live |
| Players per room | 20 | 60 | 100 | Custom | **Needs building** |
| Voice chat | ✓ | ✓ | ✓ | ✓ | Live |
| Daily challenge | ✓ | ✓ | ✓ | ✓ | Live |
| Trophies, streaks & profile | ✓ | ✓ | ✓ | ✓ | Live |
| Public content library | ✓ | ✓ | ✓ | ✓ | Live |
| CSV question upload | ✓ | ✓ | ✓ | ✓ | Live |
| Single-game tournaments | ✓ | ✓ | ✓ | ✓ | Live |
| AI-generated decks | 1 deck, 10 items | Unlimited | Unlimited | Unlimited | **P0** |
| Mixed-game events | — | ✓ | ✓ | ✓ | **P1** |
| Your logo & colours | — | Per event | Saved | Institution-wide | **P2** |
| Big-screen / projector mode | — | ✓ | ✓ | ✓ | **P3** |
| Post-event pack (PDF, certificate, CSV) | — | ✓ | ✓ | ✓ | **P4** |
| Schedule events in advance | — | ✓ | ✓ | ✓ | **P5** |
| Saved content library | — | — | ✓ | ✓ | **P1–P2** |
| Event history | — | — | ✓ | ✓ | **Needs building** |
| Saved templates | 2 | 2 | Unlimited | Unlimited | Live |
| Admin dashboard & rosters | — | — | — | ✓ | Not started |
| Safe-content mode | — | — | — | ✓ | Partial (18+ flags exist) |
| Participation reporting | — | — | — | ✓ | Not started |
| Invoicing & PO | — | — | — | ✓ | Not started |
| Priority support | — | — | ✓ | ✓ | Policy only |

### 6.6 Pricing-page FAQ

**Is FateRound free?**
Yes — playing is free forever, and always will be. All 38+ games, voice chat, the daily
challenge, trophies and streaks cost nothing and need no account. You only pay if you're
*running* something: a church programme, a school competition, an office party.

**What counts as one event?**
One Event Pass covers a single occasion — from the moment you start your first game, for the next
24 hours. Play as many games as you like within it.

**Do my players need to pay, or sign up?**
No. Only the host pays, and only the host needs an account. Players join with a code or a link,
same as always.

**Can I pay in Naira?**
Yes. Naira payments go through Paystack and work with normal Nigerian cards and bank transfer. We
also take GBP and USD by card. You can switch currency at checkout.

**What if the event doesn't happen?**
If you don't use an Event Pass, we'll refund it — just email us. Host Plan is refundable within
14 days if you haven't run an event.

**Do I lose anything I already have?**
No. Everything you use on FateRound today stays free, on your account, exactly as it is.

**I'm a school / church / company — can I get an invoice?**
Yes. Talk to us and we'll invoice annually against a PO.

### 6.7 Copy rules — load-bearing

**Never list a feature that doesn't ship yet.** Carried over from v2 verbatim, and it applies
doubly here because most of §6 is unbuilt. If a feature isn't live on the day the page goes up,
delete the row — do not grey it out, do not mark it "soon" inside the paid list. A separate
"Coming to FateRound" block below the table is fine.

**The player cap is a ceiling, not a per-game rule.** Also from v2, still true and still worth
getting right. Chess (2), Whot (2–6), Mahjong (4) and every other small-format game are *never*
affected by the cap. Write it as *"play any game up to its full player count, up to 20 players on
the free plan"* — a flat "rooms up to 20" reads like Chess is limited, which is false and costs
trust. The cap only bites on Trivia (40), Bingo (30), Word Hunt / Word Rush / I Call On / Text
Charades / Sudoku (20) and Codewords (12).

**Never say "no ads."** There's no ad system on the free tier. Advertising the absence of a
downside that doesn't exist just plants the idea that free users should expect ads.

**Lead the Event Pass card with AI decks, not player count.** Player count is a weak lead — most
events are under 20 people and the cap rarely bites, so the reason to upgrade feels abstract.
"Describe your church and get a ready quiz in seconds" is concrete and demonstrable in one screen.

**Say "one payment, nothing to cancel" prominently.** Subscription fatigue is real, and being
visibly *not* a subscription is a genuine differentiator against Kahoot — use it.

**Publish the refund policy before the page goes live**, not after the first complaint.

**Price stability in Naira.** If FX moves sharply, adjust the dollar column, not the Naira one.
Naira prices should feel stable to Nigerian users even when the rate swings — that stability is a
feature, and the numbers here (₦3,000 / ₦7,500 / ₦2,500 / ₦20,000) are chosen to be clean and
memorable rather than FX-exact.

---

## 7. What to stop building

**Clubs with leagues, transfer markets, a coin economy, season passes and a cosmetic shop.**
It is the largest spec in the repo ([`clubs-spec.md`](./clubs-spec.md), 1,574 lines) and it
monetises a thing we don't have: a large, retained, identity-bearing daily audience. Cosmetics and
battle passes convert attention you already own — they don't create it. Every week spent there is
a week not spent on the five buyers in §2 who have money now.

Park it. If the daily challenge and streaks produce a genuinely retained daily base later, the
spec is written and waiting.

**Also park:** the individual FateRound+ tier as designed in v2, the Season Pass, and the Stars
currency. If the Host Plan finds traction, it *is* the individual tier.

---

## 8. Validation before any billing code

The most valuable thing about having no billing infrastructure is that we can test the entire
thesis without building any.

**Sell three events by hand.**

1. Pick one church, one school, one small company. Not five of each.
2. Price it at ₦5,000 per event, invoiced as a Paystack payment link.
3. Deliver it manually: we set up the tournament, we generate the decks (with our own key —
   which works today), we're on the call or in the room.
4. Ask for three things in return: a named testimonial, the participation numbers, and permission
   to write it up.

**What each outcome means:**

- **Three pay** → the shape is proven. Build P0–P2 and automate what we did by hand.
- **They want it but won't pay** → the occasion is real, the price or packaging is wrong. Ask what
  they *would* pay and what they expected to be included. That conversation is the deliverable.
- **Nobody bites** → the organiser thesis is wrong too, and we've learned it for the cost of three
  phone calls instead of the whole accounts → billing → entitlements chain in
  [`pricing-implementation-plan.md`](./pricing-implementation-plan.md).

Do this before writing a single line of Paystack integration.

### Sequencing

| Stage | What happens | Gate to the next stage |
|---|---|---|
| **A — Sell by hand** | 3 manual events, ₦5,000 each, delivered personally | At least 2 of 3 pay |
| **B — Build the wedge** | P0 hosted AI decks, P1 mixed-game events, P2 branding | Something a stranger can buy and self-serve |
| **C — Take money** | Paystack single-charge Event Pass, entitlement check server-side, refund policy live | 10 self-serve passes sold |
| **D — Subscribe the repeats** | Host Plan for anyone who has bought 3+ passes; B2B site licences off the back of the stage-A case studies | — |

Stage D is where v2's B2B pilots slot in, and they're still the right idea — a school site licence
or a corporate contract is worth more than a hundred consumer subscriptions. The change is that we
arrive there with three reference customers and a working product instead of a cold pitch.

---

## Guardrails

- **Playing is always free.** Nothing that exists free today becomes paid. If any current user has
  been using something that lands in the paid tier, grandfather them explicitly and in writing.
- **Gate on the server**, not the UI — an entitlement check in every route that reads a plan.
- **Cap AI spend hard** per host and per day, from the first day it's hosted. This is the only
  line item in the plan with a real marginal cost.
- **Sell nothing that doesn't exist.** v2 got this right and it stays: no feature appears in
  checkout copy until it ships.
