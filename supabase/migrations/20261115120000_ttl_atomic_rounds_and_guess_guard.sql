-- Two Truths: close two data-integrity gaps that application code cannot close.
--
-- Both were raised in review on the Two Truths redaction PR. Neither is fixable in TypeScript:
-- the first needs one transaction, the second needs a check that cannot be raced.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rounds and their answer keys must be created together, or not at all.
--
-- The start route inserted `rounds`, read back the generated ids, then inserted
-- `ttl_round_lies`. A failure between the two left rounds with no answer key: /api/two-truths/
-- guess fails closed on a missing key (by design), so the game could not be scored — and it
-- could not be restarted either, because rounds already existed for those round numbers.
--
-- A plpgsql function body runs in a single implicit transaction, so an error anywhere below
-- rolls back BOTH inserts. That is the whole point of moving this into the database.
create or replace function public.create_ttl_rounds(p_rounds jsonb, p_lies jsonb)
returns table (id uuid, round_number integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer;
  v_expected integer;
begin
  -- Every statement in a plpgsql body shares one implicit transaction, so a failure anywhere
  -- below rolls back the rounds too. Written as plain sequential statements rather than one
  -- clever CTE, because this runs on the game-start path and has to be obvious on inspection.
  --
  -- jsonb_populate_recordset types every field off public.rounds itself, so it cannot drift on a
  -- column type change. The explicit column list is exactly what buildTtlRoundRows sets;
  -- everything else (id, created_at) keeps its table default.
  create temporary table _new_rounds on commit drop as
  with src as (
    select * from jsonb_populate_recordset(null::public.rounds, p_rounds)
  ),
  ins as (
    insert into public.rounds (
      game_id, round_number, participant_ids, wyr_option_a, wyr_option_b, mlt_question,
      submitter_player_id, quote_text, quote_author_participant_id, quote_submitted_at,
      status, started_at, ended_at, ttl_metadata
    )
    select
      src.game_id, src.round_number, src.participant_ids, src.wyr_option_a, src.wyr_option_b,
      src.mlt_question, src.submitter_player_id, src.quote_text, src.quote_author_participant_id,
      src.quote_submitted_at, src.status, src.started_at, src.ended_at, src.ttl_metadata
    from src
    returning rounds.id, rounds.round_number
  )
  select ins.id, ins.round_number from ins;

  insert into public.ttl_round_lies (round_id, lie_index)
  select n.id, (l->>'lie_index')::integer
  from jsonb_array_elements(p_lies) as l
  join _new_rounds n on n.round_number = (l->>'round_number')::integer;
  get diagnostics v_inserted = row_count;

  -- Require a ONE-TO-ONE mapping, checked in BOTH directions.
  --
  -- Comparing the keys stored against the keys SUPPLIED only catches a p_lies entry that matched
  -- no round. It does not catch the opposite and more dangerous case: three rounds with mappings
  -- for two. There v_inserted equals jsonb_array_length(p_lies), the check passes, and a round
  -- commits with no answer key — which /api/two-truths/guess fails closed on, leaving a round
  -- nobody can score. So the count is compared against the ROUNDS as well.
  select count(*) into v_expected from _new_rounds;
  if v_inserted <> v_expected then
    raise exception 'ttl answer-key mismatch: stored % keys for % rounds', v_inserted, v_expected;
  end if;
  if v_inserted <> jsonb_array_length(p_lies) then
    raise exception 'ttl answer-key mismatch: % of % supplied keys matched a round',
      v_inserted, jsonb_array_length(p_lies);
  end if;

  return query select n.id, n.round_number from _new_rounds n order by n.round_number;
end;
$$;

-- SECURITY DEFINER functions in `public` are callable by PUBLIC by default, which anon and
-- authenticated inherit. This one writes the answer keys, so only the service role may call it.
revoke execute on function public.create_ttl_rounds(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_ttl_rounds(jsonb, jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A guess must not be insertable once its round has ended.
--
-- The guess route checks `round.status` and then inserts, so a guess can land after
-- `reconcileRevealedGuesses` has already read the results and after the round flipped to
-- 'finished'. That guess is then absent from `ttl_metadata.guesses` — and since guessed_index /
-- is_correct / points are revoked from anon, it can never be displayed. Re-reading after the
-- write only narrows the window; the check has to be atomic with the insert.
--
-- A TRIGGER, not an RLS policy: guesses are written with the service role, which bypasses RLS.
-- SECURITY INVOKER on purpose: this only reads rounds.status, and every ttl_guesses insert
-- already comes through the service role, which can read it. A SECURITY DEFINER function in
-- `public` is callable by PUBLIC (which anon and authenticated inherit), so it would be a wider
-- grant than this needs.
create or replace function public.ttl_guard_guess_round_active()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  -- FOR UPDATE, not a plain read. Without the lock this ordering is permitted: the trigger reads
  -- 'active', the closing transaction flips the round to 'finished' and reconciles the published
  -- guesses, and only then does this insert commit — storing a guess that the results will never
  -- include, and that anon cannot read back because guessed_index/is_correct/points are revoked.
  -- Taking the row lock makes the two mutually exclusive: either the close waits for this insert
  -- (and its reconcile then sees the guess), or this trigger observes 'finished' and rejects.
  select status into v_status from public.rounds where id = new.round_id for update;
  if v_status is null then
    raise exception 'ttl_guesses: round % does not exist', new.round_id
      using errcode = 'foreign_key_violation';
  end if;
  if v_status <> 'active' then
    -- 'check_violation' so the route can map it to a 409 rather than a generic 500.
    raise exception 'ttl_guesses: round % is % — guessing is closed', new.round_id, v_status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists ttl_guesses_round_active on public.ttl_guesses;
create trigger ttl_guesses_round_active
  before insert on public.ttl_guesses
  for each row execute function public.ttl_guard_guess_round_active();
