# Bots-in-Room — Plan

> Status: **Phase 1 shipped (Whot, PR #886). Phase 2 shipped (Monopoly,
> `feat/monopoly-bot`). Phase 3 shipped Crazy Eights only** — see the Phase 3
> note below for why Ayo, Ludo, Five Dice and UNO did not come with it.
> Companion to
> [`solo-bot-plan.md`](./solo-bot-plan.md), which covered
> single-player-vs-bot pages (Whot, Ayo, Crazy Eights, UNO — all shipped).
> This doc covers the different feature: **letting a host add computer
> players to a real multiplayer room so a small crew can play games that
> want more people.**

## Revisions since original plan

The plan below is the original design ADR. Two items have been revised
after the fact — kept here because the *why* still matters:

- **Trading is now respond-only, not banned entirely.** Original plan:
  "no trading, ever." Actual: bots respond to human-proposed trades
  (accept / decline via a value heuristic), but never initiate. The
  original concern — bots at trade valuation look exploitable — is
  addressed by two hard rules in the heuristic: (a) never break one of
  the bot's own completed monopolies, no matter what's offered; (b)
  require a 10% margin, so dead-even swaps decline. Bot-initiated
  trades remain a hard no. See `src/lib/monopoly-bot.ts` and its
  test file for the exact thresholds.
- **At-least-one-human-seat is enforced at Start.** Original plan said
  "server enforces at least one human seat" but Phase 1 only had the
  add-bot cap of `max_players - 1`. The Start endpoint now blocks a
  bot-only room outright (`startHumanSeatError` in `src/lib/game-start.ts`).
- **Bots stay seated across Play Again / Return to Lobby.** Phase 1
  had a bug where `resetSpectatorsForLobby` demoted bots to spectator
  along with humans; bots then had no client to opt back in, and the
  Start guard above (or the ready-up ring) would block the replay
  forever. Fixed by excluding `is_bot=true` from the reset.

## Why this is a different product from solo

The scoping doc for solo bots said the strategic filter was "which bot
reinforces the thing nobody else has." That's still true — but it argued
against Monopoly on those grounds. Bots-in-room reframes the problem:

> *Solo Monopoly is boring; Monopoly-with-friends-plus-bots-to-fill fixes a
> real problem.*

Party games have a brutal constraint: they need N people at the same time.
Some games can survive at 2P (Whot, Crazy Eights, UNO all play fine
2-handed — that's what we shipped as solo). But Monopoly, Ludo, Bingo,
Mafia genuinely need 3-4+ to be recognisably themselves. When 2 friends
open the app and want to play Monopoly, telling them "not enough players"
is a lost session.

Bots-in-room is the fix. The value isn't "practice against a computer" —
it's "your Tuesday-night crew of 2 gets to play the game they wanted."

## The architectural question this raises

Solo bots are trivial architecturally — a state machine in the browser,
no server, no realtime. **A bot inside a real room is fundamentally
different.** It has to:

1. Exist as a real `players` row so the room UI shows the correct seat
2. Take turns via the game's existing API routes (buy, roll, play card…)
3. React in bounded time (say, 2–4 seconds) so humans don't wait
4. Keep working even if the host's browser closes (some games can run for
   30+ minutes)

The last requirement rules out a purely client-driven bot ("the host's
browser plays the bot's moves"). Two viable server-side patterns:

**A. Route-driven.** Each game's `expire-turn` API route already exists
for "the turn timer ran out — advance the game." A bot player is just
"the turn timer expired instantly." Add a check to each expire-turn route:
if the current player is a bot, pick a move and apply it instead of using
the timeout-default behaviour.

**B. Ticker-driven.** The existing `src/lib/game-tick.ts` in-process loop
already pokes `expire-turn` for every active timed game every ~2.5s.
Reusing it means bots move automatically without changing the routes at
all — the tick becomes both a timer *and* a bot driver.

**Recommendation: B.** Same reasoning as the tournament reminder ticker
in [PR #878](https://github.com/chinazaaa/fateround/pull/878): the ticker
is already the "make the game move" process. Making it "make the game
move, and if the current player is a bot, make its move" is a small
extension of an existing pattern.

## The load-bearing decision: is the bot a `players` row?

**Yes.** Alternatives — synthetic players kept only in the game session,
or virtual players in a JSON column — all fight the existing multiplayer
system. Every game route already assumes the current player is a
`players` row. A bot that isn't a real row would need every route to
special-case it.

New column: `players.is_bot boolean not null default false`. That plus
one grant (column-level SELECT for anon, per
[games-column-grants-gotcha](../.claude/projects/-Users-chinazaobiekwe-Documents-GitHub-fateround/memory/games-column-grants-gotcha.md))
and the client can render "🤖 Bot 1" in the roster wherever it renders
player names.

## Phase plan

### Phase 1 — Infrastructure, using a game we already have a bot for (~2-3 days)

Skip Monopoly for the first pass. Prove the mechanic on a game where the
bot logic is already written and battle-tested — **Whot**, since the
solo Whot bot from
[PR #880](https://github.com/chinazaaa/fateround/pull/880) exists.

Ships:
- `players.is_bot` migration + column grant
- Host lobby: "Add bot" button (creates a `players` row with `is_bot=true`
  and a name like "Bot 1")
- Ticker extension: when a game's `current_turn_index` points at a bot,
  drive the bot's action through the existing route
- Adapter: the solo Whot bot's `pickBotAction` takes solo state; wrap it
  so it can take DB state and emit a route call
- Realtime already broadcasts moves, so nothing new client-side

Success criterion: a host + 1 human + 1 bot can complete a full Whot
game, the bot plays credibly, and the game continues if the host closes
their tab.

**Deliberately not shipped:** UI for removing bots mid-game, choosing bot
difficulty, adding multiple bots (all Phase 2 unless trivial).

### Phase 2 — Monopoly bot, riding Phase 1's infrastructure (~4-5 days)

Now the actual ask. Monopoly's bot is the hard part; the "how does the
bot play in a room" is already solved by Phase 1.

The bot decides:
- **Roll** — trivial, just POST to `/api/monopoly/roll`
- **Buy or decline** — heuristic: buy if price ≤ cash × 0.4 AND (starts a
  colour set OR completes 2/3 of one); else decline
- **Build houses** — after any turn where cash > buffer: build on the
  most-completed colour set, evenly across properties, respecting the
  even-build rule
- **Mortgage** — only when about to go into debt; mortgage lowest-value
  ungrouped first
- **Jail** — pay $50 when past round 20 (mid/late game — mobility matters);
  before then, try doubles
- **Accept bankruptcy** — engine handles this on its own; no bot decision
- **Trading** — original plan called this out of scope entirely. Revised
  post-Phase-2 to **respond-only** (see the Revisions section at the top):
  bots accept or decline human proposals but never initiate. Solo bots
  still skip trading entirely — the response-only heuristic assumes the
  bot has a live opponent to reason against.
- **Auction** — happens only when a human declines a purchase in a
  4+-player game. Bots auto-bid at ≤ 60% of face value; no bot-bot
  auction bidding UI needed.

**Bots UX in the create/lobby flow:**
- `/create?type=monopoly` gets an "Add bots to fill" section
- Slider or +/- for bot count (1–3, capped by room size)
- Bots appear immediately in the lobby roster with 🤖 avatars
- Host can start the game any time; missing seats are filled by the bots

### Phase 3 — Extend to other games (variable, ~1 day each)

Once Phase 1 + 2 are in and used:

**Cheap wins** — games where a bot already exists:
- Whot (from Phase 1)
- Ayo, Crazy Eights, UNO — adapters over the existing solo bot logic
- **Cost:** ~1 day each, mostly wiring

> **Phase 3 outcome (shipped: Crazy Eights only).** The "cheap win" framing held for
> Crazy Eights and does NOT hold for UNO — the difference is whether the solo engine
> models the room's rules.
>
> - **Crazy Eights — genuinely cheap, shipped.** `Crazy8SoloState` carries a full
>   `CrazyEightsRules`, the SAME type the multiplayer engine parses from the game row, so
>   the bot already honours the host's action-cards / jokers / pick-2-stacking toggles.
>   The adapter (`crazy-eights-bot-adapter.ts`) is the Whot one with the nouns swapped,
>   plus one real difference: the Queen reverses play, so "who is the next player" has to
>   go through `crazyEightsNextTurnIndex(…, direction)` rather than `(i + 1) % n`. There
>   is no rule combination that needs the bot disabled.
>
> - **UNO — not cheap, deferred.** `uno-solo.ts` and `uno-bot.ts` contain zero references
>   to `UnoRules`. The solo engine hardcodes exactly one rule subset: two players, classic
>   same-kind stacking, `same_color_or_number` multi-play, and nothing else. Every one of
>   these host settings is outside what the bot can play — Zero/Seven (hand passing and
>   swapping), cross-kind stacking, any other Multi-Play grouping, Jump-In (out-of-turn
>   plays), Team-Up (2v2, and it changes the win condition), WD4 Challenge, the UNO-call
>   penalty, and No Mercy (which force-enables Zero/Seven and stacking outright).
>
>   Gating the bot on "all of those off" would mean it is unavailable in most real rooms
>   and, worse, would silently disappear when a host flips a setting after adding it. The
>   honest options are (a) teach `uno-solo` the real `UnoRules` so the bot plays whatever
>   the room plays, or (b) skip UNO. Do not ship the gated version.
>
> - **Ayo — deliberately skipped**, not blocked. Its solo bot carries real rules like
>   Crazy Eights', so it remains a genuine cheap win whenever it is wanted.

**Registry:** `src/lib/bots-in-room.ts` is now the single source for "which games can seat a
bot". The seat gate in `/api/games/[code]/bots` derives its set from the same map the
game-tick uses to poke bot drivers, so a game cannot be bot-seatable without something to
take its turns. `bots-in-room.test.ts` additionally checks each entry has a bot-tick route,
a driver and an adapter on disk.

**Medium** — games with clean decision points but no existing bot:
- **Ludo** — dice + piece choice (capture > safety > home)
- **Yahtzee** — expectimax is famous; a category-value heuristic works
- **Snake & Ladder** — trivial, but a "bot" here is auto-rolling with
  nothing to decide. Ships as a checkbox, not a bot per se.
- **Cost:** 1-2 days each

**Explicitly not doing:**
- Trivia (bots are hollow — they either know or don't)
- Mafia, Quiplash, Codewords, all party/social games (bots defeat the
  point; an LLM would be uncanny AND expensive)
- Chess/Checkers — same reasoning as the solo doc; buy an existing MIT
  engine if we ever want them

## Reuse from solo work

Every solo bot from PRs #880 and #881 has a `pickBotAction(state)` that
returns an action. Phase 1 just needs a small adapter — construct a
solo-shaped state from the DB session/hands, call the existing
`pickBotAction`, convert the action into an API call. So **Phase 3
lights up Ayo/C8/UNO nearly for free** if Phase 1 lands.

Solo mode itself stays. Bots-in-room is additive: some people will still
want to practice alone against a bot at 2am; some people will want their
Tuesday crew of 2 to play 4-handed Monopoly. Different problems.

## Seat model: bots never keep a human out

Load-bearing rule: **a human can always join a room if the seat cap allows
it, even if that means displacing a bot.** Bots are second-class seat
holders — they fill the room *when* it isn't full, and they cede seats to
humans on arrival.

Concretely:

- **Add-bot only when there's an empty seat.** The "+ Add bot" chip is
  visible only when `humans + bots < max_players`. Once full, the chip
  disappears.
- **Humans always join if `max_players` allows.** A room with 2 humans
  + 2 bots (cap 6) accepts a 3rd human normally into an empty seat. A
  room with 2 humans + 4 bots (cap 6) accepts a 3rd human by
  displacing the newest bot — that human never sees a "room full" error.
- **Bots never displace humans.** Only humans can displace bots. This
  is the invariant everything else falls out of.
- **Displacement order** — newest bot first (LIFO). Prevents "the bot
  I added specifically" from being replaced before "the bot that just
  auto-filled during Start".
- **In-lobby vs mid-game.** In the lobby, bump is clean — the seat just
  changes owner. Mid-game the bot's hand becomes the joining human's
  hand (Whot allows late-join so this works). If a game engine cannot
  support hand transfer, mid-game join bumps a bot but seats the human
  as a spectator until the next round.

**Why this matters:** the alternative — bots that hold seats even against
humans wanting to join — turns the feature into a bug. The whole point
of bots-in-room is to salvage a session that would otherwise not happen;
locking out an extra friend who shows up late would defeat that goal.

## Explicit non-goals

- **No BOT-INITIATED trading.** Bots respond to human proposals (added
  post-Phase-2, see Revisions above) but never propose one. Proactive
  trades would drop the bot into open-ended valuation across mixed
  baskets — which is exactly the "look silly" failure mode the original
  no-trading rule was defending against.
- **No bot-only games.** Every room needs at least 1 human player;
  starting a room with 4 bots and watching them play is not a product.
- **No bot skill tuning at first.** Difficulty selection is optional
  Phase 2 polish. Phase 1's bot is "normal" and that's it.
- **No trophies / streaks from bot wins.** Same policy as solo: a game
  that involves bots doesn't feed the multiplayer leaderboard. Otherwise
  bots become a leaderboard-farming exploit.
- **No solo Monopoly page.** The `/play-solo/monopoly` slot from
  `solo-bot-plan.md` is retired; bots-in-room replaces it. Nothing was
  ever built there.

## What I'll deliver at the end of Phase 1

- Working "Add bot" in a Whot room
- One migration, one bot adapter, one ticker extension
- Documentation of the pattern so Phase 2 (Monopoly) and Phase 3 (other
  games) plug in as increments
- Tests: the adapter, the ticker's bot-detection logic, at least one
  full-game smoke where the tick advances a bot

If Phase 1 hits a real blocker I haven't spotted, I stop and re-scope
rather than sink days into it. The tournament work last month is the
cautionary example — 8 migrations shipped without ever running against
their own schema, and every one of the 9 bugs the code review found
would have been caught by a single real end-to-end run.

## Estimate summary

| | Estimate | Confidence |
|---|---|---|
| Phase 1 (Whot + infra) | 2-3 days | Medium — depends on ticker integration surprises |
| Phase 2 (Monopoly bot) | 4-5 days | Low — Monopoly is complex and I've only surveyed it |
| Phase 3 per game | ~1 day each | High for solo-bot games, medium for new bots |
| **Total to "Monopoly works with bots"** | **~1–1.5 weeks** | Medium |

I'll break Phase 1 into daily checkpoints and stop after each to decide
whether to continue. If the ticker integration turns out ugly, we
regroup, not push through.
