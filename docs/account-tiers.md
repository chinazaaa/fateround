# Account Tiers — Guest, Account, Pro (+ Clubs)

Status: **Revised (Jul 2026)** · Companion to [`revenue-model.md`](./revenue-model.md) ·
[`trophies-and-streaks.md`](./trophies-and-streaks.md)

This document defines the three tiers of FateRound identity and how tournaments, trophies,
and clubs fit. It answers: **if the game works without an account, why would anyone sign up?**

---

## Core principles (non-negotiable)

1. **Guest play stays pristine, forever.** Tap a link, type a name, you're in. Joining,
   hosting, and tournaments work with no account.
2. **Every tier is strictly additive.** We never make the free/guest default worse to push upgrades.
3. **Ask for signup at the moment of earned value, never at the door.** Win a trophy, break
   a streak, finish a tournament, or tap "buy" — not at lobby join.
4. **Cosmetic-only money.** Pro adds host *convenience*; cosmetics add *self-expression*.
   Trophies and streaks are *earned*, never bought.
5. **Accessibility is never premium.** Language editions, readable themes, etc. stay free.

---

## The three tiers at a glance

| Capability | **Guest** | **Account** (free) | **Pro** (paid host) |
|---|:---:|:---:|:---:|
| Join any room or tournament by code | ✅ | ✅ | ✅ |
| Host public/private rooms & tournaments | ✅ | ✅ | ✅ |
| Play + spectate | ✅ | ✅ | ✅ |
| Late-join / resume mid-game | ✅ | ✅ | ✅ |
| Voice chat | ✅ | ✅ | ✅ |
| Custom questions in lobby | ✅ | ✅ | ✅ |
| **Free room themes** (Default + 2–3) | ✅ | ✅ | ✅ |
| Share results / QR | ✅ | ✅ | ✅ |
| Earn trophies & streaks | 🔸 this device only | ✅ synced | ✅ synced |
| **Persistent profile** (name, avatar, bio) | — | ✅ | ✅ |
| **Stats, game & tournament history** | — | ✅ | ✅ |
| **Daily challenge + streaks** 🔥 | — | ✅ | ✅ |
| **XP / level / achievements** | — | ✅ | ✅ |
| **Buy & own cosmetics** | — | ✅ | ✅ |
| **Friends list + rematch** | — | ✅ | ✅ |
| **Join & create Clubs** (≤20) | — | ✅ | ✅ |
| **Cross-device + claim guest history** | — | ✅ | ✅ |
| **Return notifications** | — | ✅ | ✅ |
| Raised player caps | — | — | ✅ |
| 2 concurrent rooms / tournaments | — | — | ✅ |
| Monopoly add-time / Scrabble time-extend | — | — | ✅ |
| Tournament: unlimited playlist + custom points | — | — | ✅ |
| Higher round / team counts | — | — | ✅ |
| Custom timers, vanity codes, larger imports | — | — | ✅ (Phase 2+) |
| **Pro badge** | — | — | ✅ |

> **Pro requires an Account.** You can't own a ₦1,000 unlock or a cosmetic as a ghost.
> **Guest ⊂ Account ⊂ Pro.**

> **Premium room themes, skins, frames, and seasonal drops are NOT Pro perks.** Any account
> can buy them. See [Cosmetics ≠ Pro](#cosmetics--pro-important) below.

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

**What they don't get:** cross-device persistence, owned cosmetics, friends, clubs, Pro.

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
- **Owning cosmetics** — themes, skins, frames. **No Pro required.**
- **Friends + rematch** — "play again with the same crew."
- **Clubs** — persistent teams (see below).
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

## Tier 3 — Pro (paid, host-focused)

**Pro is host utility — not cosmetics, not trophies, not tournament entry.**

One-time **₦1,000** (Nigeria) / **$2** (international). Forever. Per
[`revenue-model.md`](./revenue-model.md).

**Phase 1 launch set:**

- Monopoly add-time + Scrabble time-extension (mid-game conversion moments)
- Raised player caps (where `max` > `default`)
- 2 concurrent rooms or tournaments
- Tournament: unlimited playlist games + custom placement points
- Higher round/team counts (Trivia, Describe It)
- Pro badge

**Phase 2+:** vanity codes, spectator slots, custom timers, larger imports, saved question
packs, tournament history on profile.

**Explicitly not Pro:** premium themes, skins, seasonal drops, profile frames, extra streak
freezes, early access to game modes, priority support.

---

## Cosmetics ≠ Pro (important)

| | Pro (₦1,000) | Cosmetics (₦200–1,200 each) |
|---|:---:|:---:|
| Who can buy | Hosts only | **Any account** |
| What it is | More power, longer games, bigger rooms | Look good — themes, skins, frames |
| Repeatable? | No — buy once | **Yes** — many items, seasonal drops |
| Required to play? | No | No |

- Free accounts get **Default + 2–3 room themes**. Premium themes are shop items.
- A player who never hosts can still buy a chess skin or Detty December theme.
- **Room themes:** host picks; everyone in the room sees it. Host buys premium themes to
  style game night.
- **Component skins:** player-owned; board local, tokens synced (see revenue doc).

This is the biggest sustainability lever: **~8 players per room, 1 host.**

---

## Tournaments

**Shipped** — brackets & head-to-head across competitive game types.

| Capability | Guest | Account | Pro |
|------------|:---:|:---:|:---:|
| Join a tournament | ✅ | ✅ | ✅ |
| Host a tournament (≤5 games in playlist) | ✅ | ✅ | ✅ |
| Host unlimited playlist games | — | — | ✅ |
| Custom placement-points array | — | — | ✅ |
| Vanity tournament code | — | — | ✅ (Phase 2) |
| Tournament history on profile | — | ✅ | ✅ |
| Earn tournament trophies | 🔸 local | ✅ synced | ✅ synced |
| Buy tournament podium / bracket cosmetics | — | ✅ | ✅ |

Tournaments are **free to play.** Pro sells host convenience; the shop sells styling.
Tournament wins and points are **never sold.**

---

## Trophies & streaks

Full build spec: [`trophies-and-streaks.md`](./trophies-and-streaks.md).

| Rule | Detail |
|------|--------|
| Earned, not bought | Trophies and streak progress come from playing |
| Guest can earn | Server-side via anonymous auth, but bound to this device; attaching an email makes it portable |
| Feeds revenue indirectly | Trophy unlock → signup prompt → cosmetic shop |
| Cosmetic tie-in | Profile frames, trophy showcase borders — optional flair |
| Streak freezes | Base forgiveness **free**; extra freeze = optional ₦300 cosmetic later |

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
| Join a club | Free account |
| Create a club (≤ 20 members) | Free account |
| Club crest / banner | Cosmetic purchase |
| Rosters > 20, vanity code, seasons/leagues | Pro or Club+ (later) |

**Decision:** clubs are **free until sticky.** Monetize crests and seasons later — retention
first.

---

## How a session upgrades through the tiers

```text
Guest plays / hosts / joins tournament
        │
        ├── earns trophy / streak ──▶ Account (claims guest history)
        │                                      │
        │                                 buys a skin ──▶ cosmetics
        │                                      │
        │                                 joins Club
        │
        └── hosts a lot, hits a wall ──▶ Pro (₦1,000)
```

Nobody is forced up a tier. Each step is opt-in at the moment of earned value.

---

## Decisions (locked)

1. **Free club size cap = 20 members.**
2. **Hosting is identical for Guest and Account until Pro.** Account = identity; Pro = power.
3. **Streak = any game played today** (not Daily-only).
4. **Guest-history claim / anonymous-retention window = 90 days** (revised up from 30 on
   2026-07-17 to unify with the trophies anon-retention window — one number, not two).
5. **Clubs free now; monetize crests/seasons later.**
6. **Premium themes are cosmetics, not Pro.** Free tier keeps 2–3 good themes.
7. **Tournaments free to play; Pro = host power only.**
8. **Trophies and streaks never sold.**
