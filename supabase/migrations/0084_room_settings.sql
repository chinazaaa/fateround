-- Room visibility, description, and timezone
alter table rooms add column if not exists is_public boolean not null default false;
alter table rooms add column if not exists description text;
alter table rooms add column if not exists timezone text;

create index if not exists idx_rooms_public on rooms(is_public, created_at desc) where is_public = true;
