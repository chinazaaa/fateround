# Pricing — What's Needed to Ship It

Companion to `FateRoundPricingPackages.md` (the pricing/packaging draft). That doc says *what* we sell. This doc says *what we have to build* to charge for it, in dependency order, and flags which "premium" features already exist but are currently free to everyone.

> **The one-line reality:** the pricing model is built on **accounts + subscriptions + clubs + trophies + daily challenges**, and today the app has **none of the four foundations** it needs — no user accounts, no billing, no entitlements layer, no clubs. Identity is entirely anonymous per-game secret tokens. Everything below flows from that.

---

## The gap at a glance

| Building block the pricing needs | State today | Verdict |
|---|---|---|
| **User accounts / auth** | No Supabase Auth, no `profiles` table. Identity = per-game/room secret tokens (`host_token`, `resume_token`, `creator_token`). Only "logins" are the admin/manager password panels. | ❌ Build from zero |
| **Payments / billing** | No Stripe/Paddle/anything in `package.json`. Zero billing code. | ❌ Build from zero |
| **Entitlements / plan gating** | Nothing. No plan/tier concept exists to check against. | ❌ Build from zero |
| **Clubs** | No club concept. Closest is ephemeral `rooms`/`room_members`. | ❌ Build from zero |
| **Trophies (persistent)** | Computed at runtime from match results (`achievements.ts`), never stored. | ⚠️ Needs accounts + tables |
| **Daily challenges + streaks** | No daily feature. "Streak" is per-match only. Community leaderboards exist (day/week/month windows) but no cross-day streak. | ⚠️ Partial base, feature is net-new |
| **Room player caps** | Per-game constants, host-set within clamp (`game-limits.ts`). Ungated. | ✅ Exists → just needs a gate |
| **Custom decks / CSV / library** | Robust and **unlimited** (`custom-questions.ts`, `question_packs`). No per-user quota. | ✅ Exists → needs a gate + a per-user owner |
| **Voice chat** | LiveKit, works. Gated by room membership, not plan. | ✅ Exists → needs a gate |
| **Account types (educator/school/org)** | None. "School" is only a tournament *format*. Safe-content is per-game, not per-account. | ❌ Build from zero |
| **Ads / "no ads"** | No ad integration at all. | ⚠️ "Remove ads" requires first building ads |

**Takeaway:** the hard, expensive work is the foundation (accounts → billing → entitlements). Once that exists, most individual perks are small gates on features we already shipped.

---

## Phase 0 — Foundations (blocks everything; nothing can be charged for without these)

### 0.1 User accounts / identity
This is the single biggest prerequisite. There is nothing to attach a subscription to today.

- Stand up **Supabase Auth** (email + OAuth: Google/Apple at minimum for mobile).
- Add a **`profiles` table** keyed on `auth.uid()` (display name, avatar, created_at, plan fields later).
- **Migrate the anonymous identity model.** Today every gating decision keys off ephemeral per-game/room secret tokens. We need a durable `user_id` that:
  - links a signed-in user to the games/rooms they host and play,
  - can carry a subscription and per-user quotas (e.g. "N custom decks"),
  - coexists with the existing anonymous flow (we must **not** force login to play a quick game — free anonymous play is the whole top-of-funnel per the pricing doc).
- Decide the **anonymous → account bridge**: let a guest claim their history/streak/trophies when they sign up (needed for the streak/trophy hooks to have any pull).
- RLS today is wide-open anon policies (`to anon using (true)`). New user-owned tables (subscriptions, entitlements, decks-by-owner, clubs) must use real `auth.uid()` RLS — a different pattern than the rest of the codebase currently uses.

### 0.2 Billing / payments
- Pick a processor. **Stripe** is the default (Billing + Customer Portal + webhooks). Note the pricing doc explicitly calls for **invoicing / annual contracts / PO support** for schools & corporate — that's Stripe Invoicing / manual quotes, not just card checkout, and it's flagged as the *actual deal-blocker* for those segments. Build it into the checkout design early, don't bolt it on.
- Data model: `subscriptions` (user_id/club_id/org_id, product, status, current_period_end, cancel_at), map Stripe Price IDs → internal plan keys.
- **Webhooks** to keep entitlement state in sync (created/updated/deleted, payment_failed, past_due).
- Handle: monthly vs annual, proration, dunning/grace on failed payment, refunds.
- **Mobile does not sell anything — decided.** The mobile app is play-only; **all checkout happens on the web.** This sidesteps Apple/Google IAP entirely (no StoreKit/Play Billing, no 15–30% cut). What mobile still needs:
  - sign-in so a user's web-purchased plan is recognized on mobile (shared account + entitlements),
  - read-only entitlement checks (unlock the paid features the user already bought on web),
  - **no purchase/upgrade UI in-app.** Per Apple/Google rules, don't even link out to the web paywall from inside the app; at most show "manage your plan on the website" with no tappable purchase link. Keep upsell prompts to "this is a Fate Round+ feature," not a buy button.

### 0.3 Entitlements layer (the thing every feature checks)
- One **`entitlements` / plan-resolution service**: given a `user_id`, return their effective plan + feature flags, resolving:
  - direct personal sub (Fate Round+),
  - club-derived perks (member of an active Club Pro club),
  - the **50%-off club-member discount** eligibility,
  - org/school seat membership,
  - the discount rules (see Phase 2 — non-stacking, reverts on leave).
- Server-side `assertEntitlement(user, feature)` used by API routes; client-side hook for UI gating/upsell prompts.
- **Every paid lever below is just a call into this service.** Build it once, well.

---

## Phase 1 — Fate Round+ (Individual) perks

Most of these features already exist; the work is **adding the gate + the upsell UI**, not building the feature. Each needs Phase 0 done.

| Perk (from pricing doc) | What exists | Work needed |
|---|---|---|
| **Rooms up to 25 (vs 8 free)** | `game-limits.ts` per-game caps, host-set. Ungated. | Gate `max_players` on create by plan. **Copy nuance:** cap is a *ceiling*, not a per-game rule — small games (Chess/Whot/etc.) are never capped; only games whose natural max > 8 are affected (Trivia 40, Bingo 30, Word Hunt/Rush 20, etc.). Page copy must say "up to its full player count, up to 8 on free," not a flat "rooms up to 8." |
| **Unlimited custom decks + CSV** | Full CSV + library exists, **no quota**, no per-user owner. | Add a per-user owner to saved decks; enforce a free-tier count; unlimited for +. |
| **Daily challenge archive + streaks** | ❌ Feature doesn't exist. Community leaderboards (day/week/month) exist as a base. | Net-new: see Phase 3. Today's challenge free, archive+streak gated. |
| **Premium/exclusive game packs** | Library/`question_packs` + `platform_content` exist. | Mark packs as premium; gate access; a "spicy/seasonal/early-access" pack concept. |
| **Trophy case + profile customization** | ❌ Trophies computed at runtime, not stored; no profile. | Net-new: persist trophies (needs accounts), build profile + cosmetics. |
| **More clubs / bigger clubs** | ❌ No clubs. | Depends on Phase 2. |

> **Dropped from launch:** "No ads" (no ad system exists, so nothing to remove) and "Priority TV-display mode" (perk undefined, no measurable win). Remove both from the pricing page copy too.

**Launch pricing mechanics also needed:** annual plan, "save ~44%" framing, and the **early-bird $14.99/yr locked-for-life** cohort offer → a coupon/grandfathering mechanism in Stripe + a way to keep that price on renewal indefinitely.

---

## Phase 2 — Clubs & Club Pro (net-new product, the retention engine)

Nothing here exists. `rooms` is ephemeral and token-based; clubs are persistent, accounts-backed groups.

- **Data model:** `clubs` (owner_id, name, branding: badge/colors/banner), `club_members` (role: owner/admin/member, joined_at). RLS on `auth.uid()`.
- **Membership limits by plan:** free = join 1 club; + = up to 3 clubs, larger sizes; Club Pro = up to 50 members. Enforce via entitlements.
- **Club Pro subscription** billed to the owner/admin ($7.99/mo/club) — a **club-scoped** subscription, not user-scoped (new shape in the billing model).
- **The anti-loophole rule (called out as critical in the pricing doc):** the flat club fee must **NOT** grant all members Fate Round+. Only the paying admin gets + bundled. Members get club-level perks (branding, club tournaments, club leaderboard, trophy-case visibility) only.
- **The 50%-off member discount** — the fiddliest billing logic in the whole model:
  - any member of an *active* Club Pro club can buy personal + at $1.49/mo,
  - discount **reverts to $2.99 at next renewal if they leave** the club (needs a membership-change → Stripe subscription-update hook),
  - **does not stack** across multiple Club Pro clubs — one discount per person, "member of any Club Pro club," never additive.
- **Club features:** branded club page, club-only private tournaments & leaderboards, club trophy case / hall of fame. Tournaments partly exist (`tournament-*.ts`) — needs a club-scoped variant.
- **Club Friendlies** (inter-club matches) — explicitly *under consideration, not in pricing yet*. Skip for v1.

---

## Phase 3 — Trophies + Daily Challenges (the habit-loop hooks that justify the sub)

These are the features the pricing doc leans on to make + worth buying (streak protection = the Wordle/NYT mechanic). Both are net-new and depend on accounts.

### Trophies (persistent)
- New `trophies` / `user_trophies` tables. Persist what `achievements.ts` / `community-achievements.ts` compute at runtime.
- Trophy case UI on the profile; rarity/flex framing. Gate showcase/cosmetics behind +.

### Daily challenges + streaks
- New daily-challenge scheduler (one puzzle/day per family — crossword/word games already have puzzle banks: `crossword-puzzles.ts`, `word-search-puzzles.ts`, `word-scramble-puzzles.ts`).
- **Today's challenge + today's leaderboard = always free** (the free daily touchpoint that drives return + sharing — never gate it).
- **Archive + streak history + streak protection = gated behind +.**
- Cross-day streak tracking per user (needs durable identity). Community leaderboard infra (`community-*.ts`, day/week/month windows) is a useful base but doesn't track streaks.
- See existing `docs/high-scores-leaderboards-plan.md` — overlaps heavily; reconcile with it.

---

## Phase 4 — Schools & Corporate (org accounts + seats + admin)

Highest-value segments, but they need an **organization/seat** layer on top of individual accounts.

- **Org model:** `organizations` (type: school/company), `org_members` (role: admin/teacher/member), org-level plan sets the ceiling → **one contract per org**, not per seat. Admin invites members.
- **Account-type flag at signup:** Personal vs Educator/School, independent of device/URL. Drives limits + content defaults.
- **Educator specifics:** safe-content mode **by default** (spicy/party games hidden) — currently safe-content is per-*game* (`game-maturity.ts`, `MatureGameGate.tsx`), not per-*account*. Needs an account-level content policy. Classroom free = 40 players (vs 8 personal).
- **Verification:** school/work email-domain auto-approve; manual review fallback (needed outside regions with standard school domains, e.g. Nigeria).
- **Corporate:** branded club w/ logo/colors/custom URL/subdomain, admin analytics dashboard, private tournaments, Slack/Teams/Zoom/Discord one-click launch integrations, seat minimums (10), annual billing.
- **Enterprise:** SSO, white-label (hide FR branding), AI-personalized content, contracts/PO/invoicing, dedicated AM. Mostly sales-led + contract flow, not pure self-serve.
- **Reporting/analytics:** "who played / participation rate" engagement reporting is net-new (we don't durably track per-user participation yet).

---

## Cross-cutting / do-not-forget

- **Anonymous play must stay free & frictionless.** The funnel depends on it — don't gate quick play behind login.
- **Invoicing/PO/annual contracts** for school+corporate are a *deal-blocker*, not a nice-to-have. Design the billing flow to support non-card payment early.
- **Web-only checkout, mobile is play-only.** All payment happens on the web; mobile just reads entitlements for a signed-in account. No in-app purchase or upgrade links (Apple/Google rules). This is decided — don't reintroduce mobile billing.
- **Grandfathering / early-bird lock-in** needs a real coupon + renewal-price-persistence mechanism, not a one-off discount.
- **RLS pattern shift:** paid/user-owned tables use `auth.uid()` RLS — different from the existing anon-token model across the rest of the DB. Keep the two identity worlds cleanly separated.

---

## Suggested build order (critical path)

1. **Accounts + Auth + `profiles`** (0.1) — unblocks literally everything.
2. **Billing + entitlements** (0.2, 0.3) — Stripe, subscriptions, plan-resolution service. Web checkout only; mobile reads entitlements.
3. **Fate Round+ gates** (Phase 1) — cheapest wins; mostly gating features that already exist (player caps, custom-deck quota, premium packs). Ship the first paid tier.
4. **Trophies + Daily challenges** (Phase 3) — the retention hooks that make + actually worth renewing.
5. **Clubs + Club Pro** (Phase 2) — net-new product + the tricky discount/anti-loophole billing logic.
6. **Schools + Corporate orgs** (Phase 4) — org/seat layer, content policy, verification, sales-led billing.

Phases 3–6 can reorder based on which segment we go after first, but **1 → 2 → 3 (first paid tier)** is fixed.
