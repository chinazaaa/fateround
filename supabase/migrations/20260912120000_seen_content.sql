-- Track which platform content items each player has seen, so content selection
-- can prioritise unseen items and warn hosts when most content is stale.

create table if not exists seen_content (
  id           bigint generated always as identity primary key,
  profile_id   uuid not null references profiles(id) on delete cascade,
  game_type    text not null,
  content_key  text not null,
  seen_at      timestamptz not null default now()
);

create unique index idx_seen_content_uniq
  on seen_content (profile_id, game_type, content_key);

create index idx_seen_content_lookup
  on seen_content (profile_id, game_type);

create index idx_seen_content_age
  on seen_content (seen_at);

alter table seen_content enable row level security;
-- Service-role only — no anon/authenticated policies needed.

-- RPC used by fetchSeenContentForPlayers to aggregate seen counts per content key.
create or replace function seen_content_counts(
  p_profile_ids uuid[],
  p_game_type text
)
returns table(content_key text, seen_count int)
language sql stable security definer
as $$
  select sc.content_key, count(distinct sc.profile_id)::int as seen_count
  from seen_content sc
  where sc.profile_id = any(p_profile_ids)
    and sc.game_type = p_game_type
  group by sc.content_key;
$$;
