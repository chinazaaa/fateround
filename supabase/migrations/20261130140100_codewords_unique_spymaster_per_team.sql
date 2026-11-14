-- Codewords spymaster race fix (F3). /api/codewords/role does check-then-upsert, so
-- parallel spymaster claims for one team all succeeded. Enforce it in the database.
--
-- 1. Demote (never delete) duplicate spymaster rows per (game_id, team), keeping the
--    earliest by created_at then id.
-- 2. Add a partial unique index so a second spymaster per team raises 23505.
-- Explicit transaction: the runner does not wrap files, and LOCK TABLE needs one. The
-- lock blocks concurrent role writes between cleanup and index build.
begin;

lock table public.codewords_player_roles in share row exclusive mode;

update public.codewords_player_roles r
set role = 'operative'
from (
  select id,
         row_number() over (partition by game_id, team order by created_at, id) as rn
  from public.codewords_player_roles
  where role = 'spymaster'
) d
where r.id = d.id
  and d.rn > 1;

create unique index if not exists codewords_player_roles_one_spymaster_per_team
  on public.codewords_player_roles (game_id, team)
  where role = 'spymaster';

commit;
