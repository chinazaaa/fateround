-- Rate-limit ledger for the public winner self-post endpoint.
--
-- The weekly post code is short and memorable by design (see POST_CODE_MIN_LENGTH),
-- which makes it cheap to guess. This table backs a per-IP throttle so wrong-code
-- attempts are capped within a rolling window, making brute-force impractical
-- across serverless instances (a single in-memory counter wouldn't be shared).
--
-- One row per IP: `count` failed attempts since `window_started_at`. The window
-- is rolled/reset in application code; successful posts clear the row.

create table if not exists community_post_win_attempts (
  ip text primary key,
  count integer not null default 0,
  window_started_at timestamptz not null default now()
);

-- Service-role-only, consistent with the other community tables.
alter table community_post_win_attempts enable row level security;
