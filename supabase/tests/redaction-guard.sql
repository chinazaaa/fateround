-- Redaction guard: asserts the column-level revoke boundary for every secret column.
-- Uses has_column_privilege (NOT information_schema) so it is correct on a from-scratch local DB.
do $$
declare
  spec  jsonb := '[
    {"t":"ttl_statements",             "s":["lie_index"]},
    {"t":"ttl_guesses",                "s":["guessed_index","is_correct","points"]},
    {"t":"describe_it_sessions",       "s":["current_word","used_words"]},
    {"t":"quick_draw_guess_sessions",  "s":["current_word","used_words"]},
    {"t":"crazy_eights_sessions",      "s":["draw_pile","discard_pile"]},
    {"t":"uno_sessions",               "s":["draw_pile","discard_pile"]},
    {"t":"whot_sessions",              "s":["draw_pile","discard_pile"]},
    {"t":"codewords_boards",           "s":["key"]}
  ]';
  e         jsonb;
  tbl       text;
  secrets   text[];
  role_name text;
  col       text;
  fails     int := 0;
  checks    int := 0;
begin
  for e in select * from jsonb_array_elements(spec) loop
    tbl     := e->>'t';
    secrets := array(select jsonb_array_elements_text(e->'s'));

    if to_regclass('public.'||quote_ident(tbl)) is null then
      raise warning 'MISSING TABLE %', tbl; fails := fails + 1; continue;
    end if;

    -- every named secret column must actually exist (catches a renamed column silently un-guarding)
    foreach col in array secrets loop
      checks := checks + 1;
      if not exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name=tbl and column_name=col) then
        raise warning 'FAIL %.% : secret column does not exist', tbl, col; fails := fails + 1;
      end if;
    end loop;

    foreach role_name in array array['anon','authenticated'] loop
      -- table-wide SELECT must be gone, else column grants are moot
      checks := checks + 1;
      if has_table_privilege(role_name, format('public.%I', tbl), 'SELECT') then
        raise warning 'FAIL % has table-wide SELECT on % (revoke did not apply)', role_name, tbl;
        fails := fails + 1;
      end if;

      for col in
        select column_name from information_schema.columns
        where table_schema='public' and table_name=tbl
      loop
        checks := checks + 1;
        if col = any(secrets) then
          if has_column_privilege(role_name, format('public.%I', tbl), col, 'SELECT') then
            raise warning 'FAIL LEAK %.% readable by %', tbl, col, role_name;
            fails := fails + 1;
          end if;
        else
          -- the other half: a revoke that also kills a normal column breaks the game
          if not has_column_privilege(role_name, format('public.%I', tbl), col, 'SELECT') then
            raise warning 'FAIL BREAK %.% NOT readable by % (re-grant missed a column)', tbl, col, role_name;
            fails := fails + 1;
          end if;
        end if;
      end loop;
    end loop;

    -- The server must still be able to read what it redacts. On a from-scratch local DB,
    -- service_role often holds NO privileges on migration-created tables because hosted
    -- Supabase's bootstrap GRANTs are not reproduced by `db reset`. That is an environment
    -- artifact, not a defect, so only assert this where service_role has some grant to lose:
    -- if it can read a non-secret column but not the secret one, a migration starved it.
    if exists (
      select 1 from information_schema.columns ic
       where ic.table_schema='public' and ic.table_name=tbl
         and not (ic.column_name = any(secrets))
         and has_column_privilege('service_role', format('public.%I', tbl), ic.column_name, 'SELECT')
    ) then
      foreach col in array secrets loop
        checks := checks + 1;
        if not has_column_privilege('service_role', format('public.%I', tbl), col, 'SELECT') then
          raise warning 'FAIL service_role STARVED on %.% (it reads other columns of this table)', tbl, col;
          fails := fails + 1;
        end if;
      end loop;
    else
      raise notice 'skip: service_role has no grants on % (local bootstrap artifact)', tbl;
    end if;
  end loop;

  -- ttl_round_lies is revoked wholesale, not per-column
  checks := checks + 2;
  foreach role_name in array array['anon','authenticated'] loop
    if has_table_privilege(role_name, 'public.ttl_round_lies', 'SELECT') then
      raise warning 'FAIL % can read ttl_round_lies', role_name; fails := fails + 1;
    end if;
  end loop;

  raise notice 'redaction guard: % checks, % failures', checks, fails;
  if fails > 0 then
    raise exception 'redaction guard FAILED with % failure(s)', fails;
  end if;
end $$;
