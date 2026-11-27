#!/usr/bin/env bash
# Two-session regression tests for the row locking in public.settle_host_leave(), public.end_game_if_host_alone()
# and public.remove_player_if_game_open()
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
# KEY SHARE on the nominee, so D waits with or without the explicit lock in the candidate query. That lock closes the
# window INSIDE the function (between choosing the candidate and writing the nomination), which no outside session can
# hold open.
#
# Case C (eligibility changes vs the nomination): same shape, but session U makes an ORDINARY non-key update of the
# chosen player (it flips the spectator flag). A foreign key's KEY SHARE does not block that, so U waits only because
# the election locks the candidate FOR NO KEY UPDATE: the nominee cannot stop being eligible between the choice and the
# write (this one does fail without the lock).
#
# Case D (a removal vs a finish): session F finishes the game and keeps its transaction open; session R calls
# remove_player_if_game_open() for a seated player. R is observed WAITING on F, and once F commits it answers
# `game_finished` and the seat is still there (a finish that committed first is never raced by the delete).
#
# Case E (a spectator update of the EXISTING nominee vs the settlement that keeps it): the settlement's eligibility check
# locks the nominee FOR NO KEY UPDATE, so a spectator update waits until the settlement commits (this one fails without
# the lock: the update would commit in between and leave an ineligible nominee).
#
# Case F (Two Truths start vs a host leaving alone): start_two_truths_game() changes the spectator flags and the status
# under the games row lock; end_game_if_host_alone() is observed WAITING on it, and then sees the started roster
# (`continue`, game still active) instead of an intermediate one.
#
# Sessions are coordinated through pg_stat_activity and an advisory-lock gate, not timing. Fixtures are committed (two
# sessions cannot share a transaction) and removed on exit. Every identifier is run-specific (worker names, fixture game
# and player ids, the gate key) and cleanup touches only those, so concurrent runs on one database do not interfere.
set -euo pipefail

DB="${DB:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
psqlq() { psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }

RUN="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n' | tr 'a-f' 'A-F')"
APP="shl-$RUN"
GATE=$(( (0x${RUN} % 2000000000) + 1 ))
GA="SHA$RUN"; GB="SHB$RUN"; GC="SHC$RUN"; GD="SHD$RUN"; GE="SHE$RUN"; GF="SHF$RUN"
new_uuid() { psqlq -c "select gen_random_uuid()"; }
HOST="$(new_uuid)"; OTHER="$(new_uuid)"; JOINER="$(new_uuid)"; GONE="$(new_uuid)"; OTHER2="$(new_uuid)"; SEATED="$(new_uuid)"; NOMINEE="$(new_uuid)"; TTHOST="$(new_uuid)"; TTSUB="$(new_uuid)"
WORKERS=()

cleanup() {
  psqlq -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name like '$APP-%' and pid <> pg_backend_pid()" >/dev/null 2>&1 || true
  psqlq -c "delete from public.games where id in ('$GA', '$GB', '$GC', '$GD', '$GE', '$GF')" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
wait_for() { # description, sql returning t when satisfied
  for _ in $(seq 1 200); do
    [ "$(psqlq -c "$2")" = "t" ] && return 0
    sleep 0.1
  done
  fail "timed out waiting for: $1"
}
# Wait for a worker process and require it to have exited cleanly.
reap() { # pid, description
  if ! wait "$1"; then fail "worker failed: $2"; fi
}

# The gate: held by a separate session for the whole case; a session that wants to keep its locks open does so by
# waiting on it, and the test releases it by ending that holder.
start_gate() {
  PGAPPNAME="$APP-gate" psql "$DB" -X -q -c "select pg_advisory_lock($GATE); select pg_sleep(120)" >/dev/null 2>&1 &
  GATE_PID=$!
  wait_for "gate held" "select exists (select 1 from pg_locks where locktype = 'advisory' and granted and objid = $GATE)"
}
open_gate() {
  psqlq -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name = '$APP-gate'" >/dev/null
  wait "$GATE_PID" 2>/dev/null || true # the holder was terminated on purpose
}

# ---- Case A: join vs end_game_if_host_alone -------------------------------------------------------------------
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GA', 'lock test A', 'tok-$RUN-a', 'uno', 'waiting');
insert into public.players (id, game_id, name) values ('$HOST', '$GA', 'Host');
update public.games set host_player_id = '$HOST' where id = '$GA';
SQL
start_gate
PGAPPNAME="$APP-join" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  insert into public.players (id, game_id, name) values ('$JOINER', '$GA', 'Joiner');
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
JOIN_PID=$!
wait_for "join holds its uncommitted insert" "select exists (select 1 from pg_stat_activity where application_name = '$APP-join' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_A=$(mktemp)
PGAPPNAME="$APP-end" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.end_game_if_host_alone('$GA', '$HOST', null, 1, false)->>'status'" >"$OUT_A" 2>&1 &
END_PID=$!
wait_for "end_game_if_host_alone waits on the join" "select exists (select 1 from pg_stat_activity where application_name = '$APP-end' and wait_event_type = 'Lock')"
[ "$(psqlq -c "select status from public.games where id = '$GA'")" = "waiting" ] || fail "the lobby was finished while a join was in flight"
open_gate
# Wait for the client processes themselves (not just the backends) before reading what they wrote.
reap "$JOIN_PID" "join"
reap "$END_PID" "end_game_if_host_alone"
[ "$(cat "$OUT_A")" = "continue" ] || fail "case A: expected 'continue' (the joined player is eligible), got '$(cat "$OUT_A")'"
[ "$(psqlq -c "select status from public.games where id = '$GA'")" = "waiting" ] || fail "case A: lobby was finished with the new player seated"

# ---- Case B: nominee leaving vs the nomination ----------------------------------------------------------------
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GB', 'lock test B', 'tok-$RUN-b', 'uno', 'active');
insert into public.players (id, game_id, name, joined_at) values ('$OTHER', '$GB', 'Other', now());
SQL
start_gate
OUT_S=$(mktemp)
PGAPPNAME="$APP-settle" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select public.settle_host_leave('$GB', '$GONE', null, null, 1, false);
  select pg_advisory_xact_lock($GATE);
  commit;" >"$OUT_S" 2>&1 &
SETTLE_PID=$!
wait_for "settle holds its locks" "select exists (select 1 from pg_stat_activity where application_name = '$APP-settle' and wait_event_type = 'Lock' and wait_event = 'advisory')"
PGAPPNAME="$APP-del" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "delete from public.players where id = '$OTHER'" >/dev/null 2>&1 &
DEL_PID=$!
wait_for "the nominee's DELETE waits for the nomination" "select exists (select 1 from pg_stat_activity where application_name = '$APP-del' and wait_event_type = 'Lock')"
open_gate
reap "$SETTLE_PID" "settle (case B): $(cat "$OUT_S")"
reap "$DEL_PID" "nominee delete"
# The nomination committed first; the delete then ran (the foreign key nulls the nominee reference).
[ "$(psqlq -c "select count(*) from public.players where id = '$OTHER'")" = "0" ] || fail "case B: the delete did not complete"
[ "$(psqlq -c "select pending_host_nominated_at is not null from public.games where id = '$GB'")" = "t" ] || fail "case B: the nomination did not commit: $(cat "$OUT_S")"

# ---- Case C: a non-key update of the nominee vs the nomination -----------------------------------------------
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GC', 'lock test C', 'tok-$RUN-c', 'uno', 'active');
insert into public.players (id, game_id, name, joined_at) values ('$OTHER2', '$GC', 'Other', now());
SQL
start_gate
OUT_S2=$(mktemp)
PGAPPNAME="$APP-settle2" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select public.settle_host_leave('$GC', '$GONE', null, null, 1, false);
  select pg_advisory_xact_lock($GATE);
  commit;" >"$OUT_S2" 2>&1 &
SETTLE2_PID=$!
wait_for "settle holds its locks (case C)" "select exists (select 1 from pg_stat_activity where application_name = '$APP-settle2' and wait_event_type = 'Lock' and wait_event = 'advisory')"
PGAPPNAME="$APP-flag" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "update public.players set spectator = true where id = '$OTHER2'" >/dev/null 2>&1 &
FLAG_PID=$!
wait_for "the spectator-flag UPDATE waits for the nomination" "select exists (select 1 from pg_stat_activity where application_name = '$APP-flag' and wait_event_type = 'Lock')"
[ "$(psqlq -c "select spectator from public.players where id = '$OTHER2'")" = "f" ] || fail "case C: the flag changed while the nomination was in flight"
open_gate
reap "$SETTLE2_PID" "settle (case C): $(cat "$OUT_S2")"
reap "$FLAG_PID" "spectator flag update"
[ "$(psqlq -c "select pending_host_player_id = '$OTHER2' from public.games where id = '$GC'")" = "t" ] || fail "case C: the nomination did not commit"
[ "$(psqlq -c "select spectator from public.players where id = '$OTHER2'")" = "t" ] || fail "case C: the flag update did not apply once the nomination committed"

# ---- Case D: a removal vs a finish that committed first ------------------------------------------------------
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GD', 'lock test D', 'tok-$RUN-d', 'uno', 'active');
insert into public.players (id, game_id, name) values ('$SEATED', '$GD', 'Seated');
SQL
start_gate
PGAPPNAME="$APP-finish" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  update public.games set status = 'finished', finished_at = now() where id = '$GD';
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
FINISH_PID=$!
wait_for "the finish holds its uncommitted update" "select exists (select 1 from pg_stat_activity where application_name = '$APP-finish' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_R=$(mktemp)
PGAPPNAME="$APP-remove" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.remove_player_if_game_open('$GD', '$SEATED')->>'status'" >"$OUT_R" 2>&1 &
REMOVE_PID=$!
wait_for "the removal waits for the finish" "select exists (select 1 from pg_stat_activity where application_name = '$APP-remove' and wait_event_type = 'Lock')"
[ "$(psqlq -c "select count(*) from public.players where id = '$SEATED'")" = "1" ] || fail "case D: the seat was deleted while a finish was in flight"
open_gate
reap "$FINISH_PID" "finish"
reap "$REMOVE_PID" "removal"
[ "$(cat "$OUT_R")" = "game_finished" ] || fail "case D: expected 'game_finished', got '$(cat "$OUT_R")'"
[ "$(psqlq -c "select count(*) from public.players where id = '$SEATED'")" = "1" ] || fail "case D: the seat of a finished game was deleted"

# ---- Case E: a spectator update of the EXISTING nominee vs the settlement that keeps it -----------------------
# The settlement decides "the nominee is still eligible" and returns 'settled'. Without a lock on the nominee row a
# spectator update could commit between that read and the settlement's commit and leave an ineligible nominee in place.
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GE', 'lock test E', 'tok-$RUN-e', 'uno', 'active');
insert into public.players (id, game_id, name, joined_at) values ('$NOMINEE', '$GE', 'Nominee', now());
update public.games set pending_host_player_id = '$NOMINEE' where id = '$GE';
SQL
start_gate
OUT_E=$(mktemp)
PGAPPNAME="$APP-settle3" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "
  begin;
  select public.settle_host_leave('$GE', '$GONE', null, null, 1, false)->>'status';
  select pg_advisory_xact_lock($GATE);
  commit;" >"$OUT_E" 2>&1 &
SETTLE3_PID=$!
wait_for "settle holds its locks (case E)" "select exists (select 1 from pg_stat_activity where application_name = '$APP-settle3' and wait_event_type = 'Lock' and wait_event = 'advisory')"
PGAPPNAME="$APP-flag2" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "update public.players set spectator = true where id = '$NOMINEE'" >/dev/null 2>&1 &
FLAG2_PID=$!
wait_for "the spectator update of the nominee waits for the settlement" "select exists (select 1 from pg_stat_activity where application_name = '$APP-flag2' and wait_event_type = 'Lock')"
[ "$(psqlq -c "select spectator from public.players where id = '$NOMINEE'")" = "f" ] || fail "case E: the nominee's flag changed while the settlement was in flight"
open_gate
reap "$SETTLE3_PID" "settle (case E): $(cat "$OUT_E")"
reap "$FLAG2_PID" "nominee spectator update"
grep -q "settled" "$OUT_E" || fail "case E: expected 'settled', got '$(cat "$OUT_E")'"

# ---- Case F: a Two Truths start vs a host leaving alone ---------------------------------------------------------
# The start applies the spectator flags and the status change in one unit under the games row lock, so
# end_game_if_host_alone either runs before it (the game is still waiting and the submitter is an eligible player) or
# after it commits (and sees the finished roster). It never reads a half-changed roster.
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GF', 'lock test F', 'tok-$RUN-f', 'two_truths', 'waiting');
insert into public.players (id, game_id, name, joined_at) values ('$TTHOST', '$GF', 'Host', now() - interval '5 minutes'), ('$TTSUB', '$GF', 'Submitter', now());
update public.games set host_player_id = '$TTHOST' where id = '$GF';
SQL
start_gate
OUT_F=$(mktemp)
PGAPPNAME="$APP-start" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select public.start_two_truths_game('$GF', array['$TTSUB'::uuid], now(), 3);
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
START_PID=$!
wait_for "the start holds its uncommitted writes" "select exists (select 1 from pg_stat_activity where application_name = '$APP-start' and wait_event_type = 'Lock' and wait_event = 'advisory')"
PGAPPNAME="$APP-endf" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.end_game_if_host_alone('$GF', '$TTHOST', null, 1, false)->>'status'" >"$OUT_F" 2>&1 &
ENDF_PID=$!
wait_for "end_game_if_host_alone waits for the start" "select exists (select 1 from pg_stat_activity where application_name = '$APP-endf' and wait_event_type = 'Lock')"
open_gate
reap "$START_PID" "two truths start"
reap "$ENDF_PID" "end_game_if_host_alone (case F)"
[ "$(cat "$OUT_F")" = "continue" ] || fail "case F: expected 'continue' (the submitter plays), got '$(cat "$OUT_F")'"
[ "$(psqlq -c "select status from public.games where id = '$GF'")" = "active" ] || fail "case F: the started game was finished from an intermediate roster"

echo "ok"
