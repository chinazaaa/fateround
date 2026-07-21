# Trophy Catalog — Seed List

Status: **Build spec / seed data** · Companion to
[`trophies-and-streaks.md`](./trophies-and-streaks.md)

This is the concrete, per-game **trophy catalog** — the source-of-truth list to seed the
`trophies` table and `src/lib/trophies/catalog.ts`. It covers all **32 game modes** plus
cross-game **Platform** and **Host** trophies. The mechanics (tiers, points, Platinum rule,
rarity, award engine, criteria DSL, measurable-vs-binary progress, hidden trophies) are all
defined in [`trophies-and-streaks.md`](./trophies-and-streaks.md) — read that first; this
file is the *content*.

> **Admin-managed after seeding.** This list is the **seed** for the `trophies` table (via
> `src/lib/trophies/catalog.ts`). Once seeded, the database row is the source of truth: an
> admin can **add, edit, reorder, and retire** trophies from `/admin/trophies` — no deploy
> needed to tweak a title, fix a threshold, or add a new one. Full CRUD spec, guardrails,
> and seeding rules live in [`trophies-and-streaks.md`](./trophies-and-streaks.md) §6A.

---

## How to read this

Every game has its own finite ladder: several Bronze/Silver/Gold trophies plus **one
Platinum** ("earn every other trophy in this game"). Columns:

- **Tier** — 🥉 Bronze (15 pts) · 🥈 Silver (30) · 🥇 Gold (90) · 🏆 Platinum (300).
- **Trophy** — display title.
- **Description** — the plain-English criterion the player sees (the "Details" line).
- **Owner** — 🎮 **Player** or 🎙️ **Host**. Most trophies are player-owned by design; host
  trophies are concentrated in the **Host trophies** section, plus a per-game sprinkle.
- **Criteria** — the DSL rule (see `trophies-and-streaks.md` §3.10). `(H)` = hidden
  (title / description / criterion stay redacted until earned).

**Counts:** deep/competitive games run ~18–28 trophies, medium games ~14–16, and the
casual voting/social modes ~10–12 (their depth is limited by nature). High counts come from
**laddered counters** (e.g. win 1/10/25/50/100 as separate trophies).

**Owner mix:** the large majority are 🎮 Player. Two "meta" Platinums exist — **Platform**
(the cross-game player spine) and **Host** — so a dedicated player *or* host each has a
headline Platinum to chase without touching every game.

**Anti-spoof:** competitive trophies ("win N") are gated behind a minimum real-player count
server-side (`trophies-and-streaks.md` §3.9). Participation trophies stay liberal.

**IDs & events:** trophy id = `<game_type>.<slug>` (e.g. `whot.first_win`); Platform/Host
ids use the `platform.` / `host.` prefix. Many `event.*` signals don't exist in the code
yet — that's expected; the catalog defines what we build. Reused role-award keys
(`codewords_spymaster`, `codewords_operative`, `two_truths_guesser`,
`describe_it_describer`, `describe_it_guesser`) already exist in
`src/lib/community-achievements.ts`.

> **Values are first-pass.** Exact thresholds, which `event.*` each game can emit, min
> player floors, and the final hidden set are tuning decisions — see the end of this file.

## Board & card games (competitive — win/skill based)

### Whot (`whot`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Shed | Win your first game of Whot by shedding all your cards. | 🎮 Player | `counter whot.wins ≥ 1` |
| 🥉 Bronze | Market Regular | Play 10 games of Whot from start to finish. | 🎮 Player | `counter whot.games_played ≥ 10` |
| 🥉 Bronze | Pick Two, Please | Play a 2 card to make the next player draw two from market. | 🎮 Player | `event whot.play_pick_two` |
| 🥉 Bronze | Suspended | Skip an opponent's turn with an 8 (suspension). | 🎮 Player | `event whot.play_suspension` |
| 🥉 Bronze | Hold On | Play a 1 to hold on and take another turn. | 🎮 Player | `event whot.play_hold_on` |
| 🥉 Bronze | Wild Thing | Play your first Whot(20) wild and call a new shape. | 🎮 Player | `event whot.first_wild` |
| 🥉 Bronze | Star Struck | Win a game with a Star card as your final played card. | 🎮 Player | `event whot.finish_star` |
| 🥉 Bronze | Full House | As host, fill a Whot room to its maximum player count. | 🎙️ Host | `event whot.host_full_room` |
| 🥈 Silver | Ten Times a Charm | Win 10 games of Whot. | 🎮 Player | `counter whot.wins ≥ 10` |
| 🥈 Silver | Clean Hands | Win a game without ever drawing from the market. | 🎮 Player | `event whot.win_no_draw` |
| 🥈 Silver | Chain Reaction | Defend a 2 by stacking your own pick-two onto it. | 🎮 Player | `event whot.stack_pick_two` |
| 🥈 Silver | Pick Three Panic | Finish a game by playing a 5 (pick three) as your last card. | 🎮 Player | `event whot.finish_pick_three` |
| 🥈 Silver | Market Crash | Trigger a 14 (general market) making every opponent draw. | 🎮 Player | `counter whot.general_market_plays ≥ 5` |
| 🥈 Silver | Wild Collector | Play 25 Whot(20) wild cards across all your games. | 🎮 Player | `counter whot.wilds_played ≥ 25` |
| 🥈 Silver | Shape Shifter | Win games finishing on each of the five shapes at least once. | 🎮 Player | `distinct whot.finish_shapes ≥ 5` |
| 🥈 Silver | Speed Shedder | Win a game in under 60 seconds. | 🎮 Player | `event whot.fast_win` |
| 🥈 Silver | Room Runner | Host 15 games of Whot. | 🎙️ Host | `counter whot.hosted ≥ 15` |
| 🥇 Gold | Whot Veteran | Win 25 games of Whot. | 🎮 Player | `counter whot.wins ≥ 25` |
| 🥇 Gold | Whot Master | Win 50 games of Whot. | 🎮 Player | `counter whot.wins ≥ 50` |
| 🥇 Gold | Whot Legend | Win 100 games of Whot. | 🎮 Player | `counter whot.wins ≥ 100` |
| 🥇 Gold | Comeback King | Win a game after holding 10 or more cards at one point. | 🎮 Player | `event whot.comeback_win` |
| 🥇 Gold | Special Delivery | Win with a special card (2/5/8/14/1/Whot) as your last card. | 🎮 Player | `event whot.finish_special` |
| 🥇 Gold | Stack Overflow | Stack pick-twos to force an opponent to draw 8 or more at once. | 🎮 Player | `event whot.mega_stack` (H) |
| 🥇 Gold | Empty Market | Win a game in which the market pile ran out and reshuffled. | 🎮 Player | `event whot.market_reshuffle_win` (H) |
| 🏆 Platinum | Whot Sovereign | Earn every other Whot trophy. | 🎮 Player | `platinum whot` |

### Chess (`chess`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Blood | Win your first game of chess. | 🎮 Player | `counter chess.wins ≥ 1` |
| 🥉 Bronze | Opening Moves | Play 10 games of chess to completion. | 🎮 Player | `counter chess.games_played ≥ 10` |
| 🥉 Bronze | Castle Keep | Castle (king-side or queen-side) in a game. | 🎮 Player | `event chess.castle` |
| 🥉 Bronze | First Promotion | Promote a pawn to any piece. | 🎮 Player | `event chess.promote` |
| 🥉 Bronze | Queen Slayer | Capture your opponent's queen. | 🎮 Player | `event chess.capture_queen` |
| 🥉 Bronze | En Passant | Execute an en passant capture. | 🎮 Player | `event chess.en_passant` |
| 🥉 Bronze | Check, Please | Deliver check to your opponent 25 times across games. | 🎮 Player | `counter chess.checks_given ≥ 25` |
| 🥉 Bronze | Table Setter | As host, open and start 10 chess matches. | 🎙️ Host | `counter chess.hosted ≥ 10` |
| 🥈 Silver | Ten Wins | Win 10 games of chess. | 🎮 Player | `counter chess.wins ≥ 10` |
| 🥈 Silver | Back-Rank Special | Win by delivering a back-rank checkmate. | 🎮 Player | `event chess.back_rank_mate` |
| 🥈 Silver | Underpromotion | Promote a pawn to a knight, bishop, or rook (not a queen). | 🎮 Player | `event chess.underpromote` |
| 🥈 Silver | Queen's Guard | Win a game without ever losing your queen. | 🎮 Player | `event chess.win_queen_alive` |
| 🥈 Silver | The Sacrifice | Win a game in which you sacrificed your queen. | 🎮 Player | `event chess.queen_sac_win` |
| 🥈 Silver | Hat Trick | Win 3 games of chess in a row. | 🎮 Player | `counter chess.win_streak ≥ 3` |
| 🥈 Silver | Promotion Party | Promote 10 pawns across all your games. | 🎮 Player | `counter chess.promotions ≥ 10` |
| 🥈 Silver | Blitz Finish | Win a game in under 3 minutes of play time. | 🎮 Player | `event chess.fast_win` |
| 🥈 Silver | Grandmaster's Table | Host 25 chess matches. | 🎙️ Host | `counter chess.hosted ≥ 25` |
| 🥇 Gold | Twenty-Five Wins | Win 25 games of chess. | 🎮 Player | `counter chess.wins ≥ 25` |
| 🥇 Gold | Fifty Wins | Win 50 games of chess. | 🎮 Player | `counter chess.wins ≥ 50` |
| 🥇 Gold | Century Master | Win 100 games of chess. | 🎮 Player | `counter chess.wins ≥ 100` |
| 🥇 Gold | Scholar's Mate | Win by checkmate in 10 moves or fewer. | 🎮 Player | `event chess.scholars_mate` |
| 🥇 Gold | Smother | Win by delivering a smothered mate with a knight. | 🎮 Player | `event chess.smothered_mate` (H) |
| 🥇 Gold | Endgame Artist | Win a game with only a king and pawns remaining on your side. | 🎮 Player | `event chess.pawn_endgame_win` |
| 🥇 Gold | Unbeaten Run | Win 7 games of chess in a row. | 🎮 Player | `counter chess.win_streak ≥ 7` |
| 🥇 Gold | Stalemate Dodger | Convert a game to a win from a position that was drawish. | 🎮 Player | `event chess.stalemate_avoided` (H) |
| 🥇 Gold | Two-Queen Tyranny | Win a game while controlling two queens at once. | 🎮 Player | `event chess.two_queens_win` (H) |
| 🏆 Platinum | Chess Immortal | Earn every other Chess trophy. | 🎮 Player | `platinum chess` |

### Checkers (`checkers`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Crown | Win your first game of checkers. | 🎮 Player | `counter checkers.wins ≥ 1` |
| 🥉 Bronze | Board Regular | Play 10 games of checkers to completion. | 🎮 Player | `counter checkers.games_played ≥ 10` |
| 🥉 Bronze | Coronation | King a piece by reaching the far row. | 🎮 Player | `event checkers.king_piece` |
| 🥉 Bronze | Double Trouble | Capture two pieces in a single multi-jump. | 🎮 Player | `event checkers.double_jump` |
| 🥉 Bronze | First Capture | Jump and capture an opponent's piece. | 🎮 Player | `event checkers.first_capture` |
| 🥈 Silver | Ten Crowns | Win 10 games of checkers. | 🎮 Player | `counter checkers.wins ≥ 10` |
| 🥈 Silver | Triple Threat | Capture three pieces in a single multi-jump. | 🎮 Player | `event checkers.triple_jump` |
| 🥈 Silver | King Me Twice | King two pieces in the same game. | 🎮 Player | `event checkers.double_king` |
| 🥈 Silver | Forced Hand | Win a game exploiting a forced-capture combo. | 🎮 Player | `event checkers.forced_combo` |
| 🥈 Silver | Streak of Two | Win 3 games of checkers in a row. | 🎮 Player | `counter checkers.win_streak ≥ 3` |
| 🥈 Silver | Capture Count | Capture 50 pieces across all your games. | 🎮 Player | `counter checkers.captures ≥ 50` |
| 🥈 Silver | Room Host | Host 10 checkers matches. | 🎙️ Host | `counter checkers.hosted ≥ 10` |
| 🥇 Gold | Twenty-Five Crowns | Win 25 games of checkers. | 🎮 Player | `counter checkers.wins ≥ 25` |
| 🥇 Gold | Fifty Crowns | Win 50 games of checkers. | 🎮 Player | `counter checkers.wins ≥ 50` |
| 🥇 Gold | Flawless Board | Win a game without losing a single piece. | 🎮 Player | `event checkers.win_no_loss` |
| 🥇 Gold | Quad Jump | Capture four pieces in a single multi-jump. | 🎮 Player | `event checkers.quad_jump` (H) |
| 🥇 Gold | Unstoppable | Win 6 games of checkers in a row. | 🎮 Player | `counter checkers.win_streak ≥ 6` |
| 🏆 Platinum | King of the Board | Earn every other Checkers trophy. | 🎮 Player | `platinum checkers` |

### Ludo (`ludo`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Home | Win your first game of Ludo. | 🎮 Player | `counter ludo.wins ≥ 1` |
| 🥉 Bronze | Dice Roller | Play 10 games of Ludo to completion. | 🎮 Player | `counter ludo.games_played ≥ 10` |
| 🥉 Bronze | Breakout | Roll a 6 to move a token out of base. | 🎮 Player | `event ludo.leave_base` |
| 🥉 Bronze | First Capture | Land on an opponent token and send it home. | 🎮 Player | `event ludo.first_capture` |
| 🥉 Bronze | Safe Haven | Land a token on a safe star square. | 🎮 Player | `event ludo.safe_square` |
| 🥉 Bronze | One Home | Get your first token into the home column. | 🎮 Player | `event ludo.first_token_home` |
| 🥉 Bronze | Lucky Six | Roll a 6 twenty-five times across your games. | 🎮 Player | `counter ludo.sixes ≥ 25` |
| 🥉 Bronze | Party Host | As host, fill a Ludo room to four players. | 🎙️ Host | `event ludo.host_full_room` |
| 🥈 Silver | Ten Homes | Win 10 games of Ludo. | 🎮 Player | `counter ludo.wins ≥ 10` |
| 🥈 Silver | Sniper | Capture three opponent tokens in a single game. | 🎮 Player | `event ludo.triple_capture` |
| 🥈 Silver | Roadblock | Form a barrier by stacking two of your tokens on one square. | 🎮 Player | `event ludo.barrier` |
| 🥈 Silver | Homeward Bound | Get all four of your tokens home in a game. | 🎮 Player | `event ludo.all_four_home` |
| 🥈 Silver | Bounty Hunter | Capture 50 opponent tokens across all your games. | 🎮 Player | `counter ludo.captures ≥ 50` |
| 🥈 Silver | Token Traffic | Bring 100 tokens home across all your games. | 🎮 Player | `counter ludo.tokens_home ≥ 100` |
| 🥈 Silver | Room Runner | Host 15 games of Ludo. | 🎙️ Host | `counter ludo.hosted ≥ 15` |
| 🥇 Gold | Twenty-Five Homes | Win 25 games of Ludo. | 🎮 Player | `counter ludo.wins ≥ 25` |
| 🥇 Gold | Fifty Homes | Win 50 games of Ludo. | 🎮 Player | `counter ludo.wins ≥ 50` |
| 🥇 Gold | Century Racer | Win 100 games of Ludo. | 🎮 Player | `counter ludo.wins ≥ 100` |
| 🥇 Gold | Against All Odds | Win a game after being the last player with tokens still in base. | 🎮 Player | `event ludo.win_from_behind` |
| 🥇 Gold | Triple Six | Roll three 6s in a row (and forfeit the turn). | 🎮 Player | `event ludo.triple_six` (H) |
| 🥇 Gold | Clean Sweep | Capture all four of an opponent's tokens in one game. | 🎮 Player | `event ludo.sweep_opponent` (H) |
| 🏆 Platinum | Ludo Overlord | Earn every other Ludo trophy. | 🎮 Player | `platinum ludo` |

### Snakes & Ladders (`snake_and_ladder`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Steps | Win your first race to tile 100. | 🎮 Player | `event snake_and_ladder.first_win` |
| 🥈 Silver | Dice Darling | Win 10 games of Snakes & Ladders. | 🎮 Player | `counter snake_and_ladder.wins ≥ 10` |
| 🥇 Gold | Track Tyrant | Win 25 games of Snakes & Ladders. | 🎮 Player | `counter snake_and_ladder.wins ≥ 25` |
| 🥉 Bronze | Rung Rookie | Climb 10 ladders across all your games. | 🎮 Player | `counter snake_and_ladder.ladders_climbed ≥ 10` |
| 🥈 Silver | Sky Climber | Climb 75 ladders across all your games. | 🎮 Player | `counter snake_and_ladder.ladders_climbed ≥ 75` |
| 🥉 Bronze | Chomped | Land on a snake's head and slide down for the first time. | 🎮 Player | `event snake_and_ladder.snake_bitten` |
| 🥈 Silver | Snake Snack | Get bitten by snakes 25 times. | 🎮 Player | `counter snake_and_ladder.snake_bites ≥ 25` |
| 🥇 Gold | Fang Survivor | Win a game after sliding down a snake from the 90s. | 🎮 Player | `event snake_and_ladder.snakebit_victory` (H) |
| 🥉 Bronze | Right on the Nose | Finish with the exact roll needed to land on 100. | 🎮 Player | `event snake_and_ladder.exact_finish` |
| 🥈 Silver | Precision Pilot | Finish on an exact roll 10 times. | 🎮 Player | `counter snake_and_ladder.exact_finishes ≥ 10` |
| 🥉 Bronze | Top of the World | Ride the tallest ladder on the board in a single move. | 🎮 Player | `event snake_and_ladder.tallest_ladder` |
| 🥇 Gold | Basement Bounce | Win a game after being stranded on tile 10 or lower mid-race. | 🎮 Player | `event snake_and_ladder.bottom_comeback` (H) |
| 🥈 Silver | Regular Roller | Play 50 games of Snakes & Ladders. | 🎮 Player | `counter snake_and_ladder.games_played ≥ 50` |
| 🥈 Silver | Room Runner | Host 10 Snakes & Ladders rooms. | 🎙️ Host | `counter snake_and_ladder.rooms_hosted ≥ 10` |
| 🏆 Platinum | Ruler of the Board | Earn every other Snakes & Ladders trophy. | 🎮 Player | `platinum snake_and_ladder` |

### Tic-Tac-Toe (`tic_tac_toe`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Three in a Row | Win your first game of Tic-Tac-Toe. | 🎮 Player | `event tic_tac_toe.first_win` |
| 🥈 Silver | Line Leader | Win 25 games of Tic-Tac-Toe. | 🎮 Player | `counter tic_tac_toe.wins ≥ 25` |
| 🥇 Gold | Grid Gladiator | Win 100 games of Tic-Tac-Toe. | 🎮 Player | `counter tic_tac_toe.wins ≥ 100` |
| 🥇 Gold | Double Trouble | Win by creating a fork — two winning lines your opponent can't both block. | 🎮 Player | `event tic_tac_toe.fork_win` (H) |
| 🥉 Bronze | Wall Then Win | Block an opponent's winning line, then go on to win that game. | 🎮 Player | `event tic_tac_toe.block_and_win` |
| 🥉 Bronze | Stalemate | Play out your first drawn game. | 🎮 Player | `event tic_tac_toe.first_draw` |
| 🥈 Silver | Deadlock Dealer | Reach 25 drawn games. | 🎮 Player | `counter tic_tac_toe.draws ≥ 25` |
| 🥇 Gold | Unstoppable | Win 10 games in a row without a loss or draw. | 🎮 Player | `counter tic_tac_toe.win_streak ≥ 10` |
| 🥉 Bronze | Quick Draw | Win in the minimum number of moves. | 🎮 Player | `event tic_tac_toe.fast_win` (H) |
| 🥈 Silver | Team X | Win 25 games playing as X. | 🎮 Player | `counter tic_tac_toe.wins_as_x ≥ 25` |
| 🥈 Silver | Team O | Win 25 games playing as O. | 🎮 Player | `counter tic_tac_toe.wins_as_o ≥ 25` |
| 🥉 Bronze | Board Regular | Play 100 games of Tic-Tac-Toe. | 🎮 Player | `counter tic_tac_toe.games_played ≥ 100` |
| 🥉 Bronze | First Table | Host your first Tic-Tac-Toe match. | 🎙️ Host | `event tic_tac_toe.host_first` |
| 🥈 Silver | Match Maker | Host 25 Tic-Tac-Toe matches. | 🎙️ Host | `counter tic_tac_toe.matches_hosted ≥ 25` |
| 🏆 Platinum | Grid Grandmaster | Earn every other Tic-Tac-Toe trophy. | 🎮 Player | `platinum tic_tac_toe` |

### Crazy Eights (`crazy_eights`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Hand Cleared | Win your first game of Crazy Eights. | 🎮 Player | `event crazy_eights.first_win` |
| 🥈 Silver | Card Shark | Win 10 games of Crazy Eights. | 🎮 Player | `counter crazy_eights.wins ≥ 10` |
| 🥈 Silver | Shed Master | Win 25 games of Crazy Eights. | 🎮 Player | `counter crazy_eights.wins ≥ 25` |
| 🥇 Gold | Discard Dynasty | Win 50 games of Crazy Eights. | 🎮 Player | `counter crazy_eights.wins ≥ 50` |
| 🥉 Bronze | Eighty-Six It | Win a game by playing an 8 as your final card. | 🎮 Player | `event crazy_eights.win_on_eight` |
| 🥈 Silver | Wildfinish | Win with an 8 as your last card 10 times. | 🎮 Player | `counter crazy_eights.eight_wins ≥ 10` |
| 🥉 Bronze | Empty-Handed | Shed the very last card in your hand to finish a game. | 🎮 Player | `event crazy_eights.empty_hand` |
| 🥈 Silver | Triple Wild | Play three 8s in a single game. | 🎮 Player | `event crazy_eights.triple_eights` (H) |
| 🥈 Silver | Suit Yourself | Change the suit with an 8 a total of 50 times. | 🎮 Player | `counter crazy_eights.suit_changes ≥ 50` |
| 🥇 Gold | Never Fold | Win a game without ever drawing from the stock pile. | 🎮 Player | `event crazy_eights.no_draw_win` (H) |
| 🥉 Bronze | Stack Attack | Stack a draw penalty onto the next player for the first time. | 🎮 Player | `event crazy_eights.stack_penalty` |
| 🥇 Gold | Pile Driver | Force opponents to pick up 25 stacked penalty cards total. | 🎮 Player | `counter crazy_eights.stacked_cards ≥ 25` |
| 🥉 Bronze | Against the Odds | Win a game from a hand of 10 or more cards. | 🎮 Player | `event crazy_eights.comeback_win` (H) |
| 🥉 Bronze | Getting the Hang of It | Play 10 games of Crazy Eights. | 🎮 Player | `counter crazy_eights.games_played ≥ 10` |
| 🥇 Gold | Table Veteran | Play 100 games of Crazy Eights. | 🎮 Player | `counter crazy_eights.games_played ≥ 100` |
| 🥉 Bronze | Dealer's First | Host your first Crazy Eights room. | 🎙️ Host | `event crazy_eights.host_first` |
| 🥈 Silver | House Dealer | Host 10 Crazy Eights rooms. | 🎙️ Host | `counter crazy_eights.rooms_hosted ≥ 10` |
| 🥇 Gold | Card Room Boss | Host 50 Crazy Eights rooms. | 🎙️ Host | `counter crazy_eights.rooms_hosted ≥ 50` |
| 🏆 Platinum | Wild at Heart | Earn every other Crazy Eights trophy. | 🎮 Player | `platinum crazy_eights` |

### Monopoly (`monopoly`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Collect $200 | Pass GO for the first time. | 🎮 Player | `event monopoly.first_go` |
| 🥈 Silver | Lap Runner | Pass GO 50 times across all games. | 🎮 Player | `counter monopoly.go_passes ≥ 50` |
| 🥇 Gold | Marathon Mogul | Pass GO 200 times across all games. | 🎮 Player | `counter monopoly.go_passes ≥ 200` |
| 🥉 Bronze | Last One Standing | Win your first game of Monopoly. | 🎮 Player | `event monopoly.first_win` |
| 🥈 Silver | Property Pro | Win 10 games of Monopoly. | 🎮 Player | `counter monopoly.wins ≥ 10` |
| 🥇 Gold | Boardroom Baron | Win 25 games of Monopoly. | 🎮 Player | `counter monopoly.wins ≥ 25` |
| 🥉 Bronze | Full Set | Own every property in a single colour group. | 🎮 Player | `event monopoly.first_set` |
| 🥇 Gold | Clean Sweep | Own every property along one full side of the board. | 🎮 Player | `event monopoly.side_sweep` (H) |
| 🥉 Bronze | Breaking Ground | Build your first house. | 🎮 Player | `event monopoly.first_house` |
| 🥈 Silver | Construction Crew | Build 50 houses across all games. | 🎮 Player | `counter monopoly.houses_built ≥ 50` |
| 🥉 Bronze | Grand Opening | Build your first hotel. | 🎮 Player | `event monopoly.first_hotel` |
| 🥇 Gold | Hotel Empire | Put a hotel on every property in a colour set. | 🎮 Player | `event monopoly.full_hotels` (H) |
| 🥉 Bronze | First Paycheck | Collect rent from an opponent for the first time. | 🎮 Player | `event monopoly.first_rent` |
| 🥈 Silver | Landlord Life | Collect $10,000 in rent across all games. | 🎮 Player | `counter monopoly.rent_collected ≥ 10000` |
| 🥇 Gold | Rent Tycoon | Collect $100,000 in rent across all games. | 🎮 Player | `counter monopoly.rent_collected ≥ 100000` |
| 🥇 Gold | Highway Robbery | Charge a single rent of $2,000 or more. | 🎮 Player | `counter monopoly.biggest_rent ≥ 2000` (H) |
| 🥈 Silver | Prime Real Estate | Own both Boardwalk and Park Place at the same time. | 🎮 Player | `event monopoly.own_mayfair` |
| 🥉 Bronze | Behind Bars | Get sent to jail. | 🎮 Player | `event monopoly.go_to_jail` |
| 🥉 Bronze | Jailbreak | Get out of jail with a card or a roll. | 🎮 Player | `event monopoly.jail_break` |
| 🥈 Silver | Game Over, Friend | Bankrupt an opponent out of the game. | 🎮 Player | `event monopoly.bankruptcy` (H) |
| 🥉 Bronze | Let's Make a Deal | Complete your first property trade. | 🎮 Player | `event monopoly.first_trade` |
| 🥈 Silver | All Aboard | Own all four railroads at once. | 🎮 Player | `distinct monopoly.railroads_owned ≥ 4` |
| 🥈 Silver | Deep Pockets | Hold $5,000 or more in cash at once. | 🎮 Player | `counter monopoly.peak_cash ≥ 5000` |
| 🥉 Bronze | Going Once, Going Twice | Win a property at auction. | 🎮 Player | `event monopoly.auction_win` |
| 🥉 Bronze | Opening the Doors | Host your first Monopoly game. | 🎙️ Host | `event monopoly.host_first` |
| 🥈 Silver | Table Host | Host 10 Monopoly games. | 🎙️ Host | `counter monopoly.games_hosted ≥ 10` |
| 🥇 Gold | Casino Owner | Host 50 Monopoly games. | 🎙️ Host | `counter monopoly.games_hosted ≥ 50` |
| 🥈 Silver | Full House | Host a Monopoly game with a full room of 6 players. | 🎙️ Host | `event monopoly.full_room` |
| 🏆 Platinum | Titan of the Board | Earn every other Monopoly trophy. | 🎮 Player | `platinum monopoly` |

### Yahtzee (`yahtzee`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Scorecard Filled | Complete your first full game of Yahtzee. | 🎮 Player | `event yahtzee.first_game` |
| 🥈 Silver | Roll Regular | Complete 25 games of Yahtzee. | 🎮 Player | `counter yahtzee.games_played ≥ 25` |
| 🥇 Gold | Dice Devotee | Complete 100 games of Yahtzee. | 🎮 Player | `counter yahtzee.games_played ≥ 100` |
| 🥉 Bronze | Yahtzee! | Roll your first Yahtzee — five of a kind. | 🎮 Player | `event yahtzee.first_yahtzee` |
| 🥈 Silver | High Five | Roll 5 Yahtzees across all games. | 🎮 Player | `counter yahtzee.yahtzees ≥ 5` |
| 🥇 Gold | Five-Alive Legend | Roll 10 Yahtzees across all games. | 🎮 Player | `counter yahtzee.yahtzees ≥ 10` |
| 🥉 Bronze | Full House | Score the full house category. | 🎮 Player | `event yahtzee.full_house` |
| 🥉 Bronze | Small Run | Score a small straight (four in sequence). | 🎮 Player | `event yahtzee.small_straight` |
| 🥈 Silver | Long Run | Score a large straight (five in sequence). | 🎮 Player | `event yahtzee.large_straight` |
| 🥉 Bronze | Four of a Kind | Score the four-of-a-kind category. | 🎮 Player | `event yahtzee.four_kind` |
| 🥈 Silver | Bonus Earned | Score 63 or more in the upper section to claim the bonus. | 🎮 Player | `event yahtzee.upper_bonus` |
| 🥈 Silver | Double Century | Finish a game with a total score of 200 or more. | 🎮 Player | `counter yahtzee.high_score ≥ 200` |
| 🥇 Gold | Triple Century | Finish a game with a total score of 300 or more. | 🎮 Player | `counter yahtzee.high_score ≥ 300` |
| 🥇 Gold | Near Perfect | Finish a game with a total score of 375 or more. | 🎮 Player | `counter yahtzee.high_score ≥ 375` (H) |
| 🥇 Gold | Twice as Nice | Roll two or more Yahtzees in a single game. | 🎮 Player | `event yahtzee.multi_yahtzee` (H) |
| 🥈 Silver | All Sixes | Fill the sixes box with the maximum 30 points. | 🎮 Player | `event yahtzee.all_sixes` |
| 🥉 Bronze | Nothing Wasted | Finish a game without scratching a single category to zero. | 🎮 Player | `event yahtzee.no_scratch` (H) |
| 🥉 Bronze | Wild Dice | Score a Yahtzee under the joker rule. | 🎮 Player | `event yahtzee.joker_rule` |
| 🥉 Bronze | Three's Company | Score the three-of-a-kind category. | 🎮 Player | `event yahtzee.three_kind` |
| 🥉 Bronze | First Table | Host your first Yahtzee game. | 🎙️ Host | `event yahtzee.host_first` |
| 🥈 Silver | Dice Warden | Host 10 Yahtzee games. | 🎙️ Host | `counter yahtzee.games_hosted ≥ 10` |
| 🥈 Silver | Cup Runner | Host 40 Yahtzee games. | 🎙️ Host | `counter yahtzee.games_hosted ≥ 40` |
| 🏆 Platinum | Deity of the Dice | Earn every other Yahtzee trophy. | 🎮 Player | `platinum yahtzee` |

## Word, trivia & puzzle games

### Trivia (`trivia`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Steps | Answer 10 questions across any trivia games. | 🎮 Player | `counter trivia.questions_answered ≥ 10` |
| 🥉 Bronze | Getting Warm | Rack up 25 correct answers. | 🎮 Player | `counter trivia.correct ≥ 25` |
| 🥉 Bronze | First Victory | Win your very first trivia game. | 🎮 Player | `counter trivia.games_won ≥ 1` |
| 🥉 Bronze | Hot Streak | Answer 5 questions correctly in a row. | 🎮 Player | `counter trivia.answer_streak ≥ 5` |
| 🥉 Bronze | Fast Fingers | Be the first player to lock in the correct answer in a round. | 🎮 Player | `event trivia.fastest_finger` |
| 🥉 Bronze | Lightning Reflex | Answer a question correctly in under 2 seconds. | 🎮 Player | `event trivia.speed_answer` |
| 🥉 Bronze | Sampler | Play questions from 3 different categories. | 🎮 Player | `distinct trivia.category ≥ 3` |
| 🥉 Bronze | Perfect Start | Get every question in a single round correct. | 🎮 Player | `event trivia.perfect_round` |
| 🥉 Bronze | Open the Doors | Host your first trivia room. | 🎙️ Host | `counter trivia.rooms_hosted ≥ 1` |
| 🥉 Bronze | Packed House | Host a trivia room filled with 8 or more players. | 🎙️ Host | `event trivia.full_room` (H) |
| 🥈 Silver | Quiz Regular | Answer 50 questions total. | 🎮 Player | `counter trivia.questions_answered ≥ 50` |
| 🥈 Silver | Sharp Mind | Reach 100 correct answers. | 🎮 Player | `counter trivia.correct ≥ 100` |
| 🥈 Silver | Champion | Win 5 trivia games. | 🎮 Player | `counter trivia.games_won ≥ 5` |
| 🥈 Silver | Unstoppable | Answer 10 questions correctly in a row. | 🎮 Player | `counter trivia.answer_streak ≥ 10` |
| 🥈 Silver | Category Master | Get 20 correct answers within a single category. | 🎮 Player | `counter trivia.category_correct ≥ 20` |
| 🥈 Silver | Well Traveled | Play questions from 6 different categories. | 🎮 Player | `distinct trivia.category ≥ 6` |
| 🥈 Silver | Comeback Kid | Win a game after sitting in last place at the halfway mark. | 🎮 Player | `event trivia.comeback` (H) |
| 🥈 Silver | Quizmaster Host | Host 10 trivia games. | 🎙️ Host | `counter trivia.games_hosted ≥ 10` |
| 🥇 Gold | Question Machine | Answer 250 questions total. | 🎮 Player | `counter trivia.questions_answered ≥ 250` |
| 🥇 Gold | Trivia Titan | Answer 1,000 questions total. | 🎮 Player | `counter trivia.questions_answered ≥ 1000` |
| 🥇 Gold | Walking Encyclopedia | Reach 500 correct answers. | 🎮 Player | `counter trivia.correct ≥ 500` |
| 🥇 Gold | Trivia Dynasty | Win 25 trivia games. | 🎮 Player | `counter trivia.games_won ≥ 25` |
| 🥇 Gold | Flawless Victory | Win a full game without a single wrong answer. | 🎮 Player | `event trivia.flawless_game` (H) |
| 🥇 Gold | Quickest Draw | Be the first to answer correctly 25 times. | 🎮 Player | `counter trivia.fastest_finger ≥ 25` |
| 🏆 Platinum | Grand Quizmaster | Earn every other Trivia trophy. | 🎮 Player | `platinum trivia` |

### Scrabble (`scrabble`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Opening Move | Place your very first word on the board. | 🎮 Player | `event scrabble.first_word` |
| 🥉 Bronze | Word Smith | Play 25 words across your games. | 🎮 Player | `counter scrabble.words_played ≥ 25` |
| 🥉 Bronze | First Win | Win your first Scrabble game. | 🎮 Player | `counter scrabble.games_won ≥ 1` |
| 🥉 Bronze | Bingo! | Use all 7 of your tiles in a single play for the 50-point bonus. | 🎮 Player | `counter scrabble.bingo ≥ 1` |
| 🥉 Bronze | Double Trouble | Land a word on a triple-word-score square. | 🎮 Player | `event scrabble.triple_word` |
| 🥉 Bronze | Big Play | Score 30 or more points on a single word. | 🎮 Player | `event scrabble.word_30` |
| 🥉 Bronze | Wild Card | Play a blank tile as part of a word. | 🎮 Player | `event scrabble.blank_tile` |
| 🥉 Bronze | Q Without U | Play a valid word containing the letter Q. | 🎮 Player | `event scrabble.letter_q` (H) |
| 🥉 Bronze | Points Starter | Accumulate 5,000 total points. | 🎮 Player | `counter scrabble.total_points ≥ 5000` |
| 🥉 Bronze | Set the Board | Host your first Scrabble game. | 🎙️ Host | `counter scrabble.games_hosted ≥ 1` |
| 🥈 Silver | Wordy | Play 150 words across your games. | 🎮 Player | `counter scrabble.words_played ≥ 150` |
| 🥈 Silver | Winner's Circle | Win 10 Scrabble games. | 🎮 Player | `counter scrabble.games_won ≥ 10` |
| 🥈 Silver | Bingo Regular | Score 5 seven-tile bingos. | 🎮 Player | `counter scrabble.bingo ≥ 5` |
| 🥈 Silver | Bigger Play | Score 40 or more points on a single word. | 🎮 Player | `event scrabble.word_40` |
| 🥈 Silver | High Value | Play words using each of Q, Z, X and J at least once. | 🎮 Player | `distinct scrabble.rare_letter ≥ 4` |
| 🥈 Silver | Long Word | Play a word that is 8 or more letters long. | 🎮 Player | `counter scrabble.longest_word ≥ 8` |
| 🥈 Silver | Packed Table | Host a Scrabble game with a full table of players. | 🎙️ Host | `event scrabble.full_room` (H) |
| 🥈 Silver | Table Regular | Host 10 Scrabble games. | 🎙️ Host | `counter scrabble.games_hosted ≥ 10` |
| 🥇 Gold | Word Master | Play 500 words across your games. | 🎮 Player | `counter scrabble.words_played ≥ 500` |
| 🥇 Gold | Grandmaster | Win 25 Scrabble games. | 🎮 Player | `counter scrabble.games_won ≥ 25` |
| 🥇 Gold | Bingo Machine | Score 10 seven-tile bingos. | 🎮 Player | `counter scrabble.bingo ≥ 10` |
| 🥇 Gold | Monster Word | Score 50 or more points on a single word. | 🎮 Player | `event scrabble.word_50` (H) |
| 🥇 Gold | Point Millionaire | Accumulate 50,000 total points. | 🎮 Player | `counter scrabble.total_points ≥ 50000` |
| 🥇 Gold | Polyglot | Play games in all 4 language editions (English, French, German, Spanish). | 🎮 Player | `distinct scrabble.language ≥ 4` |
| 🏆 Platinum | Tile Sovereign | Earn every other Scrabble trophy. | 🎮 Player | `platinum scrabble` |

### Word Hunt (`word_hunt`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Word Spotter | Find 10 words in the letter grid. | 🎮 Player | `counter word_hunt.words_found ≥ 10` |
| 🥉 Bronze | First Round Win | Win your first Word Hunt round. | 🎮 Player | `counter word_hunt.rounds_won ≥ 1` |
| 🥉 Bronze | Five-Letter Find | Find a word that is 5 letters long. | 🎮 Player | `event word_hunt.word_5` |
| 🥉 Bronze | Fill the Grid | Host a Word Hunt round with a full room of players. | 🎙️ Host | `event word_hunt.full_room` |
| 🥉 Bronze | Warm Streak | Find 10 words within a single round. | 🎮 Player | `counter word_hunt.round_words ≥ 10` |
| 🥉 Bronze | Point Collector | Earn 2,000 total points. | 🎮 Player | `counter word_hunt.total_points ≥ 2000` |
| 🥉 Bronze | Start the Hunt | Host your first Word Hunt round. | 🎙️ Host | `counter word_hunt.games_hosted ≥ 1` |
| 🥉 Bronze | Daily Dabbler | Play Word Hunt on 3 different days. | 🎮 Player | `counter word_hunt.play_days ≥ 3` |
| 🥈 Silver | Word Hunter | Find 100 words across your rounds. | 🎮 Player | `counter word_hunt.words_found ≥ 100` |
| 🥈 Silver | Round Regular | Win 10 Word Hunt rounds. | 🎮 Player | `counter word_hunt.rounds_won ≥ 10` |
| 🥈 Silver | Six-Letter Sleuth | Find a word that is 6 letters long. | 🎮 Player | `event word_hunt.word_6` |
| 🥈 Silver | Combo Finder | Find 20 words within a single round. | 🎮 Player | `counter word_hunt.round_words ≥ 20` |
| 🥈 Silver | Speed Reader | Find 5 words in under 10 seconds. | 🎮 Player | `event word_hunt.speed_combo` (H) |
| 🥈 Silver | Streak Keeper | Play Word Hunt on 7 different days. | 🎮 Player | `counter word_hunt.play_days ≥ 7` |
| 🥈 Silver | Hunt Regular | Host 10 Word Hunt rounds. | 🎙️ Host | `counter word_hunt.games_hosted ≥ 10` |
| 🥇 Gold | Word Fiend | Find 500 words across your rounds. | 🎮 Player | `counter word_hunt.words_found ≥ 500` |
| 🥇 Gold | Lexicon Legend | Find 2,000 words across your rounds. | 🎮 Player | `counter word_hunt.words_found ≥ 2000` |
| 🥇 Gold | Seven-Letter Savant | Find a word that is 7 letters long. | 🎮 Player | `event word_hunt.word_7` |
| 🥇 Gold | Eight-Plus Elite | Find a word that is 8 or more letters long. | 🎮 Player | `event word_hunt.word_8` (H) |
| 🥇 Gold | Grid Legend | Find a pangram or rare bonus word in the grid. | 🎮 Player | `event word_hunt.rare_word` (H) |
| 🏆 Platinum | Grid Conqueror | Earn every other Word Hunt trophy. | 🎮 Player | `platinum word_hunt` |

### Sudoku (`sudoku`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Solve | Complete your first Sudoku puzzle. | 🎮 Player | `counter sudoku.solved ≥ 1` |
| 🥉 Bronze | Getting the Hang | Solve 10 puzzles. | 🎮 Player | `counter sudoku.solved ≥ 10` |
| 🥉 Bronze | Unaided | Solve a puzzle without using a single hint. | 🎮 Player | `counter sudoku.no_hint_solved ≥ 1` |
| 🥉 Bronze | Beat the Clock | Solve a puzzle in under 10 minutes. | 🎮 Player | `event sudoku.speed_10` |
| 🥉 Bronze | Easy Does It | Solve a puzzle on Easy difficulty. | 🎮 Player | `event sudoku.difficulty_easy` |
| 🥉 Bronze | Clean Sheet | Solve a puzzle with no mistakes flagged. | 🎮 Player | `counter sudoku.no_mistake_solved ≥ 1` |
| 🥉 Bronze | Warm Mind | Solve a puzzle on Medium difficulty. | 🎮 Player | `event sudoku.difficulty_medium` |
| 🥉 Bronze | Open the Grid | Host your first Sudoku room. | 🎙️ Host | `counter sudoku.games_hosted ≥ 1` |
| 🥉 Bronze | Fill the Room | Host a Sudoku room with a full lobby of players. | 🎙️ Host | `event sudoku.full_room` (H) |
| 🥈 Silver | Puzzle Regular | Solve 25 puzzles. | 🎮 Player | `counter sudoku.solved ≥ 25` |
| 🥈 Silver | Hint-Free Habit | Solve 10 puzzles without any hints. | 🎮 Player | `counter sudoku.no_hint_solved ≥ 10` |
| 🥈 Silver | Speed Solver | Solve a puzzle in under 5 minutes. | 🎮 Player | `event sudoku.speed_5` |
| 🥈 Silver | Getting Tough | Solve a puzzle on Hard difficulty. | 🎮 Player | `event sudoku.difficulty_hard` |
| 🥈 Silver | Spotless | Solve 10 puzzles with no mistakes. | 🎮 Player | `counter sudoku.no_mistake_solved ≥ 10` |
| 🥈 Silver | Streak Solver | Solve puzzles on 7 different days. | 🎮 Player | `counter sudoku.play_days ≥ 7` |
| 🥈 Silver | All Levels | Solve a puzzle at every difficulty (Easy, Medium, Hard, Expert). | 🎮 Player | `distinct sudoku.difficulty ≥ 4` |
| 🥈 Silver | Grid Regular | Host 10 Sudoku rooms. | 🎙️ Host | `counter sudoku.games_hosted ≥ 10` |
| 🥇 Gold | Century Solver | Solve 100 puzzles. | 🎮 Player | `counter sudoku.solved ≥ 100` |
| 🥇 Gold | Purist | Solve 50 puzzles without any hints. | 🎮 Player | `counter sudoku.no_hint_solved ≥ 50` |
| 🥇 Gold | Lightning Logic | Solve a puzzle in under 3 minutes. | 🎮 Player | `event sudoku.speed_3` (H) |
| 🥇 Gold | Expert Cracked | Solve a puzzle on Expert difficulty. | 🎮 Player | `event sudoku.difficulty_expert` |
| 🥇 Gold | Flawless First | Solve a puzzle on the first try with no hints and no mistakes. | 🎮 Player | `event sudoku.flawless_first` (H) |
| 🏆 Platinum | Sudoku Sage | Earn every other Sudoku trophy. | 🎮 Player | `platinum sudoku` |

### Codewords (`codewords`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Contact | Play your very first Codewords match. | 🎮 Player | `counter codewords.games_played ≥ 1` |
| 🥉 Bronze | First Blood | Win a match with your team. | 🎮 Player | `counter codewords.team_wins ≥ 1` |
| 🥉 Bronze | Triple Threat | As Spymaster, give a single clue tied to 3 of your words. | 🎮 Player | `event codewords.clue_three` |
| 🥉 Bronze | In Sync | Correctly reveal 10 of your team's words across all games. | 🎮 Player | `counter codewords.correct_guesses ≥ 10` |
| 🥉 Bronze | Sidestepped | Win a match without ever flipping the ASSASSIN card. | 🎮 Player | `event codewords.assassin_avoided` |
| 🥉 Bronze | Kiss of Death | Reveal the ASSASSIN and hand your team an instant loss. | 🎮 Player | `event codewords.assassin_hit` (H) |
| 🥉 Bronze | Two for One | As Operative, guess 2 correct words on a single turn. | 🎮 Player | `event codewords.double_hit` |
| 🥉 Bronze | Down to the Wire | Win when both teams are one word from victory. | 🎮 Player | `event codewords.close_win` (H) |
| 🥈 Silver | Word Regular | Play 10 Codewords matches. | 🎮 Player | `counter codewords.games_played ≥ 10` |
| 🥈 Silver | Repeat Winner | Win 10 matches with your team. | 🎮 Player | `counter codewords.team_wins ≥ 10` |
| 🥈 Silver | Best Spymaster | Voted the standout Spymaster of the match. | 🎮 Player | `event codewords_spymaster` |
| 🥈 Silver | Best Operative | Voted the standout Operative of the match. | 🎮 Player | `event codewords_operative` |
| 🥈 Silver | Quad Clue | As Spymaster, give a single clue tied to 4 of your words. | 🎮 Player | `event codewords.clue_four` |
| 🥈 Silver | Telepathy | Correctly reveal 50 of your team's words. | 🎮 Player | `counter codewords.correct_guesses ≥ 50` |
| 🥈 Silver | Board Keeper | Host 10 Codewords matches. | 🎙️ Host | `counter codewords.games_hosted ≥ 10` |
| 🥇 Gold | Codebreaker Legend | Play 50 Codewords matches. | 🎮 Player | `counter codewords.games_played ≥ 50` |
| 🥇 Gold | Grid Master | Win 25 matches with your team. | 🎮 Player | `counter codewords.team_wins ≥ 25` |
| 🥇 Gold | The Perfect Word | Give a clue for 5 words and have your team guess them all. | 🎮 Player | `event codewords.clue_five` |
| 🥇 Gold | Flawless Victory | Win a match with zero wrong guesses all game. | 🎮 Player | `event codewords.clean_win` |
| 🥇 Gold | Grand Arbiter | Host 50 Codewords matches. | 🎙️ Host | `counter codewords.games_hosted ≥ 50` |
| 🏆 Platinum | Nine in the Clear | Earn every other Codewords trophy. | 🎮 Player | `platinum codewords` |

### Bingo (`bingo`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Card | Play your first Bingo game. | 🎮 Player | `counter bingo.games_played ≥ 1` |
| 🥉 Bronze | First Win | Win your first game. | 🎮 Player | `counter bingo.wins ≥ 1` |
| 🥉 Bronze | Daub Debut | Mark 25 called numbers on your cards. | 🎮 Player | `counter bingo.numbers_marked ≥ 25` |
| 🥉 Bronze | Line 'Em Up | Win a game with a completed line. | 🎮 Player | `event bingo.line_win` |
| 🥉 Bronze | So Close | End a game one number short of a winning pattern. | 🎮 Player | `event bingo.near_miss` (H) |
| 🥉 Bronze | Lucky Corners | Win a game via the four-corners pattern. | 🎮 Player | `event bingo.four_corners` |
| 🥈 Silver | Card Sharp | Play 10 Bingo games. | 🎮 Player | `counter bingo.games_played ≥ 10` |
| 🥈 Silver | Ink Stained | Mark 100 called numbers. | 🎮 Player | `counter bingo.numbers_marked ≥ 100` |
| 🥈 Silver | Ten Down | Win 10 games. | 🎮 Player | `counter bingo.wins ≥ 10` |
| 🥈 Silver | Speed Daub | Win a game in 15 calls or fewer. | 🎮 Player | `event bingo.fast_win` (H) |
| 🥈 Silver | House Runner | Host and call 5 Bingo games. | 🎙️ Host | `counter bingo.games_hosted ≥ 5` |
| 🥈 Silver | Every Ball Counts | Call 500 numbers as the host. | 🎙️ Host | `counter bingo.numbers_called ≥ 500` |
| 🥇 Gold | Ink Well | Mark 500 called numbers. | 🎮 Player | `counter bingo.numbers_marked ≥ 500` |
| 🥇 Gold | Bingo Boss | Win 25 games. | 🎮 Player | `counter bingo.wins ≥ 25` |
| 🥇 Gold | Blackout | Win by filling every square on your card. | 🎮 Player | `event bingo.blackout` |
| 🥇 Gold | Master of Ceremonies | Host 25 Bingo games. | 🎙️ Host | `counter bingo.games_hosted ≥ 25` |
| 🏆 Platinum | Full House Hero | Earn every other Bingo trophy. | 🎮 Player | `platinum bingo` |

### Two Truths and a Lie (`two_truths`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Fib | Submit your first set of two truths and a lie. | 🎮 Player | `counter two_truths.sets_submitted ≥ 1` |
| 🥉 Bronze | Warming Up | Play your first game. | 🎮 Player | `counter two_truths.games_played ≥ 1` |
| 🥉 Bronze | Detective's Debut | Correctly spot the lie 5 times. | 🎮 Player | `counter two_truths.correct_guesses ≥ 5` |
| 🥉 Bronze | One Born Every Minute | Fool the entire table with your lie. | 🎮 Player | `event two_truths.fooled_table` |
| 🥉 Bronze | Snap Judgment | Catch the lie in the opening round of a game. | 🎮 Player | `event two_truths.quick_catch` (H) |
| 🥉 Bronze | Session Starter | Host 3 Two Truths games. | 🎙️ Host | `counter two_truths.games_hosted ≥ 3` |
| 🥈 Silver | Regular Liar | Submit 10 sets. | 🎮 Player | `counter two_truths.sets_submitted ≥ 10` |
| 🥈 Silver | Sharp Eye | Correctly spot the lie 25 times. | 🎮 Player | `counter two_truths.correct_guesses ≥ 25` |
| 🥈 Silver | Table Regular | Play 10 games. | 🎮 Player | `counter two_truths.games_played ≥ 10` |
| 🥈 Silver | Best Guesser | Voted the sharpest lie-catcher of the game. | 🎮 Player | `event two_truths_guesser` |
| 🥈 Silver | Table Host | Host 10 Two Truths games. | 🎙️ Host | `counter two_truths.games_hosted ≥ 10` |
| 🥇 Gold | Tall-Tale Titan | Submit 25 sets. | 🎮 Player | `counter two_truths.sets_submitted ≥ 25` |
| 🥇 Gold | Human Lie Detector | Correctly spot the lie 75 times. | 🎮 Player | `counter two_truths.correct_guesses ≥ 75` |
| 🥇 Gold | Perfect Detective | Catch the lie in every round of a single game. | 🎮 Player | `event two_truths.perfect_game` (H) |
| 🏆 Platinum | Nothing But the Truth | Earn every other Two Truths and a Lie trophy. | 🎮 Player | `platinum two_truths` |

### Describe It (`describe_it`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Ice Breaker | Play your first Describe It round. | 🎮 Player | `counter describe_it.rounds_played ≥ 1` |
| 🥉 Bronze | Getting Warmer | Guess 5 words correctly. | 🎮 Player | `counter describe_it.words_guessed ≥ 5` |
| 🥉 Bronze | First Victory | Win your first round with your team. | 🎮 Player | `counter describe_it.team_wins ≥ 1` |
| 🥉 Bronze | Buzzer Beater | Guess a word within 3 seconds of the first clue. | 🎮 Player | `event describe_it.fast_guess` |
| 🥉 Bronze | Best Guesser | Voted the standout guesser of the round. | 🎮 Player | `event describe_it_guesser` |
| 🥉 Bronze | Warm-Up Host | Host 3 Describe It rounds. | 🎙️ Host | `counter describe_it.games_hosted ≥ 3` |
| 🥈 Silver | Wordsmith | Play 10 rounds. | 🎮 Player | `counter describe_it.rounds_played ≥ 10` |
| 🥈 Silver | Vocabulary Vault | Guess 50 words correctly. | 🎮 Player | `counter describe_it.words_guessed ≥ 50` |
| 🥈 Silver | On a Roll | Win 10 rounds with your team. | 🎮 Player | `counter describe_it.team_wins ≥ 10` |
| 🥈 Silver | Best Describer | Voted the standout describer of the round. | 🎮 Player | `event describe_it_describer` |
| 🥈 Silver | Marathon Mouth | Clear 8 or more words in a single round. | 🎮 Player | `event describe_it.marathon_round` (H) |
| 🥈 Silver | Round Master | Host 15 Describe It rounds. | 🎙️ Host | `counter describe_it.games_hosted ≥ 15` |
| 🥇 Gold | Round Regular | Play 25 rounds. | 🎮 Player | `counter describe_it.rounds_played ≥ 25` |
| 🥇 Gold | Dictionary Destroyer | Guess 200 words correctly. | 🎮 Player | `counter describe_it.words_guessed ≥ 200` |
| 🥇 Gold | Unbeatable Team | Win 25 rounds with your team. | 🎮 Player | `counter describe_it.team_wins ≥ 25` |
| 🥇 Gold | Clean Sweep | Guess every word in a round with no passes. | 🎮 Player | `event describe_it.perfect_round` (H) |
| 🏆 Platinum | Words Fail Me | Earn every other Describe It trophy. | 🎮 Player | `platinum describe_it` |

### Who Said This (`who_said_this`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Name Dropper | Play your first Who Said This round. | 🎮 Player | `counter who_said_this.rounds_played ≥ 1` |
| 🥉 Bronze | Good Ear | Match 5 quotes to the right speaker. | 🎮 Player | `counter who_said_this.correct_matches ≥ 5` |
| 🥉 Bronze | First Verdict | Win your first game. | 🎮 Player | `counter who_said_this.wins ≥ 1` |
| 🥉 Bronze | Quick Quip | Match a quote in under 3 seconds. | 🎮 Player | `event who_said_this.fast_match` (H) |
| 🥉 Bronze | On a Roll | Match 5 quotes correctly in a row. | 🎮 Player | `event who_said_this.streak_five` |
| 🥉 Bronze | Pack Curator | Host a round using your own quote pack. | 🎙️ Host | `counter who_said_this.packs_hosted ≥ 1` |
| 🥈 Silver | Regular Reader | Play 10 rounds. | 🎮 Player | `counter who_said_this.rounds_played ≥ 10` |
| 🥈 Silver | Well-Read | Match 25 quotes correctly. | 🎮 Player | `counter who_said_this.correct_matches ≥ 25` |
| 🥈 Silver | Frequent Winner | Win 10 games. | 🎮 Player | `counter who_said_this.wins ≥ 10` |
| 🥈 Silver | Flawless Recall | Match every quote correctly in a single game. | 🎮 Player | `event who_said_this.perfect_game` (H) |
| 🥈 Silver | Quiz Master | Host 10 Who Said This games. | 🎙️ Host | `counter who_said_this.games_hosted ≥ 10` |
| 🥇 Gold | Quote Machine | Play 25 rounds. | 🎮 Player | `counter who_said_this.rounds_played ≥ 25` |
| 🥇 Gold | Total Recall | Match 100 quotes correctly. | 🎮 Player | `counter who_said_this.correct_matches ≥ 100` |
| 🥇 Gold | Champion Attributor | Win 25 games. | 🎮 Player | `counter who_said_this.wins ≥ 25` |
| 🏆 Platinum | The Last Word | Earn every other Who Said This trophy. | 🎮 Player | `platinum who_said_this` |

### NPAT / Name-Place-Animal-Thing (`i_call_on`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Letter | Play your first NPAT round. | 🎮 Player | `counter i_call_on.rounds_played ≥ 1` |
| 🥉 Bronze | Off the Mark | Win your first round. | 🎮 Player | `counter i_call_on.round_wins ≥ 1` |
| 🥉 Bronze | Original Thinker | Score 25 unique (unmatched) answers. | 🎮 Player | `counter i_call_on.unique_answers ≥ 25` |
| 🥉 Bronze | Full Sheet | Fill every category before the timer runs out. | 🎮 Player | `event i_call_on.full_sheet` |
| 🥉 Bronze | Quick Draw | Be the first to lock in a completed sheet. | 🎮 Player | `event i_call_on.first_to_submit` |
| 🥉 Bronze | The Caller | Host 5 NPAT rounds. | 🎙️ Host | `counter i_call_on.rounds_hosted ≥ 5` |
| 🥈 Silver | Alphabet Regular | Play 10 rounds. | 🎮 Player | `counter i_call_on.rounds_played ≥ 10` |
| 🥈 Silver | On the Board | Win 10 rounds. | 🎮 Player | `counter i_call_on.round_wins ≥ 10` |
| 🥈 Silver | Nothing in Common | Complete a round where every one of your answers is unique. | 🎮 Player | `event i_call_on.all_unique` (H) |
| 🥈 Silver | Objection Sustained | Win a scoring dispute when the caller reviews answers. | 🎮 Player | `event i_call_on.dispute_won` (H) |
| 🥈 Silver | Category Specialist | Top-score across 5 different categories (name, place, animal, thing, food). | 🎮 Player | `distinct i_call_on.categories_aced ≥ 5` |
| 🥈 Silver | Head Judge | Adjudicate 25 rounds as the caller. | 🎙️ Host | `counter i_call_on.rounds_judged ≥ 25` |
| 🥇 Gold | Letter Legend | Play 25 rounds. | 🎮 Player | `counter i_call_on.rounds_played ≥ 25` |
| 🥇 Gold | Round Royalty | Win 25 rounds. | 🎮 Player | `counter i_call_on.round_wins ≥ 25` |
| 🥇 Gold | Word Hoard | Score 200 unique answers. | 🎮 Player | `counter i_call_on.unique_answers ≥ 200` |
| 🥇 Gold | High Roller | Post the highest score of the round. | 🎮 Player | `event i_call_on.high_score` |
| 🏆 Platinum | Full Alphabet Sweep | Earn every other NPAT trophy. | 🎮 Player | `platinum i_call_on` |

## Voting & social games (participation & social based — no single "winner")

### Smash Marry Kill (`smash_marry_kill`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Impressions | Cast your smash, marry, and kill in your first round. | 🎮 Player | `event smash_marry_kill.first_round` |
| 🥉 Bronze | Making the Rounds | Vote in 25 total rounds of Smash Marry Kill. | 🎮 Player | `counter smash_marry_kill.rounds ≥ 25` |
| 🥉 Bronze | Serial Voter | Vote in 100 total rounds. | 🎮 Player | `counter smash_marry_kill.rounds ≥ 100` |
| 🥉 Bronze | Newlywed | Get voted "marry" for the first time. | 🎮 Player | `event smash_marry_kill.first_marry` |
| 🥉 Bronze | Table for One | Play your first full game. | 🎮 Player | `event smash_marry_kill.first_game` |
| 🥈 Silver | Hopeless Romantic | Vote in 500 total rounds. | 🎮 Player | `counter smash_marry_kill.rounds ≥ 500` |
| 🥈 Silver | Marriage Material | Get voted "marry" 25 times across all games. | 🎮 Player | `counter smash_marry_kill.marry_received ≥ 25` |
| 🥈 Silver | Certified Smash | Get voted "smash" 25 times across all games. | 🎮 Player | `counter smash_marry_kill.smash_received ≥ 25` |
| 🥈 Silver | Regulars' Night | Play 25 full games. | 🎮 Player | `counter smash_marry_kill.games ≥ 25` |
| 🥇 Gold | Great Minds | Match the entire table on all three picks in a single round. | 🎮 Player | `event smash_marry_kill.table_match` |
| 🥇 Gold | On the List | Get voted "kill" 50 times across all games. | 🎮 Player | `counter smash_marry_kill.kill_received ≥ 50` (H) |
| 🥇 Gold | Matchmaker General | Host 25 games of Smash Marry Kill. | 🎙️ Host | `counter smash_marry_kill.hosted ≥ 25` |
| 🏆 Platinum | Till Death Do Us Part | Earn every other Smash Marry Kill trophy. | 🎮 Player | `platinum smash_marry_kill` |

### Red Flag / Green Flag (`red_flag_green_flag`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Read | Cast your first green-or-red verdict on someone. | 🎮 Player | `event red_flag_green_flag.first_verdict` |
| 🥉 Bronze | Flag Bearer | Cast 25 total verdicts. | 🎮 Player | `counter red_flag_green_flag.verdicts ≥ 25` |
| 🥉 Bronze | Judge and Jury | Cast 100 total verdicts. | 🎮 Player | `counter red_flag_green_flag.verdicts ≥ 100` |
| 🥉 Bronze | Squeaky Clean | Be rated all-green by the whole room in a round. | 🎮 Player | `event red_flag_green_flag.all_green` |
| 🥉 Bronze | First Field Day | Play your first full game. | 🎮 Player | `event red_flag_green_flag.first_game` |
| 🥈 Silver | Human Lie Detector | Cast 500 total verdicts. | 🎮 Player | `counter red_flag_green_flag.verdicts ≥ 500` |
| 🥈 Silver | Beloved | Get rated all-green 10 times across all games. | 🎮 Player | `counter red_flag_green_flag.all_green_count ≥ 10` |
| 🥈 Silver | Rounds on the Board | Play in 100 total rounds. | 🎮 Player | `counter red_flag_green_flag.rounds ≥ 100` |
| 🥈 Silver | Season Ticket | Play 25 full games. | 🎮 Player | `counter red_flag_green_flag.games ≥ 25` |
| 🥇 Gold | Walking Red Flag | Be rated all-red by the whole room in a round. | 🎮 Player | `event red_flag_green_flag.all_red` (H) |
| 🥇 Gold | Verdict Machine | Cast 1000 total verdicts. | 🎮 Player | `counter red_flag_green_flag.verdicts ≥ 1000` |
| 🥇 Gold | Flag Marshal | Host 25 games of Red Flag / Green Flag. | 🎙️ Host | `counter red_flag_green_flag.hosted ≥ 25` |
| 🏆 Platinum | Colorblind No More | Earn every other Red Flag / Green Flag trophy. | 🎮 Player | `platinum red_flag_green_flag` |

### Smash or Pass (`smash_or_pass`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Opening Call | Make your first smash-or-pass call. | 🎮 Player | `event smash_or_pass.first_call` |
| 🥉 Bronze | Snap Judgment | Make 25 total calls. | 🎮 Player | `counter smash_or_pass.calls ≥ 25` |
| 🥉 Bronze | Quick Draw | Make 100 total calls. | 🎮 Player | `counter smash_or_pass.calls ≥ 100` |
| 🥉 Bronze | Warmed Up | Play your first full game. | 🎮 Player | `event smash_or_pass.first_game` |
| 🥈 Silver | Trigger Finger | Make 500 total calls. | 🎮 Player | `counter smash_or_pass.calls ≥ 500` |
| 🥈 Silver | Round Tripper | Play in 100 total rounds. | 🎮 Player | `counter smash_or_pass.rounds ≥ 100` |
| 🥈 Silver | Frequent Flyer | Play 25 full games. | 🎮 Player | `counter smash_or_pass.games ≥ 25` |
| 🥇 Gold | Room Consensus | Be part of a unanimous room call in a round. | 🎮 Player | `event smash_or_pass.unanimous` |
| 🥇 Gold | Hard Pass Legend | Make 1000 total calls. | 🎮 Player | `counter smash_or_pass.calls ≥ 1000` (H) |
| 🥇 Gold | Pass the Mic | Host 25 games of Smash or Pass. | 🎙️ Host | `counter smash_or_pass.hosted ≥ 25` |
| 🏆 Platinum | No Passing This Up | Earn every other Smash or Pass trophy. | 🎮 Player | `platinum smash_or_pass` |

### Would You Rather (`would_you_rather`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Fork in the Road | Answer your first dilemma. | 🎮 Player | `event would_you_rather.first_answer` |
| 🥉 Bronze | Decision Maker | Answer 25 total dilemmas. | 🎮 Player | `counter would_you_rather.answers ≥ 25` |
| 🥉 Bronze | Weighing In | Answer 100 total dilemmas. | 🎮 Player | `counter would_you_rather.answers ≥ 100` |
| 🥉 Bronze | Odd One Out | Be the only person to pick your option in a round. | 🎮 Player | `event would_you_rather.lone_choice` |
| 🥉 Bronze | First Crossroads | Play your first full game. | 🎮 Player | `event would_you_rather.first_game` |
| 🥈 Silver | Impossible Choices | Answer 500 total dilemmas. | 🎮 Player | `counter would_you_rather.answers ≥ 500` |
| 🥈 Silver | Reading the Room | Match the majority pick 10 rounds in a row. | 🎮 Player | `counter would_you_rather.majority_streak ≥ 10` |
| 🥈 Silver | Contrarian Soul | Be the lone choice 10 times across all games. | 🎮 Player | `counter would_you_rather.lone_count ≥ 10` |
| 🥈 Silver | Well Traveled | Play 25 full games. | 🎮 Player | `counter would_you_rather.games ≥ 25` |
| 🥇 Gold | Hive Mind | Match the majority pick 25 rounds in a row. | 🎮 Player | `counter would_you_rather.majority_streak ≥ 25` |
| 🥇 Gold | Marches to Own Drum | Be the lone choice 50 times across all games. | 🎮 Player | `counter would_you_rather.lone_count ≥ 50` (H) |
| 🥇 Gold | Dilemma Dealer | Host 25 games of Would You Rather. | 🎙️ Host | `counter would_you_rather.hosted ≥ 25` |
| 🏆 Platinum | Both, Actually | Earn every other Would You Rather trophy. | 🎮 Player | `platinum would_you_rather` |

### This or That (`this_or_that`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Take Your Pick | Answer your first this-or-that prompt. | 🎮 Player | `event this_or_that.first_answer` |
| 🥉 Bronze | Picking Sides | Answer 25 total prompts. | 🎮 Player | `counter this_or_that.answers ≥ 25` |
| 🥉 Bronze | Made Up My Mind | Answer 100 total prompts. | 🎮 Player | `counter this_or_that.answers ≥ 100` |
| 🥉 Bronze | First Faceoff | Play your first full game. | 🎮 Player | `event this_or_that.first_game` |
| 🥈 Silver | Never Undecided | Answer 500 total prompts. | 🎮 Player | `counter this_or_that.answers ≥ 500` |
| 🥈 Silver | In the Mix | Play in 100 total rounds. | 🎮 Player | `counter this_or_that.rounds ≥ 100` |
| 🥈 Silver | Loyal Regular | Play 25 full games. | 🎮 Player | `counter this_or_that.games ≥ 25` |
| 🥇 Gold | Decisive Streak | Answer 1000 total prompts. | 🎮 Player | `counter this_or_that.answers ≥ 1000` |
| 🥇 Gold | Everyone's a Critic | Play in 500 total rounds. | 🎮 Player | `counter this_or_that.rounds ≥ 500` (H) |
| 🥇 Gold | This AND That | Host 25 games of This or That. | 🎙️ Host | `counter this_or_that.hosted ≥ 25` |
| 🏆 Platinum | The Chooser | Earn every other This or That trophy. | 🎮 Player | `platinum this_or_that` |

### Never Have I Ever (`never_have_i_ever`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Confession | Answer your first "I have / I never" prompt. | 🎮 Player | `event never_have_i_ever.first_answer` |
| 🥉 Bronze | Coming Clean | Answer 25 total prompts. | 🎮 Player | `counter never_have_i_ever.answers ≥ 25` |
| 🥉 Bronze | Open Book | Answer 100 total prompts. | 🎮 Player | `counter never_have_i_ever.answers ≥ 100` |
| 🥉 Bronze | The Only Angel | Be the lone "I never" in a round. | 🎮 Player | `event never_have_i_ever.lone_never` |
| 🥉 Bronze | The Only Sinner | Be the lone "I have" in a round. | 🎮 Player | `event never_have_i_ever.lone_have` |
| 🥉 Bronze | First Circle | Play your first full game. | 🎮 Player | `event never_have_i_ever.first_game` |
| 🥈 Silver | Nothing to Hide | Answer 500 total prompts. | 🎮 Player | `counter never_have_i_ever.answers ≥ 500` |
| 🥈 Silver | Choir Boy | Answer "I never" 10 prompts in a row. | 🎮 Player | `counter never_have_i_ever.saintly_streak ≥ 10` (H) |
| 🥈 Silver | Absolute Menace | Answer "I have" 10 prompts in a row. | 🎮 Player | `counter never_have_i_ever.wild_streak ≥ 10` (H) |
| 🥈 Silver | Storyteller | Play 25 full games. | 🎮 Player | `counter never_have_i_ever.games ≥ 25` |
| 🥇 Gold | Full Disclosure | Answer 1000 total prompts. | 🎮 Player | `counter never_have_i_ever.answers ≥ 1000` |
| 🥇 Gold | Confession Booth Keeper | Host 25 games of Never Have I Ever. | 🎙️ Host | `counter never_have_i_ever.hosted ≥ 25` |
| 🏆 Platinum | I Have Now | Earn every other Never Have I Ever trophy. | 🎮 Player | `platinum never_have_i_ever` |

### Most Likely To (`most_likely_to`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Nomination | Cast your first "most likely to" vote. | 🎮 Player | `event most_likely_to.first_vote` |
| 🥉 Bronze | Pointing Fingers | Cast 25 total votes. | 🎮 Player | `counter most_likely_to.votes ≥ 25` |
| 🥉 Bronze | Poll Regular | Cast 100 total votes. | 🎮 Player | `counter most_likely_to.votes ≥ 100` |
| 🥉 Bronze | Called Out | Get chosen "most likely" for the first time. | 🎮 Player | `event most_likely_to.first_chosen` |
| 🥉 Bronze | First Assembly | Play your first full game. | 🎮 Player | `event most_likely_to.first_game` |
| 🥈 Silver | Ballot Stuffer | Cast 500 total votes. | 🎮 Player | `counter most_likely_to.votes ≥ 500` |
| 🥈 Silver | Usual Suspect | Get chosen "most likely" 25 times. | 🎮 Player | `counter most_likely_to.chosen ≥ 25` |
| 🥈 Silver | Prime Suspect | Get chosen "most likely" 100 times. | 🎮 Player | `counter most_likely_to.chosen ≥ 100` |
| 🥈 Silver | Frequent Delegate | Play 25 full games. | 🎮 Player | `counter most_likely_to.games ≥ 25` |
| 🥇 Gold | Unanimous Verdict | Be the pick of the entire room in a single round. | 🎮 Player | `event most_likely_to.unanimous` (H) |
| 🥇 Gold | Landslide Legend | Get chosen "most likely" 250 times. | 🎮 Player | `counter most_likely_to.chosen ≥ 250` |
| 🥇 Gold | Chief of Polls | Host 25 games of Most Likely To. | 🎙️ Host | `counter most_likely_to.hosted ≥ 25` |
| 🏆 Platinum | Most Likely to Platinum | Earn every other Most Likely To trophy. | 🎮 Player | `platinum most_likely_to` |

### Hot Seat (`hot_seat`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Take a Seat | Sit in the hot seat for the first time. | 🎮 Player | `event hot_seat.first_turn` |
| 🥉 Bronze | Warming the Chair | Take 10 turns in the hot seat. | 🎮 Player | `counter hot_seat.turns ≥ 10` |
| 🥉 Bronze | Under the Lights | Take 50 turns in the hot seat. | 🎮 Player | `counter hot_seat.turns ≥ 50` |
| 🥉 Bronze | First Grilling | Play your first full game. | 🎮 Player | `event hot_seat.first_game` |
| 🥈 Silver | No Sweat | Take 100 turns in the hot seat. | 🎮 Player | `counter hot_seat.turns ≥ 100` |
| 🥈 Silver | Rapid Fire | Answer 250 total hot-seat questions. | 🎮 Player | `counter hot_seat.questions ≥ 250` |
| 🥈 Silver | Seasoned Guest | Play 25 full games. | 🎮 Player | `counter hot_seat.games ≥ 25` |
| 🥇 Gold | Iron Chair | Take 250 turns in the hot seat. | 🎮 Player | `counter hot_seat.turns ≥ 250` (H) |
| 🥇 Gold | Interrogation Answered | Answer 1000 total hot-seat questions. | 🎮 Player | `counter hot_seat.questions ≥ 1000` |
| 🥇 Gold | Master of Ceremonies | Host 25 games of Hot Seat. | 🎙️ Host | `counter hot_seat.hosted ≥ 25` |
| 🏆 Platinum | Can't Stand the Heat | Earn every other Hot Seat trophy. | 🎮 Player | `platinum hot_seat` |

### Pick a Number (`pick_a_number`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Lucky Guess | Play your first round of Pick a Number. | 🎮 Player | `event pick_a_number.first_round` |
| 🥉 Bronze | Number Cruncher | Play 25 total rounds. | 🎮 Player | `counter pick_a_number.rounds ≥ 25` |
| 🥉 Bronze | Digit Devotee | Play 100 total rounds. | 🎮 Player | `counter pick_a_number.rounds ≥ 100` |
| 🥉 Bronze | Bullseye | Guess the exact number for the first time. | 🎮 Player | `event pick_a_number.first_exact` |
| 🥉 Bronze | First Draw | Play your first full game. | 🎮 Player | `event pick_a_number.first_game` |
| 🥈 Silver | High Roller | Play 500 total rounds. | 🎮 Player | `counter pick_a_number.rounds ≥ 500` |
| 🥈 Silver | Right on the Money | Land 10 exact guesses across all games. | 🎮 Player | `counter pick_a_number.exact ≥ 10` |
| 🥈 Silver | Regular Player | Play 25 full games. | 🎮 Player | `counter pick_a_number.games ≥ 25` |
| 🥇 Gold | Psychic Streak | Land 50 exact guesses across all games. | 🎮 Player | `counter pick_a_number.exact ≥ 50` (H) |
| 🥇 Gold | Numbers Runner | Host 25 games of Pick a Number. | 🎙️ Host | `counter pick_a_number.hosted ≥ 25` |
| 🏆 Platinum | The Right Number | Earn every other Pick a Number trophy. | 🎮 Player | `platinum pick_a_number` |

### Date My Kid / Parent Approval (`parent_approval`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Meet the Parents | Play your first round of Parent Approval. | 🎮 Player | `event parent_approval.first_round` |
| 🥉 Bronze | Screening Candidates | Play 25 total rounds. | 🎮 Player | `counter parent_approval.rounds ≥ 25` |
| 🥉 Bronze | Vetting Committee | Play 100 total rounds. | 🎮 Player | `counter parent_approval.rounds ≥ 100` |
| 🥉 Bronze | Stamp of Approval | Give your first approval to a candidate. | 🎮 Player | `event parent_approval.first_approval_given` |
| 🥉 Bronze | First Family Dinner | Play your first full game. | 🎮 Player | `event parent_approval.first_game` |
| 🥈 Silver | Tough Crowd | Give 250 total approvals or passes. | 🎮 Player | `counter parent_approval.verdicts ≥ 250` |
| 🥈 Silver | Welcomed In | Get approved by a parent 25 times. | 🎮 Player | `counter parent_approval.approvals_received ≥ 25` |
| 🥈 Silver | Family Regular | Play 25 full games. | 🎮 Player | `counter parent_approval.games ≥ 25` |
| 🥇 Gold | Golden Child | Get approved by a parent 100 times. | 🎮 Player | `counter parent_approval.approvals_received ≥ 100` (H) |
| 🥇 Gold | Head of Household | Host 25 games of Parent Approval. | 🎙️ Host | `counter parent_approval.hosted ≥ 25` |
| 🏆 Platinum | You Have Our Blessing | Earn every other Parent Approval trophy. | 🎮 Player | `platinum parent_approval` |

### Custom Game (`custom`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Off the Menu | Play your first host-created custom mode. | 🎮 Player | `event custom.first_play` |
| 🥉 Bronze | Trying New Things | Play 25 total rounds of custom modes. | 🎮 Player | `counter custom.plays ≥ 25` |
| 🥉 Bronze | Wildcard Regular | Play 100 total rounds of custom modes. | 🎮 Player | `counter custom.plays ≥ 100` |
| 🥉 Bronze | Sampler | Play 5 different custom modes. | 🎮 Player | `distinct custom.modes_played ≥ 5` |
| 🥈 Silver | Connoisseur | Play 25 different custom modes. | 🎮 Player | `distinct custom.modes_played ≥ 25` |
| 🥈 Silver | Homebrew | Create your first custom mode with a label, emoji, and color. | 🎙️ Host | `event custom.first_create` |
| 🥈 Silver | Full House | Run a custom mode with 8 or more players in the room. | 🎙️ Host | `event custom.big_room` |
| 🥈 Silver | Mode Maker | Create 5 different custom modes. | 🎙️ Host | `counter custom.created ≥ 5` |
| 🥇 Gold | Explorer | Play 100 different custom modes. | 🎮 Player | `distinct custom.modes_played ≥ 100` (H) |
| 🥇 Gold | Game Designer | Create 25 different custom modes. | 🎙️ Host | `counter custom.created ≥ 25` |
| 🥇 Gold | Full Lobby Impresario | Run 25 custom games to a full room. | 🎙️ Host | `counter custom.big_rooms ≥ 25` |
| 🏆 Platinum | House Rules | Earn every other Custom Game trophy. | 🎮 Player | `platinum custom` |

## Anonymous & messaging games

### Anonymous Messages (`anonymous_messages`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | First Whisper | Send your very first anonymous message into a room. | 🎮 Player | `event anonymous_messages.first_message` |
| 🥉 Bronze | Icebreaker | Reply to someone else's anonymous message for the first time. | 🎮 Player | `event anonymous_messages.first_reply` |
| 🥉 Bronze | Room Crasher | Join your first anonymous room. | 🎮 Player | `event anonymous_messages.room_joined` |
| 🥉 Bronze | Picture This | Send your first message with a photo, GIF, or voice clip attached. | 🎮 Player | `event anonymous_messages.first_media` |
| 🥈 Silver | Chatterbox | Send 25 anonymous messages. | 🎮 Player | `counter anonymous_messages.messages_sent ≥ 25` |
| 🥈 Silver | Media Mogul | Send 15 messages carrying photos, GIFs, or voice clips. | 🎮 Player | `counter anonymous_messages.media_sent ≥ 15` |
| 🥈 Silver | Night Owl | Send an anonymous message between midnight and 4 AM. | 🎮 Player | `event anonymous_messages.night_owl` (H) |
| 🥇 Gold | Motormouth | Send 100 anonymous messages. | 🎮 Player | `counter anonymous_messages.messages_sent ≥ 100` |
| 🥇 Gold | Well Traveled | Take part in 25 different anonymous rooms. | 🎮 Player | `distinct anonymous_messages.rooms_participated ≥ 25` |
| 🏆 Platinum | Faceless Legend | Earn every other Anonymous Messages trophy. | 🎮 Player | `platinum anonymous_messages` |

### Secret Message (`secret_message`)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Sealed Lips | Send your first private secret message to someone. | 🎮 Player | `event secret_message.first_message` |
| 🥉 Bronze | Reply in Confidence | Reply to a secret message you received. | 🎮 Player | `event secret_message.first_reply` |
| 🥉 Bronze | Back Room | Send a secret message from inside a live room. | 🎮 Player | `event secret_message.room_used` |
| 🥉 Bronze | Two's Company | Send secret messages to 3 different people. | 🎮 Player | `distinct secret_message.recipients ≥ 3` |
| 🥈 Silver | Whisper Network | Send 25 secret messages. | 🎮 Player | `counter secret_message.messages_sent ≥ 25` |
| 🥈 Silver | Social Butterfly | Send secret messages to 10 different people. | 🎮 Player | `distinct secret_message.recipients ≥ 10` |
| 🥈 Silver | Confidant | Send secret messages across 10 different rooms. | 🎮 Player | `counter secret_message.rooms_used ≥ 10` |
| 🥇 Gold | Spymaster | Send 100 secret messages. | 🎮 Player | `counter secret_message.messages_sent ≥ 100` |
| 🥇 Gold | Double Agent | Send a secret to someone who is secretly messaging you at the same time. | 🎮 Player | `event secret_message.crossed_wires` (H) |
| 🏆 Platinum | Keeper of Secrets | Earn every other Secret Message trophy. | 🎮 Player | `platinum secret_message` |

## Platform trophies (cross-game — the account-level spine)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Welcome Aboard | Create your FateRound profile. | 🎮 Player | `event platform.profile_created` |
| 🥉 Bronze | Verified | Confirm your email address. | 🎮 Player | `event platform.email_verified` |
| 🥈 Silver | Two Screens | Sign in on a second device to sync your account. | 🎮 Player | `event platform.device_synced` |
| 🥉 Bronze | On a Roll | Play on 3 consecutive days. | 🎮 Player | `streak ≥ 3` |
| 🥉 Bronze | Week Warrior | Keep a 7-day play streak alive. | 🎮 Player | `streak ≥ 7` |
| 🥈 Silver | Fortnight | Keep a 14-day play streak alive. | 🎮 Player | `streak ≥ 14` |
| 🥈 Silver | Monthly Regular | Keep a 30-day play streak alive. | 🎮 Player | `streak ≥ 30` |
| 🥇 Gold | Unbroken | Keep a 60-day play streak alive. | 🎮 Player | `streak ≥ 60` |
| 🥇 Gold | Century Streak | Keep a 100-day play streak alive. | 🎮 Player | `streak ≥ 100` |
| 🥇 Gold | Year One | Keep a 365-day play streak alive. | 🎮 Player | `streak ≥ 365` |
| 🥉 Bronze | Sampler | Play 5 different game modes. | 🎮 Player | `distinct platform.modes_played ≥ 5` |
| 🥈 Silver | Well Rounded | Play 15 different game modes. | 🎮 Player | `distinct platform.modes_played ≥ 15` |
| 🥈 Silver | Connoisseur | Play 25 different game modes. | 🎮 Player | `distinct platform.modes_played ≥ 25` |
| 🥇 Gold | Completionist | Play all 32 game modes at least once. | 🎮 Player | `distinct platform.modes_played ≥ 32` |
| 🥉 Bronze | New Faces | Play with 5 different opponents. | 🎮 Player | `distinct platform.opponents ≥ 5` |
| 🥈 Silver | Circle of Friends | Play with 20 different opponents. | 🎮 Player | `distinct platform.opponents ≥ 20` |
| 🥈 Silver | Networker | Play with 50 different opponents. | 🎮 Player | `distinct platform.opponents ≥ 50` |
| 🥇 Gold | People Person | Play with 100 different opponents. | 🎮 Player | `distinct platform.opponents ≥ 100` |
| 🥉 Bronze | Daily Dabble | Complete your first Daily Challenge. | 🎮 Player | `counter platform.dailies_done ≥ 1` |
| 🥈 Silver | Ten-Day Habit | Complete 10 Daily Challenges. | 🎮 Player | `counter platform.dailies_done ≥ 10` |
| 🥈 Silver | Daily Grind | Complete 50 Daily Challenges. | 🎮 Player | `counter platform.dailies_done ≥ 50` |
| 🥇 Gold | Devoted | Complete 100 Daily Challenges. | 🎮 Player | `counter platform.dailies_done ≥ 100` |
| 🥉 Bronze | Trophy Hunter | Earn 10 trophies across all games. | 🎮 Player | `counter platform.trophies_earned ≥ 10` |
| 🥈 Silver | Cabinet Filler | Earn 50 trophies across all games. | 🎮 Player | `counter platform.trophies_earned ≥ 50` |
| 🥈 Silver | Trophy Case | Earn 100 trophies across all games. | 🎮 Player | `counter platform.trophies_earned ≥ 100` |
| 🥇 Gold | Hoarder | Earn 250 trophies across all games. | 🎮 Player | `counter platform.trophies_earned ≥ 250` |
| 🥈 Silver | First Platinum | Earn your first Platinum trophy. | 🎮 Player | `counter platform.platinums ≥ 1` |
| 🥇 Gold | Platinum Club | Earn 3 Platinum trophies. | 🎮 Player | `counter platform.platinums ≥ 3` |
| 🥇 Gold | Platinum Tycoon | Earn 10 Platinum trophies. | 🎮 Player | `counter platform.platinums ≥ 10` |
| 🥉 Bronze | Rising Star | Reach Trophy Level 10. | 🎮 Player | `counter platform.trophy_level ≥ 10` |
| 🥈 Silver | Established | Reach Trophy Level 25. | 🎮 Player | `counter platform.trophy_level ≥ 25` |
| 🥇 Gold | Elite | Reach Trophy Level 50. | 🎮 Player | `counter platform.trophy_level ≥ 50` |
| 🥇 Gold | Centurion | Reach Trophy Level 100. | 🎮 Player | `counter platform.trophy_level ≥ 100` |
| 🥉 Bronze | Midnight Gamer | Play a game between midnight and 4 AM. | 🎮 Player | `event platform.midnight_gamer` (H) |
| 🥈 Silver | Perfect Week | Play at least one game on every day of a calendar week. | 🎮 Player | `event platform.perfect_week` (H) |
| 🥉 Bronze | Bittersweet | Win one game and lose another in the same session. | 🎮 Player | `event platform.win_and_lose` (H) |
| 🏆 Platinum | Fate Round Legend | Earn every other Platform trophy. | 🎮 Player | `platinum platform` |

## Host trophies (running the room well)

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 Bronze | Opening Night | Host your first game night. | 🎙️ Host | `counter host.nights ≥ 1` |
| 🥉 Bronze | Regular Host | Host 10 game nights. | 🎙️ Host | `counter host.nights ≥ 10` |
| 🥈 Silver | Seasoned MC | Host 50 game nights. | 🎙️ Host | `counter host.nights ≥ 50` |
| 🥇 Gold | Centurion Host | Host 100 game nights. | 🎙️ Host | `counter host.nights ≥ 100` |
| 🥇 Gold | Legendary Host | Host 250 game nights. | 🎙️ Host | `counter host.nights ≥ 250` |
| 🥈 Silver | Packed House | Host a game with every seat filled. | 🎙️ Host | `event host.full_room` |
| 🥇 Gold | Standing Room Only | Host a room filled to maximum player capacity. | 🎙️ Host | `event host.max_room` |
| 🥈 Silver | Big Night | Host a single game with 20 or more players. | 🎙️ Host | `event host.big_night_20` |
| 🥇 Gold | Sold Out | Host a single game with 50 or more players. | 🎙️ Host | `event host.big_night_50` (H) |
| 🥉 Bronze | Mix Master | Host 5 different game modes. | 🎙️ Host | `distinct host.modes_hosted ≥ 5` |
| 🥈 Silver | Versatile | Host 10 different game modes. | 🎙️ Host | `distinct host.modes_hosted ≥ 10` |
| 🥈 Silver | Ringmaster | Host 20 different game modes. | 🎙️ Host | `distinct host.modes_hosted ≥ 20` |
| 🥇 Gold | Full Repertoire | Host all 32 game modes. | 🎙️ Host | `distinct host.modes_hosted ≥ 32` |
| 🥈 Silver | Tournament Director | Run a tournament from start to finish. | 🎙️ Host | `event host.tournament_completed` |
| 🥈 Silver | Series Organizer | Run 5 tournaments to completion. | 🎙️ Host | `counter host.tournaments_run ≥ 5` |
| 🥇 Gold | League Commissioner | Run 10 tournaments to completion. | 🎙️ Host | `counter host.tournaments_run ≥ 10` |
| 🥉 Bronze | Bracket Builder | Host a bracket-style tournament. | 🎙️ Host | `event host.bracket_hosted` |
| 🥉 Bronze | Head to Head | Host a 1v1 head-to-head match. | 🎙️ Host | `event host.head_to_head` |
| 🥉 Bronze | Run It Back | Start a play-again rematch with the same group. | 🎙️ Host | `event host.rematch` |
| 🥈 Silver | Usual Suspects | Host the same returning crew across a third session. | 🎙️ Host | `event host.recurring_crew` |
| 🥉 Bronze | Night Owl Host | Host a game after midnight. | 🎙️ Host | `event host.late_night` (H) |
| 🥈 Silver | Weekend Warrior | Host on three consecutive weekends. | 🎙️ Host | `event host.weekend_streak` |
| 🥉 Bronze | Open Mic | Enable player-submitted questions in a room. | 🎙️ Host | `event host.player_questions_enabled` |
| 🥈 Silver | Custom Deck | Import your own custom question pack. | 🎙️ Host | `event host.custom_questions_imported` |
| 🥉 Bronze | Voices On | Host a game night with voice chat enabled. | 🎙️ Host | `event host.voice_chat_night` |
| 🥈 Silver | Holiday Host | Host a game on a public holiday. | 🎙️ Host | `event host.holiday_host` (H) |
| 🥇 Gold | Marathon Master | Host 5 or more games back-to-back in a single session. | 🎙️ Host | `event host.marathon` (H) |
| 🏆 Platinum | Master of Ceremonies | Earn every other Host trophy. | 🎙️ Host | `platinum host` |

---

## Coverage summary

- **Games covered:** all 32 `GameType` modes, each with its own Bronze/Silver/Gold ladder
  plus a Platinum ("earn every other trophy in this game").
- **Total trophies in this catalog:** 606 — including 34 Platinums
  (32 per-game + Platform + Host).
- **Owner mix:** 518 player-owned (85%), 88 host-owned
  (15%).
- **Hidden:** 67 trophies marked `(H)` — redacted until earned.

### Before seeding — RESOLVED with recommended defaults (2026-07-17)

Reversible; override anytime. See
[`platform-features-master-plan.md`](./platform-features-master-plan.md) § Open decisions.

1. ✅ **Exact thresholds** — default win-ladder **1 / 10 / 25 / 50 / 100** across games (adjust
   only outliers); streak-milestone trophies at 7 / 30 / 100. Points per tier already locked
   (15 / 30 / 90 / 300). Fine-tune from real play data via the admin catalog.
2. ✅ **Which `event.*` signals each game can emit** — **ship Bronze/Silver counters first**
   where an event isn't wired yet; add the Gold event trophy when its signal lands. (Locked
   rollout rule; per-game signal list is a build-time detail, not a blocker.)
3. ✅ **Min-player floors** — **per-game floor, not a flat 3.** Default 3 real players for party
   games; **2 for inherently 2-player games** (chess, checkers, tic-tac-toe). Guests count
   (§3.9).
4. ✅ **Final hidden set** — keep the `(H)`-marked trophies hidden as authored for launch; revisit
   after seeing which feel like fun surprises vs. confusing gaps. Easy to flip in admin.
5. ✅ **Host streak semantics** — **host activity feeds the same account `streak`** (play *or*
   host today keeps 🔥). Cadence trophies like `host.weekend_streak` use their **own dedicated
   counter**, not a second streak.
