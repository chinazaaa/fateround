-- Three SEO blog posts for the solo-vs-bot and rooms-with-bots features.
--
-- Complement the marketing landers (/play-whot-vs-bot, /play-ayo-vs-bot,
-- /estate-kings-with-bots-online, etc.) with rules/how-to content that
-- ranks on long-tail queries and internal-links back to the play surfaces.
--
-- Same pattern as 20260726120000_blog_posts.sql — publicly readable table,
-- admin-writable through the /admin/blog UI, seeded here so posts land in
-- git and deploy with the app. Idempotent via `on conflict (slug) do nothing`.

insert into blog_posts (slug, title, excerpt, body, author, tags, status, published_at)
values
(
  'how-to-play-whot-vs-computer',
  'How to play Whot vs the computer (rules, tips, and where to play free)',
  'A clear guide to playing Nigerian Whot against a computer opponent — the shapes, the specials (Pick 2, Pick 3, Hold On, General Market, WHOT 20), and the strategy that beats a solo bot.',
  $md$Nigerian Whot is best in a noisy room full of friends. But a lot of the time you just want to play a hand right now — no room to fill, no group chat to nudge. That is where a Whot bot earns its keep.

This is a quick tour of the rules, plus the tactics that actually work against a computer opponent. When you're ready, jump straight into a solo game at **[Play Whot vs bot](/play-whot-vs-bot)**.

## The goal

Be the first player to empty your hand. Everything else in the game — the shapes, the specials, the market — is in service of that one target.

## The deck

Whot uses five shapes: **Circle, Triangle, Cross, Square, Star**. Each shape has numbered cards, plus the special **WHOT** card, usually numbered 20 and drawn in every colour at once — the wild.

## Basic play

On your turn, play a card that matches the top card of the pile by **shape or number**. If you can't match, you go to market — draw one card — and play passes.

## The special cards (the reason Whot is Whot)

- **Pick Two (2)** — the next player draws two and loses their turn (unless your table allows stacking).
- **Pick Three (5)** — the next player draws three. The one everyone dreads.
- **Hold On (1)** — the next player is skipped.
- **General Market (14)** — *every other player* draws one. Brutal in a full room.
- **Suspension (8)** — play again immediately.
- **WHOT (20)** — the wild. Play it any time and call the next shape.

## How the bot plays

A decent Whot bot doesn't just dump random cards. Here's how [FateRound's solo Whot bot](/play-solo/whot) actually behaves — and what it means for you:

- **It stacks Pick 2s when it can.** If you drop a Pick 2 and it has one, expect it back.
- **It saves WHOTs for tight moments.** Don't count on it wasting a wild on a card it could have matched normally.
- **It calls shapes it can follow up on.** When it plays a WHOT and calls Star, it usually has more Stars to keep the pressure on.
- **It reads your last card.** If you're at one card, it will play a special or a shape you didn't just play to block your finish.

## Strategy that beats a solo bot

- **Hold your WHOT for one-card checks.** A wild is worth ten to you when you're one card away — don't burn it early.
- **Stack when it hurts.** If the bot drops a Pick 2 and you have one, stack it back — you turn a two-card hit into a four-card hit against the bot instead.
- **Track shapes.** Whot is small enough to remember what colours you've seen. When the bot calls a shape after a WHOT, it usually has more of it — cut that line off first.
- **Empty the specials first when you're behind.** If you're carrying a bad hand, dump your Hold Ons and General Markets to reset the pace.
- **Save one special for the last two.** A Hold On or Pick Two on your penultimate card guarantees you the win — you skip the bot and play your last card unopposed.

## Where to play

- **[Play Whot vs bot](/play-whot-vs-bot)** — solo, no sign-up, no room to fill.
- **[Play Whot online with bots](/whot-with-bots-online)** — real multiplayer rooms with the empty seats filled by bots, so a two-friend night becomes a four-player table.
- **[Whot vs UNO comparison](/whot-vs-uno)** — if you're curious how the two card games differ.
- **[Whot rules — the full breakdown](/blog/whot-rules-explained)** — the deeper rules post, including house-rule variants.

Ready? [Deal a solo Whot round now.](/play-whot-vs-bot)$md$,
  'Fate Round',
  array['guides', 'whot', 'solo-vs-bot', 'card-games'],
  'published',
  timestamptz '2026-08-16 09:00:00+00'
),
(
  'ayo-ayo-rules-and-how-to-play-solo',
  'Ayo (Ayo Olopon) rules and how to play the Yoruba mancala solo',
  'A clear guide to Ayo — the ancient Yoruba mancala. How the board works, how sowing and capturing actually play out, and where to play solo against a computer opponent for free.',
  $md$Ayo — also called **Ayo Olopon** in Nigeria, and **Awale** across parts of West Africa — is one of the oldest games in the world. It's a two-player mancala: no dice, no cards, just seeds moving around a board of houses. The rules are quick to learn and the strategy takes years to get good at.

This is a plain-English guide to Ayo, plus how to play a round solo against a computer opponent right now.

## The board

Two rows of six houses (twelve houses total). Each house starts with **four seeds** — 48 seeds in all. Each player owns one row: the row closest to you is your side. Off to either side, there's a **store** (some boards call it a mancala) where captured seeds live.

## The goal

Capture more seeds than your opponent by the time the row empties out. Simple to say. Hard to do.

## How a turn works — sowing

On your turn:

1. **Pick up all the seeds** from any one house on your own side.
2. **Sow them counter-clockwise**, dropping one seed into each next house as you go around the board.
3. If you have more seeds than houses ahead, you keep going — but you *skip your own starting house*.

That's it. No dice, no chance — just moving seeds around the loop.

## How captures work

Where the sowing ends is what matters:

- **If your last seed lands on the opponent's side**, and that house now holds **exactly 2 or 3 seeds**, you capture the whole house — those seeds go to your store.
- If the house *before* that also holds 2 or 3 seeds (still on the opponent's side), you capture that too. Captures chain backwards until the count breaks.
- If your last seed lands on your own side, or on a house that doesn't total 2 or 3, no capture — just play passes.

The trick of Ayo is *setting up* captures — leaving a 1 or 2 in an enemy house that your next sowing will complete into a 2 or 3.

## When the row empties

If the opponent has no seeds to move on their turn, you must play a move that gives them at least one — Ayo etiquette says you feed. If no move can feed them, the game ends and remaining seeds go to whoever's side they're on.

Whoever finishes with more seeds in their store wins.

## Playing Ayo solo, against a computer opponent

You don't need another human to play a proper round. [Play Ayo vs bot](/play-ayo-vs-bot) drops you into a solo table against a computer opponent that plays a real mancala — it sets up captures, blocks yours, and pressures the empty houses so you have to fill them.

Some tips for beating the bot:

- **Count before you sow.** Every move is deterministic. Count the seeds, count the houses ahead, and see the landing house before you commit.
- **Watch the opponent's 1s and 2s.** Those are your capture targets — any sowing that lands your last seed there is potentially free seeds.
- **Don't feed captures.** If a move puts a seed on the opponent's side that turns their house from 1 into 2 (or 2 into 3) on their next turn, you're the one being captured.
- **Empty your rightmost houses last.** The houses closest to your capture side sow into the opponent — those are your attack sources. Keep them loaded.
- **Late-game endgame counts.** When there are only a few seeds on the board, everything is calculable. The bot will play the endgame perfectly — you have to as well.

## Where to play

- **[Play Ayo vs bot](/play-ayo-vs-bot)** — solo, in the browser, no sign-up.
- **[The full Ayo game page](/games/ayo)** — rules, tags, and multiplayer rooms.
- **[Play Whot vs bot](/play-whot-vs-bot)** — the other Nigerian classic, solo edition.

Learn the pattern, then take it to a real opponent when you're ready. [Sow the first seed.](/play-ayo-vs-bot)$md$,
  'Fate Round',
  array['guides', 'ayo', 'mancala', 'nigerian-games', 'solo-vs-bot'],
  'published',
  timestamptz '2026-08-16 09:05:00+00'
),
(
  'play-monopoly-online-with-bots-alternative',
  'Play a Monopoly-style board game online — with bots, no waiting for a full table',
  'A free online property-trading board game with computer players. How bot-filled rooms work in Estate Kings — a Monopoly-style game — so a two-friend night becomes a real four-player game.',
  $md$Half the reason online board games die is the wait. You want a four-player game. You have two friends online. You either sit in a lobby refreshing player counts, or you settle for a two-player game that isn't really the game.

Bots fix that — the good kind, that actually play. Here's how a bot-filled multiplayer room works in **Estate Kings**, FateRound's free property-trading board game (in the same genre as classic buy-houses-and-bankrupt-your-friends games like Monopoly), and how to run one tonight.

## What Estate Kings is

Estate Kings is FateRound's own take on the online property-trading board game — a game inspired by the classic genre popularised by titles like Monopoly. You buy properties as you circle the board, collect rent when opponents land on them, trade for colour groups, build houses and hotels, and bankrupt everyone else. Same familiar loop, our own board and rules.

It's free, in the browser, no sign-up. See the full [Estate Kings game page](/games/monopoly) for the rules.

## Why add bots to a multiplayer room?

Property-trading board games are built for **3 to 5 players**. With two, one player gets both sides of every trade — no leverage, no colour-group race. With four, you get a real market: rival streets, forced trades, someone always one bad roll from bankruptcy.

Bots let you play the right-sized game with whatever humans you actually have online:

- **Two friends + two bots** → a proper four-player table.
- **Three friends + one bot** → a full four-seat game without waiting on that one person who's always late.
- **Solo warm-up before the group arrives** → practice the trade logic against a bot before human friends show up.

## How the bots actually play

The bots aren't chair-fillers. In an Estate Kings room they:

- **Buy properties on landing.** They evaluate the property, the group, and their cash — they don't just always buy or always pass.
- **Negotiate trades.** They accept fair deals, counter unfair ones, and push for colour groups when they're close to completing one.
- **Build houses and hotels.** When a group is theirs and the cash is right, they build — and yes, they'll drop a hotel on the exact street you keep landing on.
- **Bankrupt aggressively.** Late-game, a bot with cash and property will squeeze you.

You can lose to them. That's the point.

## How to start a room with bots

1. Go to **[Estate Kings with bots online](/estate-kings-with-bots-online)** or hit **Create**, then pick Estate Kings.
2. Set your starting cash, timer, and house rules.
3. Share the room code with the friends who are around.
4. **For any seat that's still empty when you're ready to start, add a bot in one tap.**
5. Kick a bot the moment a real player joins — bots step aside for humans.

That's it. The game deals as soon as every seat (human or bot) is filled.

## Tips for beating a bot at a property-trading board game

- **Chase colour groups they don't have.** Bots trade smart, but they can't invent properties. If you monopolise a group early, they can't stop the build.
- **Don't over-trade.** Bots value properties fairly — you rarely rob them in a trade, so trade only for a real colour-group advantage.
- **Build early on high-traffic groups.** The oranges and reds get landed on most; hotels there pay for themselves quickly.
- **Keep a bankruptcy buffer.** Bots don't panic-sell. If they have you cornered, they'll wait for a bad roll — carry enough cash to survive one hit.
- **Late game, prioritise mortgage math.** When the board is bought up, the winner is usually whoever manages mortgages and rent income best, not whoever rolls best.

## Where to play

- **[Estate Kings with bots online](/estate-kings-with-bots-online)** — the multiplayer room with bots to fill empty seats.
- **[Estate Kings game page](/games/monopoly)** — rules, tags, and the play button.
- **[Whot online with bots](/whot-with-bots-online)** — the same bot-in-room feature for the classic Nigerian card game.

A real four-player game, whenever you can get two friends online. [Start a room now.](/estate-kings-with-bots-online)$md$,
  'Fate Round',
  array['guides', 'monopoly-alternative', 'board-games', 'bots-in-rooms', 'estate-kings'],
  'published',
  timestamptz '2026-08-16 09:10:00+00'
)
on conflict (slug) do nothing;
