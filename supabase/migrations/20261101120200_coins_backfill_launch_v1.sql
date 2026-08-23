-- Coins & Shop — one-shot retro backfill for every profile that exists on
-- launch day. Uses grant_launch_v1() so the formula, the cap and the
-- one-per-profile guard live in a single place. The partial unique index
-- on coin_ledger (profile_id, reason='launch_grant_v1') means a re-run of
-- this migration is a safe no-op — every already-granted profile is
-- silently skipped inside grant_launch_v1().
--
-- Runs for both anonymous and email profiles: an anonymous player who
-- upgrades to an email account later keeps this grant, per the plan's
-- Case-A merge rule.
--
-- Anyone who signs up AFTER this migration ran gets only the 100-coin
-- welcome grant via grant_welcome() — the plan's timing rule ("no gaming
-- the launch date").
--
-- Row-count logging: we PERFORM inside a loop so a bad profile doesn't
-- take the whole migration down; grant_launch_v1() itself doesn't raise
-- for the already-granted case, only for a genuinely missing profile.

do $$
declare
  v_id      uuid;
  v_granted bigint;
  v_ok      integer := 0;
  v_skipped integer := 0;
begin
  for v_id in select id from profiles loop
    begin
      v_granted := grant_launch_v1(v_id);
      if v_granted is null then
        v_skipped := v_skipped + 1;
      else
        v_ok := v_ok + 1;
      end if;
    exception when others then
      -- Never block the migration on a single profile. The launch team can
      -- diff coin_ledger for reason='launch_grant_v1' after the fact and
      -- re-run this migration to catch any misses (grant_launch_v1 is
      -- idempotent per profile).
      raise notice 'launch_grant_v1 failed for profile %: %', v_id, sqlerrm;
      v_skipped := v_skipped + 1;
    end;
  end loop;

  raise notice 'launch_grant_v1: granted % profiles, skipped %', v_ok, v_skipped;
end $$;
