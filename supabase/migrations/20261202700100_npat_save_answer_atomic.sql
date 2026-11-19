-- I Call On (NPAT): save a draft or a final submission with the "already submitted" check inside
-- the write itself.
--
-- The routes used to read submitted_at and then upsert. Two requests for one player and round
-- could both read null; the second upsert then replaced the first submission's answers and
-- timestamp. Here the upsert's DO UPDATE only fires while the stored row is still unsubmitted, so
-- the first submission wins whatever the interleaving, and a late draft can never overwrite it.
--
-- Returns {status: 'saved'} or {status: 'already_submitted'} (nothing was changed).
create or replace function public.npat_save_answer(
  p_game_id text,
  p_round_id uuid,
  p_player_id uuid,
  p_name text,
  p_animal text,
  p_place text,
  p_thing text,
  p_food text,
  p_submit boolean,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.npat_answers as a (game_id, round_id, player_id, name, animal, place, thing, food, submitted_at)
  values (
    upper(p_game_id), p_round_id, p_player_id, p_name, p_animal, p_place, p_thing, p_food,
    case when p_submit then p_now else null end
  )
  on conflict (player_id, round_id) do update
    set name = excluded.name,
        animal = excluded.animal,
        place = excluded.place,
        thing = excluded.thing,
        food = excluded.food,
        submitted_at = excluded.submitted_at
    where a.submitted_at is null;

  -- FOUND is false when the conflicting row was already submitted and the WHERE skipped the update.
  if not found then
    return jsonb_build_object('status', 'already_submitted');
  end if;
  return jsonb_build_object('status', 'saved');
end;
$$;

-- SECURITY DEFINER functions in `public` are callable by PUBLIC by default. This writes
-- npat_answers, so only the service role may call it.
revoke execute on function public.npat_save_answer(text, uuid, uuid, text, text, text, text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.npat_save_answer(text, uuid, uuid, text, text, text, text, text, boolean, timestamptz) to service_role;
