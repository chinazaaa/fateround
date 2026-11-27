#!/usr/bin/env bash
# Two-session regression test for the serialization of a host-left finish with a Play Again reset
# (supabase/migrations/20261204200000_play_again_reset_fence.sql).
#
#   DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/play-again-reset-locks.sh
#
# Case A (the finish wins): session F runs end_game_if_host_alone() (which finishes the game and writes the bookkeeping
# marker) and keeps its transaction open. Session R calls begin_play_again_reset() for the snapshot it read BEFORE the
# finish (the game was live). R is observed WAITING on F; once F commits R answers `bookkeeping_owed` and marks nothing,
# so the finished session's rows are kept.
#
# Case B (the reset wins): R's reset is started and committed; F then calls end_game_if_host_alone() and is REFUSED
# (`continue`), so no finish commits against a reset in progress.
#
# Sessions are coordinated through pg_stat_activity and an advisory-lock gate, not timing. Every identifier is
# run-specific and cleanup touches only those, so concurrent runs do not interfere.
set -euo pipefail

DB="${DB:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
psqlq() { psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }

RUN="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n' | tr 'a-f' 'A-F')"
APP="pra-$RUN"
GATE=$(( (0x${RUN} % 2000000000) + 1 ))
GA="PRA$RUN"; GB="PRB$RUN"
HOST="$(psqlq -c "select gen_random_uuid()")"; HOST2="$(psqlq -c "select gen_random_uuid()")"

cleanup() {
  psqlq -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name like '$APP-%' and pid <> pg_backend_pid()" >/dev/null 2>&1 || true
  psqlq -c "delete from public.games where id in ('$GA', '$GB')" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
wait_for() {
  for _ in $(seq 1 200); do
    [ "$(psqlq -c "$2")" = "t" ] && return 0
    sleep 0.1
  done
  fail "timed out waiting for: $1"
}
reap() { if ! wait "$1"; then fail "worker failed: $2"; fi; }
start_gate() {
  PGAPPNAME="$APP-gate" psql "$DB" -X -q -c "select pg_advisory_lock($GATE); select pg_sleep(120)" >/dev/null 2>&1 &
  GATE_PID=$!
  wait_for "gate held" "select exists (select 1 from pg_locks where locktype = 'advisory' and granted and objid = $GATE)"
}
open_gate() {
  psqlq -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name = '$APP-gate'" >/dev/null
  wait "$GATE_PID" 2>/dev/null || true
}

# ---- Case A: the finish commits first -------------------------------------------------------------------------
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status, sessions_played) values ('$GA', 'reset lock A', 'tok-$RUN-a', 'uno', 'active', 3);
insert into public.players (id, game_id, name) values ('$HOST', '$GA', 'Host');
update public.games set host_player_id = '$HOST' where id = '$GA';
SQL
start_gate
PGAPPNAME="$APP-finish" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select public.end_game_if_host_alone('$GA', '$HOST', null, 3, true);
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
FINISH_PID=$!
wait_for "the finish holds its uncommitted update" "select exists (select 1 from pg_stat_activity where application_name = '$APP-finish' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_R=$(mktemp)
PGAPPNAME="$APP-reset" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.begin_play_again_reset('$GA', 'active', null, 3)->>'status'" >"$OUT_R" 2>&1 &
RESET_PID=$!
wait_for "the reset waits for the finish" "select exists (select 1 from pg_stat_activity where application_name = '$APP-reset' and wait_event_type = 'Lock')"
open_gate
reap "$FINISH_PID" "finish"
reap "$RESET_PID" "reset"
[ "$(cat "$OUT_R")" = "bookkeeping_owed" ] || fail "case A: expected 'bookkeeping_owed', got '$(cat "$OUT_R")'"
[ "$(psqlq -c "select reset_started_at is null from public.games where id = '$GA'")" = "t" ] || fail "case A: the refused reset marked the game"

# ---- Case B: the reset starts first ---------------------------------------------------------------------------
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status, sessions_played) values ('$GB', 'reset lock B', 'tok-$RUN-b', 'uno', 'active', 3);
insert into public.players (id, game_id, name) values ('$HOST2', '$GB', 'Host');
update public.games set host_player_id = '$HOST2' where id = '$GB';
SQL
[ "$(psqlq -c "select public.begin_play_again_reset('$GB', 'active', null, 3)->>'status'")" = "started" ] || fail "case B: the reset did not start"
[ "$(psqlq -c "select public.end_game_if_host_alone('$GB', '$HOST2', null, 3, true)->>'status'")" = "continue" ] || fail "case B: a finish was committed against a reset in progress"
[ "$(psqlq -c "select status from public.games where id = '$GB'")" = "active" ] || fail "case B: the game was finished during the reset"

echo "ok"
