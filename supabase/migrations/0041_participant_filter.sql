alter table games
  add column if not exists participant_filter text not null default 'all'
  check (participant_filter in ('all', 'joined'));
