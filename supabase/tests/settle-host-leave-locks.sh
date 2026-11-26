#!/usr/bin/env bash
# Two-session regression test for the row locking in public.settle_host_leave() and public.end_game_if_host_alone()
# (supabase/migrations/20261203900000_settle_host_leave.sql).
#
#   DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/settle-host-leave-locks.sh
#
# Case A (lobby join vs the "nobody else is eligible" finish): session J inserts a player into the lobby and keeps its
# transaction open. A join takes KEY SHARE on the games row through its foreign key, which conflicts with the
# FOR UPDATE that end_game_if_host_alone() takes. The test asserts the function is observed WAITING on J, and that once
# J commits it answers `continue` (it SEES the new player) instead of finishing the lobby with that player seated.
#
# Case B (nominee leaves vs the nomination): session S runs settle_host_leave() and keeps its transaction open.
# Session D deletes the nominated player. The test asserts D is observed WAITING on S, and that the nomination
# committed. What this can and cannot show: once the nomination UPDATE has run, its foreign key already holds a
# KEY SHARE on the nominee, so D waits with or without the explicit `FOR KEY SHARE` in the candidate query. That clause
# closes the window INSIDE the function (between choosing the candidate and writing the nomination), which no outside
# session can hold open; its syntax with ORDER BY/LIMIT is covered by case 13 of settle-host-leave.sql.
#
# Sessions are coordinated through pg_stat_activity and an advisory-lock gate, not timing. Fixtures are committed
# (two sessions cannot share a transaction) and removed on exit.
set -euo pipefail

DB="${DB:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
GATE=7313
psqlq() { psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }

cleanup() {
  psqlq -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name like 'shl-%' and pid <> pg_backend_pid()" >/dev/null 2>&1 || true
  psqlq -c "delete from public.games where id in ('SHLA', 'SHLB', 'SHLC')" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

HOST=00000000-0000-0000-0000-00000000e001
OTHER=00000000-0000-0000-0000-00000000e002
JOINER=00000000-0000-0000-0000-00000000e003
OTHER2=00000000-0000-0000-0000-00000000e005
GONE=00000000-0000-0000-0000-00000000e004 # the leaver of case B: no seat row

fail() { echo "FAIL: $*" >&2; exit 1; }
wait_for() { # description, sql returning t when satisfied
  for _ in $(seq 1 200); do
    [ "$(psqlq -c "$2")" = "t" ] && return 0
    sleep 0.1
  done
  fail "timed out waiting for: $1"
}

# The gate: held by a separate session for the whole test; a session that wants to keep its locks open does so by
# waiting on it, and the test releases it by ending that holder.
start_gate() {
  PGAPPNAME=shl-gate psql "$DB" -X -q -c "select pg_advisory_lock($GATE); select pg_sleep(120)" >/dev/null 2>&1 &
  wait_for "gate held" "select exists (select 1 from pg_locks where locktype = 'advisory' and granted and objid = $GATE)"
}
open_gate() {
  psqlq -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'shl-gate'" >/dev/null
}

# ---- Case A: join vs end_game_if_host_alone -------------------------------------------------------------------
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('SHLA', 'lock test A', 'tok-shla', 'uno', 'waiting');
insert into public.players (id, game_id, name) values ('$HOST', 'SHLA', 'Host');
update public.games set host_player_id = '$HOST' where id = 'SHLA';
SQL
start_gate
PGAPPNAME=shl-join psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  insert into public.players (id, game_id, name) values ('$JOINER', 'SHLA', 'Joiner');
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
wait_for "join holds its uncommitted insert" "select exists (select 1 from pg_stat_activity where application_name = 'shl-join' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_A=$(mktemp)
PGAPPNAME=shl-end psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.end_game_if_host_alone('SHLA', '$HOST', null, 1)->>'status'" >"$OUT_A" 2>&1 &
wait_for "end_game_if_host_alone waits on the join" "select exists (select 1 from pg_stat_activity where application_name = 'shl-end' and wait_event_type = 'Lock')"
[ "$(psqlq -c "select status from public.games where id = 'SHLA'")" = "waiting" ] || fail "the lobby was finished while a join was in flight"
open_gate
wait_for "end_game_if_host_alone answered" "select not exists (select 1 from pg_stat_activity where application_name = 'shl-end')"
[ "$(cat "$OUT_A")" = "continue" ] || fail "case A: expected 'continue' (the joined player is eligible), got '$(cat "$OUT_A")'"
[ "$(psqlq -c "select status from public.games where id = 'SHLA'")" = "waiting" ] || fail "case A: lobby was finished with the new player seated"

# ---- Case B: nominee leaving vs the nomination ----------------------------------------------------------------
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('SHLB', 'lock test B', 'tok-shlb', 'uno', 'active');
insert into public.players (id, game_id, name, joined_at) values ('$OTHER', 'SHLB', 'Other', now());
SQL
start_gate
OUT_S=$(mktemp)
PGAPPNAME=shl-settle psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select public.settle_host_leave('SHLB', '$GONE', null, null, 1);
  select pg_advisory_xact_lock($GATE);
  commit;" >"$OUT_S" 2>&1 &
wait_for "settle holds its locks" "select exists (select 1 from pg_stat_activity where application_name = 'shl-settle' and wait_event_type = 'Lock' and wait_event = 'advisory')"
PGAPPNAME=shl-del psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "delete from public.players where id = '$OTHER'" >/dev/null 2>&1 &
wait_for "the nominee's DELETE waits for the nomination" "select exists (select 1 from pg_stat_activity where application_name = 'shl-del' and wait_event_type = 'Lock')"
open_gate
wait_for "both sessions finished" "select not exists (select 1 from pg_stat_activity where application_name in ('shl-settle', 'shl-del'))"
# The nomination committed first; the delete then ran (the foreign key nulls the nominee reference).
[ "$(psqlq -c "select count(*) from public.players where id = '$OTHER'")" = "0" ] || fail "case B: the delete did not complete"
[ "$(psqlq -c "select pending_host_nominated_at is not null from public.games where id = 'SHLB'")" = "t" ] || fail "case B: the nomination did not commit: $(cat "$OUT_S")"

# ---- Case C: a non-key update of the nominee vs the nomination -----------------------------------------------
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('SHLC', 'lock test C', 'tok-shlc', 'uno', 'active');
insert into public.players (id, game_id, name, joined_at) values ('$OTHER2', 'SHLC', 'Other', now());
SQL
start_gate
PGAPPNAME=shl-settle2 psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select public.settle_host_leave('SHLC', '$GONE', null, null, 1);
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
wait_for "settle holds its locks (case C)" "select exists (select 1 from pg_stat_activity where application_name = 'shl-settle2' and wait_event_type = 'Lock' and wait_event = 'advisory')"
PGAPPNAME=shl-flag psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "update public.players set spectator = true where id = '$OTHER2'" >/dev/null 2>&1 &
wait_for "the spectator-flag UPDATE waits for the nomination" "select exists (select 1 from pg_stat_activity where application_name = 'shl-flag' and wait_event_type = 'Lock')"
[ "$(psqlq -c "select spectator from public.players where id = '$OTHER2'")" = "f" ] || fail "case C: the flag changed while the nomination was in flight"
open_gate
wait_for "both sessions finished (case C)" "select not exists (select 1 from pg_stat_activity where application_name in ('shl-settle2', 'shl-flag'))"
[ "$(psqlq -c "select pending_host_player_id is not null from public.games where id = 'SHLC'")" = "t" ] || fail "case C: the nomination did not commit"

echo "ok"
