-- Solo (vs bot) practice tracking.
--
-- Solo games run entirely client-side (sessionStorage; no room, no games row),
-- so nothing on the games table can tell us how much they get played. This
-- table logs one row per solo game STARTED, so the admin dashboard can show
-- adoption per game type without touching any player identity.
--
-- No PII: solo players are always anonymous, no profile is created for a solo
-- session, and nothing here links back to a person. Difficulty is captured
-- because it's a meaningful mode dimension for the card games.

create table if not exists public.solo_plays (
  id uuid primary key default gen_random_uuid(),
  game_type text not null,
  difficulty text,
  created_at timestamptz not null default now()
);

alter table public.solo_plays enable row level security;

-- Public insert-only: the solo clients POST from the browser via the anon key.
-- No SELECT policy — admin reads go through the service-role key which bypasses
-- RLS. Keeping reads off anon prevents scraping raw event streams.
drop policy if exists "anon insert solo_plays" on public.solo_plays;
create policy "anon insert solo_plays"
  on public.solo_plays for insert
  to anon, authenticated
  with check (true);

grant insert on public.solo_plays to anon, authenticated;

create index if not exists idx_solo_plays_created_at on public.solo_plays (created_at desc);
create index if not exists idx_solo_plays_game_type on public.solo_plays (game_type);

comment on table public.solo_plays is
  'One row per solo-vs-bot practice game started. Client-side games have no games/players row, so this is the only signal of solo adoption. Insert-only from anon; admin aggregates counts via the service-role key.';
