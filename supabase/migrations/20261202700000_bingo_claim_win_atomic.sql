-- Bingo: admit the winning claim and finish the round in ONE transaction.
--
-- The route used to insert the approved claim and then update games.status as a separate write.
-- If that second write failed, the approved claim stayed committed: the unique index (one approved
-- claim per game) then rejected every other claimant, and the route's own "someone already won"
-- check rejected every retry, leaving an active round nobody could finish.
--
-- This flips active -> finished (the single-winner compare-and-set) and inserts the approved claim
-- together. If the claim insert loses the unique-index race the sub-transaction rolls the status
-- flip back too, so a failure at any step leaves neither a claim nor a finished game behind.
create or replace function public.bingo_claim_win(
  p_game_id text,
  p_player_id uuid,
  p_pattern text,
  p_finished_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claim public.bingo_claims;
begin
  begin
    update public.games
       set status = 'finished', finished_at = p_finished_at
     where id = upper(p_game_id) and status = 'active';
    if not found then
      return jsonb_build_object('status', 'game_not_active');
    end if;

    insert into public.bingo_claims (game_id, player_id, pattern, status)
    values (upper(p_game_id), p_player_id, p_pattern, 'approved')
    returning * into v_claim;
  exception when unique_violation then
    -- Rolls back the games update above as well.
    return jsonb_build_object('status', 'already_won');
  end;

  return jsonb_build_object('status', 'won', 'claim', to_jsonb(v_claim));
end;
$$;

-- SECURITY DEFINER functions in `public` are callable by PUBLIC by default. This writes games and
-- bingo_claims, so only the service role may call it.
revoke execute on function public.bingo_claim_win(text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.bingo_claim_win(text, uuid, text, timestamptz) to service_role;
