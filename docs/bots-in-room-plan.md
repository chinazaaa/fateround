# Bots-in-Room — Plan

> Status: **Plan only, nothing built.** Companion to
> [`solo-bot-plan.md`](./solo-bot-plan.md), which covered
> single-player-vs-bot pages (Whot, Ayo, Crazy Eights, UNO — all shipped).
> This doc covers the different feature: **letting a host add computer
> players to a real multiplayer room so a small crew can play games that
> want more people.**

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
- **Trading** — explicitly out of scope, never in solo either. Marked NOT
  A ROADMAP ITEM in the code so it doesn't accidentally come back.
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

## Explicit non-goals

- **No trading, ever.** Not "trading v2" — genuinely never. Marked in
  code and doc so it doesn't come back through drift.
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
