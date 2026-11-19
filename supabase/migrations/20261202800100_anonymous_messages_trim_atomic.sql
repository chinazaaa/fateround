-- Anonymous room trim: recheck the threshold and delete the batch in ONE statement.
-- The helper counted 1,001 messages, the host deleted one, and the batch delete still ran,
-- cutting 100 more from a board sitting at the cap. The count and the delete now share a
-- snapshot, and the games row lock serialises concurrent trimmers.
create or replace function public.trim_anonymous_messages(
  p_game_id text,
  p_max integer,
  p_batch integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  perform 1 from public.games where id = p_game_id for update;
  if not found then
    return 0;
  end if;

  with over_cap as (
    select count(*) > p_max as is_over
    from public.anonymous_messages
    where game_id = p_game_id
  ),
  doomed as (
    select m.id
    from public.anonymous_messages m, over_cap
    where m.game_id = p_game_id and over_cap.is_over
    order by m.created_at asc
    limit p_batch
  ),
  del as (
    delete from public.anonymous_messages
    where id in (select id from doomed)
    returning 1
  )
  select count(*) into v_deleted from del;

  return v_deleted;
end;
$$;

revoke execute on function public.trim_anonymous_messages(text, integer, integer) from public, anon, authenticated;
grant execute on function public.trim_anonymous_messages(text, integer, integer) to service_role;
