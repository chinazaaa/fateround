-- Separate the "quiet" and "available" time windows on each subscriber device.
--
-- Bug: the notifications screen stored a single window (quiet_start_minutes /
-- quiet_end_minutes) that BOTH the 'quiet' and 'available' modes read and wrote.
-- Editing the times in one mode silently changed the other. The two windows are
-- meant to be independent — "Quiet" is the times to stay silent, "Available" is
-- the times you're happy to be pinged — so they get their own columns.
--
-- quiet_start_minutes / quiet_end_minutes keep holding the 'quiet' window.
-- available_start_minutes / available_end_minutes are the new 'available' window.

alter table public.notification_subscriber_devices
  add column if not exists available_start_minutes int
    check (available_start_minutes is null or (available_start_minutes >= 0 and available_start_minutes <= 1439)),
  add column if not exists available_end_minutes int
    check (available_end_minutes is null or (available_end_minutes >= 0 and available_end_minutes <= 1439));

-- Backfill so nobody loses the window they'd already configured: until now the
-- single window served whichever mode was active, so seed the new 'available'
-- columns from the existing values. After this, the two evolve independently.
update public.notification_subscriber_devices
  set available_start_minutes = quiet_start_minutes,
      available_end_minutes = quiet_end_minutes
  where available_start_minutes is null
    and available_end_minutes is null
    and (quiet_start_minutes is not null or quiet_end_minutes is not null);
