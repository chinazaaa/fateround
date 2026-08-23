-- What's new: catch the /updates page up on features that shipped since the trophies batch.
--
-- Same idempotent shape as 20260814020000_product_updates_trophies.sql and the earlier
-- 0124_product_updates_voice_chat.sql: insert each row only if a product_updates row with
-- that title doesn't already exist, so a re-run (or a replay across environments) is a
-- no-op. sort_order descends in the list; these sit above the August 2026 trophies batch
-- (350) so they show up first in the "Recent" section.

insert into product_updates (type, title, description, month, year, sort_order)
select v.type, v.title, v.description, v.month, v.year, v.sort_order
from (
  values
    (
      'new',
      'Estate Kings bank loans',
      $$Ran out of cash mid-turn? Borrow against your portfolio at a flat interest rate over a fixed term. Miss the deadline and the bank forecloses — cash seized, buildings liquidated at half price, properties transferred. Toggle it and the rate/term in the lobby.$$,
      10::smallint,
      2026::smallint,
      500::integer
    ),
    (
      'new',
      'Estate Kings house rules',
      $$Every Estate Kings house rule now shows up at create AND in the lobby, under a collapsible Advanced section — Double GO Salary, Forced Auctions, No Rent in NICKED, Robin Hood Estate Dividend, Bank Loans, and the auction timer. Pick your rules once at create and they ride through to the lobby.$$,
      10::smallint,
      2026::smallint,
      495::integer
    ),
    (
      'new',
      'Troll Run',
      $$A brand-new word-battle mode with multiple themed worlds. Race the timer, dodge the trolls, and build the longest chain — solo or in a room.$$,
      10::smallint,
      2026::smallint,
      490::integer
    ),
    (
      'new',
      'Wordle Room',
      $$Same-Wordle-different-guesses: everyone in the room plays the same word list, viewers watch the guesses land, and the finish leaderboard ranks by fewest guesses.$$,
      10::smallint,
      2026::smallint,
      485::integer
    ),
    (
      'new',
      'Ludo daily puzzle',
      $$A new daily challenge — finish all four pieces in the fewest possible rolls given a fixed dice sequence. Sits alongside Chess Mate, Word Hunt, Word Search, Sudoku, and the rest.$$,
      10::smallint,
      2026::smallint,
      480::integer
    ),
    (
      'new',
      'Chess Mate daily puzzle',
      $$Solve a mate-in-2 or mate-in-3 every day. Any correct mating line scores; the fastest players climb the daily leaderboard.$$,
      10::smallint,
      2026::smallint,
      475::integer
    ),
    (
      'new',
      'Yesterday’s daily answers',
      $$Every daily puzzle now has a "yesterday’s answers" page so you can see what you missed once the day’s over — Word Hunt’s full word list, Sudoku on the grid, Word Search with paths highlighted, Wordle’s target word, and every other daily. Prev/next arrows browse back through the week.$$,
      10::smallint,
      2026::smallint,
      470::integer
    ),
    (
      'new',
      'Continue playing across devices',
      $$Started a game on your phone and want to keep going on your laptop? The homepage now shows every game you’re in the middle of — hosted or joined — from any device, so you don’t have to retype a code.$$,
      10::smallint,
      2026::smallint,
      465::integer
    ),
    (
      'new',
      'Schedule a game',
      $$Pick a time and open the room in advance. Public scheduled games surface on the browse page under Upcoming so players can RSVP, and you (and everyone who RSVPed) get a push when the room opens.$$,
      10::smallint,
      2026::smallint,
      460::integer
    ),
    (
      'new',
      'Notifications preferences',
      $$One place to decide which notifications reach you: turn-your-turn nudges, scheduled-game T-15 / T-0 reminders, community-post replies, and the daily-challenge streak reminder — quiet hours included. Under Settings → Notifications.$$,
      10::smallint,
      2026::smallint,
      455::integer
    ),
    (
      'new',
      'Move hosting between devices',
      $$If you close the tab you were hosting from, or start a game on your phone and want to run it from your laptop, you can now move the host session over instead of losing it. Web: on any game you host, "Take over hosting here" appears when you visit from a different device.$$,
      10::smallint,
      2026::smallint,
      450::integer
    ),
    (
      'new',
      'Mobile info-architecture refresh',
      $$One settings destination on mobile, a new profile with Trophies / Stats tabs, and a Home order that puts what you were playing at the top. Continue playing shows up on mobile too.$$,
      10::smallint,
      2026::smallint,
      445::integer
    ),
    (
      'changed',
      'Live games strip clarity',
      $$"9/6 players" for a game with viewers used to read as impossible. Now the live-games and browse cards split it — "6/6 players · 3 watching" — so you can see who’s playing vs. who’s along for the ride at a glance.$$,
      10::smallint,
      2026::smallint,
      440::integer
    )
) as v(type, title, description, month, year, sort_order)
where not exists (
  select 1 from product_updates pu where pu.title = v.title
);
