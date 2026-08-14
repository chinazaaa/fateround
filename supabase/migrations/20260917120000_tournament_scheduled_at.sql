-- Scheduled events: the wall-clock time the tournament is meant to start. Set
-- by the host at creation, shared with players via the invite link so they can
-- pre-register and add the event to their calendar (.ics). It's a display /
-- reminder field only — the host still controls the actual start with the
-- "Start Next Game" button on the day, so an empty room can never auto-open
-- without anyone in it.
--
-- Null / omitted means "no scheduled time" — the tournament behaves exactly as
-- before this column existed.
alter table tournaments add column if not exists scheduled_at timestamptz;
