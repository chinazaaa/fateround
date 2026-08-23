-- Coins & Shop — server-authoritative earn / spend / grant / migrate.
--
-- Every mutation to `profiles.coins` and `coin_ledger` goes through one of
-- these functions. SECURITY DEFINER + REVOKE from public means the caller
-- can't reach them directly from the anon or authenticated role: they run
-- only from the service-role API layer (see /api/admin/coins for the
-- admin adjustment path; Phase 2 wires the earn path from the finish
-- handler). This is deliberate — a client that can influence how much it
-- earned is the recurring failure the whole posture exists to prevent.
--
-- Every function updates profiles.coins and inserts the ledger row in one
-- transaction. balance_after is computed inside the function against a
-- row-locked profile so concurrent awards can't race the balance out of
-- alignment. Grants that must run at most once (welcome, launch, guest
-- migration) rely on the partial unique index in the foundation migration
-- rather than a re-checked flag — the DB tells us "already granted" via
-- constraint violation, which we swallow to null so callers can idempotently
-- retry.
--
-- Anti-farming rule (per plan §"Anti-farming rules"):
--   * award_coins() takes `unique_humans` and skips the write if < 2 humans,
--     unless the reason is inherently solo (daily_challenge) or bracketed
--     (tournament_placement), or the caller passes exempt_from_floor=true.
--   * 2-human rooms earn at 0.5× rate; 3+ humans at 1×.
--   * Rounding is floor(); a 5-coin bonus in a 2-human room pays 2 coins,
--     not 3, so an alt-account operator strictly loses compared to real 3+
--     rooms.

-- ---------------------------------------------------------------------------
-- award_coins(profile_id, delta, reason, ref_id, unique_humans,
--             exempt_from_floor)
--
-- Returns the credited amount (post-multiplier), or 0 if the floor blocked
-- the award. Never returns a negative number — spend_coins() is the debit
-- path.
-- ---------------------------------------------------------------------------
create or replace function award_coins(
  p_profile_id       uuid,
  p_delta            bigint,
  p_reason           text,
  p_ref_id           text default null,
  p_unique_humans    integer default null,
  p_exempt_from_floor boolean default false
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credited     bigint;
  v_new_balance  bigint;
  v_is_exempt    boolean;
begin
  if p_delta is null or p_delta <= 0 then
    raise exception 'award_coins: delta must be positive (got %)', p_delta;
  end if;

  if p_reason not in (
    'win', 'daily_challenge', 'streak_multiplier',
    'tournament_placement', 'host_bounty', 'first_mode_bonus',
    -- `refund` is a credit path — used by future support tooling that
    -- reverses a shop_purchase. Deliberately routed through award_coins
    -- (not spend_coins) because it MOVES COINS BACK to the player, and
    -- naming the credit path "spend" would be a footgun. Exempted from
    -- the 2-human floor: a refund is admin-driven, not gameplay.
    'refund'
  ) then
    raise exception 'award_coins: reason % is not an earn reason', p_reason;
  end if;

  -- Tournament and daily-challenge earnings are exempt from the 2-human
  -- floor and the 2-human multiplier (plan §"Anti-farming rules").
  v_is_exempt := coalesce(p_exempt_from_floor, false)
              or p_reason in ('daily_challenge', 'tournament_placement', 'refund');

  v_credited := p_delta;

  if not v_is_exempt then
    if p_unique_humans is null or p_unique_humans < 2 then
      -- Below the floor: silently drop rather than error. The finish path
      -- calls this best-effort, and the caller's log covers the "why".
      return 0;
    end if;
    if p_unique_humans = 2 then
      -- 0.5× multiplier, floored (never round up — favor "farming loses").
      v_credited := p_delta / 2;
    end if;
  end if;

  if v_credited <= 0 then
    return 0;
  end if;

  -- Lock the profile row so the balance we insert into the ledger matches
  -- the balance we just wrote.
  update profiles
     set coins = coins + v_credited
   where id = p_profile_id
   returning coins into v_new_balance;

  if v_new_balance is null then
    raise exception 'award_coins: no such profile %', p_profile_id;
  end if;

  insert into coin_ledger (profile_id, delta, balance_after, reason, ref_id)
  values (p_profile_id, v_credited, v_new_balance, p_reason, p_ref_id);

  return v_credited;
end;
$$;

revoke all on function award_coins(uuid, bigint, text, text, integer, boolean) from public;

-- ---------------------------------------------------------------------------
-- spend_coins(profile_id, delta, reason, ref_id)
--
-- Deducts `delta` coins if the balance covers it. Returns the new balance,
-- or NULL if the spend was rejected for insufficient funds. Callers must
-- treat NULL as "purchase failed" — never assume success.
-- ---------------------------------------------------------------------------
create or replace function spend_coins(
  p_profile_id  uuid,
  p_delta       bigint,
  p_reason      text,
  p_ref_id      text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance bigint;
begin
  if p_delta is null or p_delta <= 0 then
    raise exception 'spend_coins: delta must be positive (got %)', p_delta;
  end if;
  -- DB-API SURFACE CHANGE (this PR): `refund` used to be an accepted
  -- reason here and is now rejected. A refund is a CREDIT and belongs on
  -- award_coins() — routing it through spend would double-debit the
  -- player (this function subtracts, then the ledger row says "refund").
  -- No in-tree caller passed 'refund' before, but if any external DBA
  -- script, dashboard SQL, or older client did, this raises loudly on
  -- the first call — no silent behavior change.
  if p_reason <> 'shop_purchase' then
    raise exception 'spend_coins: reason % is not a spend reason (refund goes through award_coins)', p_reason;
  end if;

  -- Row-locking update; the CHECK (coins >= 0) constraint on profiles
  -- would raise, but we prefer to return NULL so callers get a soft
  -- "no funds" path instead of a 500.
  update profiles
     set coins = coins - p_delta
   where id = p_profile_id
     and coins >= p_delta
  returning coins into v_new_balance;

  if v_new_balance is null then
    -- Distinguish "no such profile" (programmer error — callers should
    -- never spend against a stranger) from "insufficient funds" (a soft
    -- failure the shop UI turns into "not enough coins"). Mirrors what
    -- admin_adjust_coins does for the same reason.
    perform 1 from profiles where id = p_profile_id;
    if not found then
      raise exception 'spend_coins: no such profile %', p_profile_id;
    end if;
    return null;
  end if;

  insert into coin_ledger (profile_id, delta, balance_after, reason, ref_id)
  values (p_profile_id, -p_delta, v_new_balance, p_reason, p_ref_id);

  return v_new_balance;
end;
$$;

revoke all on function spend_coins(uuid, bigint, text, text) from public;

-- ---------------------------------------------------------------------------
-- grant_welcome(profile_id)
--
-- One-shot 100-coin welcome grant for every new signup. Idempotent — the
-- partial unique index on (profile_id, reason='welcome_v1') means a repeat
-- call after a successful grant is a no-op. Returns the new balance, or
-- the current balance if the grant already ran.
-- ---------------------------------------------------------------------------
create or replace function grant_welcome(p_profile_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount      constant bigint := 100;
  v_new_balance bigint;
begin
  begin
    update profiles set coins = coins + v_amount
     where id = p_profile_id
     returning coins into v_new_balance;

    if v_new_balance is null then
      raise exception 'grant_welcome: no such profile %', p_profile_id;
    end if;

    insert into coin_ledger (profile_id, delta, balance_after, reason, ref_id)
    values (p_profile_id, v_amount, v_new_balance, 'welcome_v1', 'welcome_v1');
  exception when unique_violation then
    -- Already granted. The subtransaction the BEGIN block creates is
    -- rolled back automatically when this handler runs, so the +v_amount
    -- update above is already reverted; just re-read the balance to
    -- return the caller the current value.
    select coins into v_new_balance from profiles where id = p_profile_id;
  end;

  return v_new_balance;
end;
$$;

revoke all on function grant_welcome(uuid) from public;

-- ---------------------------------------------------------------------------
-- grant_launch_v1(profile_id) — one-shot retro backfill for existing
-- players. Formula and cap from the plan §"Backfill methodology":
--   raw = 5*trophy_count
--       + 3*min(daily_challenges_completed, 100)
--       + 25*tournaments_placed
--       + 1*min(games_finished, 500)
--       + 100 flat welcome
--   capped at 2000
--
-- Callable per-profile from the backfill migration and, thereafter, safely
-- ignored for anyone already granted (partial unique index enforces).
--
-- All inputs read server-side from tables we already own — no client input.
-- ---------------------------------------------------------------------------
create or replace function grant_launch_v1(p_profile_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap             constant bigint := 2000;
  v_trophies        bigint;
  v_dailies         bigint;
  v_tournaments     bigint;
  v_games           bigint;
  v_raw             bigint;
  v_grant           bigint;
  v_new_balance     bigint;
  v_itemization     jsonb;
begin
  select count(*)::bigint into v_trophies
    from player_trophies where profile_id = p_profile_id;

  select coalesce(count(*), 0)::bigint into v_dailies
    from daily_scores where profile_id = p_profile_id;
  v_dailies := least(v_dailies, 100);

  -- Tournaments still key on player_name (not profile_id), so this is a
  -- handle-match. The `coalesce(p.handle,'') <> ''` guard is load-bearing:
  -- without it, every profile with a null/blank handle would join every
  -- unnamed / '' tournament row and pick up someone else's placements
  -- (25 coins each). Treated as advisory even with the guard; the 2000
  -- cap absorbs any remaining slop from handle collisions between two
  -- profiles that happen to share a name.
  select coalesce(sum(case when is_eliminated then 0 else 1 end), 0)::bigint
    into v_tournaments
    from tournament_players tp
    join profiles p on p.id = p_profile_id
   where coalesce(p.handle, '') <> ''
     and lower(tp.player_name) = lower(p.handle);

  select coalesce(games_played, 0)::bigint into v_games
    from player_stats
   where profile_id = p_profile_id and game_type = '__global__';
  v_games := least(coalesce(v_games, 0), 500);

  v_raw := 5 * v_trophies
         + 3 * v_dailies
         + 25 * v_tournaments
         + 1 * v_games
         + 100;
  v_grant := least(v_raw, v_cap);

  if v_grant <= 0 then
    return null;
  end if;

  v_itemization := jsonb_build_object(
    'trophies', v_trophies,
    'daily_challenges', v_dailies,
    'tournaments_placed', v_tournaments,
    'games_finished', v_games,
    'welcome_flat', 100,
    'raw_total', v_raw,
    'capped_at', v_cap,
    'granted', v_grant
  );

  begin
    update profiles set coins = coins + v_grant
     where id = p_profile_id
     returning coins into v_new_balance;

    if v_new_balance is null then
      raise exception 'grant_launch_v1: no such profile %', p_profile_id;
    end if;

    insert into coin_ledger
      (profile_id, delta, balance_after, reason, ref_id, admin_note)
    values
      (p_profile_id, v_grant, v_new_balance, 'launch_grant_v1',
       'launch_grant_v1', v_itemization::text);
  exception when unique_violation then
    -- Already granted. The subtransaction is rolled back automatically —
    -- the +v_grant update above is reverted along with the failed insert.
    return null;
  end;

  return v_new_balance;
end;
$$;

revoke all on function grant_launch_v1(uuid) from public;

-- ---------------------------------------------------------------------------
-- migrate_guest_grants(profile_id, device_id)
--
-- Sums pending guest earnings for `device_id` over the last 7 days, caps
-- the total at 500 coins (anti-abuse — friend-group signup farm on one
-- shared device), writes ONE coin_ledger row with an itemized note, and
-- deletes the consumed rows. Returns the granted amount (post-cap), or 0
-- if there was nothing to migrate.
--
-- One migration per profile — partial unique index enforces.
-- ---------------------------------------------------------------------------
create or replace function migrate_guest_grants(
  p_profile_id uuid,
  p_device_id  text
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap         constant bigint := 500;
  v_window      constant interval := interval '7 days';
  v_raw         bigint;
  v_granted     bigint;
  v_new_balance bigint;
  v_itemization jsonb;
begin
  if p_device_id is null or length(trim(p_device_id)) = 0 then
    return 0;
  end if;

  select coalesce(sum(delta), 0)::bigint,
         jsonb_object_agg(reason, per_reason)
    into v_raw, v_itemization
    from (
      select reason, sum(delta)::bigint as per_reason
        from guest_pending_grants
       where device_id = p_device_id
         and created_at >= now() - v_window
       group by reason
    ) t;

  if v_raw is null or v_raw <= 0 then
    return 0;
  end if;

  v_granted := least(v_raw, v_cap);

  begin
    update profiles set coins = coins + v_granted
     where id = p_profile_id
     returning coins into v_new_balance;

    if v_new_balance is null then
      raise exception 'migrate_guest_grants: no such profile %', p_profile_id;
    end if;

    insert into coin_ledger
      (profile_id, delta, balance_after, reason, ref_id, admin_note)
    values
      (p_profile_id, v_granted, v_new_balance, 'guest_migration',
       p_device_id,
       jsonb_build_object('raw_total', v_raw, 'capped_at', v_cap,
                          'granted', v_granted,
                          'per_reason', coalesce(v_itemization, '{}'::jsonb))::text);
  exception when unique_violation then
    -- Already migrated once for this profile. The subtransaction is
    -- rolled back automatically, so the +v_granted update above is
    -- reverted; leave the pending rows in place — the earlier migration
    -- already consumed them.
    return 0;
  end;

  -- Consume ONLY the rows that fed into the grant. Rows older than the
  -- 7-day window weren't summed in — deleting them here would silently
  -- lose the audit trail of what the guest saw ("Sign up to claim X")
  -- earlier. Housekeeping of expired rows is a separate cron concern.
  delete from guest_pending_grants
   where device_id = p_device_id
     and created_at >= now() - v_window;

  return v_granted;
end;
$$;

revoke all on function migrate_guest_grants(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- admin_adjust_coins(profile_id, delta, admin_email, category, note,
--                    daily_cap_coins)
--
-- Atomic balance move + ledger insert for the admin adjustment path. Kept
-- separate from award_coins / spend_coins because the ledger row carries
-- admin_id / admin_category / admin_note fields the earn/spend paths
-- deliberately don't take.
--
-- Returns a jsonb envelope so the API can render an accurate response
-- from a single round-trip and doesn't have to re-sum the 24h window
-- (which would race the RPC's own view — a ledger row can fall out of
-- the window between the RPC and the recount):
--
--   { "outcome": "ok" | "cap_breach" | "underflow",
--     "new_balance": bigint | null,   -- present only for outcome=ok
--     "spent_today": bigint,          -- always the value the lock saw
--     "cap":         bigint }         -- echoed back for the response
--
-- Raises for a missing profile or an invalid category — those are
-- programmer errors the caller should surface as 4xx.
--
-- CAP ENFORCEMENT IS IN-DB, UNDER AN ADVISORY TRANSACTION LOCK keyed on
-- the admin email — so two concurrent adjustments from the same admin
-- serialize and can't both see spentToday=0 and both post. An earlier
-- draft did the cap check in the API layer and had exactly that TOCTOU.
-- Passing the cap as a parameter (rather than baking 5000 into the DB)
-- keeps the policy value with the API code that owns "same 24 hours."
-- ---------------------------------------------------------------------------

-- Drop the previous signature (returned bare bigint) — jsonb return is a
-- signature change Postgres won't do with CREATE OR REPLACE.
drop function if exists admin_adjust_coins(uuid, bigint, text, text, text, bigint);

create or replace function admin_adjust_coins(
  p_profile_id     uuid,
  p_delta          bigint,
  p_admin_email    text,
  p_category       text,
  p_note           text,
  p_daily_cap_coins bigint default 5000
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance    bigint;
  v_admin_key      text;
  v_spent_today    bigint;
  v_spent_after    bigint;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'admin_adjust_coins: delta must be non-zero';
  end if;
  if p_category not in (
    'bug_reimbursement', 'support_goodwill', 'promotion', 'correction', 'other'
  ) then
    raise exception 'admin_adjust_coins: unknown category %', p_category;
  end if;
  if p_delta < 0 and p_category <> 'correction' then
    raise exception 'admin_adjust_coins: negative delta requires category=correction';
  end if;
  if p_note is null or length(trim(p_note)) < 10 then
    raise exception 'admin_adjust_coins: note must be at least 10 characters';
  end if;
  if p_admin_email is null or length(trim(p_admin_email)) = 0 then
    raise exception 'admin_adjust_coins: admin_email is required';
  end if;

  v_admin_key := lower(trim(p_admin_email));

  -- Serialize concurrent calls from the same admin so the cap check + the
  -- insert-that-would-breach-it run as one critical section. The lock is
  -- released at commit; keyed on hashtext so different admin emails never
  -- contend, and same admin from two tabs / two rooms queue behind each
  -- other. Not a bottleneck — admin adjustments are rare.
  perform pg_advisory_xact_lock(hashtext('admin_adjust_coins:' || v_admin_key));

  select coalesce(sum(abs(delta)), 0)::bigint
    into v_spent_today
    from coin_ledger
   where reason = 'admin_adjustment'
     and admin_id = v_admin_key
     and created_at >= now() - interval '24 hours';

  if v_spent_today + abs(p_delta) > p_daily_cap_coins then
    return jsonb_build_object(
      'outcome',     'cap_breach',
      'new_balance', null,
      'spent_today', v_spent_today,
      'cap',         p_daily_cap_coins
    );
  end if;

  update profiles
     set coins = coins + p_delta
   where id = p_profile_id
     and (p_delta > 0 or coins >= -p_delta)
   returning coins into v_new_balance;

  if v_new_balance is null then
    -- Either the profile doesn't exist or the guard blocked an underflow.
    -- Tell the caller apart by probing existence.
    perform 1 from profiles where id = p_profile_id;
    if not found then
      raise exception 'admin_adjust_coins: no such profile %', p_profile_id;
    end if;
    return jsonb_build_object(
      'outcome',     'underflow',
      'new_balance', null,
      'spent_today', v_spent_today,
      'cap',         p_daily_cap_coins
    );
  end if;

  insert into coin_ledger
    (profile_id, delta, balance_after, reason, admin_id, admin_category, admin_note)
  values
    (p_profile_id, p_delta, v_new_balance, 'admin_adjustment',
     v_admin_key, p_category, p_note);

  v_spent_after := v_spent_today + abs(p_delta);

  return jsonb_build_object(
    'outcome',     'ok',
    'new_balance', v_new_balance,
    'spent_today', v_spent_after,
    'cap',         p_daily_cap_coins
  );
end;
$$;

revoke all on function admin_adjust_coins(uuid, bigint, text, text, text, bigint) from public;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted). Apply as a NEW forward migration; do NOT edit this file.
--   drop function if exists admin_adjust_coins(uuid, bigint, text, text, text, bigint);
--   drop function if exists migrate_guest_grants(uuid, text);
--   drop function if exists grant_launch_v1(uuid);
--   drop function if exists grant_welcome(uuid);
--   drop function if exists spend_coins(uuid, bigint, text, text);
--   drop function if exists award_coins(uuid, bigint, text, text, integer, boolean);
-- ----------------------------------------------------------------------------
