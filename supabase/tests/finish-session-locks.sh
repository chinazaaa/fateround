#!/usr/bin/env bash
# Two-session regression test for the row locking in public.finish_uno_session() and public.finish_scrabble_session()
# (supabase/migrations/20261204000000_finish_uno_session.sql, 20261204100000_finish_scrabble_session.sql).
#
#   DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/finish-session-locks.sh
#
# Case A (Uno double finish): session F1 runs finish_uno_session() and keeps its transaction open (the lock held).
# Session F2 runs the SAME finish (an identical payload, with series points) at the SAME expected version. The test
# asserts F2 is observed WAITING on F1, and that once F1 commits F2 answers `already_finished` (not a second
# `finished`), so the round's series points are added exactly once and the hand is written once.
# Case B (Scrabble double finish): the same shape; the scores are written once and F2 is `already_finished`.
#
# Sessions are coordinated through pg_stat_activity and an advisory-lock gate, not timing. Fixtures are committed
# (two sessions cannot share a transaction) and removed on exit.
set -euo pipefail

DB="${DB:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
GATE=7414
psqlq() { psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }

cleanup() {
  psqlq -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name like 'fin-%' and pid <> pg_backend_pid()" >/dev/null 2>&1 || true
  psqlq -c "delete from public.games where id in ('FINLU', 'FINLS')" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

fail() { echo "FAIL: $*" >&2; exit 1; }
wait_for() { # description, sql returning t when satisfied
  for _ in $(seq 1 200); do
    [ "$(psqlq -c "$2")" = "t" ] && return 0
    sleep 0.1
  done
  fail "timed out waiting for: $1"
}
start_gate() {
  PGAPPNAME=fin-gate psql "$DB" -X -q -c "select pg_advisory_lock($GATE); select pg_sleep(120)" >/dev/null 2>&1 &
  wait_for "gate held" "select exists (select 1 from pg_locks where locktype = 'advisory' and granted and objid = $GATE)"
}
open_gate() {
  psqlq -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'fin-gate'" >/dev/null
}

P1=00000000-0000-0000-0000-00000000f001
P2=00000000-0000-0000-0000-00000000f002
P3=00000000-0000-0000-0000-00000000f003
P4=00000000-0000-0000-0000-00000000f004

# ---- Case A: Uno ---------------------------------------------------------------------------------------------
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status, uno_series_scoring, uno_series_target)
  values ('FINLU', 'lock test U', 'tok-finlu', 'uno', 'active', true, 1000);
insert into public.players (id, game_id, name) values ('$P1', 'FINLU', 'A'), ('$P2', 'FINLU', 'B');
insert into public.uno_sessions (game_id, turn_order, phase) values ('FINLU', array['$P1'::uuid, '$P2'::uuid], 'playing');
insert into public.uno_player_hands (game_id, player_id, cards, player_order) values ('FINLU', '$P1', '[]', 0), ('FINLU', '$P2', '[{"id":"x"}]', 1);
SQL
VER=$(psqlq -c "select updated_at from public.uno_sessions where game_id = 'FINLU'")
CALL_U="select public.finish_uno_session('FINLU', '$VER', '{\"status_message\":\"done\"}'::jsonb, '[{\"player_id\":\"$P1\",\"cards\":[]}]'::jsonb, '{\"winner_id\":\"$P1\",\"points\":50}'::jsonb, null, null)->>'status'"

start_gate
PGAPPNAME=fin-first psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "begin; $CALL_U; select pg_advisory_xact_lock($GATE); commit;" >/dev/null 2>&1 &
wait_for "first finisher holds its locks" "select exists (select 1 from pg_stat_activity where application_name = 'fin-first' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_U=$(mktemp)
PGAPPNAME=fin-second psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "$CALL_U" >"$OUT_U" 2>&1 &
wait_for "second finisher waits on the first" "select exists (select 1 from pg_stat_activity where application_name = 'fin-second' and wait_event_type = 'Lock')"
open_gate
wait_for "second finisher answered" "select not exists (select 1 from pg_stat_activity where application_name = 'fin-second')"
[ "$(cat "$OUT_U")" = "already_finished" ] || fail "case A: expected the second finish to be 'already_finished', got '$(cat "$OUT_U")'"
[ "$(psqlq -c "select uno_series_scores->>'$P1' from public.games where id = 'FINLU'")" = "50" ] || fail "case A: series points were not awarded exactly once"
[ "$(psqlq -c "select status from public.games where id = 'FINLU'")" = "finished" ] || fail "case A: game not finished"

# ---- Case B: Scrabble ----------------------------------------------------------------------------------------
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('FINLS', 'lock test S', 'tok-finls', 'scrabble', 'active');
insert into public.players (id, game_id, name) values ('$P3', 'FINLS', 'A'), ('$P4', 'FINLS', 'B');
insert into public.scrabble_sessions (game_id, turn_order, phase) values ('FINLS', array['$P3'::uuid, '$P4'::uuid], 'playing');
insert into public.scrabble_player_state (game_id, player_id, rack, score, player_order) values ('FINLS', '$P3', '[]', 10, 0), ('FINLS', '$P4', '[]', 20, 1);
SQL
VER=$(psqlq -c "select updated_at from public.scrabble_sessions where game_id = 'FINLS'")
CALL_S="select public.finish_scrabble_session('FINLS', '$VER', '{\"status_message\":\"done\"}'::jsonb, '[{\"player_id\":\"$P3\",\"score\":7},{\"player_id\":\"$P4\",\"score\":21}]'::jsonb)->>'status'"

start_gate
PGAPPNAME=fin-first psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "begin; $CALL_S; select pg_advisory_xact_lock($GATE); commit;" >/dev/null 2>&1 &
wait_for "first finisher holds its locks" "select exists (select 1 from pg_stat_activity where application_name = 'fin-first' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_S=$(mktemp)
PGAPPNAME=fin-second psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "$CALL_S" >"$OUT_S" 2>&1 &
wait_for "second finisher waits on the first" "select exists (select 1 from pg_stat_activity where application_name = 'fin-second' and wait_event_type = 'Lock')"
open_gate
wait_for "second finisher answered" "select not exists (select 1 from pg_stat_activity where application_name = 'fin-second')"
[ "$(cat "$OUT_S")" = "already_finished" ] || fail "case B: expected the second finish to be 'already_finished', got '$(cat "$OUT_S")'"
[ "$(psqlq -c "select score from public.scrabble_player_state where game_id = 'FINLS' and player_id = '$P3'")" = "7" ] || fail "case B: scores not written once"
[ "$(psqlq -c "select status from public.games where id = 'FINLS'")" = "finished" ] || fail "case B: game not finished"

echo "finish-session-locks: ok"
