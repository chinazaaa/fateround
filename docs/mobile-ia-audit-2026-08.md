# Mobile information architecture — Profile & Home (2026-08)

Prompted by: _"a lot of things are on the profile page… even on the Home screen there's a lot,
just making sure we maintain premium UI/UX."_

This is an audit of what those two screens actually carry today, measured against web, plus a
recommended structure. No code changed.

---

## 1. Where settings live on each platform

Web has one place: `/profile` with three tabs — **Trophies**, **Stats & History**, **Settings**
(`src/app/profile/page.tsx:50-52`). One destination, three views.

Mobile has **three** places, and none of them is called Settings:

| What                                       | Where on mobile                                     | Kind                     |
| ------------------------------------------ | --------------------------------------------------- | ------------------------ |
| Appearance, Sound effects, Notifications   | ⚙ `SettingsButton` → `SettingsSheet` (Home top bar) | device (SecureStore)     |
| Display name, Voice-chat default, Sign out | bottom of `/profile`, `AccountSettingsSection`      | account (`profiles` row) |
| "Not you? Switch", "Save to profile"       | `ProfileChip` sheet (Home top bar)                  | identity                 |

The device/account split is deliberate and correct — web splits the same way. The problem is
that a player doesn't hold that distinction in their head. They think "settings", and there is
no single door. Two of the three doors sit next to each other in the Home top bar and open
different sheets.

**This is the bigger issue, ahead of crowding.** Crowding is uncomfortable; three doors for one
mental model means people simply don't find things.

## 2. What `/profile` carries

One continuous scroll (`app/profile.tsx`):

1. Header card — avatar, handle, signed-in/guest hint
2. Four stat tiles — Trophy points, Level, Current streak, Best streak
3. Streak at-risk card (conditional)
4. **Your games** — per-game trophy rows
5. **Settings** — display name, voice chat, sign out

Items 1–4 are web's _Trophies_ tab. Item 5 is web's _Settings_ tab. They are stacked with
nothing between them but a heading, so account settings sit below an arbitrarily long list of
games — the more games a player has, the further sign-out drifts.

**Web's Stats & History tab has no mobile equivalent at all.** `StatsTab` exists on web
(`src/components/profile/StatsTab.tsx`); mobile has no stats or match-history surface anywhere.
So mobile is simultaneously _crowded_ on one axis and _missing a third of the screen's purpose_
on another.

## 3. What Home carries

In order (`app/index.tsx`):

1. Top bar — ⚙ + ProfileChip
2. Hero — kicker, logo, tagline
3. Join-a-game card (code input + Join)
4. **Four full-width stacked buttons** — Create a game · Daily Challenges · Leaderboards ·
   Practice vs bot (`styles.actions` is `alignItems: 'stretch'`, so these are four full-width
   rows, not a grid)
5. `SubscribeHomeBanner` (conditional)
6. `YourUpcomingGamesStrip`
7. `BrowseGamesList` — 5-item preview + See all
8. **Recent** — games you actually played

The ordering is the real finding: **a returning player's Recent games sit below a five-item
browse list.** For anyone past their first session, Recent is the highest-intent block on the
screen and it is last. The four stacked buttons also consume a full screen height between the
join card and anything personalised.

---

## Recommendation

Three changes, in the order I'd do them. The first fixes the discoverability problem, the second
the crowding, the third is ordering.

### A. One Settings destination

Promote the ⚙ sheet into a real `/settings` screen carrying **both** groups — device
preferences (appearance, sound, notifications) _and_ account settings (display name, voice-chat
default, sign out) — with the account/device split kept as two labelled sections inside it, as
web does inside its Settings tab.

Then remove `AccountSettingsSection` from `/profile`, and reduce the ProfileChip sheet to what
it is actually for: signing in and saving a guest profile.

Result: ⚙ means settings, everywhere, always. `/profile` stops carrying sign-out below a game
list.

### B. Give `/profile` web's three tabs

Trophies · Stats · Settings-link. Tabs at the top of a profile are a standard mobile pattern
and it matches web exactly, which makes the two platforms describable in one sentence. This is
also the natural home for the **missing Stats & History** surface — worth building on its own
merits, and a tab gives it somewhere to go that costs no extra screen.

If (A) ships, the third tab can be a single row that opens `/settings` rather than duplicating
it.

### C. Reorder Home around intent

Move **Recent** and **Your upcoming games** above the browse preview, and collapse the four
stacked buttons into a 2×2 tile grid. Roughly:

> hero → join card → 2×2 actions → upcoming → recent → browse preview → subscribe banner

That halves the distance to the two blocks a returning player came for, and keeps discovery
(browse) below the things they already have.

---

## Not recommended

- **A bottom tab bar.** It would fix navigation depth, but Home is deliberately a single
  focused funnel ("join with a code") and a persistent tab bar competes with that. The join
  card is the product's front door; it should stay the loudest thing on the screen.
- **Moving trophies off `/profile`.** They are the reason the screen exists.
