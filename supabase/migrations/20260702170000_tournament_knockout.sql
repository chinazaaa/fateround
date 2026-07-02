-- Knockout (group elimination) tournament format: one group game per round with
-- everyone in it, the bottom half eliminated each round until a champion remains
-- (Round of 16 → Quarterfinal → Semifinal → Final). game_config stores the
-- per-round setup for that group game (for trivia: questions per round + timer),
-- captured once at creation and reused every round.

alter table tournaments drop constraint if exists tournaments_format_check;
alter table tournaments
  add constraint tournaments_format_check
  check (format in ('round-robin', 'head-to-head', 'knockout'));

alter table tournaments add column if not exists game_config jsonb;
