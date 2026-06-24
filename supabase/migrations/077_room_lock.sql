-- Host can lock a room to block new joins and hide from public browse
alter table rooms add column if not exists is_locked boolean not null default false;

drop index if exists idx_rooms_public;
create index if not exists idx_rooms_public on rooms(is_public, created_at desc)
  where is_public = true and is_locked = false;
