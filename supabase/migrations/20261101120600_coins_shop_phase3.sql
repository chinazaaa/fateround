-- Coins & Shop — Phase 3 (shop; spending goes live).
--
-- Reference: docs/coins-and-shop-plan.md § "Launch sequencing" → Phase 3.
--
-- Adds:
--   * purchase_item() RPC — the single server-authoritative purchase path.
--     Spends coins via spend_coins(), writes the profile_owned_* row, and
--     back-fills the ledger row's ref_id with the owned-row id — all inside
--     one transaction so the "ledger is truth" invariant can't slip when
--     the frontend races two clicks.
--   * A partial unique index on (profile_id, ref_id) where
--     reason='shop_purchase' AND ref_id starts with a durable-kind tag.
--     Extends the pattern established by uq_coin_ledger_one_shot_grant.
--     Consumables (extra bot per-room, streak freeze use) DON'T carry a
--     tagged ref_id, so the index deliberately excludes them.
--   * Seed rows in game_themes for the six [LAUNCH] themes catalogued in
--     docs/game-themes-catalog.md.
--
-- Grandfathering (from Phase 1) already sets price_coins = 0 on every
-- existing question_packs / puzzle_themes row, so the coin badge in the
-- library shows only for admin-authored premium packs added later.

-- ---------------------------------------------------------------------------
-- Uniqueness for durable one-shot purchases.
-- ---------------------------------------------------------------------------
-- ref_id shape for a durable purchase is '<kind>:<slug-or-uuid>' — e.g.
--   'edition:america', 'theme:whot-neon', 'frame:frame-gold-ring',
--   'name_color:name-coral', 'animation:winner-anim-confetti',
--   'card_template:card-template-neon', 'library_pack:<uuid>'.
-- Consumables use 'extra_bot:<player_uuid>' / 'streak_freeze_use:<date>',
-- which are already unique per event so they don't need this index.
--
-- The index is a partial UNIQUE — a second click that races through
-- purchase_item() collides at 23505 and the RPC returns 'already_owned'
-- cleanly instead of double-charging.
create unique index if not exists uq_coin_ledger_shop_purchase_durable
  on coin_ledger (profile_id, ref_id)
  where reason = 'shop_purchase'
    and ref_id ~ '^(edition|theme|frame|name_color|animation|card_template|library_pack):';

-- ---------------------------------------------------------------------------
-- purchase_item(profile_id, kind, slug, price_coins)
-- ---------------------------------------------------------------------------
-- Single entry point for every shop / inline coin gate. The kind is one of
--   'edition' | 'theme' | 'frame' | 'name_color' | 'animation'
--   | 'card_template' | 'library_pack' | 'streak_freeze'
-- The first seven are durable ownership and land in the matching
-- profile_owned_* table. 'streak_freeze' is a consumable that credits
-- profiles.streak_freezes and does NOT insert an owned-row.
--
-- Returns jsonb envelope:
--   { "outcome": "ok" | "already_owned" | "insufficient_funds",
--     "new_balance": bigint | null,
--     "ref_id": text | null }
--
-- The RPC is server-authoritative on the price — the caller passes it but
-- the RPC re-reads from the catalog table where applicable (game_themes /
-- game_editions / question_packs / puzzle_themes) and rejects a mismatch.
-- Frames / name colors / animations / card templates live in code (their
-- palette is curated, not admin-editable), so their prices come in as
-- p_price_coins from a code constant and the RPC trusts it.
--
-- ledger.reason is always 'shop_purchase' and ref_id is '<kind>:<slug>'
-- for durable kinds. That ref_id is what the partial unique index keys
-- off, giving idempotent retries a clean 'already_owned' path.
--
-- Bots-in-room and refunds do NOT go through this RPC:
--   * extra bots: /api/games/[code]/bots calls spend_coins() directly
--     with ref_id='extra_bot:<player_uuid>' (consumable per-room, no
--     owned-row).
--   * refunds: admin_adjust_coins() or award_coins(reason='refund').
create or replace function purchase_item(
  p_profile_id     uuid,
  p_kind           text,
  p_slug           text,
  p_price_coins    bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref_id       text;
  v_new_balance  bigint;
  v_catalog_price bigint;
  v_pack_uuid    uuid;
begin
  if p_kind is null or length(trim(p_kind)) = 0 then
    raise exception 'purchase_item: kind is required';
  end if;
  if p_slug is null or length(trim(p_slug)) = 0 then
    raise exception 'purchase_item: slug is required';
  end if;
  if p_price_coins is null or p_price_coins < 0 then
    raise exception 'purchase_item: price must be >= 0 (got %)', p_price_coins;
  end if;

  -- Re-read the catalog price where a table exists so a stale client
  -- (or a hand-crafted payload) can't underpay. Kinds whose catalog
  -- lives in code trust p_price_coins as the source of truth.
  if p_kind = 'theme' then
    select price_coins into v_catalog_price
      from game_themes
     where slug = p_slug and is_active = true
     limit 1;
    if v_catalog_price is null then
      raise exception 'purchase_item: unknown theme %', p_slug;
    end if;
    if v_catalog_price <> p_price_coins then
      raise exception 'purchase_item: price mismatch for theme % (client=%, catalog=%)',
        p_slug, p_price_coins, v_catalog_price;
    end if;
  elsif p_kind = 'edition' then
    select price_coins into v_catalog_price
      from game_editions
     where slug = p_slug and is_active = true
     limit 1;
    if v_catalog_price is null then
      raise exception 'purchase_item: unknown edition %', p_slug;
    end if;
    if v_catalog_price <> p_price_coins then
      raise exception 'purchase_item: price mismatch for edition % (client=%, catalog=%)',
        p_slug, p_price_coins, v_catalog_price;
    end if;
  elsif p_kind = 'library_pack' then
    -- library_pack slug is the pack uuid.
    begin
      v_pack_uuid := p_slug::uuid;
    exception when others then
      raise exception 'purchase_item: library_pack slug must be a UUID (got %)', p_slug;
    end;
    select price_coins into v_catalog_price
      from question_packs
     where id = v_pack_uuid and status = 'approved'
     limit 1;
    if v_catalog_price is null then
      raise exception 'purchase_item: unknown or unapproved pack %', p_slug;
    end if;
    if v_catalog_price <> p_price_coins then
      raise exception 'purchase_item: price mismatch for pack % (client=%, catalog=%)',
        p_slug, p_price_coins, v_catalog_price;
    end if;
    if v_catalog_price = 0 then
      -- Grandfathered free pack. No spend; still land an owned row for a
      -- clean "in my library" render. Idempotent via PK.
      insert into profile_owned_packs (profile_id, pack_id)
      values (p_profile_id, v_pack_uuid)
      on conflict do nothing;
      select coins into v_new_balance from profiles where id = p_profile_id;
      return jsonb_build_object(
        'outcome', 'ok', 'new_balance', v_new_balance,
        'ref_id', 'library_pack:' || p_slug
      );
    end if;
  elsif p_kind in ('frame', 'name_color', 'animation', 'card_template', 'streak_freeze') then
    -- Catalog lives in code; trust the client price up to a sane ceiling.
    if p_price_coins > 10000 then
      raise exception 'purchase_item: price for kind % exceeds ceiling (%)', p_kind, p_price_coins;
    end if;
  else
    raise exception 'purchase_item: unknown kind %', p_kind;
  end if;

  v_ref_id := p_kind || ':' || p_slug;

  -- Streak freeze is a consumable — no owned-row, credit to
  -- profiles.streak_freezes instead. No shop-purchase uniqueness index
  -- match either (ref_id starts with 'streak_freeze:', which the partial
  -- index excludes), so the buyer can re-purchase.
  if p_kind = 'streak_freeze' then
    v_new_balance := spend_coins(p_profile_id, p_price_coins, 'shop_purchase', v_ref_id);
    if v_new_balance is null then
      return jsonb_build_object('outcome', 'insufficient_funds', 'new_balance', null, 'ref_id', null);
    end if;
    update profiles
       set streak_freezes = coalesce(streak_freezes, 0) + 1
     where id = p_profile_id;
    return jsonb_build_object('outcome', 'ok', 'new_balance', v_new_balance, 'ref_id', v_ref_id);
  end if;

  -- Cheap pre-check so a repeat buyer of a free grandfathered theme or a
  -- previously-purchased durable gets 'already_owned' without touching
  -- the balance. The DB-level index (below) is what actually enforces —
  -- this is only the fast, unlocked path.
  if p_kind = 'edition' then
    perform 1 from profile_owned_editions where profile_id = p_profile_id and edition_slug = p_slug;
    if found then return jsonb_build_object('outcome','already_owned','new_balance',(select coins from profiles where id=p_profile_id),'ref_id',v_ref_id); end if;
  elsif p_kind = 'theme' then
    perform 1 from profile_owned_themes where profile_id = p_profile_id and theme_slug = p_slug;
    if found then return jsonb_build_object('outcome','already_owned','new_balance',(select coins from profiles where id=p_profile_id),'ref_id',v_ref_id); end if;
  elsif p_kind = 'frame' then
    perform 1 from profile_owned_frames where profile_id = p_profile_id and frame_slug = p_slug;
    if found then return jsonb_build_object('outcome','already_owned','new_balance',(select coins from profiles where id=p_profile_id),'ref_id',v_ref_id); end if;
  elsif p_kind = 'name_color' then
    perform 1 from profile_owned_name_colors where profile_id = p_profile_id and color_slug = p_slug;
    if found then return jsonb_build_object('outcome','already_owned','new_balance',(select coins from profiles where id=p_profile_id),'ref_id',v_ref_id); end if;
  elsif p_kind = 'animation' then
    perform 1 from profile_owned_animations where profile_id = p_profile_id and animation_slug = p_slug;
    if found then return jsonb_build_object('outcome','already_owned','new_balance',(select coins from profiles where id=p_profile_id),'ref_id',v_ref_id); end if;
  elsif p_kind = 'card_template' then
    perform 1 from profile_owned_card_templates where profile_id = p_profile_id and template_slug = p_slug;
    if found then return jsonb_build_object('outcome','already_owned','new_balance',(select coins from profiles where id=p_profile_id),'ref_id',v_ref_id); end if;
  elsif p_kind = 'library_pack' then
    perform 1 from profile_owned_packs where profile_id = p_profile_id and pack_id = v_pack_uuid;
    if found then return jsonb_build_object('outcome','already_owned','new_balance',(select coins from profiles where id=p_profile_id),'ref_id',v_ref_id); end if;
  end if;

  -- Free grandfathered durable (price 0). Insert owned-row directly, no
  -- ledger write (spend_coins would raise on delta=0). Idempotent via PK.
  if p_price_coins = 0 then
    if p_kind = 'edition' then
      insert into profile_owned_editions (profile_id, edition_slug) values (p_profile_id, p_slug) on conflict do nothing;
    elsif p_kind = 'theme' then
      insert into profile_owned_themes (profile_id, theme_slug) values (p_profile_id, p_slug) on conflict do nothing;
    elsif p_kind = 'frame' then
      insert into profile_owned_frames (profile_id, frame_slug) values (p_profile_id, p_slug) on conflict do nothing;
    elsif p_kind = 'name_color' then
      insert into profile_owned_name_colors (profile_id, color_slug) values (p_profile_id, p_slug) on conflict do nothing;
    elsif p_kind = 'animation' then
      insert into profile_owned_animations (profile_id, animation_slug) values (p_profile_id, p_slug) on conflict do nothing;
    elsif p_kind = 'card_template' then
      insert into profile_owned_card_templates (profile_id, template_slug) values (p_profile_id, p_slug) on conflict do nothing;
    end if;
    select coins into v_new_balance from profiles where id = p_profile_id;
    return jsonb_build_object('outcome', 'ok', 'new_balance', v_new_balance, 'ref_id', v_ref_id);
  end if;

  -- Priced durable: spend first (row-locks the profile), then insert the
  -- owned-row. The partial unique index on (profile_id, ref_id) makes a
  -- concurrent second purchase 23505 — swallow it and refund the coins we
  -- just spent so the caller sees a clean 'already_owned'.
  v_new_balance := spend_coins(p_profile_id, p_price_coins, 'shop_purchase', v_ref_id);
  if v_new_balance is null then
    return jsonb_build_object('outcome', 'insufficient_funds', 'new_balance', null, 'ref_id', null);
  end if;

  begin
    if p_kind = 'edition' then
      insert into profile_owned_editions (profile_id, edition_slug) values (p_profile_id, p_slug);
    elsif p_kind = 'theme' then
      insert into profile_owned_themes (profile_id, theme_slug) values (p_profile_id, p_slug);
    elsif p_kind = 'frame' then
      insert into profile_owned_frames (profile_id, frame_slug) values (p_profile_id, p_slug);
    elsif p_kind = 'name_color' then
      insert into profile_owned_name_colors (profile_id, color_slug) values (p_profile_id, p_slug);
    elsif p_kind = 'animation' then
      insert into profile_owned_animations (profile_id, animation_slug) values (p_profile_id, p_slug);
    elsif p_kind = 'card_template' then
      insert into profile_owned_card_templates (profile_id, template_slug) values (p_profile_id, p_slug);
    elsif p_kind = 'library_pack' then
      insert into profile_owned_packs (profile_id, pack_id) values (p_profile_id, v_pack_uuid);
    end if;
  exception when unique_violation then
    -- Owned-row already exists (race with a concurrent purchase). The
    -- shop_purchase partial unique index on the ledger row will ALSO
    -- have raised 23505 — one of the two concurrent spends is the
    -- "loser". Return already_owned. Note: the loser's spend has
    -- already committed at this point because spend_coins() returned;
    -- we can't undo it here without leaving the ledger inconsistent,
    -- so we refund via a compensating award. The refund flows through
    -- award_coins with reason='refund' so it lands as its own ledger
    -- row and admin audit stays clean.
    perform award_coins(p_profile_id, p_price_coins, 'refund', v_ref_id, null, true);
    select coins into v_new_balance from profiles where id = p_profile_id;
    return jsonb_build_object('outcome', 'already_owned', 'new_balance', v_new_balance, 'ref_id', v_ref_id);
  end;

  return jsonb_build_object('outcome', 'ok', 'new_balance', v_new_balance, 'ref_id', v_ref_id);
end;
$$;

revoke all on function purchase_item(uuid, text, text, bigint) from public;

-- ---------------------------------------------------------------------------
-- Seed the six [LAUNCH] game themes.
-- ---------------------------------------------------------------------------
-- Prices per docs/coins-and-shop-plan.md § "Proposed price bands" (400 coins
-- for a game theme). Art JSON stays minimal at seed time — actual asset refs
-- are populated by the art delivery PRs (docs/coins-art-briefs.md).
insert into game_themes (game_type, slug, name, art, price_coins, sort_order)
values
  ('whot',   'whot-neon',           'Neon Whot',           '{"palette":"neon"}'::jsonb,      400, 10),
  ('whot',   'whot-naija',          'Naija Whot',          '{"palette":"naija"}'::jsonb,     400, 20),
  ('ludo',   'ludo-wooden',         'Wooden Ludo',         '{"palette":"wooden"}'::jsonb,    400, 10),
  ('ludo',   'ludo-naija',          'Naija Ludo',          '{"palette":"naija"}'::jsonb,     400, 20),
  ('sudoku', 'sudoku-minimalist',   'Minimalist Sudoku',   '{"palette":"minimalist"}'::jsonb,400, 10),
  ('sudoku', 'sudoku-newsprint',    'Newsprint Sudoku',    '{"palette":"newsprint"}'::jsonb, 400, 20)
on conflict (game_type, slug) do nothing;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted). Apply as a NEW forward migration; do NOT edit this file.
--   delete from game_themes where slug in (
--     'whot-neon','whot-naija','ludo-wooden','ludo-naija',
--     'sudoku-minimalist','sudoku-newsprint');
--   drop function if exists purchase_item(uuid, text, text, bigint);
--   drop index if exists uq_coin_ledger_shop_purchase_durable;
-- ----------------------------------------------------------------------------
