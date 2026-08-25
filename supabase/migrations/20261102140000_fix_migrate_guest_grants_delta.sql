-- Fix migrate_guest_grants: outer sum(delta) references a column the
-- derived table doesn't project.
--
-- 20261101120100_coins_functions.sql line 419 has:
--
--   select coalesce(sum(delta), 0)::bigint,
--          jsonb_object_agg(reason, per_reason)
--     into v_raw, v_itemization
--     from (
--       select reason, sum(delta)::bigint as per_reason
--         from guest_pending_grants
--        where id = any(v_ids)
--        group by reason
--     ) t;
--
-- The outer FROM is `t`, which only projects `reason` and `per_reason`.
-- Referencing `delta` there throws SQL 42703 "column \"delta\" does not
-- exist" at runtime — every guest-migration attempt with pending rows
-- fails, so signup-time coin migration is silently broken.
--
-- Fix: sum `per_reason` in the outer query (the per-reason totals sum to
-- the same grand total as summing `delta` directly). Everything else in
-- the function is unchanged.

create or replace function migrate_guest_grants(
  p_profile_id uuid,
  p_device_id  text
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_cap   constant bigint := 500;
  v_window      constant interval := interval '7 days';
  v_raw         bigint;
  v_granted     bigint;
  v_new_balance bigint;
  v_itemization jsonb;
  v_ids         uuid[];
  v_prev_total  bigint;
  v_remaining   bigint;
begin
  if p_device_id is null or length(trim(p_device_id)) = 0 then
    return 0;
  end if;

  select array_agg(id) into v_ids
    from (
      select id
        from guest_pending_grants
       where device_id = p_device_id
         and created_at >= now() - v_window
       for update
    ) locked;

  if v_ids is null or array_length(v_ids, 1) is null then
    return 0;
  end if;

  select coalesce(sum(per_reason), 0)::bigint,
         jsonb_object_agg(reason, per_reason)
    into v_raw, v_itemization
    from (
      select reason, sum(delta)::bigint as per_reason
        from guest_pending_grants
       where id = any(v_ids)
       group by reason
    ) t;

  if v_raw is null or v_raw <= 0 then
    delete from guest_pending_grants where id = any(v_ids);
    return 0;
  end if;

  select coalesce(sum(delta), 0)::bigint into v_prev_total
    from coin_ledger
   where profile_id = p_profile_id
     and reason = 'guest_migration';

  v_remaining := greatest(0, v_total_cap - v_prev_total);
  v_granted   := least(v_raw, v_remaining);

  if v_granted <= 0 then
    delete from guest_pending_grants where id = any(v_ids);
    return 0;
  end if;

  begin
    update profiles set coins = coins + v_granted
     where id = p_profile_id
     returning coins into v_new_balance;

    if v_new_balance is null then
      raise exception 'migrate_guest_grants: no such profile %', p_profile_id;
    end if;

    insert into coin_ledger
      (profile_id, delta, balance_after, reason, ref_id, metadata)
    values
      (p_profile_id, v_granted, v_new_balance, 'guest_migration',
       p_device_id,
       jsonb_build_object(
         'device_id',   p_device_id,
         'raw_total',   v_raw,
         'total_cap',   v_total_cap,
         'prev_total',  v_prev_total,
         'granted',     v_granted,
         'per_reason',  coalesce(v_itemization, '{}'::jsonb)
       ));
  exception when unique_violation then
    delete from guest_pending_grants where id = any(v_ids);
    return 0;
  end;

  delete from guest_pending_grants where id = any(v_ids);

  return v_granted;
end;
$$;

revoke all on function migrate_guest_grants(uuid, text) from public;
grant execute on function migrate_guest_grants(uuid, text) to authenticated, service_role;
