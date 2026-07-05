# Trophy Catalog — Seed List

Status: **Build spec / seed data** · Companion to
[`trophies-and-streaks.md`](./trophies-and-streaks.md)

This is the concrete, per-game **trophy catalog** — the source-of-truth list to seed the
`trophies` table and `src/lib/trophies/catalog.ts`. It covers all **33 game modes** plus
cross-game **platform** and **host** trophies. The mechanics (tiers, points, Platinum rule,
rarity, award engine, criteria DSL, measurable-vs-binary progress, hidden trophies) are all
defined in [`trophies-and-streaks.md`](./trophies-and-streaks.md) — read that first; this
file is the *content*.

---

## How to read this

Every game has its own finite ladder: a few Bronze/Silver/Gold trophies plus **one
Platinum** ("earn every other trophy in this game"). Columns:

- **Tier** — 🥉 Bronze (15 pts) · 🥈 Silver (30) · 🥇 Gold (90) · 🏆 Platinum (300).
- **Trophy** — display title.
- **Description** — the plain-English criterion the player sees (the "Details" line).
- **Owner** — 🎮 **Player** or 🎙️ **Host**. *Most trophies are player-owned by design;*
  host trophies are concentrated in [§Host Trophies](#host-trophies) plus a light sprinkle
  per game.
- **Criteria** — the DSL rule (see `trophies-and-streaks.md` §3.10). `H` = hidden.

**Owner mix (target):** ~80% player / ~20% host across the catalog. Players get depth in
every game; hosts get their own progression for running nights well.

**Anti-spoof reminder:** competitive trophies ("win N") are gated behind a minimum real
player count server-side (`trophies-and-streaks.md` §3.9). Participation trophies stay
liberal.

**IDs:** trophy id = `<game_type>.<slug>` (e.g. `whot.first_win`); platform/host ids use
the `platform.` / `host.` prefix. `event.*` counters must be emitted by the game at finish.

---

## Board & card games (competitive — win/skill based)

### Whot (`whot`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Whot Win | Win your first game of Whot. | 🎮 | `event whot.win` |
| 🥈 | Whot Regular | Win 10 games of Whot. | 🎮 | `counter whot.wins ≥ 10` |
| 🥈 | Shape Shifter | Win a game where you played a Whot (20) card to change the shape. | 🎮 | `event whot.win_with_whot20` |
| 🥇 | Clean Hands | Win a game without ever drawing from the market. | 🎮 | `event whot.win_no_draw` |
| 🥇 | Comeback King | Win from 5+ cards in hand while an opponent was on their last card. | 🎮 | `event whot.comeback_win` (H) |
| 🏆 | **Whot Master** | Earn every other Whot trophy. | 🎮 | `platinum whot` |

### Chess (`chess`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Blood | Win your first game of Chess. | 🎮 | `event chess.win` |
| 🥈 | Checkmate Collector | Win 10 games of Chess. | 🎮 | `counter chess.wins ≥ 10` |
| 🥇 | Scholar's Mate | Win in 10 moves or fewer. | 🎮 | `event chess.win_under_10_moves` |
| 🥇 | Untouchable | Win without losing your queen. | 🎮 | `event chess.win_queen_safe` (H) |
| 🏆 | **Grandmaster** | Earn every other Chess trophy. | 🎮 | `platinum chess` |

### Checkers (`checkers`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Jump | Win your first game of Checkers. | 🎮 | `event checkers.win` |
| 🥈 | Board Sweeper | Win 10 games of Checkers. | 🎮 | `counter checkers.wins ≥ 10` |
| 🥇 | Triple Jump | Capture 3+ pieces in a single move. | 🎮 | `event checkers.triple_capture` |
| 🏆 | **King Me** | Earn every other Checkers trophy. | 🎮 | `platinum checkers` |

### Ludo (`ludo`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | Home Run | Get your first token all the way home. | 🎮 | `event ludo.first_token_home` |
| 🥈 | Ludo Champion | Win 10 games of Ludo. | 🎮 | `counter ludo.wins ≥ 10` |
| 🥇 | Sent You Back | Capture an opponent's token 3 times in one game. | 🎮 | `event ludo.triple_capture` |
| 🥇 | Lucky Sixes | Roll three 6s in a row. | 🎮 | `event ludo.triple_six` (H) |
| 🏆 | **Ludo Legend** | Earn every other Ludo trophy. | 🎮 | `platinum ludo` |

### Snakes & Ladders (`snake_and_ladder`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | Up the Ladder | Win your first game of Snakes & Ladders. | 🎮 | `event snake_and_ladder.win` |
| 🥈 | Slippery Winner | Win 10 games. | 🎮 | `counter snake_and_ladder.wins ≥ 10` |
| 🥇 | Snake Bit | Win a game after landing on 3+ snakes. | 🎮 | `event snake_and_ladder.win_after_3_snakes` (H) |
| 🏆 | **Board Boss** | Earn every other Snakes & Ladders trophy. | 🎮 | `platinum snake_and_ladder` |

### Tic-Tac-Toe (`tic_tac_toe`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | Three in a Row | Win your first game of Tic-Tac-Toe. | 🎮 | `event tic_tac_toe.win` |
| 🥈 | Noughts & Crosses | Win 15 games. | 🎮 | `counter tic_tac_toe.wins ≥ 15` |
| 🥇 | Fork Master | Win by creating a double threat (fork). | 🎮 | `event tic_tac_toe.win_by_fork` (H) |
| 🏆 | **X Marks the Spot** | Earn every other Tic-Tac-Toe trophy. | 🎮 | `platinum tic_tac_toe` |

### Crazy Eights (`crazy_eights`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Discard | Win your first game of Crazy Eights. | 🎮 | `event crazy_eights.win` |
| 🥈 | Card Shark | Win 10 games. | 🎮 | `counter crazy_eights.wins ≥ 10` |
| 🥇 | Eighty-Six | Win by playing an 8 as your last card. | 🎮 | `event crazy_eights.win_on_eight` |
| 🏆 | **Eights Expert** | Earn every other Crazy Eights trophy. | 🎮 | `platinum crazy_eights` |

### Monopoly (`monopoly`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | Passing Go | Collect your first salary by passing GO. | 🎮 | `event monopoly.first_pass_go` |
| 🥈 | Landlord | Win your first game of Monopoly. | 🎮 | `event monopoly.win` |
| 🥈 | Property Baron | Own a full colour set. | 🎮 | `event monopoly.full_set` |
| 🥇 | Hotel Tycoon | Build a hotel on any property. | 🎮 | `event monopoly.build_hotel` |
| 🥇 | Bankrupt the Table | Win by bankrupting the last opponent. | 🎮 | `event monopoly.win_by_bankruptcy` (H) |
| 🏆 | **Monopoly Mogul** | Earn every other Monopoly trophy. | 🎮 | `platinum monopoly` |

### Yahtzee (`yahtzee`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Roll | Finish your first game of Yahtzee. | 🎮 | `event yahtzee.game_complete` |
| 🥈 | Full House | Score a full house. | 🎮 | `event yahtzee.full_house` |
| 🥇 | YAHTZEE! | Roll a Yahtzee (five of a kind). | 🎮 | `event yahtzee.yahtzee` |
| 🥇 | Big Scorer | Finish a game with 300+ points. | 🎮 | `event yahtzee.score_300` |
| 🏆 | **Dice Deity** | Earn every other Yahtzee trophy. | 🎮 | `platinum yahtzee` |

---

## Word, trivia & puzzle games

### Trivia (`trivia`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | Quiz Starter | Answer 50 trivia questions. | 🎮 | `counter trivia.answers ≥ 50` |
| 🥈 | Perfect Round | Answer every question in a round correctly. | 🎮 | `event trivia.perfect_round` |
| 🥈 | Trivia Winner | Win a trivia game. | 🎮 | `event trivia.win` |
| 🥇 | Five in a Row | Win 5 trivia games. | 🎮 | `counter trivia.wins ≥ 5` |
| 🥇 | Fastest Finger | Be first to answer correctly 10 times in one game. | 🎮 | `event trivia.ten_fastest` (H) |
| 🏆 | **Quizmaster** | Earn every other Trivia trophy. | 🎮 | `platinum trivia` |

### Scrabble (`scrabble`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Word | Play your first word in Scrabble. | 🎮 | `event scrabble.first_word` |
| 🥈 | Wordsmith | Win 10 games of Scrabble. | 🎮 | `counter scrabble.wins ≥ 10` |
| 🥇 | Bingo! | Play all 7 tiles in one turn (50-pt bonus). | 🎮 | `event scrabble.seven_tile_play` |
| 🥇 | Triple Threat | Score 40+ points on a single word. | 🎮 | `event scrabble.word_40plus` |
| 🏆 | **Lexicon Lord** | Earn every other Scrabble trophy. | 🎮 | `platinum scrabble` |

### Word Hunt (`word_hunt`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Find | Find your first word in Word Hunt. | 🎮 | `event word_hunt.first_word` |
| 🥈 | Word Hunter | Find 500 words total. | 🎮 | `counter word_hunt.words_found ≥ 500` |
| 🥇 | Long Shot | Find a 7-letter word or longer. | 🎮 | `event word_hunt.word_7plus` |
| 🥇 | Top of the Board | Win a Word Hunt round. | 🎮 | `event word_hunt.win` |
| 🏆 | **Lexicographer** | Earn every other Word Hunt trophy. | 🎮 | `platinum word_hunt` |

### Sudoku (`sudoku`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Solve | Complete your first Sudoku. | 🎮 | `event sudoku.solve` |
| 🥈 | Number Cruncher | Solve 25 Sudokus. | 🎮 | `counter sudoku.solves ≥ 25` |
| 🥇 | No Hints Needed | Solve a Sudoku without using a single hint. | 🎮 | `event sudoku.solve_no_hints` |
| 🥇 | Speed Solver | Solve a Sudoku in under 5 minutes. | 🎮 | `event sudoku.solve_under_5min` (H) |
| 🏆 | **Sudoku Sensei** | Earn every other Sudoku trophy. | 🎮 | `platinum sudoku` |

### Codewords (`codewords`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Contact | Play your first game of Codewords. | 🎮 | `event codewords.play` |
| 🥈 | Best Operative | Be the top-guessing operative on the winning team. | 🎮 | `event codewords_operative` |
| 🥇 | Best Spymaster | Lead your team to victory as spymaster. | 🎮 | `event codewords_spymaster` |
| 🥇 | Flawless Intel | Win as spymaster without your team hitting a wrong card. | 🎮 | `event codewords.clean_win` (H) |
| 🏆 | **Master Spy** | Earn every other Codewords trophy. | 🎮 | `platinum codewords` |

### Bingo (`bingo`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Dab | Mark your first number in Bingo. | 🎮 | `event bingo.first_mark` |
| 🥈 | BINGO! | Win a game of Bingo. | 🎮 | `event bingo.win` |
| 🥇 | Blackout | Win with a full-card (blackout) pattern. | 🎮 | `event bingo.blackout_win` |
| 🏆 | **Bingo Boss** | Earn every other Bingo trophy. | 🎮 | `platinum bingo` |

### Two Truths and a Lie (`two_truths`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | Storyteller | Submit your first set of two truths and a lie. | 🎮 | `event two_truths.submit` |
| 🥈 | Best Guesser | Correctly spot the lie 20 times. | 🎮 | `counter two_truths.correct_guesses ≥ 20` (→ `two_truths_guesser`) |
| 🥇 | Master of Deceit | Fool the entire table with your lie. | 🎮 | `event two_truths.fooled_everyone` (H) |
| 🏆 | **Truth Detective** | Earn every other Two Truths trophy. | 🎮 | `platinum two_truths` |

### Describe It (`describe_it`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Clue | Play your first round of Describe It. | 🎮 | `event describe_it.play` |
| 🥈 | Best Describer | Get your team the most correct guesses in a game. | 🎮 | `event describe_it_describer` |
| 🥈 | Best Guesser | Be the top guesser in a game. | 🎮 | `event describe_it_guesser` |
| 🥇 | Mind Reader | Guess a word in under 5 seconds. | 🎮 | `event describe_it.fast_guess` (H) |
| 🏆 | **Wordsmith Whisperer** | Earn every other Describe It trophy. | 🎮 | `platinum describe_it` |

### Who Said This (`who_said_this`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | Eavesdropper | Play your first round of Who Said This. | 🎮 | `event who_said_this.play` |
| 🥈 | Quote Sleuth | Correctly match 25 quotes to their author. | 🎮 | `counter who_said_this.correct ≥ 25` |
| 🥇 | Perfect Ear | Get every quote right in a game. | 🎮 | `event who_said_this.perfect_game` |
| 🏆 | **Quote Master** | Earn every other Who Said This trophy. | 🎮 | `platinum who_said_this` |

### NPAT / I Call On (`i_call_on`)
> *(Name-Place-Animal-Thing; the in-app game_type is `i_call_on`.)*

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Letter | Play your first NPAT round. | 🎮 | `event i_call_on.play` |
| 🥈 | Category King | Win 10 NPAT rounds. | 🎮 | `counter i_call_on.wins ≥ 10` |
| 🥇 | Unique Genius | Score the only unique answer in every category in one round. | 🎮 | `event i_call_on.all_unique_round` (H) |
| 🏆 | **NPAT Champion** | Earn every other NPAT trophy. | 🎮 | `platinum i_call_on` |

---

## Voting & social games (participation & social based — no single "winner")

> These modes are about the group, not a win. Trophies reward **showing up, volume, and
> fun social outcomes**. Kept liberal (low spoof incentive).

### Smash Marry Kill (`smash_marry_kill`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Verdict | Cast your votes in your first Smash Marry Kill round. | 🎮 | `event smash_marry_kill.first_vote` |
| 🥈 | Judgement Day | Vote in 50 SMK rounds. | 🎮 | `counter smash_marry_kill.rounds_voted ≥ 50` |
| 🥇 | Great Minds | Be in a round where the whole table voted identically. | 🎮 | `event smash_marry_kill.unanimous_round` (H) |
| 🎙️ 🥈 | Ring Leader | Host an SMK game with 8+ players. | 🎙️ | `event smash_marry_kill.host_8plus` |
| 🏆 | **Verdict Veteran** | Earn every other SMK trophy. | 🎮 | `platinum smash_marry_kill` |

### Red Flag / Green Flag (`red_flag_green_flag`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Flag | Cast your first Red/Green verdict. | 🎮 | `event red_flag_green_flag.first_vote` |
| 🥈 | Flag Bearer | Vote in 50 rounds. | 🎮 | `counter red_flag_green_flag.rounds_voted ≥ 50` |
| 🥇 | All Green | Be voted a green flag by everyone in a round. | 🎮 | `event red_flag_green_flag.all_green` (H) |
| 🏆 | **Flag Judge** | Earn every other Red/Green Flag trophy. | 🎮 | `platinum red_flag_green_flag` |

### Smash or Pass (`smash_or_pass`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Call | Make your first Smash-or-Pass call. | 🎮 | `event smash_or_pass.first_vote` |
| 🥈 | Decisive | Vote in 50 rounds. | 🎮 | `counter smash_or_pass.rounds_voted ≥ 50` |
| 🏆 | **Snap Judge** | Earn every other Smash or Pass trophy. | 🎮 | `platinum smash_or_pass` |

### Would You Rather (`would_you_rather`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | Tough Choice | Answer your first Would You Rather. | 🎮 | `event would_you_rather.first_vote` |
| 🥈 | Fence Sitter No More | Answer 50 dilemmas. | 🎮 | `counter would_you_rather.answered ≥ 50` |
| 🥇 | Against the Grain | Be the only person to pick your option in a round. | 🎮 | `event would_you_rather.lone_choice` (H) |
| 🏆 | **Dilemma Master** | Earn every other Would You Rather trophy. | 🎮 | `platinum would_you_rather` |

### This or That (`this_or_that`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | Pick One | Answer your first This or That. | 🎮 | `event this_or_that.first_vote` |
| 🥈 | Preference Engine | Answer 50 prompts. | 🎮 | `counter this_or_that.answered ≥ 50` |
| 🏆 | **Taste Maker** | Earn every other This or That trophy. | 🎮 | `platinum this_or_that` |

### Never Have I Ever (`never_have_i_ever`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Confession | Answer your first Never Have I Ever. | 🎮 | `event never_have_i_ever.first_vote` |
| 🥈 | Open Book | Answer 50 prompts. | 🎮 | `counter never_have_i_ever.answered ≥ 50` |
| 🥇 | Saint | Be the only "I never have" in a round. | 🎮 | `event never_have_i_ever.lone_never` (H) |
| 🏆 | **Nothing to Hide** | Earn every other Never Have I Ever trophy. | 🎮 | `platinum never_have_i_ever` |

### Most Likely To (`most_likely_to`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Nomination | Cast your first Most Likely To vote. | 🎮 | `event most_likely_to.first_vote` |
| 🥈 | The People's Choice | Get voted "most likely" 10 times. | 🎮 | `counter most_likely_to.times_chosen ≥ 10` |
| 🥇 | Landslide | Get every single vote in a round. | 🎮 | `event most_likely_to.unanimous_pick` (H) |
| 🏆 | **Most Likely To Win** | Earn every other Most Likely To trophy. | 🎮 | `platinum most_likely_to` |

### Hot Seat (`hot_seat`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | Take the Seat | Take the hot seat for the first time. | 🎮 | `event hot_seat.first_turn` |
| 🥈 | Under Pressure | Survive the hot seat 10 times. | 🎮 | `counter hot_seat.turns ≥ 10` |
| 🏆 | **Cool Under Fire** | Earn every other Hot Seat trophy. | 🎮 | `platinum hot_seat` |

### Pick a Number (`pick_a_number`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | Lucky Guess | Play your first Pick a Number. | 🎮 | `event pick_a_number.play` |
| 🥈 | Numbers Game | Play 25 rounds. | 🎮 | `counter pick_a_number.rounds ≥ 25` |
| 🏆 | **Number's Up** | Earn every other Pick a Number trophy. | 🎮 | `platinum pick_a_number` |

### Date My Kid / Parent Approval (`parent_approval`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | Meet the Parents | Play your first round. | 🎮 | `event parent_approval.play` |
| 🥈 | Approved | Get approved 10 times. | 🎮 | `counter parent_approval.approvals ≥ 10` |
| 🏆 | **In-Law Legend** | Earn every other Parent Approval trophy. | 🎮 | `platinum parent_approval` |

### Custom Game (`custom`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | Rule Breaker | Play a host's custom game mode. | 🎮 | `event custom.play` |
| 🎙️ 🥈 | Game Designer | Create and run your own custom game mode. | 🎙️ | `event custom.host_create` |
| 🏆 | **Sandbox Star** | Earn every other Custom trophy. | 🎮 | `platinum custom` |

---

## Anonymous & messaging games

### Anonymous Messages (`anonymous_messages`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Whisper | Send your first anonymous message. | 🎮 | `event anonymous_messages.first_send` |
| 🥈 | Mystery Sender | Send 25 anonymous messages. | 🎮 | `counter anonymous_messages.sent ≥ 25` |
| 🏆 | **Ghost Writer** | Earn every other Anonymous Messages trophy. | 🎮 | `platinum anonymous_messages` |

### Secret Message (`secret_message`)
| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | Sealed | Send your first secret message. | 🎮 | `event secret_message.first_send` |
| 🥈 | Keeper of Secrets | Send 25 secret messages. | 🎮 | `counter secret_message.sent ≥ 25` |
| 🏆 | **Codebreaker** | Earn every other Secret Message trophy. | 🎮 | `platinum secret_message` |

---

## Platform trophies (cross-game — the account-level spine)

Not tied to any one game; these reward the habit, breadth, and social reach that make the
account worth keeping. All 🎮 player-owned (they follow the person, not a room).

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | Welcome | Create your profile (guest → account). | 🎮 | `event platform.account_created` |
| 🥉 | Warm Up | Keep a 3-day streak. | 🎮 | `streak ≥ 3` |
| 🥈 | On a Roll | Keep a 7-day streak. | 🎮 | `streak ≥ 7` |
| 🥇 | On Fire | Keep a 30-day streak. | 🎮 | `streak ≥ 30` |
| 🥇 | Unstoppable | Keep a 100-day streak. | 🎮 | `streak ≥ 100` (H) |
| 🥉 | Getting Around | Play 5 different game modes. | 🎮 | `distinct modes_played ≥ 5` |
| 🥈 | Explorer | Play 15 different game modes. | 🎮 | `distinct modes_played ≥ 15` |
| 🥇 | Completionist | Play all 33 game modes. | 🎮 | `distinct modes_played ≥ 33` |
| 🥉 | Made a Friend | Play with 5 different people. | 🎮 | `distinct opponents ≥ 5` |
| 🥈 | Social Butterfly | Play with 20 different people. | 🎮 | `distinct opponents ≥ 20` |
| 🥇 | Life of the Party | Play with 100 different people. | 🎮 | `distinct opponents ≥ 100` |
| 🥈 | Daily Habit | Complete 10 Daily Challenges. | 🎮 | `counter platform.dailies_done ≥ 10` |
| 🥇 | Platinum Hunter | Earn 3 Platinum trophies (any games). | 🎮 | `counter platform.platinums ≥ 3` |
| 🥇 | Trophy Collector | Reach 100 total trophies. | 🎮 | `counter platform.total_trophies ≥ 100` (H) |
| 🏆 | **Fate Round Legend** | Earn every other Platform trophy. | 🎮 | `platinum platform` |

---

## Host trophies (running the room well)

The host is the distribution engine, so hosts get their own progression. Concentrated here
plus the per-game host trophies above (Ring Leader, Game Designer, …). All 🎙️.

| Tier | Trophy | Description | Owner | Criteria |
|---|---|---|---|---|
| 🥉 | First Night | Host your first game. | 🎙️ | `event host.first_game` |
| 🥈 | Regular Host | Host 10 game nights. | 🎙️ | `counter host.nights ≥ 10` |
| 🥇 | Party Planner | Host 50 game nights. | 🎙️ | `counter host.nights ≥ 50` |
| 🥈 | Full House | Host a room that hits its max player count. | 🎙️ | `event host.full_room` |
| 🥈 | Variety Host | Host 10 different game modes. | 🎙️ | `distinct host.modes_hosted ≥ 10` |
| 🥇 | Ringmaster | Run a tournament to completion. | 🎙️ | `event host.tournament_finished` |
| 🥇 | Crowd Pleaser | Host a night where 20+ players joined. | 🎙️ | `event host.20plus_players` (H) |
| 🥈 | Encore | Host the same crew for a rematch (play-again). | 🎙️ | `event host.rematch` |
| 🏆 | **Master of Ceremonies** | Earn every other Host trophy. | 🎙️ | `platinum host` |

---

## Coverage & balance summary

- **Games covered:** all 33 `GameType` modes, each with its own Bronze/Silver/Gold ladder
  + a Platinum ("earn every other trophy in this game").
- **Owner mix:** the large majority of trophies are 🎮 player-owned; 🎙️ host trophies live
  in the dedicated Host section plus a light per-game sprinkle (Ring Leader, Game Designer)
  — matching "mix of host and player, more player-owned."
- **Two "meta" Platinums:** `platform` (the cross-game spine) and `host` (running rooms),
  so both a dedicated player and a dedicated host have a headline Platinum to chase without
  touching every game.
- **Role awards reused:** Codewords (spymaster/operative), Two Truths (guesser), Describe It
  (describer/guesser) map to the existing `GAME_ACHIEVEMENTS` keys in
  `src/lib/community-achievements.ts`, so the win-post flow already knows how to route them.

### Still to decide (per game, before seeding)
1. **Exact thresholds** (win counts, streak lengths) — tune from real play data; values here
   are first-pass.
2. **Which `event.*` signals each game can actually emit** at finish (some golds — e.g.
   Chess "queen safe", Ludo "triple six" — need the game to report that fact). Where a game
   can't emit a signal yet, ship the Bronze/Silver first and add the Gold when the event
   lands.
3. **Min-player floors** for each competitive `event.*win`/`counter *.wins` trophy (§3.9).
4. **Hidden set** — marked `(H)` above; confirm which stay hidden vs revealed.
