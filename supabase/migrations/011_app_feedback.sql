create table if not exists app_feedback (
  id uuid primary key default gen_random_uuid(),
  game_type text not null default 'general'
    check (game_type in (
      'general',
      'smash_marry_kill',
      'red_flag_green_flag',
      'smash_or_pass',
      'would_you_rather',
      'this_or_that',
      'most_likely_to',
      'who_said_this',
      'hot_seat',
      'custom'
    )),
  category text not null
    check (category in ('bug', 'feature', 'improvement', 'other')),
  message text not null,
  page_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_feedback_created_at on app_feedback(created_at desc);

alter table app_feedback enable row level security;
create policy "public_app_feedback_insert" on app_feedback for insert to anon with check (true);
