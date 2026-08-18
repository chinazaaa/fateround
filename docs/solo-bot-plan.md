# Solo vs-Bot Play — Scope

> Status: **Scope only, nothing built.** Answers "which games can have a computer
> opponent, what would it cost, and which are actually worth building."
>
> Companion: [`revenue-model-v3.md`](./revenue-model-v3.md) (why retention between
> parties matters), [`high-scores-leaderboards-plan.md`](./high-scores-leaderboards-plan.md).

## The problem it solves

Party games need N people at the same time. That's the constraint that kills
retention: there is nothing to do on a Tuesday. The daily challenges already
push against this (12 types, including a Whot puzzle), but they're *puzzles* —
fixed content, one solution path, done in three minutes.

A bot opponent is different: a full game, repeatable, and practice for the real
thing.

## Cost: zero AI tokens

Game bots are **classic search and heuristic algorithms in plain TypeScript**.
No LLM, no API call, no key, no metering. An LLM would be worse on every axis
that matters here:

| | Local algorithm | LLM |
|---|---|---|
| Cost per move | £0 | real money, per move |
| Latency | <1 ms | 1–3 s |
| Legal moves | guaranteed by construction | can hallucinate illegal ones |
| Weak network / offline | fine | fails |

That last row matters for our strongest market. A local bot needs no server
round-trip per move.

The only genuinely LLM-shaped feature in the product remains AI deck generation
(`/api/ai-questions`), which is separately capped app-wide.

---

## Architecture: the shell already exists

**The bot logic is the easy half. The expensive half is usually "run a game with
no room" — and that's already built.**

Daily challenges run with **no `games` row, no room code, no host token, and no
realtime**. They have their own tables (`daily_challenges`,
`daily_challenge_content`, `daily_scores`, `personal_bests`) and their own route
(`/daily-challenges/[gameType]`).

A vs-bot mode follows the same shape: local state, no room, no realtime, one
score submission at the end. That removes the single biggest cost from every
estimate below.

**What genuinely doesn't exist yet:** a live move-search engine. The closest
thing, `daily-chess-mate.ts`, plays a *precomputed* solution line
("attacker move, defender reply, …") rather than computing a reply. So every
bot below is new logic — but new logic in one file, not a new subsystem.

**What each engine already gives us** is the expensive primitive — legal-move
generation and move application:

- Ayo — `legalMoves()`, `legalMovesForSide()`, `sowFromPit()`, `applyAyoMove()`,
  and `moveFeedsOpponent()`, which is already a positional heuristic.
- Whot — `canPlayCard()`.

A bot is then: enumerate legal moves → score them → pick the best.

---

## Which of the 48 games can have a bot

### Tier A — classic algorithms, plays genuinely well

| Game | Approach | Effort |
|---|---|---|
| **Ayo** | minimax + alpha-beta. Perfect information, branching ≈ 6, so depth 8 returns instantly | **1–2 days** |
| **Whot** | heuristics: play matching, shed high cards, hold specials, track what's gone. Hidden hands mean search adds little | **~1 day** |
| Crazy Eights | same family as Whot — near-identical bot | +½ day after Whot |
| UNO | same family again, plus team mode | +1 day after Whot |
| Tic-tac-toe | fully solved; trivial minimax | ½ day |
| Checkers ×3 | minimax + alpha-beta; forced captures keep branching small. One bot serves all three variants | 2–3 days for the family |

### Tier B — doable, more work

| Game | Note |
|---|---|
| Yahtzee | expectimax is well-studied, but a category-value heuristic plays well for far less work — 1–2 days |
| Ludo | dice + piece choice; heuristic (capture > safety > home run) — 1–2 days |
| Monopoly | buy/build/auction heuristics are ~3–5 days. **Trading is negotiation** and is a project on its own — a non-trading bot is the sane version |
| Scrabble | we have the 39k-word list. Move generation (anchors, cross-checks) is documented but fiddly: weak bot 2–3 days, strong bot a week+ |
| Mahjong | bot-able, but complex rules make it poor value right now |

### Tier C — a bot adds nothing

- **Snake & Ladder** has *no decisions at all*. A "bot" is an auto-roller. Solo
  play is possible; an opponent is meaningless.
- **Word Hunt / Word Search / Word Scramble / Word Grouping / Crossword /
  Sudoku** are already single-player-shaped and covered by the daily
  challenges. They want a solo mode with a timer, not an opponent — largely
  already shipped.
- **Trivia**: a bot is easy to fake (answer correctly X% of the time with
  human-ish delay) but hollow — it either knows or it doesn't, and players can
  feel the arbitrariness.

### Tier D — don't, at any price

Social and creative games are *about the people in the room*; a bot defeats the
entire point, and an LLM would be both expensive and uncanny:

Mafia · Quiplash · Describe It · Quick Draw · Two Truths · Never Have I Ever ·
Most Likely To · Would You Rather · This or That · Hot Seat · Who Said This ·
Pick a Number · Smash Marry Kill · Red Flag Green Flag · Parent Approval ·
Anonymous Messages · Secret Message · Codewords (needs semantic association)

### Chess — buy, don't build

Chess is Tier A in theory, but a decent engine is weeks of work and the world is
full of free ones. Either drop in an MIT-licensed JS engine or lean on the
existing `chess_mate` dailies. Building a mediocre chess AI is the worst use of
this time — chess.com already exists, and nobody is choosing FateRound for it.

---

## Recommendation: build two, not ten

The strategic filter isn't "which is easiest" — it's **which bot reinforces the
thing nobody else has.** Anyone can play checkers against a computer. Nobody
else has done Nigerian games properly on the web, and the search data says
people are looking (13.58% CTR at position 7.8 in Nigeria).

1. **Ayo first.** Cleanest engine (`legalMoves` / `applyAyoMove` /
   `moveFeedsOpponent` all present), textbook algorithm, and it's a game people
   *already expect* to play against a machine. Best effort-to-quality ratio in
   the catalogue. **1–2 days.**
2. **Whot second.** Biggest strategic value — it's the flagship of the
   differentiated catalogue, and a bot makes it practice for the real thing.
   Heuristics only, no search. **~1 day.**
3. **Then stop and look.** Do people play it twice? If the answer is no, no
   number of additional bots will fix that. If yes, Crazy Eights and UNO come
   nearly free off Whot's work.

Total to a real answer: **2–3 days of work, £0 of API spend.**

## Open questions before building

- **Where does it live?** A "Play solo" entry on the game landing pages, or
  inside `/daily-challenges`? The latter reuses more but muddies "daily".
- **Does a solo win count?** Trophies and streaks are earned by playing — if
  bot games feed them, they're farmable. Recommend: solo games are their own
  track, and don't touch the multiplayer leaderboard.
- **Difficulty levels?** Search depth for Ayo, heuristic aggression for Whot.
  Cheap to expose, and "beat the hard bot" is its own retention hook.
