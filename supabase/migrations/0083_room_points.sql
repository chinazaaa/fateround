-- Room leaderboard points
alter table room_members add column if not exists room_points integer not null default 0;

alter table room_games add column if not exists points_awarded_at timestamptz;

alter table players add column if not exists room_member_id uuid references room_members(id) on delete set null;
create index if not exists idx_players_room_member_id on players(room_member_id) where room_member_id is not null;
