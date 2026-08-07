# Clubs — Full Spec

Status: **Draft v2 — complete redesign (2026-08-05).** Replaces the previous bookkeeping-only spec
with a competitive club system: inter-club matches, transfer market, virtual economy, leagues,
cups, and seasons.

Companion to [`account-tiers.md`](./account-tiers.md),
[`platform-features-master-plan.md`](./platform-features-master-plan.md),
[`revenue-model.md`](./revenue-model.md),
[`pricing-implementation-plan.md`](./pricing-implementation-plan.md).

> **What a Club is, in one line:** a competitive team that plays head-to-head matches against other
> clubs in league seasons and cup tournaments, with a virtual economy (FateRound Coins), a transfer
> market, and promotion/relegation — think Premier League, not a WhatsApp group chat.
>
> **Why someone joins a club:** to compete against other clubs, to have their individual skill
> contribute to a team's success, to experience transfer market drama, and to chase promotion,
> trophies, and seasonal glory. Not bookkeeping — stakes.

---

## 1. Principles

1. **One competitive club per player.** Your wins, scores, and contributions count for one club
   only. This creates scarcity (clubs compete for you), makes transfers meaningful, and gives
   loyalty real value. You can still play casual games with anyone — club membership only matters
   for league/cup matches.
2. **Account-gated.** You need a FateRound profile (not a guest) to join or create a club.
   Persistent membership needs persistent identity. This is a natural signup hook — someone gets
   invited to a club, they have to create an account first.
3. **Level-gated creation.** You must reach a minimum level (e.g. level 5) to create a club. This
   ensures founders have invested in the platform, understand the games, and aren't throwaway
   accounts. The platform seeds new clubs with starter coins.
4. **Additive only.** Clubs never make non-club play worse. Every game still works with zero
   clubs. Casual play is always free and frictionless.

---

## 2. Roles & hierarchy

The person who creates the club is the **Owner** — permanent seat, can only be voluntarily
transferred, never removed.

| Role | Count | Powers |
|---|---|---|
| **Owner** | 1 per club | All powers. Approves treasury spending, promotes/demotes anyone, sells players, dissolves club, transfers ownership. |
| **Captain** | 1-2 per club | On-field leader. Can recruit/invite players (owner approves spend above a threshold), pick match lineups, manage subs, communicate strategy. |
| **Vice-captain / Admin** | Any number | Can send invites, organise games, moderate club chat. |
| **Member** | Any number | Plays matches, contributes scores, can donate coins to treasury, can request a transfer out. |

**Ownership transfer:** owner can transfer to any admin/captain. If the owner wants to leave, they
must transfer ownership first — can't strand a club.

**Captain ≠ manager sim.** The captain is a player who also leads. They always play, they don't
sit on the sideline.

---

## 3. Club creation

1. Player reaches the required level (e.g. level 5).
2. Creates a club: picks a name, crest (emoji + colour in v1), optional motto.
3. Platform seeds the club treasury with **1,000 FateRound Coins**.
4. Creator becomes the Owner. They can immediately assign a Captain.
5. Owner gets **5 free invite slots** for founding members (see §4).

### Crest

v1 crest = emoji + colour. No image upload, no moderation surface, ships fast. Branded/uploaded
crests become a later paid cosmetic.

### Club name uniqueness

Non-unique names allowed (like display handles). The `slug`/id disambiguates. Multiple clubs can
be called "The Champions" — they're distinguished by crest, roster, and division.

---

## 4. Joining a club

Three paths, but all cost coins after the founding squad:

### Founding squad (first 5 members) — free invites

Owner/captain sends an invite link. First 5 members join for free — no coins, no transfer fee.
This is how every club starts: you form the crew with your friends.

Invite flow:
1. Owner/captain creates an invite → shareable link `/club/join/:code`.
2. Recipient opens it. No account? → prompted to create one first ("Create an account to join
   the club"). Has an account? → one-tap join.
3. Joining inserts a `club_members` row, increments `uses`, honours `expires_at` / `max_uses`.

### After 5 members — every new member costs coins

Once the founding 5 are filled, all new members cost coins from the **club treasury**, regardless
of how they arrive. The invite link still works as a mechanism to target a specific person, but
the club pays a recruitment fee based on the player's level/market value.

**Recruiting a free agent** (player not in any club):
- Club sends an offer (coins based on player's market value).
- Player sees the offer and accepts or declines.
- Coins go from club treasury → to the player personally.

**Transfer from another club:**
- Buying club makes an offer to the selling club (a transfer fee).
- Selling club's owner/captain accepts or rejects.
- The player must also agree (players are not property — they can reject a move).
- Coins go from buying club's treasury → selling club's treasury.
- Optionally, a cut of the transfer fee goes to the player.

**Player requests a transfer out:**
- A player can tell their club they want to leave.
- The club can: release them for free (they become a free agent), sell them to an interested
  buyer, or refuse (player is stuck until the transfer window closes — but they can leave for
  free at end of season, no hostage situations).

### Why not just invite everyone for free?

The economy only works if growing a roster costs coins. Free invites for the founding 5 keep the
friend-group starting experience natural. After that, the transfer market creates real strategy:
do you buy the expensive proven winner, or find an undervalued player who's been climbing fast?

---

## 5. Player value & market

Every player with an account has a **market value** — a number that represents what it costs a
club to recruit them. Market value is derived from:

- **Level** (primary factor)
- **Win rate** across games
- **Games played** (activity/reliability)
- **Trophies earned** (achievement)
- **Recent form** (last 2 weeks of results — hot streak raises value, inactivity drops it)

Rough value ranges:

| Player level | Approximate market value |
|---|---|
| Level 1-3 | 100-200 coins |
| Level 4-6 | 250-450 coins |
| Level 7-9 | 500-800 coins |
| Level 10-12 | 900-1,500 coins |
| Level 13+ | 1,500+ coins |

Values fluctuate — go on a winning streak, your value rises. Go inactive for 3 weeks, it drops.

---

## 6. Player contracts & loyalty

When a player joins a club (after the founding squad), they commit for a **minimum of 1 season**.
Rules:

- **Can't leave mid-season** unless it's during a transfer window AND another club buys them AND
  they agree to the move.
- **End of season: free to leave.** All player contracts unlock. Anyone can walk for free. No
  hostage situations — worst case, you wait until season end.
- **Loyalty multiplier:** for every consecutive season a player stays with the same club, their
  **contribution multiplier** increases by +5%, capped at +25% after 5 seasons. A loyal level 7
  who's been with you for 4 seasons can outperform a mercenary level 9 who just arrived.
  - This creates a genuine reason to build a core squad rather than churning the roster every
    transfer window.
  - The multiplier applies to matchday scoring (see §9).
  - Resets to 0% if the player leaves and later returns.

---

## 7. Transfer windows

Transfers are **not** always open. They happen in defined windows, aligned to seasons:

1. **Pre-season window** (3-5 days before the season starts): the main market period. Clubs
   rebuild based on the upcoming game rotation. Most signings happen here.
2. **Mid-season window** (2-3 days, between matchday 2 and 3): emergency signings. Tactical
   adjustments. Shorter and more urgent.

**Outside windows:** no buying, no selling, no recruitment. Rosters are locked. Players who want
out must wait for the next window or end of season.

**Why windows?** They create urgency ("window closes in 2 days"), prevent constant roster churn,
give seasons stability, and concentrate drama into exciting bursts of activity.

---

## 8. FateRound Coins — the virtual economy

FateRound Coins are the platform's virtual currency. They are earned through gameplay and spent
on club operations. **Not purchasable with real money** — earned only.

### Personal coins (earned by the player)

| Activity | Coins earned |
|---|---|
| Win a game | 15-30 (varies by game length/complexity) |
| Lose/participate in a game | 3-5 |
| Complete a daily challenge | 15 |
| 7-day streak milestone | 50 bonus |
| Level up | 100 |
| Trophy earned | 25-100 (varies by rarity) |
| Being recruited by a club (signing bonus) | varies by your market value |
| Contributing to a matchday win | 20 |

### Club treasury (earned by the club)

| Activity | Coins earned |
|---|---|
| Starter fund (new club) | 1,000 |
| Matchday win | 100 |
| Matchday draw | 40 |
| Season promotion | 500 |
| League season championship | 1,500 |
| Cup tournament win | 1,000 |
| Selling a player (transfer fee) | varies — selling club sets the asking price |
| Member donations | whatever members choose to give |

### Spending (from club treasury)

| Activity | Cost |
|---|---|
| Recruit a free agent | based on player's market value |
| Transfer fee to another club | selling club's asking price |
| Season entry fee | 50 (small — ensures commitment, prevents ghost clubs entering) |

### Balance principle

A club of 5 active founding members playing regularly for a week should earn enough (through
matchday wins + member donations) to sign 1 mid-tier free agent. Growing the squad is steady,
not instant. A windfall (selling a star player, winning the league) lets a club make a splash
in the market.

### Personal vs. club treasury

These are separate. Players earn coins personally from their gameplay. The club treasury earns
from match results, player sales, and member donations. The owner/captain manages the treasury.
All members can see the balance and full transaction history — transparency by default.

---

## 9. Matches — how clubs play against each other

Matches are **real head-to-head games**. Both clubs' players are in the same room, playing the
same challenge at the same time. Not async score comparison — actual matches.

### Squad size

Each club fields **5 players** per match. The captain picks the starting lineup from the roster.
Not everyone plays every match — like a football manager selecting the starting XI. A roster of
10+ members means the captain has selection decisions to make.

### Match format: best of 3 rounds

Each match is **best of 3 rounds**. Win 2 rounds = win the match (3 league points). Lose = 0
points. Draw after 3 rounds (1-1 with a tied third) = 1 point each.

### How each round works (by game type)

**The core concept:** both clubs play the same challenge simultaneously. The challenge uses
**platform content only** (not custom uploads) — this prevents cheating (captain uploads easy
questions and shares answers) and ensures fairness across clubs.

Within each club's 5 players, they work **collaboratively as a team** — one shared effort,
not 5 individual scores summed up.

**Trivia:**
- Both clubs get the same pool of questions (e.g. 30 questions).
- Questions come one at a time. All 5 players on each side see the same question.
- **Each player gets one attempt per question.** If Player A gets it wrong, the question stays
  for the other 4 teammates to try. The question is only gone (burned) if all 5 get it wrong
  or skip.
- Get it right → point for the club, next question.
- Skip → question is gone, no point, next question. Doesn't come back.
- Timer: 10-15 seconds per question (short enough to prevent Googling).
- Round ends when time runs out (e.g. 5 minutes).
- **Club with more correct answers wins the round.**

**Word Search:**
- Both clubs get the same giant grid.
- Club members work together — when any player on your team finds a word, it's found for the
  whole club (marked as complete). No duplicates.
- Both clubs racing on the same grid simultaneously.
- First club to find all words, or most words found when time runs out, wins the round.

**Word Hunt:**
- Same letter grid for both clubs.
- Team submits words collectively — if two of your players both find "CASTLE", it only counts
  once for the club.
- Club with more unique valid words found when time runs out wins the round.

**Word Scramble:**
- Same pool of scrambled words for both clubs.
- When any club member solves one, it's solved for the team.
- Skip a word → it's gone, doesn't come back.
- First club to solve them all, or most solved when time runs out, wins the round.

**Crossword:**
- Same puzzle for both clubs. Each club has their own shared board.
- Club members fill in answers collaboratively — any member can type in any cell.
- First club to complete the puzzle, or most cells filled correctly when time runs out, wins
  the round.

### Games NOT in the season rotation

Round-table / placement-based games (Whot, Crazy Eights, Ludo, Bingo, Checkers, Chess) are
**not included in league/cup matches**. In these games, all players are in the same pot and one
person wins — you can't cleanly separate "Club A's score vs. Club B's score" because players
from both sides are directly competing for the same position.

These games are still available for casual play within clubs (and contribute to personal stats,
trophies, coins, and leveling). They're just not season fixtures.

**Eligible season games (v1):** Trivia, Word Search, Word Hunt, Word Scramble, Crossword,
and any future score-based or collaborative game where two teams can play the same challenge
independently and simultaneously.

---

## 10. Substitutions & disconnections

### Substitutions

The captain can swap **up to 2 players between rounds** (not during a round). This means:

- A roster of 7+ matters — your starting 5 plus subs who might come on.
- Tactical decisions: "we lost round 1, bring in Funke for round 2, she's better under
  pressure."
- Subs must be from the club's registered roster for that season.

### Disconnection mid-round

- If a player drops during a round, the club continues that round short-handed (4 players).
- Before the next round, the captain can sub in a replacement.
- If no sub is available, they continue short-handed with a **handicap bonus** (see §11).

### Minimum squad & handicap

A club can play a match with a **minimum of 3 players** (out of the standard 5). Below 3 = forfeit.

When playing short-handed, the club gets a score bonus to partially compensate:

| Players fielded | Handicap bonus |
|---|---|
| 5 (full) | 0% |
| 4 | +10% |
| 3 (minimum) | +20% |

The bonus applies to the club's round score. It doesn't make 3v5 fair — it just makes it
survivable. A strong 3-player squad with a 20% bonus can still win.

---

## 11. Scheduling matches

Both clubs need to be online at the same time. The **FateRound admin sets the available time
slots** for each matchday, and the clubs vote on which one works.

1. **Admin sets 3-5 time slots** for each matchday when creating the season fixtures (e.g.
   Tuesday 7pm, Thursday 8pm, Saturday 3pm, Sunday 2pm). These are the only options —
   clubs don't propose their own times.
2. **Both captains vote** on which slots work for their squad (can select multiple).
3. **System picks the best mutual slot** — the one both captains voted for. If multiple
   overlaps, the earliest one wins. If no overlap, the system assigns the slot with the
   most total votes across both captains.
4. **The confirmed time is visible to both clubs** in the club tab and match details.
   Push notification to all squad members.
5. **15-minute grace period** at match time. If a club doesn't field at least 3 players within
   15 minutes, it's a forfeit (3 points to the other club).
6. **One reschedule per season** — a captain can request a reschedule (24-hour extension).
   The opponent captain accepts or declines. Prevents abuse while allowing for genuine
   emergencies.

### If neither club shows

Both clubs get 0 points (double forfeit). Neither benefits. This discourages collusion ("let's
both not show up for a free draw").

---

## 12. Seasons — the league

A season is a **monthly league** with fixtures, a table, and promotion/relegation.

### Registration — not automatic

Creating a club doesn't automatically enter you into the league. Clubs must **register for each
season** during the announcement/registration phase. This is deliberate:

- **Not every club wants to compete.** Some clubs might form just for casual play with friends —
  no pressure, no fixtures, no obligations. That's fine. The club still exists as a group with
  a roster, chat, and casual games. They just don't enter the league.
- **Registration costs coins** (small entry fee from the treasury, e.g. 50 coins) — ensures only
  committed clubs enter. No ghost clubs clogging up divisions.
- **Minimum roster to register:** a club must have at least 5 members (enough to field a squad)
  at the time of registration. Can't enter with 2 people and hope to recruit before Matchday 1.
- **The owner or captain registers** the club for the season. Members are notified.
- **Once registered, you're committed** for the full season. Can't withdraw mid-season without
  a forfeit penalty (lose all remaining matches 0-3, no prize coins).

Same for the Cup — separate registration, separate entry fee. A club can enter the league only,
the cup only, both, or neither. Each is opt-in.

### Season lifecycle

| Phase | Duration | What happens |
|---|---|---|
| **Announcement + registration** | 3-5 days before | Platform announces the season's game rotation. Registration opens. Clubs opt in and pay entry fee. Transfer window opens. |
| **Pre-season transfer window** | 3-5 days | Clubs buy/sell/recruit. Build your squad for the announced games. |
| **Matchday 1** | ~1 week | First fixture. Both clubs schedule and play their match. |
| **Matchday 2** | ~1 week | Second fixture. |
| **Mid-season transfer window** | 2-3 days | Emergency signings. Short, urgent. |
| **Matchday 3** | ~1 week | Third fixture. |
| **Matchday 4** | ~1 week | Final fixture. Stakes are clear — who's promoting, who's going down. |
| **End of season** | Instant | Final table, prizes, promotion/relegation applied. Player contracts unlock. |
| **Off-season** | 3-5 days | Next season announced. Main transfer window opens. Cycle repeats. |

### Game rotation

Each season features a specific set of games (from the eligible pool in §9). The rotation is
announced in advance so clubs can recruit accordingly.

Examples:
- Season 7: Trivia, Word Search, Crossword
- Season 8: Word Hunt, Word Scramble, Trivia
- Season 9: Crossword, Word Search, Word Hunt

The game for each matchday is assigned from the rotation:
- Matchday 1: Trivia
- Matchday 2: Word Search
- Matchday 3: Crossword
- Matchday 4: Trivia (repeats are fine)

This means:
- Clubs need strength across multiple game types, not just one.
- The transfer market has real strategy: "next season has Crossword — we need a word person."
- Different seasons feel different. A Word Hunt season rewards different skills than a Trivia
  season.

### Divisions & the league table

Clubs are organised into **divisions** of 8-12 clubs each. New clubs start in the lowest
division.

Each matchday, every club plays one opponent. Over 4 matchdays, every club plays 4 matches.
(With 8+ clubs in a division, you won't play everyone — just like real football leagues with
more teams than matchdays.)

**Points:** Win = 3, Draw = 1, Loss = 0.

**Promotion/relegation:** at the end of each season:
- **Top 2 promote** to the next division up.
- **Bottom 2 relegate** to the next division down.
- Division 1 champions = league champions for that season.

### Season prizes

| Achievement | Coins to treasury |
|---|---|
| League champion (Division 1) | 1,500 |
| Division champion (any division) | 1,000 |
| 2nd place (any division) | 600 |
| 3rd-4th place | 300 |
| Promoted (top 2) | 500 bonus |
| Participated (any position) | 100 |
| Relegated | 0 (nothing extra) |

Champions and promoted clubs also get a **seasonal badge** visible on every member's profile
for the following season.

### Dead rubber matches

Late in the season, if promotion/relegation is decided for both clubs, there's still incentive:
match wins earn treasury coins, and individual performance affects personal stats, market value,
and trophy progress.

---

## 13. The Cup — knockout tournament

The Cup runs **alongside or between league seasons**. It's a separate competition with a
different format:

- **Open entry:** any club can enter, regardless of division. A Division 4 club can draw a
  Division 1 club.
- **Random draw, single elimination.** Lose and you're out.
- **Giant-killing:** the magic of a low-division club knocking out a top club. Huge bragging
  rights.
- **Different game type** from the current league season. If the league is playing Trivia this
  season, the Cup might be Word Search. Forces clubs to have range.
- **Same match format** as league (5v5, best of 3 rounds, collaborative).

Cup prize: **1,000 coins** to the winning club's treasury + a Cup Winner badge for all members.

### Champions League equivalent (later)

After a cycle of 3-4 league seasons, the top 2 clubs from each division qualify for a
cross-division knockout tournament. The best proving they're the best. Biggest prize, biggest
badge. This is a later feature — build the league and cup first.

---

## 14. Club chat

In-app text chat for club members. Features:

- **Text messages** from any member.
- **Auto-posted match results** — "Matchday 2: Brainiacs 2-1 Naija Stars" auto-appears after
  each match.
- **Transfer notifications** — "Funke has joined the club!" / "Chidi transferred to The
  Hustlers for 350 coins."
- **Captain announcements** — pinnable messages from captain/owner (e.g. "Word Search match
  Thursday 8pm, everyone be there").
- No media uploads in v1 — text only. Keep it simple.

---

## 15. What a player sees day-to-day

The experience test — if the daily loop isn't compelling, none of the infrastructure matters.

**Open FateRound → Club tab:**
- Your club's league position ("3rd in Division 2, 6 points from 3 games")
- This week's matchup ("vs. Night Owls — Matchday 4, Word Search")
- Match schedule ("Thursday 8pm — confirmed by both captains")
- Your personal stats ("3 matches played this season, 82% Trivia accuracy")
- Club chat (latest messages, captain announcements)

**During the week:**
- Play casual games as usual (earn personal coins, XP, trophies — not club-related)
- Check the transfer market (during windows)
- Club chat banter, strategy talk

**Match day:**
- Join the match room at the scheduled time
- Play 5v5, best of 3, against the opposing club
- See the result immediately — did we win?
- League table updates. Coins distributed. Chat erupts.

**End of season:**
- Final table drops. Promotion? Relegation? Champions?
- Prize coins distributed. Seasonal badge awarded.
- Contracts unlock — loyalty decisions. Does anyone leave?
- Next season announced — new game rotation. Transfer window opens.
- The cycle repeats. New rivals, new games, new signings.

---

## 16. Anti-cheating

### Platform content only for season matches

Club matches use **platform-curated content** (the admin Trivia bank, platform Word Search grids,
etc.) — never custom CSV uploads. This prevents captains from uploading easy questions and
sharing answers. Custom content is still available for casual club games — it just doesn't count
for the season/cup.

### Short timers

10-15 seconds per question in Trivia. Tight timers for Word Search/Hunt/Scramble/Crossword.
Not enough time to Google or use solver tools effectively.

### One attempt per player per question (Trivia)

Each player gets one shot at each question. Wrong = the question stays for teammates. The
question is only burned when all 5 have answered wrong or skipped. This prevents one person
from spamming answers AND prevents a saboteur from burning through the question pool.

### Suspicious pattern detection (later)

Flag accounts that consistently answer in under 1 second (no human reads that fast), or that
have a 100% accuracy rate over many matches. Not a v1 build — just note it for later.

---

## 17. Edge cases

### Player inactivity

A player who hasn't played any games (casual or club) in 2 weeks is flagged as **inactive**.
Their roster slot still counts against the limit but they can't be selected for match lineups.
The captain can release an inactive player without waiting for a transfer window — freeing the
slot. This prevents dead rosters.

### Club dissolution

If membership drops below 3 (the minimum to play a match), the club is:
1. Automatically relegated at end of season (if in the league).
2. If membership stays below 3 for an entire season, the club is dissolved. Remaining members
   become free agents.

The owner can also voluntarily dissolve the club at any time. All members become free agents.
Treasury coins are lost (not distributed — prevents dissolve-to-cash-out schemes).

### What if there aren't enough clubs for divisions?

Early on, there may only be a handful of clubs. Start with a **single open league table** (no
divisions) and introduce divisions + promotion/relegation once the club population justifies it
(e.g. 20+ clubs). The system scales — the structure works at any size.

---

## 18. Platform administration (FateRound admin)

The competitive club system is **platform-run, not user-run**. Seasons, cups, fixtures, and
content are all managed by FateRound admins through the existing `/admin` panel. Clubs and
their captains play within the structure the platform sets — they don't create leagues or
schedule their own seasons.

### What the FateRound admin controls

| Responsibility | What the admin does | Where |
|---|---|---|
| **Create a season** | Set the season name, start/end dates, game rotation (which games are in this season), and which matchday plays which game. | `/admin/seasons` |
| **Assign divisions** | Group clubs into divisions based on current standings. Handle promotion/relegation between seasons. For early days (few clubs), run a single open league. | `/admin/seasons/:id/divisions` |
| **Generate fixtures** | Draw matchday pairings for each division. Can be auto-generated (random or seeded) or manually adjusted. Publish fixtures so clubs can see their opponents. | `/admin/seasons/:id/fixtures` |
| **Open/close transfer windows** | Set the exact dates for pre-season and mid-season transfer windows. Windows open and close automatically at the set times. | `/admin/seasons/:id/transfers` |
| **Create a cup tournament** | Set the cup name, game type, entry fee, draw format (random), and prize. Open registration, then generate the bracket. | `/admin/cups` |
| **Manage match content** | Curate the Trivia question banks, Word Search grids, Crossword puzzles, Word Scramble sets, and Word Hunt grids used in season/cup matches. This is the existing `platform_content` / admin content pipeline — club matches pull from the same pool. | `/admin/themes`, `/admin/content` (existing) |
| **Resolve disputes** | Handle forfeits, reschedule disputes, and edge cases (e.g. both clubs claim the other didn't show). Override match results if needed. | `/admin/matches/:id` |
| **Award/deduct coins** | Manual coin adjustments for exceptional cases — prize corrections, compensation for technical issues, penalties for rule violations. | `/admin/clubs/:id/treasury` |
| **Moderate clubs** | Rename/flag/dissolve clubs with offensive names or crests. Ban players from the competitive system for cheating or abuse. | `/admin/clubs` |
| **Set coin economy parameters** | Adjust coin earning rates, recruitment cost multipliers, prize pools, and season entry fees without a code deploy. Stored as platform config, not hardcoded. | `/admin/economy` |
| **Season announcements** | Post platform-wide announcements: season previews, game rotation reveals, transfer window reminders, final standings. Visible on the club tab and optionally push-notified. | `/admin/announcements` |

### What the admin does NOT do

- **Pick match lineups** — that's the club captain's job.
- **Set match times directly** — the admin sets 3-5 available time slots per matchday (§11);
  the two clubs' captains vote on which slot works. The admin doesn't pick THE time — they set
  the menu of options.
- **Run individual matches** — matches are self-service. The system handles scoring, round
  progression, and result recording. The admin only intervenes on disputes.
- **Manage club rosters** — owners/captains handle their own rosters. The admin can ban a player
  from competitive play but doesn't manage individual club membership.

### Season creation workflow (admin)

1. Admin creates a new season: name, dates, game rotation.
2. Admin publishes the announcement — season becomes visible. **Registration opens.** Clubs
   opt in and pay entry fee. Transfer window opens on the set date.
3. Registration closes. Admin reviews the registered clubs. Applies promotion/relegation from
   last season for returning clubs. Places newly registered clubs into the lowest division.
4. Admin generates fixtures for each division (auto-draw or manual).
5. Admin sets **3-5 available time slots per matchday** (the options captains vote on).
6. Admin sets transfer window dates (pre-season + mid-season).
7. Season goes live. Matchdays run on schedule. Results are recorded automatically.
8. At season end: admin reviews final standings, confirms promotions/relegations, distributes
   prizes (auto-calculated, admin confirms). Season closes.

### Cup creation workflow (admin)

1. Admin creates a cup: name, game type, entry fee, prize pool.
2. Registration opens — clubs opt in (and pay entry fee from treasury).
3. Admin closes registration, generates the bracket (random draw).
4. Rounds play out on a set schedule (e.g. one round per week).
5. Admin can manually resolve walkovers/forfeits if a club doesn't show.
6. Final played → winner announced, prizes distributed.

### Economy tuning

Coin earning rates, player value multipliers, and prize amounts are stored as **platform
config** (not hardcoded constants). The admin can adjust them between seasons without a deploy:

- "Players are earning coins too fast — reduce win rewards from 20 to 15"
- "Not enough transfer activity — reduce recruitment costs by 20%"
- "Season 8 is a special event — double the champion prize"

This is critical for a virtual economy — it will need tuning based on real usage data.

---

## 19. Roster limits

| Club tier | Max roster size |
|---|---|
| Free club | 15 |
| Upgraded (later, paid tier) | 25 |

With 5 players per match and up to 2 subs between rounds, a roster of 15 gives meaningful depth
without letting clubs hoard every good player. Every member should have a realistic chance of
being selected for matches.

---

## 20. Data model

Keys off `profiles.id` (the identity foundation). **Remember the column-grants gotcha:** every
new column that clients read needs an explicit column-level `GRANT SELECT` to
`anon`/`authenticated`, or reads throw `42501`. Migrations use `YYYYMMDDHHMMSS_` prefix.

### Coins & player value (platform-wide, not club-specific)

```sql
-- Personal coin balance. Every account holder has one.
-- Balance is derived from the ledger (coin_transactions) but cached here for fast reads.
alter table profiles add column coin_balance int not null default 0;
alter table profiles add column market_value  int not null default 100;

-- Every coin movement — earning, spending, transfers. The ledger of truth.
create table coin_transactions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  amount      int not null,                         -- positive = earned, negative = spent
  type        text not null check (type in (
                'game_win','game_play','daily_challenge','streak_bonus','level_up',
                'trophy','match_contribution','recruitment_received','donation_out',
                'donation_in','transfer_fee_received','admin_adjustment'
              )),
  ref_id      uuid,                                 -- optional FK to the source (game, match, etc.)
  note        text,
  created_at  timestamptz not null default now()
);
create index idx_coin_tx_profile on coin_transactions(profile_id, created_at desc);
```

### Club core

```sql
create table clubs (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text unique,                      -- URL-safe identifier
  crest_emoji     text,                             -- v1 crest = emoji + colour
  crest_color     text,
  motto           text,
  owner_id        uuid not null references profiles(id) on delete restrict,
  member_limit    int not null default 15,
  treasury        int not null default 1000,        -- starter coins
  founding_slots  int not null default 5,           -- free invite slots remaining
  created_at      timestamptz not null default now()
);

create table club_members (
  club_id         uuid not null references clubs(id) on delete cascade,
  profile_id      uuid not null references profiles(id) on delete cascade,
  role            text not null default 'member'
                    check (role in ('owner','captain','admin','member')),
  loyalty_seasons int not null default 0,           -- consecutive seasons stayed
  joined_at       timestamptz not null default now(),
  primary key (club_id, profile_id)
);
create index idx_club_members_profile on club_members(profile_id);
-- Enforce one competitive club per player:
create unique index idx_one_club_per_player on club_members(profile_id);

create table club_invites (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references clubs(id) on delete cascade,
  code        text unique not null,
  created_by  uuid not null references profiles(id),
  expires_at  timestamptz,
  max_uses    int,
  uses        int not null default 0,
  created_at  timestamptz not null default now()
);
```

### Club treasury ledger

```sql
create table club_treasury_log (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references clubs(id) on delete cascade,
  amount      int not null,                         -- positive = income, negative = expense
  type        text not null check (type in (
                'starter','signing','transfer_in','transfer_out','sale',
                'season_prize','cup_prize','match_win','match_draw',
                'donation','entry_fee','admin_adjustment'
              )),
  ref_id      uuid,                                 -- FK to transfer, match, etc.
  note        text,
  created_at  timestamptz not null default now()
);
create index idx_treasury_log_club on club_treasury_log(club_id, created_at desc);
```

### Transfer market

```sql
-- Active listings: players available for recruitment or transfer.
create table transfer_listings (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references profiles(id),
  listed_by       uuid references clubs(id),        -- null = free agent (self-listed)
  asking_price    int not null,
  status          text not null default 'open'
                    check (status in ('open','accepted','rejected','withdrawn','expired')),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz                        -- auto-expire when window closes
);

-- Offers made by clubs to players or to other clubs.
create table transfer_offers (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid references transfer_listings(id),  -- null for direct approach
  from_club_id    uuid not null references clubs(id),
  to_player_id    uuid not null references profiles(id),
  to_club_id      uuid references clubs(id),        -- null if player is a free agent
  offer_amount    int not null,
  status          text not null default 'pending'
                    check (status in ('pending','accepted','rejected','withdrawn')),
  player_accepted boolean,                           -- player must also agree
  club_accepted   boolean,                           -- selling club must agree (if applicable)
  created_at      timestamptz not null default now()
);

-- Completed transfers — permanent history.
create table transfer_history (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references profiles(id),
  from_club_id    uuid references clubs(id),         -- null if was a free agent
  to_club_id      uuid not null references clubs(id),
  fee             int not null,
  season_id       uuid references seasons(id),
  window          text check (window in ('pre_season','mid_season','founding')),
  created_at      timestamptz not null default now()
);
create index idx_transfer_history_player on transfer_history(player_id, created_at desc);
```

### Seasons & league

```sql
create table seasons (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,                     -- "Season 7"
  game_rotation   text[] not null,                   -- e.g. {'trivia','word_search','crossword'}
  matchday_games  text[] not null,                   -- per-matchday: {'trivia','word_search','crossword','trivia'}
  registration_opens timestamptz not null,
  registration_closes timestamptz not null,
  starts_on       timestamptz not null,
  ends_on         timestamptz,
  entry_fee       int not null default 50,
  status          text not null default 'draft'
                    check (status in ('draft','registration','active','completed')),
  created_at      timestamptz not null default now()
);

-- Which clubs registered for a season + their division placement.
create table season_registrations (
  season_id       uuid not null references seasons(id) on delete cascade,
  club_id         uuid not null references clubs(id) on delete cascade,
  division        int not null default 1,            -- 1 = lowest
  final_position  int,                               -- set at season end
  points          int not null default 0,
  wins            int not null default 0,
  draws           int not null default 0,
  losses          int not null default 0,
  promoted        boolean default false,
  relegated       boolean default false,
  registered_at   timestamptz not null default now(),
  primary key (season_id, club_id)
);

-- Transfer window periods within a season.
create table transfer_windows (
  id              uuid primary key default gen_random_uuid(),
  season_id       uuid not null references seasons(id) on delete cascade,
  type            text not null check (type in ('pre_season','mid_season')),
  opens_at        timestamptz not null,
  closes_at       timestamptz not null
);
```

### Fixtures & matches

```sql
create table season_fixtures (
  id              uuid primary key default gen_random_uuid(),
  season_id       uuid not null references seasons(id) on delete cascade,
  matchday        int not null,                      -- 1, 2, 3, 4
  game_type       text not null,                     -- which game from the rotation
  home_club_id    uuid not null references clubs(id),
  away_club_id    uuid not null references clubs(id),
  -- Scheduling: admin sets available slots, captains vote
  time_slots      timestamptz[] not null,            -- admin-set options (3-5 slots)
  home_votes      int[],                             -- indices into time_slots the home captain picked
  away_votes      int[],                             -- indices the away captain picked
  scheduled_at    timestamptz,                       -- resolved from votes
  status          text not null default 'scheduled'
                    check (status in ('scheduled','voting','confirmed','live',
                                      'completed','forfeit_home','forfeit_away','forfeit_both')),
  winner_club_id  uuid references clubs(id),         -- null = draw
  home_rounds_won int not null default 0,
  away_rounds_won int not null default 0,
  created_at      timestamptz not null default now()
);
create index idx_fixtures_season on season_fixtures(season_id, matchday);

-- Individual round results within a best-of-3 match.
create table match_rounds (
  id              uuid primary key default gen_random_uuid(),
  fixture_id      uuid not null references season_fixtures(id) on delete cascade,
  round_number    int not null check (round_number in (1, 2, 3)),
  home_score      int not null default 0,            -- questions correct, words found, etc.
  away_score      int not null default 0,
  winner_club_id  uuid references clubs(id),
  -- Squad snapshots: who played this round
  home_squad      uuid[] not null,                   -- profile_ids (5 players)
  away_squad      uuid[] not null,
  started_at      timestamptz,
  ended_at        timestamptz,
  primary key (fixture_id, round_number)
);
```

### Cup tournaments

```sql
create table cup_tournaments (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,                     -- "FateRound Cup Season 7"
  game_type       text not null,                     -- the game for this cup
  season_id       uuid references seasons(id),       -- which season it runs alongside (optional)
  entry_fee       int not null default 50,
  prize_winner    int not null default 1000,
  prize_runner_up int not null default 300,
  status          text not null default 'draft'
                    check (status in ('draft','registration','bracket_drawn',
                                      'active','completed')),
  created_at      timestamptz not null default now()
);

create table cup_registrations (
  tournament_id   uuid not null references cup_tournaments(id) on delete cascade,
  club_id         uuid not null references clubs(id) on delete cascade,
  registered_at   timestamptz not null default now(),
  primary key (tournament_id, club_id)
);

create table cup_fixtures (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references cup_tournaments(id) on delete cascade,
  round_name      text not null,                     -- 'R32','R16','QF','SF','F'
  match_number    int not null,                      -- ordering within the round
  club_a_id       uuid references clubs(id),         -- null = TBD (bye or winner of previous)
  club_b_id       uuid references clubs(id),
  time_slots      timestamptz[],
  scheduled_at    timestamptz,
  status          text not null default 'pending'
                    check (status in ('pending','scheduled','confirmed','live',
                                      'completed','forfeit_a','forfeit_b')),
  winner_club_id  uuid references clubs(id),
  -- Best of 3 rounds, same as league
  a_rounds_won    int not null default 0,
  b_rounds_won    int not null default 0,
  created_at      timestamptz not null default now()
);

-- Cup rounds reuse match_rounds with a nullable fixture_id + cup_fixture_id.
alter table match_rounds add column cup_fixture_id uuid references cup_fixtures(id);
-- A round belongs to exactly one: a league fixture OR a cup fixture.
```

### Club chat

```sql
create table club_chat_messages (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references clubs(id) on delete cascade,
  sender_id   uuid references profiles(id),          -- null = system message
  message     text not null,
  type        text not null default 'text'
                check (type in ('text','system','announcement')),
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index idx_chat_club on club_chat_messages(club_id, created_at desc);
```

### Platform config (economy tuning)

```sql
create table platform_config (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references profiles(id),
  updated_at  timestamptz not null default now()
);
-- Rows like: ('coin_rates', {"game_win": 20, "game_play": 5, ...})
--            ('market_value_multipliers', {"level_weight": 0.4, "win_rate_weight": 0.3, ...})
--            ('season_prizes', {"champion_d1": 1500, "champion_any": 1000, ...})
```

### RLS summary

| Table | Read | Write |
|---|---|---|
| `clubs` (public card: name, crest, member count, division) | `anon` | server only |
| `clubs` (full details) | members only | owner/captain via server |
| `club_members` | members only | server only |
| `club_invites` | creator + admin/owner | admin/owner via server |
| `club_treasury_log` | members only | server only |
| `club_chat_messages` | members only | members (insert own), system |
| `transfer_listings` / `transfer_offers` | authenticated (all — it's a public market) | server only |
| `transfer_history` | authenticated (all) | server only |
| `seasons` / `season_registrations` | authenticated | admin via server |
| `season_fixtures` / `match_rounds` | authenticated | server only |
| `cup_*` | authenticated | admin via server |
| `coin_transactions` | own rows only | server only |
| `platform_config` | server only (not client-readable) | admin via server |

---

## 21. UI/UX — screens & flows

### Three-codebase reality

Per [`platform-features-master-plan.md`](./platform-features-master-plan.md), every screen below
is built on **web** and **native mobile (Expo)**. Mobile uses runtime theming
(`useThemedStyles`/`useTheme`), follows mobile header/text conventions, and must not use
module-scope `theme`. Web follows the design system (`.fr-site` for public pages, DS components
for app screens).

---

### Player screens (everyone with an account)

**A. Club tab (main navigation)**

The club tab is the central hub. What shows depends on whether you're in a club:

**Not in a club:**
- "Join or create a club" prompt
- Browse open recruitment offers (clubs that have sent you an offer)
- "Create a Club" button (greyed out with level requirement if below threshold:
  "Reach level 5 to create a club")

**In a club:**
- Club header: crest (emoji + colour), name, motto, division badge, treasury balance
- **Sub-tabs:**
  - **Home** — current season status (league position, next matchday, recent results), club
    announcements (pinned chat messages)
  - **Squad** — full roster with roles, levels, loyalty badges, market values. Captain can set
    lineup here.
  - **Fixtures** — upcoming and past matches. Tap a fixture → match detail (scores, squads,
    round-by-round breakdown). Upcoming fixtures show scheduling vote status.
  - **League** — full division table (Pos, Club, P, W, D, L, Pts). Tap any club → their public
    card. Promotion/relegation zones highlighted.
  - **Transfers** — during windows: browse free agents, view incoming/outgoing offers, player
    search with filters (level, game-type stats, market value range). Outside windows: "Transfer
    window closed — opens [date]".
  - **Chat** — club text chat with system messages (match results, transfer notifications,
    captain announcements).

**B. Player profile — club section**

On your profile (and visible on public profiles), show:
- Current club: crest + name + role
- Club history: previous clubs, seasons played, trophies won
- Loyalty badge: "3-season veteran of The Brainiacs"
- Market value: visible to captains browsing the transfer market

**C. Match day — the game room**

When it's time for a match, players join via the fixture detail screen:
- "Join Match" button appears 15 minutes before scheduled time
- Match lobby: shows both squads (5v5), club crests, round info
- Match plays using the normal game engine but in **collaborative team mode**:
  - Trivia: shared question, one-attempt-per-player mechanic, skip burns the question
  - Word Search/Hunt: shared grid, found words marked for the whole team
  - Word Scramble: shared pool, solved words cleared for the team
  - Crossword: shared board, any teammate can fill any cell
- Between rounds: captain can substitute up to 2 players. Sub selection screen.
- After final round: match result screen — round-by-round scores, MVP (top contributor),
  coins earned, updated league position.

**D. Notifications**

Push and in-app notifications for:
- "The Brainiacs vs. Night Owls — match in 1 hour"
- "Transfer window opens tomorrow"
- "You've received a recruitment offer from Lagos Legends (400 coins)"
- "Season 8 announced — registration open"
- "Matchday 2 result: Brainiacs 2-1 Hustlers"
- "Captain announcement: Word Search practice tonight 8pm"

---

### Owner / captain screens

**E. Create club flow**

1. Name your club (text input, max 30 chars)
2. Choose crest: emoji picker + colour picker
3. Optional motto (text input, max 60 chars)
4. Confirmation: "You'll receive 1,000 starter coins and 5 free invite slots"
5. → Club created. Redirects to the club home with invite link CTA.

**F. Squad management (captain)**

- Drag-to-reorder or tap-to-select lineup for upcoming match
- "Starting 5" and "Bench" sections
- Player cards show: name, level, game-type stats relevant to the upcoming matchday game,
  loyalty badge, recent form indicator (up/down/stable arrow)
- "Bench Inactive" action: release a player who's been inactive 2+ weeks (no transfer window
  needed)

**G. Transfer actions (captain + owner approval)**

- **Browse free agents:** filterable list (game type, level range, market value range).
  Tap a player → profile card with stats. "Make Offer" button → enter amount (min = market
  value) → sent to player for acceptance.
- **Incoming offers for your players:** list of offers from other clubs. Accept/reject per offer.
  Shows the fee, the buying club's name, and the player in question.
- **Propose transfer request:** if a member asks to leave, captain can list them on the market
  with an asking price.
- **Owner approval gate:** any spend above a configurable threshold (e.g. 200 coins) requires
  owner confirmation before finalising. Below threshold, captain can act freely.

**H. Season registration**

- Season announcement card on the club home screen: game rotation, dates, entry fee.
- "Register for Season 8" button → confirmation modal showing entry fee deduction from
  treasury → registered. Members notified.
- Same pattern for cup registration.

**I. Scheduling vote**

- Fixture detail shows admin-set time slots as selectable cards.
- Captain taps the slots that work → "Submit Vote".
- Shows opponent's vote status: "Night Owls have voted" / "Waiting for Night Owls to vote".
- Once both vote: confirmed time highlighted, push notification to all squad members.

---

### Admin screens (`/admin/...`)

**J. Season management (`/admin/seasons`)**

- List of all seasons (draft, registration, active, completed).
- **Create season:** form with name, game rotation (multi-select from eligible games), matchday
  game assignments, registration dates, start/end dates, entry fee.
- **Season detail:**
  - Registration tab: list of registered clubs, division assignments (drag-to-move between
    divisions, or auto-assign based on last season's standings).
  - Fixtures tab: auto-generate fixtures (button) or manually pair clubs. Set 3-5 time slots
    per matchday.
  - Transfer windows tab: set open/close dates for pre-season and mid-season windows.
  - Standings tab: live league tables per division. Override results if needed.
  - End season: confirm final standings, apply promotion/relegation, distribute prizes.

**K. Cup management (`/admin/cups`)**

- Create cup: name, game type, entry fee, prizes.
- Open/close registration. View registered clubs.
- Generate bracket (random draw). Adjust manually if needed (byes for odd numbers).
- View bracket: visual bracket display. Override results for walkovers/disputes.

**L. Match management (`/admin/matches`)**

- List of all fixtures across all active seasons/cups.
- Filter by: season, matchday, status (scheduled, live, completed, forfeit).
- **Fixture detail:** both squads, scheduling status, round results.
- **Override actions:** force forfeit (one or both clubs), adjust scores, reschedule.

**M. Economy management (`/admin/economy`)**

- Form with all tunable parameters: coin earning rates (per activity type), market value
  multipliers, recruitment cost formula, prize pool amounts, entry fees.
- "Save" applies immediately (stored in `platform_config`).
- History log: who changed what, when (audit trail).

**N. Club moderation (`/admin/clubs`)**

- List all clubs with search/filter (name, member count, division, treasury).
- Club detail: full roster, treasury history, match history.
- **Actions:** rename club, change crest (offensive content), dissolve club, ban player from
  competitive play, manual coin adjustment (add/deduct with note).

**O. Announcements (`/admin/announcements`)**

- Create announcement: title, body, optional link.
- Visibility: all users, or club members only.
- Publish → appears on club tab for all users + optional push notification.
- Pin/unpin, edit, delete.

---

### Key UX patterns

**Coin balance visibility:** the player's personal coin balance is shown in the app header/nav
(like a wallet). The club treasury is shown on the club home screen. Both update in real-time
after transactions.

**Transfer market during closed windows:** the transfer tab still exists but shows a locked
state with a countdown: "Transfer window opens in 3 days, 14 hours." Players can still browse
profiles but can't make or accept offers.

**Match countdown:** on the club home and fixture detail, a live countdown to the next scheduled
match. Ramps up urgency: "Match vs. Night Owls in 2h 30m".

**League table colours:** top 2 positions highlighted green (promotion zone), bottom 2
highlighted red (relegation zone). Current club's row always bold/highlighted.

**Empty states:** "No club yet" shows a brief explainer of what clubs are and why they're
worth joining — not just "Create a club" button. Show a mini preview: example league table,
example match result, example transfer notification. Sell the experience before asking for
commitment.

---

## 22. Build order

1. **Core club infrastructure:** clubs + members + roles + create/invite/join + club chat. A
   crew can form a club and communicate.
2. **Coins & economy:** FateRound Coins earned from gameplay. Personal coin balance. Club
   treasury. Donation mechanic.
3. **Seasons & league:** season creation, divisions, fixture generation, league table, promotion/
   relegation.
4. **Match engine:** the 5v5 collaborative match room for each eligible game type. Scoring,
   rounds, results. This is the biggest build — it's a new game mode.
5. **Transfer market:** player values, free agent browsing, recruitment offers, club-to-club
   transfers, transfer windows.
6. **Player contracts & loyalty:** minimum commitment, end-of-season free agency, loyalty
   multiplier.
7. **The Cup:** knockout tournament alongside the league.
8. **Substitutions, handicap, scheduling system:** the operational polish.

---

## 22. What's explicitly NOT in this spec

- **Monetization / Club Pro** — [`revenue-model.md`](./revenue-model.md). Build the competitive
  system first; paid tiers (bigger rosters, branding, etc.) layer on top later.
- **Round-table game modes** (Whot, Ludo, Checkers, etc.) in season matches — these don't
  support clean team-vs-team scoring. Revisit if a format is found.
- **Club Friendlies** (informal inter-club matches outside the league) — nice to have, not
  needed for launch when the league and cup exist.
- **Champions League** (cross-division knockout for top clubs) — build after a few league
  seasons have run and the division system is proven.
- **Public club directory / discovery** — clubs are invite-only and transfer-market-only in v1.
  A browse/search directory is a later growth feature with moderation questions.
- **Loans** (temporarily borrowing a player from another club) — adds complexity without
  enough payoff for v1.
- **Real-money purchases of competitive coins** — FateRound Coins (the competitive currency)
  are earned only. A separate cosmetic currency exists for purchased items (see §24).
- **Pre-set teams** for casual club games — the old spec had this for Codewords/Describe It
  team assignments. Still useful for casual play but not part of the competitive system.

---

## 24. Monetization — updated for the competitive club system

> **Supersedes the club-related sections of [`revenue-model.md`](./revenue-model.md).** The old
> Club Pro model (branding + 50-member roster for $7.99/mo) was designed for a bookkeeping club.
> This section redefines monetization around the competitive system: leagues, transfers, matches,
> and the virtual economy. Non-club monetization (daily challenge gating, custom content quotas,
> room player caps) still lives in [`pricing-implementation-plan.md`](./pricing-implementation-plan.md)
> and is unchanged.

### The core rule: the competitive loop is free

Creating a club, joining the league, playing matches, using the transfer market, entering cups,
club chat — all free. The free experience must be complete enough that a club can form, compete
for a full season, get promoted, and have fun without spending a cent. Monetization is about
making the experience **better, faster, or more expressive** — never about unlocking the
fundamental loop.

---

### Tier 1: FateRound+ (individual subscription) — ~$2.99/mo or ~$19.99/yr

Personal benefits that make the individual player more effective and expressive:

| Perk | What it does |
|---|---|
| **+25% coin earning** | Every game win, daily challenge, trophy, level-up earns 25% more FateRound Coins. Over a season, this compounds significantly — a + subscriber accumulates noticeably more coins, making them wealthier personally and more valuable to their club (bigger donations to treasury). |
| **Daily challenge archive + streak tracking** | Today's challenge is free for everyone. The archive (replay past days) and streak history/protection are gated. This is unchanged from the original pricing plan — it's the Wordle/NYT hook. |
| **Premium content packs** | Exclusive Trivia question packs, Word Search theme packs, seasonal specials. For casual play and club practice — season matches always use platform content. |
| **Market visibility boost** | Your profile appears higher when captains browse the free agent market. You're not better — just more visible. Like LinkedIn Premium. Subtle but real: if 50 free agents are listed, the + subscribers surface first. |
| **Profile cosmetics** | Custom profile borders, animated avatars, trophy showcase layouts. Visible on your profile and in club rosters / league tables. |
| **4 saved game templates** (vs 2 free) | Unchanged from original pricing plan. |

**Early-bird pricing:** $14.99/yr locked for life for the first cohort (unchanged — this
mechanism still works and creates urgency).

---

### Tier 2: Club Pro (club-level subscription) — ~$7.99/mo per club

Paid by the club **owner**. Benefits apply to the club as an entity, not to individual members.
The anti-loophole rule still holds: Club Pro does **not** grant members FateRound+ — only the
paying owner gets + bundled. Members stay on whatever personal tier they're on.

| Perk | What it does |
|---|---|
| **Roster expansion: 15 → 25** | The single biggest competitive lever. More depth, more options for the captain, more resilience across a season. A 25-player squad vs 15 is a real structural advantage — you can weather injuries, scheduling conflicts, and build specialised squads for different game types. |
| **Scouting & analytics** | Detailed stats on opponent clubs before a match: their best scorers per game type, recent form, win/loss patterns, weak matchdays. Player search with filters free clubs don't get: filter by specific game-type win rate, view historical transfer values, see which clubs are interested in a player. Free clubs can browse the market; Club Pro clubs can *scout*. |
| **Custom crest** | Image upload (not just emoji + colour). Club banner, custom colours. The prestige cosmetic — your club looks professional on the league table. Requires moderation (admin can flag/replace offensive uploads). |
| **Treasury bonus (+10%)** | All treasury earnings — match wins, season prizes, player sales — net 10% more. Compounds over a season. A club that earns 2,000 coins in prizes gets 2,200 instead. |
| **Match replays** | Review round-by-round what happened in past matches. Who answered which Trivia question (right/wrong/skipped), where words were found on the grid, which cells were filled in Crossword. Useful for strategy ("their player #3 always skips science questions"). |
| **Owner gets FateRound+ bundled** | The person paying for Club Pro gets all individual + perks included — no need to pay for both separately. |

**The 50%-off member discount** (retained from original plan):
- Any member of an active Club Pro club can buy personal FateRound+ at $1.49/mo (vs $2.99).
- Discount **reverts to $2.99** at next renewal if they leave the club.
- **Does not stack** across clubs — one discount per person, "member of any Club Pro club."
- This creates a natural upsell funnel: join a Club Pro club → see the + perks → discounted
  conversion.

---

### Tier 3: Season Pass — ~$1.99/season

A battle-pass-style product tied to a specific league season. Resets each season — recurring
revenue without a subscription commitment.

**Free track** (everyone who registers for the season):
- Basic matchday rewards (coins already specified in §8)
- Standard seasonal participation badge

**Premium track** (Season Pass holders):
- **Bonus coins** at matchday milestones (+50 coins per match played, win or lose)
- **Exclusive seasonal badge** — visually distinct, changes each season, visible on profile and
  in league tables. Season 7's badge looks different from Season 8's. Collectors value.
- **Animated crest effects** — your club's crest gets a seasonal visual effect (glow, shimmer,
  border) in the league table and match lobby. Cosmetic flex.
- **Early fixture reveal** — see next season's game rotation 24 hours before the public
  announcement. Gives a head start on transfer market strategy.
- **Post-match MVP highlight** — if you're the top contributor in a round, your name gets a
  special callout in the match result screen and club chat auto-post. Cosmetic recognition.

The Season Pass is **personal** (not club-wide). Each member decides if they want it. It's cheap
enough to impulse-buy and creates FOMO through exclusive seasonal cosmetics that go away when
the season ends.

---

### Tier 4: Cosmetic Shop (à la carte)

A separate **cosmetic currency** (e.g. "Stars" or "Gems") purchased with real money. This is
completely separate from FateRound Coins — cosmetic currency cannot be used for transfers,
recruitment, or any competitive action. FateRound Coins cannot be used for cosmetic purchases.
Two economies, zero crossover.

**What's in the shop:**

| Category | Examples | Price range |
|---|---|---|
| **Crest packs** | Themed emoji sets (sports, animals, flags, food), premium colours, gradient backgrounds | $0.99-$2.99 per pack |
| **Profile effects** | Animated profile borders, custom backgrounds, entrance effects (shown when you join a match lobby) | $0.99-$1.99 each |
| **Seasonal kits** | Limited-time visual themes for your club — "Detty December" kit, "New Year" kit, event-specific designs | $1.99-$3.99 each |
| **Victory celebrations** | Custom animations that play when your club wins a match (confetti style, fireworks, club-themed) | $1.99 each |
| **Badge frames** | Decorative frames around your league position badge, division badge, or champion badge | $0.99 each |

**Why a separate currency?** Selling FateRound Coins for real money would break competitive
integrity — the club with the richest owner would dominate the transfer market. By keeping the
competitive economy (earned coins → transfers → roster building) completely separate from the
cosmetic economy (purchased currency → visual items), the league stays fair. A Division 4 club
can beat a Division 1 club on merit. The Division 1 club might *look* fancier, but they can't
*buy* better players. This is the line that must not blur.

---

### Revenue summary

| Revenue stream | Type | Price | Who pays |
|---|---|---|---|
| FateRound+ | Subscription (monthly/annual) | $2.99/mo or $19.99/yr | Individual player |
| Club Pro | Subscription (monthly, per club) | $7.99/mo | Club owner |
| Season Pass | Per-season purchase | $1.99/season | Individual player |
| Cosmetic Shop | À la carte | $0.99-$3.99 per item | Individual player |

**What's NOT monetized** (decided):
- Creating or joining a club
- Entering the league or cup (costs earned coins, not real money)
- Playing matches
- The transfer market
- FateRound Coins (the competitive currency — earned only, never sold)
- Basic game access (all 38+ games remain free)
- Voice chat
- Club chat

---

### Schools & Corporate — unchanged

The B2B tiers (Classroom, Classroom+, Site License, Team, Enterprise) from
[`pricing-implementation-plan.md`](./pricing-implementation-plan.md) §Phase 4 are unchanged.
They sit on the **organization/seat layer**, not on the club system. A school's "classroom"
is not a competitive club — it's a managed group with safe-content defaults and admin controls.
A company's "team" could optionally participate in the club system (enter the league as a club)
but the corporate subscription is about admin tools, analytics, and integrations, not
competitive features.

---

## 25. Open questions

| # | Question | Recommendation |
|---|---|---|
| 1 | Exact level required to create a club | Level 5 — enough investment to be serious, reachable within 1-2 weeks of active play |
| 2 | Exact squad size for matches | 5 per side — large enough for team dynamics, small enough to schedule |
| 3 | Season length | Monthly (4 matchdays). Short enough to stay exciting, long enough to be meaningful |
| 4 | Division size | 8 clubs. Gives 4 matchdays (you play half the division). Manageable but competitive |
| 5 | How many games in the season rotation | 3-4 games per season, one per matchday (may repeat if 4 matchdays > 3 games) |
| 6 | Can a player be scouted/viewed before recruiting? | Yes — player profiles (level, stats, trophies, game-type win rates) should be visible to captains browsing the market |
| 7 | Club chat: should match highlights auto-post? | Yes — "Amara found 18 words in Word Search (round 2)" style auto-posts add colour and recognise individual contributions |
| 8 | What happens to coins when a club dissolves? | Treasury is lost, not distributed — prevents dissolve-to-cash-out schemes |
| 9 | Should there be a coin donation cap? | Consider a weekly cap (e.g. 200 coins/player/week) to prevent a wealthy player from bankrolling an entire club. Or leave uncapped for v1 and monitor |
| 10 | Cup entry: free or costs coins? | Small entry fee (50-100 coins) to prevent ghost clubs from entering. Same as season entry |
