# Account Tiers — Guest, Account, Pro (+ Clubs)

Status: **Proposal / discussion** · Companion to [`revenue-model.md`](./revenue-model.md)

This document defines the three tiers of FateRound identity and the Clubs layer that
sits across them. It exists to answer one question: **if the game works without an
account, why would anyone sign up?**

---

## Core principles (non-negotiable)

1. **Guest play stays pristine, forever.** Tap a link, type a name, you're in. Joining
   *and* hosting work with no account. This is the network-effect engine — never gate it.
2. **Every tier is strictly additive.** A higher tier only *adds* on top. We never make
   the free/guest default worse to push upgrades.
3. **Ask for signup at the moment of earned value, never at the door.** The prompt fires
   right after the user did something they'd hate to lose (a win, a streak, a purchase).
4. **Cosmetic-only money.** Nothing a paid tier unlocks gives a gameplay advantage. Pro
   adds host *convenience and ceilings*; cosmetics add *self-expression*. Skill is free.
5. **Accessibility is never premium.** Language editions, themes-for-readability, etc.
   stay free.

---

## The three tiers at a glance

| Capability | **Guest** (no signup) | **Account** (free signup) | **Pro** (paid, host unlock) |
|---|:---:|:---:|:---:|
| Join any room by code | ✅ | ✅ | ✅ |
| Host public/private rooms, all games | ✅ | ✅ | ✅ |
| Play + Watch (spectate) | ✅ | ✅ | ✅ |
| Late-join / resume mid-game | ✅ | ✅ | ✅ |
| Voice chat | ✅ | ✅ | ✅ |
| Custom questions in lobby | ✅ | ✅ | ✅ |
| Built-in room themes (free set) | ✅ | ✅ | ✅ |
| Share results / QR | ✅ | ✅ | ✅ |
| **Persistent profile** (name, avatar, bio) | — | ✅ | ✅ |
| **Stats & game history** | — | ✅ | ✅ |
| **Daily challenge + streaks** 🔥 | — | ✅ | ✅ |
| **XP / level / achievements** | — | ✅ | ✅ |
| **Buy & own cosmetics** (themes, skins) | — | ✅ | ✅ |
| **Friends list + rematch** | — | ✅ | ✅ |
| **Join & create Clubs** | — | ✅ | ✅ |
| **Cross-device + claim guest history** | — | ✅ | ✅ |
| **Return notifications** (streak nudge, etc.) | — | ✅ | ✅ |
| Raised player caps | — | — | ✅ |
| Multiple concurrent rooms (1 → 3) | — | — | ✅ |
| Monopoly add-time / Scrabble time-extend | — | — | ✅ |
| Higher round / team counts | — | — | ✅ |
| Unlock all room themes | — | — | ✅ |
| **Pro badge** | — | — | ✅ |
| Custom timers | — | — | ✅ |
| Vanity room codes | — | — | ✅ |
| Larger CSV imports | — | — | ✅ |
| Save & reuse question packs | — | — | ✅ |
| Spectator slots | — | — | ✅ |

> **Pro requires an Account.** You can't own a $2 unlock (or a cosmetic) as a ghost — it
> has to attach to *you*, not a browser cookie. So the hierarchy is literally
> **Guest ⊂ Account ⊂ Pro.**

---

## Tier 1 — Guest (no signup)

**Who:** anyone who taps a room link, or a one-off host setting up a single game night.

**What they get:** the entire core product. All 29 games, hosting, spectating, voice,
late-join, custom questions, the free themes, share cards. They are never blocked from
the thing FateRound exists to do.

**What they don't get:** anything that requires *remembering who they are* between
sessions — no streak, no saved stats, no owned cosmetics, no friends, no Pro.

**Why this tier matters:** it's the moat. Zero friction is why FateRound spreads in a
WhatsApp group. Guests are not "unconverted users" — they're the top of the funnel and a
permanently valid way to use the product.

---

## Tier 2 — Account (free signup)

The free account exists for one reason: **to keep things.** People don't sign up to
play — they sign up to *not lose* what they did.

**What only an account can give (impossible for a guest):**

- **A self that persists.** Profile, avatar, bio, and a running record: games played,
  win-rate, longest comeback, favourite game. Identity is what people get attached to.
- **The streak.** 🔥 A streak *cannot exist* without an account — it's the single
  strongest reason-to-return we'll have. **Any game played today keeps the streak alive**
  (not Daily-only); the Daily is just the guaranteed *solo* way to keep it when no friends
  are around.
- **XP, levels, achievements.** Progression that compounds across sessions
  (`achievements.ts` already exists — accounts make it mean something).
- **Owning cosmetics.** Buy a Chess board skin or a Detty December theme → it lives on
  your account and follows you everywhere. (Cosmetics are sold to *any* account — see
  note below; you do **not** need Pro to buy them.)
- **Friends + rematch.** "Play again with the same crew" requires the system to know who
  the crew is.
- **Clubs.** Create or join persistent groups (see Clubs section).
- **Claim your guest history.** Guest sessions are device-tagged; on signup we retro-
  actively attach them — "Welcome, we saved your last 6 games and your 3-day streak."
  Signup feels like *claiming*, not *starting over*.
- **Come-back notifications.** Streak-about-to-break, "your club is playing now,"
  seasonal drop live.

**Signup prompts (moment-of-value triggers):**

| Trigger | Prompt |
|---|---|
| Wins a game | "Nice win 🏆 Save it to your profile — keep your stats & streak." |
| Finishes first Daily | "Come back tomorrow. Sign in to keep your streak alive." |
| Goes to buy a cosmetic / Pro | (signup is inherent — can't sell to a ghost) |
| Repeat host finishes a great night | "Save this roster & questions so next time takes 10 seconds?" |
| Added to a Club by a friend | "Join the club to keep your spot and team history." |

---

## Tier 3 — Pro (paid, host-focused)

**Pro is a host account.** A one-time **$2 (₦1,500 via Paystack)** unlock that gives a
host more powers, ceilings, and convenience — forever. Per `revenue-model.md`, playing
stays free; only hosts ever *need* to pay, which preserves the network effect.

**What Pro adds (Phase 1 launch set):**

- Raised player caps
- Multiple concurrent rooms (1 → 3)
- **Monopoly add-time / Scrabble time-extend** — the mid-game "don't let the fun die"
  moments; the strongest conversion triggers
- Higher round / team counts (Trivia 3→25, Describe It 2→4 teams, etc.)
- Unlock all room themes
- Pro badge on profile

**Phase 2 fast-follows:** custom timers, vanity room codes, larger CSV imports,
save & reuse question packs, spectator slots.

**Phase 3 (long-term):** Monopoly house rules, full kick/skip controls, AI-generated
questions, custom voting categories, early access to new games, priority support.

(Full feature split, pricing by region, and guardrails live in `revenue-model.md`.)

---

## Cosmetics ≠ Pro (important)

Cosmetics are a **separate revenue line, sold to any Account** — not bundled into Pro.

- A free Account can buy a theme or skin without ever buying Pro.
- Cosmetics are **player-owned identity**, which is why they need an account, not Pro.
- Rendering rule (from revenue doc): board/background art renders locally (you see your
  own); tokens/pieces/crests sync globally (everyone sees yours).
- This is the biggest long-term lever because it's sold to *players*, not just hosts —
  and there are far more players than hosts.

So: **Pro = host powers. Cosmetics = anyone's self-expression.** Both require an account;
neither requires the other.

---

## Clubs — the persistent-team & "off-WhatsApp" layer

Clubs are named, persistent groups of accounts that play together over time. They're the
answer to two problems: **team games have no continuity** (you rebuild teams every
session), and **the community lives in WhatsApp, not in FateRound.**

**What a Club is:**

- A named group with a **crest/avatar** and a member roster (accounts).
- Built for the **team games**: Codewords, Describe It / text charades, team Trivia,
  Bingo nights, tournaments — anything where the same people form recurring teams.
- **Pre-set teams.** Start a Codewords or charades game and pull teams straight from club
  membership instead of assigning by hand every time.
- **Club leaderboard & seasons.** Recurring standings reset on a cadence — this is a
  liveliness engine (a reason to show up *this week*).
- **Club game history + chat.** The group's shared record lives in-app, not in a WhatsApp
  scroll.
- **Club tournaments / leagues.** Scheduled recurring competition between members or
  between clubs.

**Tier placement (proposed — open for decision):**

| Club capability | Tier |
|---|---|
| Join a club | Account (free) |
| Create a club (≤ 20 members) | Account (free) |
| Club crest / banner cosmetics | Cosmetic purchase (any account) |
| Rosters > 20, club vanity code, seasons/leagues | Pro or a future "Club+" |

**Why Clubs matter strategically:** they convert one-off team game nights into a
*standing rivalry with a scoreboard*, they give team games the continuity they currently
lack, and they're the vehicle that moves your community from a WhatsApp group into
FateRound itself. They also open a fresh cosmetics surface (crests, banners, club themes).

---

## How a session upgrades through the tiers

```text
Guest plays a few games  ──win/streak──▶  Account (claims guest history)
        │                                        │
        │                                   buys a skin ──▶ owns cosmetics
        │                                        │
        │                                   joins/creates a Club
        │                                        │
        └──── hosts a lot ───────────────▶  Pro ($2 host unlock)
```

Nobody is forced up a tier. Each step is opt-in, triggered the moment the user has
something worth keeping.

---

## Decisions (locked)

1. **Free club size cap = 20 members.** Covers any normal friend group, office squad, or
   crew without ever feeling stingy. Past 20 you're running a community/league — that's the
   serious use case worth a Club+/Pro upgrade.
2. **Hosting is identical to Guest until Pro.** A free Account gets no host upgrade — it
   only adds identity, history, and the social/cosmetic layer. Account = identity,
   Pro = power. No muddy middle tier.
3. **Streak = any game played today.** Not Daily-only. Punishing someone who played three
   games with friends but skipped the Daily is the fastest way to make streaks feel unfair
   and break them. The Daily remains the guaranteed *solo* way to keep a streak alive.
4. **Guest-history claim window = 30 days.** Long enough that someone who drifts back after
   a couple of weeks still gets the "we saved your stuff" moment; short enough to bound
   storage and stay clean on privacy.
5. **Clubs are free now; monetize crests/seasons later.** Retention first — clubs are too
   important to growth to tax early. Cosmetics (crests, banners, club themes) and
   seasons/leagues layer on top once clubs are sticky.
