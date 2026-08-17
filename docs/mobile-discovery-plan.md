# Mobile Discovery — Plan

> Status: **Plan only, nothing built.** Companion to
> [`mobile-revamp-plan.md`](./mobile-revamp-plan.md). Scopes the
> "how do I know a Monopoly game is happening?" problem the parity
> revamp deliberately left unsolved.

## What this plan is (and isn't)

**Scope: solve the cold-start problem for multi-player games.** A user
wants to play Monopoly. Monopoly is fun with 6 people. They don't
have 6 friends online right now — today the only fallback is a bot
game. This plan makes it easy for that user to *find* games other
people just created (the ones a host opens via `/create?type=…` on
web or the mobile Create screen), and (opt-in) get pinged when a
game they'd want opens.

Not in scope:
- A friends graph (the plan explicitly ships without one — anyone
  with the app can see any public game).
- Matchmaking / skill-based sorting. Games are a bare list; the
  player picks.
- Any change to the invite-by-code flow. Private games still work
  identically.
- Chat inside a game before it starts. That's a separate feature.

## Terminology

Throughout: **game** = one instance of a match a host created via
`/create` (a row in the `games` table, identified by a `game_code`
like `ABCD12`). Not "room."

The public/private flag on a game is called **`is_public`** in the
DB (and `isPublic` on API request bodies + client state), and
**Public** in user-facing UI copy. The plan uses "Public" in copy
and `is_public` when referring to the column.

## Load-bearing invariants (do not relax)

- **Private by default.** A newly-created game is invitation-only
  unless the host explicitly flips the **Public** toggle during
  create. This is the whole reason we can ship "anyone with the app
  can browse games" without users getting angry that strangers
  joined their party night. Today's default already matches this
  (`isPublic: false` in both web `/create` state and mobile
  `create-settings.ts`); the plan preserves it.
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

## What already exists (baseline)

Way more than the first draft of this plan assumed. The core
public-games plumbing is done on web; discovery on mobile is where
almost all the new work lives.

**Web (done):**
- `games.is_public: boolean` column, default false.
- `POST /api/games` accepts `isPublic` on create.
- **Create screen** (`/create?type=…`, `src/app/create/page.tsx`)
  already has a "Public game" segmented control (Private / Public)
  in the room-settings panel.
- **`GET /api/games`** — cursor-paginated public games feed, backed
  by a supabase-realtime subscription so it self-refreshes.
- **`/browse`** — full public games list at
  `src/app/browse/page.tsx`, backed by
  `src/components/browse/BrowseGamesPage.tsx`. Realtime + poll
  fallback + pagination + status labels.

**Mobile (done):**
- Universal lobby fields render the same **Public** segmented
  control (`components/create/UniversalLobbyFields.tsx`) so the
  toggle is already in the mobile create wizard.
- Host lobby settings sheet + host controls sheet expose the toggle
  post-create (`HostLobbySettingsSheet.tsx`, `HostControlsSheet.tsx`).
- Expo push registration + per-game mute
  (`apps/mobile/lib/push-notifications.ts`).

**Cross-platform (done):**
- Game-type metadata (`lib/game-type-meta.ts`, `batch-N-games.ts`) —
  enough to render a subscribe page and a game card without new data.
- Community leaderboard on both platforms — adjacent surface for
  discovery cross-links.

## What's missing (the gap this plan closes)

1. **A mobile `/browse` screen.** Zero discovery on mobile today —
   users can't see any public game from the phone even though the
   feed endpoint is live.
2. **A home preview section on both platforms.** Discovery is one
   URL away today; a preview strip on `/` puts it in front of every
   user without a click.
3. **Host nudges toward Public** at create time and in the lobby —
   the toggle exists but is easy to miss.
4. **A subscribe screen** — one row per game type, toggle on/off.
   Persists to `notification_subscriptions` (new table).
5. **A server webhook** fired when a game flips to `is_public =
   true` (whether at create or later in the settings sheet) —
   enqueues a push job per subscriber whose subscription matches
   the game type. Deduped, rate-limited, and gated on quiet hours.
6. **iOS PWA push plumbing** — VAPID keys, service worker, and the
   Add-to-Home-Screen tip on the subscribe page for iOS Safari.
7. **Scheduled game support** — `games.scheduled_at`, an RSVP
   table, and a T-15min reminder push.

## The load-bearing decision: feed-first or push-first?

Web has the feed backend already; a mobile browse screen ships in
days, not weeks. Push is a bigger build (per-type subscription
table + web VAPID + service worker + rate limiting + quiet hours).
Feed-first lets us prove discovery drives real joins before
building the notification stack.

**Recommendation: mobile browse + home preview first.** Push
follows once we see the feed getting used.

## Phased plan

Each phase ships as its own PR chain (or single PR when small), and
delivers standalone value.

### Phase A — Discovery UI (1–2 weeks)

Almost entirely mobile work + the shared nudges on both platforms.
Backend is untouched; this reuses `GET /api/games`.

- **Mobile `/browse` screen.** Mirror of the web page:
  `apps/mobile/app/browse.tsx`, backed by
  `apps/mobile/components/browse/BrowseGamesList.tsx`. Full
  scrollable list, cursor pagination via the same
  `GET /api/games?cursor=…` endpoint, pull-to-refresh, realtime via
  the same Supabase subscription the web uses. Game-type chip strip
  along the top (same pattern as the community leaderboard filter)
  so users can narrow to "just Monopoly" or "any board game."
- **Home preview section (mobile + web).** A "Live games" strip at
  the top of the home screen — 5 cards max, "See all →" link into
  `/browse`. Auto-hides when zero games are live so a fresh install
  doesn't show an empty box. Web already has `/browse`; the home
  section is new on both platforms.
- **Create-screen hint.** For party / board game types with
  `max_players >= 3` (Monopoly, Whot, Ludo, Trivia — the ones
  that need >2 humans to feel alive), if the host has NOT flipped
  Public on, a one-line hint sits directly beneath the toggle:
  "Party game? Turn this on so others can find and join." Never
  renders for 1v1 games (chess, checkers, tic-tac-toe) or solo mode.
  Dismisses when the toggle flips on.
- **Lobby "missing players" prompt.** In the host lobby
  (`HostLobbyScreen` on mobile, host lobby on web), when the game
  has been waiting > 30 seconds AND `current_players < max_players
  - 1` (at least 2 seats still empty) AND `is_public = false`, a
  dismissible SurfaceCard appears above the roster: "Missing
  players? Make this game public — [Make public] button." Tap
  flips the flag server-side via the existing settings-sheet patch
  endpoint. Dismissed per game (SecureStore, keyed by `game_code`)
  so a private-night host isn't re-prompted every 30s. Never fires
  for solo or 1v1 types.
- **Max-players guard.** A Public game with `max_players = 1` is a
  contradiction — the host has no seat to fill. Two layers:
    - Client: when the max-players picker is 1, the Public toggle
      renders an inline hint immediately below it — "Bump the max
      players above 1 so other people can join." Toggling on with
      max 1 is a no-op with a brief toast pointing at the picker.
    - Server: `POST /api/games` and the settings-sheet patch
      reject `is_public = true` when `max_players < 2` (max is
      editable later, so client-side gating alone isn't enough).
    - Feed: extend `GET /api/games`'s filter to also require
      `max_players >= 2`, so a game that drops to 1 mid-lobby falls
      off the feed on the next poll.

- **Stale-lobby auto-close.** The whole feed is worthless if half
  the games listed are ghost lobbies hosts created and forgot
  about. Today an admin manually runs a 48-hour cleanup; that's
  too generous and too manual for a feed users are meant to trust.
    - **Rule:** a game with `status = 'waiting'` and no state
      change (`updated_at` untouched by join/leave/settings edit)
      for **15 minutes** transitions to `status = 'finished'` with
      a new `result_reason = 'idle_timeout'`. Same rule applies to
      the post-game "Play Again" lobby (also `status = 'waiting'`
      once the host requests replay), so an abandoned rematch also
      closes.
    - **Implementation:** server-side cron (Supabase edge function
      or a scheduled Next route hit by a cron trigger — pick
      whichever matches the existing admin-cron pattern) that runs
      every 2–3 minutes, selects `waiting` games older than the
      threshold, updates them. Cheap query, small write volume.
    - **UX safety net:** the feed's existing filter
      (`status = 'waiting' AND current_players < max_players`)
      already hides finished games automatically, so a stale
      lobby vanishes from `/browse` the moment the cron runs.
    - **Host-side warning — banner AND push.** At T-13min (2 min
      before close), an in-lobby banner appears for hosts watching
      the screen: "This lobby will close in 2 minutes if nobody
      joins or you start the game." A single tap on "Keep open"
      bumps `updated_at` and resets the timer once.

      In parallel, a **directed push fires to the host's device**
      (mobile Expo push OR web PWA push if the user has installed
      the PWA and granted permission on web) so an inattentive
      host who left the tab or backgrounded the app still hears
      about it. Copy: "⏳ Your Monopoly lobby closes in 2 min —
      tap to keep it open." Reuses the same per-player push token
      the "player joined" ping and turn-alerts use; no new
      subscription infra. Dedup: one warning push per game (a
      "Keep open" tap that resets the timer and eventually hits
      the T-13min mark again does NOT re-warn — one bite at the
      apple per game).

      **Quiet-hours interaction (Phase B).** Both the "player
      joined" host push and the T-13min warning respect the same
      quiet-hours window Phase B introduces. Consistent with
      Phase B's "drop, don't queue" rule: if the host is in quiet
      hours, no push fires and the game just closes silently at
      T-15min. A host who explicitly asked not to be pinged during
      work hours accepted that trade-off when they created a game
      during those hours.
- **"Player joined your game" push to the host.** Encourages the
  host to come back to the lobby and start when the game fills up.
  Reuses the existing Expo push token per player (the same channel
  turn-alerts flow through) — no new subscription infra needed
  here; it's a directed-to-host push, not the game-type broadcast
  from Phase B. Fires only when:
    - the joining player is not the host, AND
    - `status = 'waiting'`, AND
    - the game is `is_public = true` (private-game joins come from
      an invite the host already sent — the host expects them).
  Deduped: at most one "someone joined" push per 60 seconds per
  game to avoid a party of 4 joining at once producing 4 pings.
  Copy: "🎲 [Name] joined your Monopoly game — 3/6 players, tap
  to open."

**Success:** a user opens the mobile app, sees "Live games — 3
Monopoly, 1 Whot" (and every one of those 3 Monopoly games is a
real, active lobby — no ghosts). A host creating a party game gets
a one-liner nudge to flip Public; if they don't and nobody joins
after 30s, a lobby prompt gives them a one-tap way to open it up.
If they wander off, they get a "player joined" ping when someone
arrives and a "2 minutes to close" warning if nobody does. Games
left cold auto-close after 15 minutes so `/browse` stays honest.

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
  non-standalone iOS (`display-mode: standalone` media query).
  Toggle stays visible but greyed until installed.
- Server: on `games` row create where `is_public = true` OR the
  `is_public` flag flipping from false → true, enqueue push to
  every matching subscriber. Rate limit: at most 1 push per
  subscriber per game type per 30 minutes (avoids spam from a host
  toggling create + settings back and forth).
- **Discoverability of the Subscribe feature itself.** Two nudges,
  not one — biggest risk is that people never realise Subscribe
  exists. Both dismissible, both persist their dismissal so they
  never come back for that user:
    - **Home banner** (primary). A small ListRow-styled card at
      the top of the home screen: "🔔 Get pinged when your
      favourite games open — Subscribe →" plus an X to dismiss.
      Sits above the "Live games" section from Phase A so it reads
      as "here's how to make the feed keep working for you when
      you close the app." Appears from the user's second app open
      onward. Ships on both mobile home AND web `/` landing.
      **iOS Safari copy swap**: on iOS not-yet-installed the copy
      becomes "🔔 Get pinged when your favourite games open — Add
      to Home Screen, then Subscribe →" so the PWA install
      prerequisite is stated up front.
    - **Post-join nudge** (secondary). After the user's first
      successful game JOIN, a SurfaceCard on the finish screen
      says "Want a ping when new Monopoly games open?
      Subscribe →". Fires once per app install regardless of
      banner state.

  Both nudges deep-link straight into `/notifications` with the
  game-type from the finished game preselected (or all types if
  coming from the home banner).
- **Quiet / available hours.** A single per-user time window at the
  top of the Notifications screen, plus a mode segmented control:
    - **Quiet hours** — "Don't ping me between 9:00 AM – 5:00 PM."
      (Natural for someone carving work out of a default-reachable day.)
    - **Available hours** — "Only ping me between 6:00 PM – 11:00 PM."
      (Natural for someone with an irregular schedule who wants to
      opt IN to specific windows.)
  Same two fields, same storage, just an interpretation flip driven
  by the mode. Pushes outside the allowed window are DROPPED, not
  queued — a Monopoly game happening at 2pm is already over by 6pm;
  delivering a stale ping is worse than nothing. Times stored in
  the user's local timezone. Defaults off (all pings delivered).
- Web: VAPID keys generated once, service worker registered on the
  `/notifications` page.

**Success:** a user subscribes to Monopoly, closes the app, and
receives one push (not five) the next time a Public Monopoly game
opens — assuming it's outside their quiet hours.

### Phase C — Scheduled games (2–3 weeks, do only after A+B ship)

Turns discovery from real-time into planned. Only worth doing after
A+B prove the demand.

**Core model.** RSVP is intent — "I plan to be there" — not an
auto-join. Someone who RSVPs on Monday for a Friday 8pm game may
have forgotten by Friday; auto-seating them at 8:00pm creates
ghost players. The tournament pattern (RSVP → open → confirm-ready
→ start) is the right shape:

1. **Monday.** Host schedules Monopoly for Friday 8pm. Users see
   it in the /browse "Upcoming" tab and tap **RSVP** (which stores
   `game_rsvps (game_id, user_id)`; no seat allocated yet).
2. **Friday 7:45pm.** T-15min reminder push to every RSVPer +
   every game-type subscriber (respecting quiet hours from B).
   Copy: "🎲 Your Monopoly game opens in 15 min."
3. **Friday 8:00pm.** Server auto-transitions the game from
   `scheduled` → `waiting`, then fires a second push to every
   RSVPer: "🎲 Monopoly is open — tap to join." Tapping the push
   deep-links into the lobby.
4. **Lobby.** RSVPers appear in a "You RSVP'd" section of the
   lobby but show as **not ready**. They tap **I'm ready** to
   confirm and take a real seat. RSVPs that never confirm within
   a 10-minute window from lobby-open auto-drop off — the host
   can start without them or wait for other joiners.
5. **Start.** Host taps Start when enough people are ready. Game
   plays normally.

- **`games.scheduled_at TIMESTAMP` (nullable)** + `games.status`
  extended with `scheduled`. A `scheduled` game shows in
  Upcoming; a `waiting` game with a non-null `scheduled_at` in the
  past is a game the RSVPers are now confirming into.
- **New table `game_rsvps (game_id, user_id, rsvped_at,
  confirmed_at NULL)`**. `confirmed_at` flips when the user taps
  "I'm ready" in the lobby. Server auto-clears an unconfirmed row
  after 10 min post-open.
- **Create screen: Schedule for later section.** Date+time picker,
  timezone display. Only for Public games.
- **Browse page: two tabs.** Live now (Phase A) and **Upcoming**
  (Phase C). Upcoming shows scheduled games with the RSVP button
  and a countdown; RSVP'd games get a checkmark badge.
- **Home screen: "Your upcoming games" section (both platforms).**
  A ListRow strip above (or replacing when empty) the Recent
  section on both mobile home and web `/`, listing games the user
  has RSVP'd to that haven't started yet. Each row: game emoji +
  label, host name, "Friday 8:00 PM" (formatted in user's local
  timezone), tap → deep-links to the scheduled-game lobby page
  where they can un-RSVP or see who else RSVP'd. Prevents the
  "I forgot I RSVP'd" case the plan is trying to avoid — the
  strip is a visual reminder every time they open the app.
- **Push rules.**
  - T-15min reminder: RSVPers + game-type subscribers, respects
    quiet hours (Phase B).
  - T-0 lobby-open push: RSVPers ONLY (subscribers already got
    the T-15min heads-up; two pushes for the same event feels
    spammy). Respects quiet hours.
  - Host cancellation: fires a "cancelled" push to RSVPers. Single
    fan-out, **NOT throttled and NOT gated by quiet hours** —
    this one is important enough that a missed ping would strand
    the user; quiet-hours users receive it anyway.
- **Un-RSVP.** Any RSVPer can un-RSVP from the scheduled-game
  page or from the "Your upcoming games" home strip. Un-RSVPing
  after T-15min doesn't cancel the reminder push they already got
  (fine — they can just ignore it).
- **Host early-start confirm.** A host tapping Start BEFORE
  `scheduled_at` gets a confirmation dialog: "This game is
  scheduled for Friday, 8:00 PM. Start it now? RSVPers were
  expecting Friday — pings will go out immediately to let them
  know it's opening early."
    - Actions: **Cancel** (default focus) / **Start now**.
    - Choosing "Start now" fires the same T-0 lobby-open push
      to RSVPers ("🎲 Monopoly is opening early — tap to join if
      you're free") plus the T-15min heads-up push if it hasn't
      fired yet (so subscribers still get their heads-up, just
      compressed). Both respect quiet hours as usual.
    - After `scheduled_at`, Start acts normally with no confirm —
      the game is already in its expected window.
    - Purpose: prevent a distracted host from rugging a Friday
      RSVP crowd on Monday by mis-tapping. This is the same shape
      as the "are you sure?" dialog tournament tools use when a
      bracket is started before its published start time.

**Success:** a host schedules Monopoly for 8pm Friday, 4 people
RSVP over the week (and see it on their home screen every time
they open the app), at 7:45pm everyone gets a heads-up push, at
8:00pm the lobby opens and everyone gets a "tap to join" push, 3
of the 4 tap through and confirm ready, the host waits 90 seconds
for the last one, then hits Start.

## Total estimate

| Phase | Estimate | Confidence |
|---|---|---|
| A — Discovery UI (mobile /browse + home preview + nudges) | 1–2 weeks | High (backend already exists) |
| B — Push subscriptions | 2–3 weeks | Medium (web PWA infra new) |
| C — Scheduled games | 2–3 weeks | Medium (RSVP + reminder scheduling new) |
| **Total** | **5–8 weeks** | **Medium** |

Ship A and stop if the metric (feed-driven joins / total joins) is
too low to justify B. Push infra is expensive to build for something
users don't use.

## Explicit non-goals

- **No friends system.** Deliberately shipping public-anonymous.
- **No matchmaking.** No skill sorting, no auto-join.
- **No chat.** Games don't get pre-start chat here.
- **No location filter.** Games are global.
- **No changes to the invite-by-code flow.** Private games stay
  private and work exactly as they do today.

## Risks + how we mitigate

1. **Public-by-default confusion.** Already private-by-default in
   both create screens; the plan preserves that.
2. **Notification fatigue kills reach.** Per-game-type subscription
   + 30-minute per-type rate limit + never asking for permission on
   cold open + quiet hours. If reach drops <50% after Phase B,
   revisit rate limit before adding channels.
3. **iOS web push is a partial audience.** Only PWA-installed
   iOS Safari users receive web push. Plan surfaces this inline on
   the subscribe page AND on the iOS-Safari home banner. Mobile app
   users get the full experience regardless.
4. **Server push volume.** Per-subscriber-per-type-per-30-min rate
   limit is the primary guard. Server-side per-host quota (max 5
   pushes sent by one host's games per hour) is an additional guard
   worth adding in Phase B.
5. **Feature discoverability.** People won't know Subscribe exists.
   Handled by the home banner (primary) + post-first-join nudge
   (secondary), never a cold-open prompt.
6. **The Public toggle is easy to miss at create.** Handled by the
   contextual hint at create + the lobby "missing players" prompt.

## What I'll deliver at the end of each phase

- **Phase A:** mobile `/browse`, home preview section on both
  platforms, create-screen hint + lobby prompt live, at least three
  real games opened by us to prove the flow feels alive.
- **Phase B:** working `/notifications` screen, per-game-type
  subscription, quiet/available hours, one push received end-to-end
  on mobile AND on web (PWA-installed iOS + Android + desktop).
- **Phase C:** end-to-end scheduled game — I open one, three of us
  RSVP, everyone gets the 15-minute reminder, the game opens.

## When to re-scope

Same rule as the revamp plan: if Phase A takes >2 weeks or Phase B
takes >4, stop and re-plan. Don't sink weeks into infrastructure
users don't use.
