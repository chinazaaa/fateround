-- Blog posts — admin-authored articles served at /blog and /blog/[slug].
--
-- Publicly readable, admin-writable. Reads go through service-role API routes and the
-- public /blog server component (mirroring product_updates), so RLS has a permissive
-- SELECT policy but no write policy — all writes are service-role behind assertAdminRequest.
--
-- No GRANT block needed: a brand-new table inherits Supabase's default table-level SELECT
-- for anon/authenticated. (The column-level GRANT gotcha only applies to games/players,
-- which had their table-level grants revoked in 0122.)

create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null,
  body text not null,                 -- Markdown, rendered with react-markdown on the public pages
  cover_image_url text,               -- optional; a URL or a /public path
  author text not null default 'Fate Round',
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,           -- set when first published; drives public ordering + "future post" hiding
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Public listing is "published, not future-dated, newest first".
create index if not exists idx_blog_posts_public
  on blog_posts (status, published_at desc nulls last);
create unique index if not exists idx_blog_posts_slug on blog_posts (slug);

alter table blog_posts enable row level security;
drop policy if exists "public_blog_posts_select" on blog_posts;
create policy "public_blog_posts_select" on blog_posts for select to anon, authenticated using (true);

-- --------------------------------------------------------------------------
-- Seed: four SEO posts that interlink with existing /games and marketing pages.
-- Bodies are Markdown. Edit or unpublish these from /admin/blog after deploy.
-- --------------------------------------------------------------------------

insert into blog_posts (slug, title, excerpt, body, author, tags, status, published_at)
values
(
  'best-games-to-play-over-video-call',
  'The 12 best games to play over a video call',
  'Zoom, Google Meet, Discord — the party games that actually work when everyone is on a screen, and how to run them without screen-sharing headaches.',
  $md$Video calls are great for seeing faces and terrible for playing games — unless the game was built for it. The trick is simple: everyone should play from their **own phone**, with the call running purely for chat and reactions. No screen-sharing, no passing control around, no "can you see my screen?"

That is exactly how [Fate Round](/) works. One person creates a room, drops the code in the chat, and everyone joins from their own device. Below are the modes that land best on a call.

## Quick icebreakers (2–5 minutes)

- **[Would You Rather](/games/would-you-rather)** — two options, everyone votes, votes stay anonymous. The perfect warm-up while stragglers join the call.
- **[Most Likely To](/games/most-likely-to)** — vote for the friend who fits the prompt. Reveals are always the highlight.
- **[This or That](/games/this-or-that)** — rapid-fire preferences, no wrong answers, keeps the energy up.

## Bigger group energy (5+ players)

- **[Trivia](/games/trivia)** — pick a category or paste your own questions. Works for 3 people or 30.
- **[Codewords](/games/codewords)** — two teams, one grid of words, a battle of clever clues. The best game on this list for a competitive group.
- **[Quiplash-style prompts](/games/quiplash)** — everyone writes a funny answer, then the room votes on the best.

## When you want the call to get loud

- **[Never Have I Ever](/games/never-have-i-ever)** — anonymous confessions, no awkward eye contact. *(18+ — read the note on its page.)*
- **[Codenames-style word games](/games)** — see the full directory for more.

## How to run it on a call

1. Start the video call as normal (Zoom, Meet, Discord, whatever).
2. On Fate Round, hit **Create** and pick a game.
3. Paste the room link into the call chat.
4. Everyone taps it and joins from their phone — no download, no account.
5. Keep the call for talking; play happens on each person's device.

That last point is the whole game. Because nobody is sharing a screen, there is no lag, no "you go first," and no host fumbling with controls. Ready? [Browse every game](/games) and start a room.$md$,
  'Fate Round',
  array['guides', 'video-call', 'party-games'],
  'published',
  timestamptz '2026-07-14 09:00:00+00'
),
(
  'how-to-run-a-school-game-championship',
  'How to run a school game championship (a step-by-step guide)',
  'End-of-term tournaments, class competitions, and whole-year championships — how to organise one that runs itself, even without a device for every student.',
  $md$A game championship is one of the easiest ways to turn the last week of term into something students actually remember. The hard part is usually logistics: brackets, scoring, keeping 60 kids engaged at once. Here is a format that runs itself.

## 1. Pick a game the whole class knows

Stick to something with clear rules and fast rounds. Good picks:

- **[Trivia](/games/trivia)** — set your own questions on the term's topics, or use the built-in bank.
- **[Whot](/games/whot)** — the classic card game, hugely popular in Nigerian schools. See our dedicated [school Whot championship](/school-whot-championship) guide.
- **[Scrabble](/games/scrabble)** or **[Chess](/games/chess)** — for a slower, more strategic bracket.

Keep the adult party games off the list — anything marked **18+** on Fate Round is not suitable for a classroom.

## 2. Use tournament mode

Fate Round has a built-in [tournament](/tournament) system that handles the bracket for you. Players are carried between matches, standings update automatically, and there's a hub page you can put on the projector so the whole room follows along.

## 3. No device for every student? Play whole-class

You do not need one phone per child. Run the game on the projector and split the class into teams — each team huddles and sends one answer. This is how the best classroom sessions work, and it keeps everyone involved instead of buried in a screen.

## 4. Set short round timers

For a class of 30, keep rounds to 30–60 seconds. Short timers keep the pace up and stop any single round from dragging. You can set this when you create the game.

## 5. Crown a champion

At the end of the tournament, the hub shows the final standings. Print a certificate, hand out a small prize, and you have a tradition students will ask for again next term.

## A simple end-of-term plan

| Time | Activity |
| --- | --- |
| 0:00 | Explain the game, split into teams |
| 0:10 | Round-robin group stage |
| 0:30 | Knockout bracket |
| 0:50 | Final + prize-giving |

That is a full championship in under an hour, with zero prep beyond writing a few questions. [Start a tournament](/tournament) or [browse games](/games) to plan yours.$md$,
  'Fate Round',
  array['guides', 'schools', 'tournaments'],
  'published',
  timestamptz '2026-07-07 09:00:00+00'
),
(
  'party-games-for-large-groups',
  'Party games for large groups (that don''t leave anyone sitting out)',
  'Fifteen, twenty, thirty people in one room? These games scale without anyone waiting their turn — and everyone plays from their own phone.',
  $md$Most "party games" quietly fall apart past eight people. Someone is always waiting for their turn, the host loses control of the room, and half the group drifts onto their phones anyway.

The fix is to lean into the phones. On [Fate Round](/), everyone plays from their own device at the same time — so a game with 25 players is just as smooth as one with 5. Here are the modes built to scale.

## Everyone answers at once

These have no "turns" at all — the whole room plays every round:

- **[Trivia](/games/trivia)** — the gold standard for big groups. Everyone answers simultaneously, the leaderboard updates live.
- **[Would You Rather](/games/would-you-rather)** and **[This or That](/games/this-or-that)** — instant votes, instant reveals.
- **[Most Likely To](/games/most-likely-to)** — the bigger the group, the funnier the results.

## Team-based games for a crowd

When you've got 20+ people, split into teams:

- **[Codewords](/games/codewords)** — two teams, one grid. Scales to a big room because each team only needs one person guessing at a time while everyone debates.
- **[Describe It](/games/describe-it)** — teams race to guess from clues. Loud, fast, and forgiving of large numbers.

## Voting games that get better with numbers

- **[Quiplash-style prompts](/games/quiplash)** — more players means more answers to vote on, which means more laughs.
- **[Who Said This](/games/who-said-this)** — anonymous submissions, then guess who wrote what. A 30-person round is chaos in the best way.

## Three rules for a big-group session

1. **Everyone on their own phone.** No passing a device around a room of 20.
2. **Short timers.** 30 seconds keeps a big room from stalling.
3. **Let latecomers spectate.** Fate Round lets people watch and jump in on the next round, so a full room is never a closed door.

Got a big group coming over? [Browse the full directory](/games) and pick one — every game is free and needs no sign-up.$md$,
  'Fate Round',
  array['guides', 'large-groups', 'party-games'],
  'published',
  timestamptz '2026-06-30 09:00:00+00'
),
(
  'whot-rules-explained',
  'Whot rules explained: how to play the classic card game online',
  'A clear guide to Whot — the cards, the special moves (Pick Two, Pick Three, General Market, Hold On, Whot 20), and how to play it online with friends.',
  $md$Whot is one of the most-played card games in Nigeria and West Africa — fast, tactical, and brutal when someone drops a Pick Three on you. If you grew up playing it around a table, here's how it works, plus how to play it online with friends anywhere.

## The goal

Be the first player to get rid of all your cards. Simple. Getting there is where the mischief lives.

## The deck

Whot uses five shapes — **Circle, Triangle, Cross, Square, Star** — numbered cards, plus the special **Whot** card (usually numbered 20).

## Basic play

On your turn, you must play a card that matches the top card of the pile by **either its shape or its number**. Can't match? You go to market — draw a card — and play passes on.

## The special cards

This is what makes Whot, Whot:

- **Pick Two (2)** — the next player draws two cards and misses their turn (unless they can stack another 2).
- **Pick Three (5)** — the next player draws three. The one everyone fears.
- **Hold On (1)** — the next player is skipped.
- **General Market (14)** — *every other player* draws a card. Devastating in a full game.
- **Suspension / Go Again** — play again immediately.
- **Whot (20)** — a wild card. Play it any time and call whichever shape you want next.

House rules vary — some tables allow stacking Pick Twos, some don't. On [Fate Round's Whot](/games/whot) you can toggle these rules when you create the game, so you play *your* version.

## Whot vs UNO

If the special cards sound familiar, you're not wrong — Whot and UNO are cousins. We wrote a full [Whot vs UNO comparison](/whot-vs-uno) if you want the differences laid out.

## Playing Whot online

You don't need a physical deck or everyone in the same room:

1. Go to [Fate Round Whot](/games/whot) and hit **Play free**.
2. Set your house rules (stacking, which special cards are on).
3. Share the room code with your friends.
4. Everyone joins from their phone and you're dealt in.

It plays exactly like the table version — same shapes, same special cards, same arguments about whether you can stack a Pick Two. [Start a game of Whot](/games/whot) or [browse every card game](/games?category=cards).$md$,
  'Fate Round',
  array['guides', 'card-games', 'whot'],
  'published',
  timestamptz '2026-06-23 09:00:00+00'
)
on conflict (slug) do nothing;
