# Account Tiers — Guest, Account, FateRound+ / Club Pro

Status: **Revised (Aug 2026) — realigned to the subscription pricing model.** Companion to
[`revenue-model.md`](./revenue-model.md) · [`trophies-and-streaks.md`](./trophies-and-streaks.md)

> **2026-08-02: this doc previously described a one-time "Pro" unlock (₦1,000, forever) plus
> an à-la-carte cosmetics shop as the primary revenue engine.** That model has been superseded —
> `revenue-model.md` is now a recurring subscription plan (**FateRound+** and **Club Pro**), not
> a one-time purchase. This doc has been realigned to match. Where the old "Pro" tier is
> referenced elsewhere in this repo, read it as **FateRound+** unless noted otherwise.

This document defines the tiers of FateRound identity and how tournaments, trophies, and clubs
fit. It answers: **if the game works without an account, why would anyone sign up — and why
would they pay?**

---

## Core principles (non-negotiable)

1. **Guest play stays pristine, forever.** Tap a link, type a name, you're in. Joining,
   hosting, and tournaments work with no account.
2. **Every tier is strictly additive.** We never make the free/guest default worse to push upgrades.
3. **Ask for signup at the moment of earned value, never at the door.** Win a trophy, break
   a streak, finish a tournament, or tap "upgrade" — not at lobby join.
4. **Subscription money, not pay-to-win.** FateRound+ and Club Pro sell *capacity, content,
   and persistence* (bigger rooms, unlimited custom decks, archives, branding). Trophies and
   streaks are *earned*, never bought, on every tier.
5. **Accessibility is never premium.** Language editions, readable themes, etc. stay free.

---

## The tiers at a glance

| Capability | **Guest** | **Account** (Free) | **FateRound+** | **Club Pro** (per club) |
|---|:---:|:---:|:---:|:---:|
| Join any room or tournament by code | ✅ | ✅ | ✅ | ✅ |
| Host public/private rooms & tournaments | ✅ | ✅ | ✅ | ✅ |
| Play + spectate | ✅ | ✅ | ✅ | ✅ |
| Late-join / resume mid-game | ✅ | ✅ | ✅ | ✅ |
| Voice chat | ✅ | ✅ | ✅ | ✅ |
| Custom questions in lobby | ✅ | ✅ | ✅ | ✅ |
| Share results / QR | ✅ | ✅ | ✅ | ✅ |
| Earn trophies & streaks | 🔸 this device only | ✅ synced | ✅ synced | ✅ synced |
| **Persistent profile** (name, avatar, bio) | — | ✅ | ✅ | ✅ |
| **Stats, game & tournament history** | — | ✅ | ✅ | ✅ |
| **Daily challenge** (today only) | — | ✅ | ✅ | ✅ |
| **Daily challenge archive + streak history** | — | — | ✅ | ✅ (via +) |
| **XP / level / achievements** | — | ✅ | ✅ | ✅ |
| **Trophy case + profile customisation** | — | 🔸 basic | ✅ full | ✅ (via +) |
| **2 / 4 saved templates per game** | — | 2 | 4 | 4 (via +) |
| **Friends list + rematch** | — | ✅ | ✅ | ✅ |
| **Join clubs** | — | unlimited | unlimited | unlimited |
| **Create clubs** | — | 1 | up to 3 | admin: unlimited |
| **Cross-device + claim guest history** | — | ✅ | ✅ | ✅ |
| **Return notifications** | — | ✅ | ✅ | ✅ |
| **Room player cap** | 8 | 8 | 25 | 25 (via +) |
| **Unlimited custom decks + CSV upload** | — | — | ✅ | ✅ (via +) |
| **Premium / seasonal game packs** | — | — | ✅ | ✅ (via +) |
| **Premium themes** | — | — | ✅ | ✅ (via +) |
| **Extended game clocks** (add-time) | — | — | ✅ | ✅ (via +) |
| **Club branding, private tournaments, hall of fame** | — | — | — | ✅ (admin only) |

> **FateRound+ requires an Account.** You can't hold a subscription as a ghost.
> **Guest ⊂ Account ⊂ FateRound+.** **Club Pro** is a club-scoped subscription paid by the
> club owner/admin, who gets FateRound+ bundled — see [Club Pro members ≠ FateRound+ members](#club-pro-members--faterounds-members-important)
> below for the anti-loophole rule.

---

## Tier 1 — Guest (anonymous)

**Who:** anyone who taps a room link, joins a tournament, or hosts a one-off game night.

**What they get:** the entire core product — all game modes, tournaments, voice, spectating,
free themes, custom questions. Trophies and streaks accrue against a real **server-side**
`profiles` row, created by Supabase anonymous auth (see [`trophies-and-streaks.md`](./trophies-and-streaks.md)).

> Earlier drafts described guest progression as "on-device" / "🔸 local". That was misleading:
> the data lives on the server exactly as it does for an account. What a guest lacks is not
> storage but **portability** — the anonymous session in local storage is the only key to that
> profile, so it cannot follow them to another device, and losing it loses the progress. That
> is precisely what attaching an email fixes.

**What they don't get:** cross-device persistence, a trophy case, friends, clubs, FateRound+.

**Why this tier matters:** zero friction is why FateRound spreads in WhatsApp groups. Guests
are not "unconverted users" — they're the top of the funnel.

---

## Tier 2 — Account (free signup)

People sign up to **not lose things**, not to play.

**What only an account gives:**

- **A self that persists** — profile, avatar, stats, game + tournament history.
- **Frictionless join** — never re-type your name or re-pick your avatar. Guests fill the name
  field on every join; a logged-in player joins/hosts in one tap as themselves, using the name,
  avatar, and preferences saved on their profile. (Small everyday payoff that makes signup worth it.)
- **Trophies & Trophy Level** — synced across devices. Full spec:
  [`trophies-and-streaks.md`](./trophies-and-streaks.md).
- **The streak** 🔥 — any game or Daily Challenge today keeps it alive (not Daily-only).
- **XP, levels, achievements** — `achievements.ts` per-game badges + account progression.
- **A basic trophy case** — full customisation (rare trophies, badges, cosmetic flair) is a
  FateRound+ perk; a free account can still see and earn everything, just without the
  showcase polish.
- **Friends + rematch** — "play again with the same crew."
- **Clubs** — join unlimited, create 1 free (see below).
- **Claim guest history** — 90-day window; signup feels like *claiming*, not starting over.
- **Come-back notifications** — streak nudge, new Daily, seasonal drop live.

**Signup prompts (moment-of-value):**

| Trigger | Prompt |
|---------|--------|
| Earns a trophy | "🥉 Save this to your profile — don't lose it." |
| Wins a game | "Nice win 🏆 Save your stats & streak." |
| Finishes a tournament | "You placed #2 — save your standing." |
| Streak day 2+ | "Come back tomorrow. Sign in to keep your 🔥 alive." |
| Goes to buy cosmetic / Pro | (signup inherent) |
| Repeat host ends a great night | "Save this roster for next time?" |
| Added to a Club | "Join to keep your spot and team history." |

**Login = signup.** One door: email + 6-digit code. Never label it "Sign up" at the door.
See [`trophies-and-streaks.md`](./trophies-and-streaks.md) §2.

---

## Tier 3 — FateRound+ (paid, individual)

**FateRound+ is for people who host regularly and want their content and record to persist.**

**₦1,000/mo · ₦7,500/yr** (£2.49 / £19.99 · $2.99 / $19.99). Recurring subscription — cancel
any time. Per [`revenue-model.md`](./revenue-model.md).

**Launch set:**

- Rooms up to 25 players (vs 8 free)
- Unlimited custom decks + CSV upload (the hero feature — see revenue doc's reasoning)
- Daily challenge archive + streak history
- Premium and seasonal game packs
- Trophy case and profile customisation
- Premium themes
- Extended game clocks (Monopoly add-time, etc.)
- Join unlimited clubs · create up to 3, larger club sizes
- 4 saved templates per game (vs 2 free)

**Explicitly not in launch copy:** "no ads" (no ad system exists to remove), "priority
TV-display mode" (undefined, unshipped). Never sell a tier whose feature list includes
things that don't exist.

---

## Club Pro members ≠ FateRound+ members (important)

| | Club Pro admin (₦3,000/mo/club) | Regular club member |
|---|:---:|:---:|
| Who pays | The club owner/admin only | Nobody — free |
| What they get | FateRound+ bundled + branding + private tournaments + up to 50 members + hall of fame + priority support | Access to the club's page/tournaments/leaderboard; their personal account stays Free |
| Upgrade discount | N/A (already has +) | 50% off FateRound+ (₦500/mo) while an active member; reverts on leaving; does not stack across clubs |

> **Anti-loophole rule — load-bearing, do not relax.** A flat club fee must **never**
> auto-grant every member full FateRound+. 50 members getting + at ₦60/head would destroy the
> individual tier. Only the paying admin gets + bundled; everyone else gets club-level perks
> and, at most, the 50%-off personal-upgrade discount.

---

## Tournaments

**Shipped** — brackets & head-to-head across competitive game types.

| Capability | Guest | Account | FateRound+ |
|------------|:---:|:---:|:---:|
| Join a tournament | ✅ | ✅ | ✅ |
| Host a tournament (≤5 games in playlist) | ✅ | ✅ | ✅ |
| Host unlimited playlist games | — | — | ✅ |
| Custom placement-points array | — | — | ✅ |
| Tournament history on profile | — | ✅ | ✅ |
| Earn tournament trophies | 🔸 local | ✅ synced | ✅ synced |

Tournaments are **free to play.** FateRound+ sells host convenience and persistence.
Tournament wins and points are **never sold.**

---

## Trophies & streaks

Full build spec: [`trophies-and-streaks.md`](./trophies-and-streaks.md).

| Rule | Detail |
|------|--------|
| Earned, not bought | Trophies and streak progress come from playing, on every tier |
| Guest can earn | Server-side via anonymous auth, but bound to this device; attaching an email makes it portable |
| Feeds revenue indirectly | Trophy unlock → signup prompt → FateRound+ upsell (full trophy case, streak archive) |
| Trophy case tie-in | Full customisation, rare trophies, badges — FateRound+ perk; earning is always free |
| Streak freezes | Base forgiveness **free** on every tier; the streak **archive/history** is what's gated behind FateRound+ |

**Division of labour:**

| System | Rewards | Cadence |
|--------|---------|---------|
| Trophies | Depth within a game + platform milestones | Per session |
| Streak | Coming back at all | Daily |
| `achievements.ts` | Fun one-off callouts in a finished game | Per round |

---

## Clubs — persistent teams

Named groups for recurring crews. Moves community off WhatsApp.

**What a Club is:**

- Named group with crest/avatar and member roster
- Pre-set teams for Codewords, Describe It, team Trivia, Bingo nights
- Club leaderboard & seasons (recurring standings)
- Club game history
- Club tournaments / leagues

| Club capability | Tier |
|-----------------|------|
| Join clubs | **Unlimited, every tier** |
| Create clubs | Free: 1 · FateRound+: up to 3 · Club Pro admin: unlimited |
| Club branding, private tournaments, up to 50 members, hall of fame | Club Pro (admin-paid) |

> **Decided 2026-08-02 — join unlimited, cap creation.** Confirms and sharpens the 2026-07-31
> call: **joining is never capped, on any tier.** Capping joins taxes the wrong person — a
> free member invited into a friend's club didn't create or consume anything, so blocking them
> is an arbitrary paywall that degrades the *inviter's* club too (smaller, less active) and
> kills FateRound's best distribution loop (invites) at the exact moment a new user is most
> engaged. The real cost — storage, moderation surface, branding slots, admin tooling — sits on
> **creation**, so that's the lever. Free creation is tightened from 2 → **1**: at 2, a second
> club is a weak upgrade trigger nobody hits; at 1, wanting a second (family vs. work, say)
> is a real, self-caused wall the user understands, and 1 → 3 reads as a clear step up where
> 2 → 3 barely registers. Side effect: unlimited joining also means more free users land inside
> a Club Pro club, which is what feeds the 50%-off FateRound+ member-upgrade funnel — Free-caps-
> joining would have shrunk that funnel instead. [`clubs-spec.md`](./clubs-spec.md) §11
> decision #2 is updated to match — this is now the single number, don't re-open it without a
> new reason.

**Decision:** join is unlimited on every tier; creation is the paid-tier lever (Free 1 →
FateRound+ 3 → Club Pro branding/50 members, admin-created). Crests/branding are bundled into
Club Pro, not sold separately.

---

## How a session upgrades through the tiers

```text
Guest plays / hosts / joins tournament
        │
        ├── earns trophy / streak ──▶ Account (claims guest history)
        │                                      │
        │                                 joins unlimited clubs / creates 1 free
        │
        └── hosts a lot / wants custom decks ──▶ FateRound+ (₦1,000/mo)
                                                          │
                                              runs a community ──▶ Club Pro (₦3,000/mo, admin pays)
```

Nobody is forced up a tier. Each step is opt-in at the moment of earned value.

---

## Decisions (locked)

1. **Free club roster cap = 20 members. Joining clubs is unlimited on every tier; free club
   *creation* = 1** (sharpened from 2 on 2026-08-02 — see §Clubs above).
2. **Hosting is identical for Guest and Account until FateRound+.** Account = identity;
   FateRound+ = capacity + content + persistence.
3. **Streak = any game played today** (not Daily-only); the streak *archive* is what's gated.
4. **Guest-history claim / anonymous-retention window = 90 days** (revised up from 30 on
   2026-07-17 to unify with the trophies anon-retention window — one number, not two).
5. **Clubs are a paid-tier lever** (count) **but never a cosmetics shop** — no separate crest
   purchases; branding ships bundled into Club Pro.
6. **Premium themes are a FateRound+ perk**, not a separate purchase. Free tier keeps a
   default set of themes.
7. **Tournaments free to play; FateRound+ = unlimited playlist + custom points.**
8. **Trophies and streaks never sold** — earning them is free on every tier; FateRound+ only
   gates the case/archive polish.
