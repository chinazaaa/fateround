# Mobile Revamp — Plan

> Status: **Plan only, nothing built.** Companion to
> [`bots-in-room-plan.md`](./bots-in-room-plan.md). This doc scopes the
> mobile-side surface area that has fallen behind since accounts, trophies,
> the community leaderboard and the solo pages shipped on web.

## What this plan is (and isn't)

**Scope: parity, not premium — yet.** This plan closes the feature gap
between mobile and web so a user on either platform has the same
capabilities. After Phase 4 the app is cohesive, functional, dark-mode
sound, and reads as "a proper app." It does not yet read as "premium."

A **premium pass** (motion design with Reanimated 3, custom illustration,
haptics, sound cues, distinctive typography, micro-details like skeleton
loaders and pull-to-refresh) is a separate arc of 3–6 months, best done
after this parity work ships. Two reasons for the sequencing:

1. **Premium needs a real product to elevate.** Polishing screens that
   are still being invented is wasted motion — you polish twice.
2. **Usage tells you where premium effort pays.** Once parity ships,
   analytics show which games get the most solo play, which trophies
   users chase, which screens they linger on. Premium investment goes
   there first, not spread thin.

A `docs/mobile-premium-plan.md` will follow at the end of Phase 4.

## Load-bearing invariants (do not relax)

Carried across every phase, and forward into the premium arc:

- **Login is not first.** The anon-first flow stays. A user can create
  a room, add bots, play solo, and win a game without an account. Sign-in
  only prompts when the user reaches for something that needs it
  (persist across devices, appear on leaderboard, follow a friend).
  Enshrined in `bots-in-room-plan.md` too; repeated here so no phase
  quietly walks it back.
- **No feature regressions from the visual work.** Phase 0 and 4 must
  leave every existing screen at least as usable as it was.
- **No native modules without a clear win.** Each new dependency has to
  justify a dev-client rebuild.

## Why this is a plan, not a series of PRs

Track 1 (bots-in-room on mobile, PR #919) proved the pattern for "port one
web feature to mobile at a time." Everything below is bigger than that:

- **Solo play on mobile** — six games, each with a client + storage layer.
- **Sign-in + profiles + trophies UI** — a whole account surface that
  doesn't exist on mobile at all.
- **Community leaderboard + activity feed** — new screens, new realtime.
- **Design system refresh** — a real overhaul, not just adding screens.

Doing them ad-hoc means the last one either happens twice (once inline,
once during the refresh) or blocks the first three. The plan below sequences
them so each phase produces standalone value AND clears the ground for the next.

## What already exists on mobile (baseline)

Before scoping the gap, be honest about what's already there. I looked
before writing this — highlights:

- **Full multiplayer**: create/host/join for every game type. All rooms
  work, all realtime works.
- **Bots-in-room**: Monopoly + Whot (Track 1, PR #919, merged).
- **Solo play scaffolding**: a "Play solo" opt-in in the create flow
  (PR #918, merged) that skips the lobby wait — but no per-game solo
  pages yet.
- **Design tokens**: `apps/mobile/constants/theme.ts` has semantic light
  + dark colours. Not a full design system, but a foundation.
- **Sign-in**: exists at API level (anon auth on first finish) but no
  dedicated profile UI. Trophies are awarded server-side but not visible.
- **Push notifications**: wired via Expo push.

## What's missing (the gap this plan closes)

1. **Solo pages** for the 6 games that have web solo (Whot, UNO, Crazy
   Eights, Ayo, Ludo, Yahtzee).
2. **Profile screen**: tap your avatar → see your name, trophies,
   streaks, games played. Editing name/handle.
3. **Trophy grid**: mobile parity of the web trophy display —
   locked/unlocked, per-game groupings, unlock dates.
4. **Community leaderboard screen**: browse top-N per game type, mirroring
   the web's community section.
5. **Activity feed** (optional, Phase 3): "who's playing what right now",
   friend joins, trophy unlocks.
6. **Design refresh**: a coherent visual system across all the above.
   Right now the mobile app is functional-but-utilitarian; every new
   surface reinforces the visual chaos unless the refresh lands first.

## The load-bearing question: refresh first, or ship features first?

The two orderings have opposite risks:

- **Refresh first, then features.** Design work drags on, no user-visible
  progress for weeks, momentum dies. Risk: perfectionism paralysis.
- **Features first, then refresh.** Each feature ships in the old visual
  system; every screen has to be rebuilt during the refresh. Risk: double
  work + the refresh becomes overwhelming and gets deferred.

**Recommendation: hybrid.** A small design-token refresh happens FIRST
(one week, no new screens), just enough to give the new screens somewhere
sensible to land. Then features ship into the improved token set. A
bigger visual pass happens LAST once we know what real screens look like
in real use.

## Phased plan

Each phase is 1–2 weeks of focused work, ships as its own PR (or small
PR chain), and delivers standalone value. Deferred items are called out
so scope doesn't creep.

### Phase 0 — Token refresh + primitives (1 week)

The design foundation, not new screens.

- Audit current `theme.ts` — what's semantic (`text`, `bg`), what's
  ad-hoc (raw colours in components).
- Extend semantic tokens: `elevation`, `stateHover`, `stateActive`,
  `stateDisabled` for interactive surfaces. `radius.card`,
  `radius.button`, `radius.chip` for consistent corner language.
- Ship 3 primitives every new screen will use: `Button`, `Card`, `ListRow`.
  Match web's `.btn-primary` / `.btn-secondary` visually so cross-platform
  users don't feel a jump.
- Type ramp: `text.title`, `text.section`, `text.body`, `text.caption`
  swapped for the current inline sizes.

**Success:** an existing screen (pick one — the create flow, probably)
rebuilds against the new primitives in a day and looks visibly better
than before. If it doesn't, the tokens are wrong and we iterate before
building more screens against them.

### Phase 1 — Profile + trophies (1–2 weeks)

The account surface. Everything after this can link to it.

- `/profile` route: name, avatar, edit-name flow, sign-out.
- Trophy grid: per-game sections, locked/unlocked with unlock dates.
  Query the same tables web reads. No new server work needed if the
  API is already there (verify first — if not, one API additon).
- Streak display: current + best per game.
- Games-played + games-won counters per game.
- **Deferred to Phase 3:** account merging, avatar upload, achievements
  (as distinct from trophies).

**Success:** a user who won a Monopoly game this morning can open their
profile on mobile in the afternoon and see the trophy awarded, the game
in their "recent" list, and their updated Monopoly win count.

### Phase 2 — Solo play on mobile (2 weeks)

The 6 solo games. Not from scratch — port the web state machines +
bot heuristics, which are already pure functions. The UI is the real
work.

- **Reuse the pure lib files** (`whot-solo.ts`, `whot-bot.ts`,
  `ludo-solo.ts` etc.). They're supabase-free and framework-free
  already; they should compile against React Native without changes.
  If they don't (import path issues, `window` refs), fix that first.
- **Six new mobile screens** at `/play-solo/<game>` — reuse mobile's
  existing game panels where possible (`WhotPlayerView`, etc.). Some
  panels assume DB-backed session props; wrap solo state to match.
- **AsyncStorage** in place of `sessionStorage` for progress persistence.
- **Scoreboard row + auto-scroll-to-finish** — mirror the web fixes
  from PR #907 verbatim.
- **CTA on create** for each game: "Want to play solo? Practice against
  the bot →" — same pattern as web `SoloPracticeCta`.

**Success:** a user can play a full Whot game solo on mobile without an
account, the app remembers their score across a restart, and their "You
X — Bot Y" tally persists per-device.

### Phase 3 — Community + activity (1–2 weeks)

The social surface. Requires Phases 1+2 to be useful (profile links,
solo streaks worth showing).

- Community leaderboard screen: top-N per game type. Same API the web
  reads.
- Post-win to community: reuse the same `/api/community/post-win` route
  (already lives server-side; PR #910 gated it on bot-heavy rooms). The
  mobile finish screen fires the POST on win.
- Activity feed (optional, could defer to Phase 4): "friends are
  playing" / "someone just unlocked X trophy". Needs a real friends
  concept first — skip if that's not shipped.

**Success:** a mobile-only user can see they're #12 on the Monopoly
leaderboard, and their win from this morning is on the list.

### Phase 4 — Second visual pass (1 week)

Now that real screens exist in the token set, sand off the rough
edges. This is a polish phase, not a rewrite:

- Consistency sweep: spacing, radii, hit-target sizes.
- Motion pass: sensible transitions between screens.
- Dark-mode audit against every new screen.
- Onboarding polish for first-time users.

**Success:** the app feels cohesive, not "features stapled on."

## Total estimate

| Phase | Estimate | Confidence |
|---|---|---|
| 0 — Tokens + primitives | 1 week | High |
| 1 — Profile + trophies | 1–2 weeks | Medium (depends on API completeness) |
| 2 — Solo play (6 games) | 2 weeks | Medium (per-game UI variance) |
| 3 — Community + activity | 1–2 weeks | Medium |
| 4 — Second visual pass | 1 week | High |
| **Total** | **6–8 weeks** | **Medium** |

If we stop after Phase 3, the app is fully caught up with web. Phase 4
is the "feels polished" milestone; it's optional in the sense that the
app works without it, but skipping it means the visual chaos lingers.

## Explicit non-goals

- **No monetization changes.** Whatever the plan is for pricing, the
  mobile revamp doesn't introduce it. Revenue is a separate arc.
- **No new game types.** Only surfacing what already exists.
- **No cross-platform state sync as a headline feature.** Accounts already
  sync through Supabase; that's enough.
- **No trophy schema changes.** The mobile UI reads what the trophy
  engine already writes. Doc updates only (per-trophy display copy)
  if the web strings need mobile-shortening.
- **No native modules beyond what's already installed.** No new SDK
  integrations that force a dev-client rebuild — every phase ships
  through the existing Expo channel.

## Risks + how we mitigate

1. **Solo lib files don't work in RN.** Web's `whot-solo.ts` uses no DOM
   APIs so should port cleanly, but there's always an import path or
   `Date.now()` gotcha. Mitigation: dry-run one file (e.g. `whot-solo.ts`)
   during Phase 0 to prove the pattern. If it needs shims, factor them
   into `packages/shared` before Phase 2 kicks off.
2. **Trophy API not ready for mobile.** Web trophies were built against
   web endpoints; mobile may need new query shapes. Mitigation: audit
   in Phase 1 planning, add missing endpoints as a Phase 1 sub-task.
3. **Design perfectionism.** Phase 0 has a hard 1-week cap. If tokens
   aren't good enough by end of week, ship what we have and adjust in
   Phase 4. Don't block features on design iteration.
4. **The refresh IS bigger than 1 week.** Then it becomes two phases:
   Phase 0a (tokens) + Phase 0b (primitives). Sequence the same — foundation
   before features.

## What I'll deliver at the end of each phase

- **Phase 0:** one existing screen rebuilt against new primitives, a
  before/after comparison. If reviewers can't tell the new primitives
  are better, we iterate on Phase 0.
- **Phase 1:** working profile + trophy grid on mobile, verified against
  a real user account with real trophy history.
- **Phase 2:** all six solo games playable end-to-end on mobile, each
  with a scoreboard. Smoke-tested on iOS + Android via Expo Go.
- **Phase 3:** community leaderboard screen + auto-post on win. Verified
  by playing a game and seeing my own win appear on the board.
- **Phase 4:** an internal walkthrough — screen-by-screen, before/after.

## When to re-scope

If Phase 1 takes more than 2 weeks (trophy API surprises), STOP and
re-plan. Same rule the bots-in-room plan used: don't sink weeks into a
wrong direction. Re-scope with what we learned, not what we assumed.
