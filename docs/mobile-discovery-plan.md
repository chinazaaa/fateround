# Mobile Discovery — Plan

> Status: **Plan only, nothing built.** Companion to
> [`mobile-revamp-plan.md`](./mobile-revamp-plan.md). Scopes the
> "how do I know a Monopoly game is happening?" problem the parity
> revamp deliberately left unsolved.

## What this plan is (and isn't)

**Scope: solve the cold-start problem for multi-player games.** A user
wants to play Monopoly. Monopoly is fun with 6 people. They don't
have 6 friends online right now — today the only fallback is a bot
game. This plan gives that user a way to *find* games other people
just created (the ones they'd currently open at
`fateround.com/create?type=monopoly` or the mobile Create screen),
and (opt-in) get pinged when a game they'd want opens.

Not in scope:
- A friends graph (the plan explicitly ships without one — anyone
  with the app can see any discoverable game).
- Matchmaking / skill-based sorting. Games are a bare list; the
  player picks.
- Any change to the invite-by-code flow. Private games still work
  identically.
- Chat inside a game before it starts. That's a separate feature.

## Terminology

Throughout: **game** = one instance of a match a host created via
`/create` (a row in the `games` table, identified by a `game_code`
like `ABCD12`). Not "room." Whatever a Monopoly game with 6 seats
is, it's a game.

## Load-bearing invariants (do not relax)

- **Private by default.** A newly-created game is invitation-only
  unless the host explicitly flips **Discoverable** during create.
  This is the whole reason we can ship "anyone with the app can
  browse games" without users getting angry that strangers joined
  their party night. The default protects the current behaviour;
  the opt-in enables the new one.
- **No permission asks on cold start.** The plan already forbids
  login-first (see revamp plan); we extend it to "no notification
  permission on first launch." Push is asked for only after the
  user opens the subscriptions page and toggles a game type on. A
  cold-open permission prompt is the fastest way to lose future
  notification reach.
- **Per-game-type subscription — never all games at once.** A user
  who wants Monopoly pings doesn't want 50 different push channels
  spamming. The subscribe page lists every game type with a per-row
  toggle; nothing is on by default.
- **Web push requires PWA install on iOS.** iOS 16.4+ only delivers
  web push to sites the user has "Add to Home Screen"-installed.
  The subscribe page tells iOS users this inline. Non-iOS web works
  without the install step.

## Why this is a plan, not a single PR

Three feature-sized surfaces that stack on each other:

1. **Live games feed** — a public "who's playing right now" list.
   No push, no PWA, no new permissions. Just discovery.
2. **Push subscriptions** — per-game-type notifications when a
   Discoverable game opens. Reuses the existing Expo push infra on
   mobile; needs VAPID + a service worker on web.
3. **Scheduled games** — a host schedules "Monopoly at 8pm", people
   RSVP, and everyone (subscribers + RSVPers) gets a ping ~15 min
   before it starts.

Doing them in one PR means one landing that can regress any of three
things. Sequencing lets each phase produce standalone value AND
prove demand before spending on the next one.

## What already exists (baseline)

- **Game create + join.** Every game type already has a create
  screen (`/create?type=<game>` on web, `apps/mobile/app/create.tsx`
  on mobile) and a join-by-code flow.
- **Expo push registration.** `apps/mobile/lib/push-notifications.ts`
  already handles the mobile permission prompt, token registration,
  and per-game mute. Adds one new subscription category on top of
  what's there today (turn alerts + community pings).
- **A community leaderboard.** Web + mobile can see who won what
  yesterday. Adjacent surface; discovery lives next to it in the app.
- **Game-type metadata.** `lib/game-type-meta.ts` and the shared
  `batch-N-games` files already hold the display name, emoji, and
  category for every game type — enough to render a subscribe page
  and a live-game card without any new metadata.

## What's missing (the gap this plan closes)

1. **A "Discoverable" toggle** on the create screen, off by default.
2. **A public feed endpoint** — `GET /api/games/live` — returns
   currently-open Discoverable games with game code, game type,
   host display name, and current/max player count. Public read;
   no auth.
3. **A live-games feed surface** on the mobile home screen (and web
   home / community page), showing 0–N games with a Join button.
4. **A subscribe screen** — one row per game type, toggle on/off.
   Persists to `notification_subscriptions` (new table).
5. **A server webhook** fired on game create + first Discoverable
   opt-in — enqueues a push job per subscriber whose subscription
   matches the game type. Deduped and rate-limited per subscriber.
6. **iOS PWA push plumbing** — VAPID keys, service worker, and the
   Add-to-Home-Screen tip on the subscribe page for iOS Safari.
7. **Scheduled game support** — a new `scheduled_at` column on
   `games`, an RSVP table, and a T-15min reminder push.

## The load-bearing decision: feed-first or push-first?

Push-first assumes people know they want to be pinged. They don't;
they've never seen the feature. Feed-first shows them "there IS a
Monopoly game open right now" as a real, tappable thing on the home
screen. Once they've joined one that way, offering a "want a ping
next time?" nudge is a much easier sell.

Also: feed-only has zero permission asks and zero server-push
infrastructure. It ships in 1–2 weeks; push adds another 2–3.

**Recommendation: feed first.** Push follows once the feed proves
people want the discovery.

## Phased plan

Each phase ships as its own PR chain (or single PR when small), and
delivers standalone value.

### Phase A — Live games feed (1–2 weeks)

The lowest-risk half. Read-only on the server; a small home-screen
surface on the client. No new permissions.

- Add `discoverable: boolean` column to `games`. Default false.
- Create wizard (both web `/create` and mobile): **Discoverable**
  toggle in the game settings panel, strong copy for party games
  (Monopoly, Whot, Ludo) that need >2 players ("More people can
  find and join your game"). Toggle DISABLED for solo mode. Toggle
  is a no-op for 1v1 games where matchmaking makes less sense
  (chess, checkers, tic-tac-toe).
- New endpoint `GET /api/games/live?game_type=&limit=`. Returns
  active games where `discoverable = true` AND `status = 'waiting'`
  AND `current_players < max_players`. Ordered by newest.
- Mobile home: "Live games" section between Create and Recent,
  scrollable card per game (game emoji + label, host name, N/max
  players, Join button). Refreshes on focus + pull-to-refresh.
- Web home + `/leaderboard/community` page: same section, shared
  API. Existing web surfaces already assume public games — this
  is additive.

**Success:** a user with the app can see, without any setup, that
someone just opened a Monopoly game and tap in.

### Phase B — Push subscriptions (2–3 weeks)

Layer notifications on top of the feed for users who want ambient
pings when they're not in the app.

- New table `notification_subscriptions (user_id, game_type,
  channel)` where channel is `mobile` or `web`.
- New route `/notifications` in both apps: per-game-type toggle
  list. Each row shows: emoji, label, "N games today" from the last
  24h. Toggling ON asks for permission the FIRST time only.
- iOS Safari on the web `/notifications` page: renders an inline
  "Add to Home Screen for pings" tip when detected as
  non-standalone iOS. Toggle stays visible but greyed until installed.
- Server: on game create where `discoverable = true`, enqueue push
  to every matching subscriber. Rate limit: at most 1 push per
  subscriber per game type per 30 minutes (avoid spam from a host
  spamming create).
- One-time in-app nudge: after the user's first successful game
  JOIN (not on cold open), a small SurfaceCard on home says "Want a
  ping when new Monopoly games open? Subscribe →". Dismissible;
  never fires again.
- **Quiet / available hours.** A single per-user time window at the
  top of the Notifications screen, plus a mode segmented control:
    - **Quiet hours** — "Don't ping me between 9:00 AM – 5:00 PM."
      (Natural for someone carving work out of a default-reachable day.)
    - **Available hours** — "Only ping me between 6:00 PM – 11:00 PM."
      (Natural for someone with an irregular schedule who wants to
      opt IN to specific windows.)
  Same two fields, same storage, just an interpretation flip driven by
  the mode. Users pick whichever framing matches how they think about
  their schedule.

  Pushes falling outside the allowed window are DROPPED, not queued
  — a Monopoly game happening at 2pm is already over by 6pm;
  delivering a stale ping is worse than nothing. Times are stored in
  the user's local timezone (captured on toggle) so a device that
  changes timezone doesn't silently shift the window. Defaults off
  (all pings delivered) until the user picks a mode.
- Web: VAPID keys generated once, service worker registered on the
  `/notifications` page, service-worker file already partially
  exists per `apps/mobile` context (verify + extend).

**Success:** a user subscribes to Monopoly, closes the app, and
receives one push (not five) the next time a Discoverable Monopoly
game opens.

### Phase C — Scheduled games (2–3 weeks, do only after A+B ship)

Turns discovery from real-time into planned. Only worth doing after
A+B prove the demand.

- `games.scheduled_at TIMESTAMP` (nullable) + `games.status`
  extended with `scheduled`. A scheduled game shows the code + host
  but is not yet joinable-to-play; it's join-to-RSVP.
- New table `game_rsvps (game_id, user_id, rsvped_at)`.
- Create screen: **Schedule for later** section — date+time picker,
  timezone display. Only for Discoverable games.
- Live games feed: two tabs at the top — **Live now** (Phase A) and
  **Upcoming** (Phase C). Upcoming shows scheduled games with the
  RSVP button and a countdown.
- Server: T-15min reminder push to every RSVP + every subscriber
  whose game-type filter matches. T-0 auto-transitions the game
  from `scheduled` → `waiting`.
- Host cancellation: cancelling a scheduled game fires a "cancelled"
  push to RSVPers (single fan-out, not throttled — this one they
  need to know about).

**Success:** a host schedules Monopoly for 8pm, 4 people RSVP by
6pm, at 7:45pm everyone gets a "Monopoly in 15 min" push, at 8pm
the game opens and the RSVPers show up.

## Total estimate

| Phase | Estimate | Confidence |
|---|---|---|
| A — Live games feed | 1–2 weeks | High |
| B — Push subscriptions | 2–3 weeks | Medium (web PWA infra new) |
| C — Scheduled games | 2–3 weeks | Medium (RSVP + reminder scheduling new) |
| **Total** | **5–8 weeks** | **Medium** |

Ship A and stop if the metric (feed-driven joins / total joins) is
too low to justify B. Push infra is expensive to build for something
users don't use.

## Explicit non-goals

- **No friends system.** Deliberately shipping public-anonymous.
  Adding friends is a separate arc that would rewrite this feature.
- **No matchmaking.** No skill sorting, no auto-join. The user
  picks a game from a list.
- **No chat.** Games don't get pre-start chat here. That's separate.
- **No location filter.** Games are global; nobody is filtering
  Monopoly by continent.
- **No changes to the invite-by-code flow.** Private games stay
  private and work exactly as they do today.

## Risks + how we mitigate

1. **Discoverable-by-default confusion.** We're private-by-default
   for exactly this reason. If a party-game host wants strangers,
   they flip one toggle; if they don't, nothing changes.
2. **Notification fatigue kills reach.** Per-game-type subscription
   + 30-minute per-type rate limit + never asking for permission on
   cold open. If reach drops <50% after Phase B, revisit rate limit
   before adding more channels.
3. **iOS web push is a partial audience.** Only PWA-installed
   iOS Safari users receive web push. Plan surfaces this inline
   rather than pretending it's transparent. Mobile app users get
   the full experience regardless.
4. **Server push volume.** A viral moment (100 subscribers, host
   creates 5 games in a minute) could send 500 pushes. Rate limit
   is per-subscriber-per-type-per-30-min, so worst case per
   subscriber is 1 push. Server-side per-host quota (max 5 pushes
   sent by one host's games per hour) is an additional guard rail
   worth adding in Phase B.
5. **Feature discoverability.** People won't know Subscribe exists.
   Handled by the one-time post-first-join nudge, not a cold-open
   prompt.

## What I'll deliver at the end of each phase

- **Phase A:** working live-games feed on mobile + web home,
  Discoverable toggle on create, at least three real games opened
  by us in a day to prove the flow feels alive rather than empty.
- **Phase B:** a working notifications screen, per-game-type
  subscription, one push received end-to-end on mobile AND on web
  (PWA-installed iOS + Android + desktop).
- **Phase C:** end-to-end scheduled game — I open one, three of us
  RSVP, everyone gets the 15-minute reminder, the game opens.

## When to re-scope

Same rule as the revamp plan: if Phase A takes >2 weeks or Phase B
takes >4, stop and re-plan. Don't sink weeks into infrastructure
users don't use.
