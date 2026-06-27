create table if not exists product_updates (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('new', 'changed', 'upcoming')),
  title text not null,
  description text not null,
  month smallint check (month is null or (month >= 1 and month <= 12)),
  year smallint check (year is null or (year >= 2000 and year <= 2100)),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_updates_type on product_updates(type);
create index if not exists idx_product_updates_list on product_updates(type, year desc nulls last, month desc nulls last, sort_order desc);

alter table product_updates enable row level security;
drop policy if exists "public_product_updates_select" on product_updates;
create policy "public_product_updates_select" on product_updates for select to anon, authenticated using (true);

insert into product_updates (type, title, description, month, year, sort_order) values
  (
    'new',
    'Secret Message',
    'Send anonymous messages to a private board. Only the link owner sees what comes in — perfect for confessions, feedback, or surprise notes.',
    6,
    2026,
    100
  ),
  (
    'new',
    'Anonymous Messages',
    'A live anonymous inbox for your group. Everyone in the room can post and reply without revealing who said what.',
    5,
    2026,
    90
  ),
  (
    'new',
    'This or That',
    'Quick-fire binary choices — pick between two options and see how the group splits.',
    4,
    2026,
    80
  ),
  (
    'new',
    'Hot Seat',
    'One player in the spotlight answers questions while everyone else votes on their response.',
    3,
    2026,
    70
  ),
  (
    'new',
    'Custom game modes',
    'Build your own prompts and rules — run a game that fits your group exactly.',
    2,
    2026,
    60
  ),
  (
    'changed',
    'Game history',
    'Look up past rounds by room code. See who got voted for what after the game ends.',
    3,
    2026,
    100
  ),
  (
    'changed',
    'Participant-only voting',
    'Hosts can limit votes to named players in the room instead of open spectators.',
    2,
    2026,
    90
  ),
  (
    'changed',
    'Room themes',
    'Pick a visual theme when creating a game to match the vibe of your session.',
    1,
    2026,
    80
  ),
  (
    'changed',
    'Mobile experience',
    'Smoother layouts on phones — easier tapping, better card sizing, and faster room joins.',
    1,
    2026,
    70
  ),
  (
    'upcoming',
    'More game modes',
    'We are cooking up new party formats based on what players ask for most.',
    null,
    null,
    30
  ),
  (
    'upcoming',
    'Live reactions',
    'React to reveals in real time without leaving your vote screen.',
    null,
    null,
    20
  ),
  (
    'upcoming',
    'Shareable result cards',
    'Export a highlight reel or summary image after a wild round.',
    null,
    null,
    10
  );
