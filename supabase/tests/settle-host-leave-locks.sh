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
# Case G (word_rush_remove_player vs a finish that is committing): the leave waits for the finish and then answers
# `game_finished`; nothing of the session (roster, leavers) was touched.
#
# Case H (two leaves of one session): the second leave waits for the first (the games row lock) and both end up off the roster
# and recorded, with no entry lost.
#
# Case M (a Word Rush host leave vs a join in flight): the host-alone finish takes the games row FOR UPDATE, which conflicts with
# the KEY SHARE a join holds; the leave waits for the join and then sees the joiner (it is a leave, not a finish).
#
# Case P (a session writer that does not hold the games row vs a leave): the leave takes the session row lock itself and works
# on the committed row.
#
# Case N (a Word Rush leave vs a Play Again reset, both orders): a reset that is committing makes the leave wait and then find a
# lobby (the seat goes at once, nothing recorded); a leave that is in flight makes the reset wait and is recorded in the old session.
#
# Case I (Two Truths activation vs the finish): the finish waits for a committing activation; afterwards no round can be
# activated in the finished game.
#
# Case F (Two Truths start vs a host leaving alone): start_two_truths_game() takes the games row lock BEFORE it writes the
# roster. A blocker holds the submitter's player row so the start is stuck mid-way while already holding the game lock;
# end_game_if_host_alone() is observed WAITING on it (without the early lock it would run at once, see the seeded
# spectator roster and finish the game) and then sees the started roster (`continue`, game still active).
#
# Sessions are coordinated through pg_stat_activity and an advisory-lock gate, not timing. Fixtures are committed (two
# sessions cannot share a transaction) and removed on exit. Every identifier is run-specific (worker names, fixture game
# and player ids, the gate key) and cleanup touches only those, so concurrent runs on one database do not interfere.
set -euo pipefail

DB="${DB:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
psqlq() { psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }

RUN="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n' | tr 'a-f' 'A-F')"
APP="shl-$RUN"
GATE=$(( ((0x${RUN} * 131 + $$) % 2000000000) + 1 ))
GA="SHA$RUN"; GB="SHB$RUN"; GC="SHC$RUN"; GD="SHD$RUN"; GE="SHE$RUN"; GF="SHF$RUN"; GG="SHG$RUN"; GH="SHH$RUN"; GI="SHI$RUN"; GJ="SHJ$RUN"; GK="SHK$RUN"; GM="SHM$RUN"; GN="SHN$RUN"; GP="SHP$RUN"; GL="SHL$RUN"
new_uuid() { psqlq -c "select gen_random_uuid()"; }
HOST="$(new_uuid)"; OTHER="$(new_uuid)"; JOINER="$(new_uuid)"; GONE="$(new_uuid)"; OTHER2="$(new_uuid)"; SEATED="$(new_uuid)"; NOMINEE="$(new_uuid)"; TTHOST="$(new_uuid)"; TTSUB="$(new_uuid)"; WRSEAT="$(new_uuid)"; WRKEEP="$(new_uuid)"; WRSESS="$(new_uuid)"; WRSESS2="$(new_uuid)"; RND1="$(new_uuid)"; RND2="$(new_uuid)"; RND3="$(new_uuid)"; RND4="$(new_uuid)"; HOSTK="$(new_uuid)"; JOINERK="$(new_uuid)"; JOINERL="$(new_uuid)"; WRSEAT2="$(new_uuid)"; WRSEAT3="$(new_uuid)"; WRSEAT4="$(new_uuid)"; WRSEAT5="$(new_uuid)"; WRKEEP2="$(new_uuid)"; WRKEEP3="$(new_uuid)"; WRSESS3="$(new_uuid)"; WRSESS4="$(new_uuid)"; WRSESS5="$(new_uuid)"; HOSTM="$(new_uuid)"; WRSEAT6="$(new_uuid)"; WRKEEP4="$(new_uuid)"; WRKEEP5="$(new_uuid)"; WRSESS6="$(new_uuid)"; JOINERM="$(new_uuid)"
WORKERS=()
# Every worker's output lives in ONE run-specific directory that cleanup removes (no temp files are left behind).
OUT_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$OUT_DIR"
  psqlq -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name like '$APP-%' and pid <> pg_backend_pid()" >/dev/null 2>&1 || true
  psqlq -c "delete from public.games where id in ('$GA', '$GB', '$GC', '$GD', '$GE', '$GF', '$GG', '$GH', '$GI', '$GJ', '$GK', '$GL', '$GM', '$GN', '$GP')" >/dev/null 2>&1 || true
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
# The worker must be blocked BY the named holder of this run (pg_blocking_pids), not merely waiting on some heavyweight
# lock: an unrelated relation lock wait would otherwise satisfy the check without the row lock under test.
wait_blocked() { # description, waiter app suffix, blocker app suffix
  wait_for "$1" "select exists (select 1 from pg_stat_activity w join pg_stat_activity b on b.pid = any (pg_blocking_pids(w.pid)) where w.application_name = '$APP-$2' and b.application_name = '$APP-$3')"
}

start_gate() {
  PGAPPNAME="$APP-gate" psql "$DB" -X -q -c "select pg_advisory_lock($GATE); select pg_sleep(120)" >/dev/null 2>&1 &
  GATE_PID=$!
  # THIS run's own holder (matched by its application name), not just "somebody holds the key": another run that happens to
  # derive the same advisory key must not make this check pass while this run's holder is still queued behind it.
  wait_for "gate held" "select exists (select 1 from pg_locks l join pg_stat_activity a on a.pid = l.pid where l.locktype = 'advisory' and l.granted and a.application_name = '$APP-gate')"
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
OUT_A="$OUT_DIR/out_a"
PGAPPNAME="$APP-end" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.end_game_if_host_alone('$GA', '$HOST', null, 1, false)->>'status'" >"$OUT_A" 2>&1 &
END_PID=$!
wait_blocked "end_game_if_host_alone waits on the join" end join
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
OUT_S="$OUT_DIR/out_s"
PGAPPNAME="$APP-settle" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select public.settle_host_leave('$GB', '$GONE', null, null, 1, false);
  select pg_advisory_xact_lock($GATE);
  commit;" >"$OUT_S" 2>&1 &
SETTLE_PID=$!
wait_for "settle holds its locks" "select exists (select 1 from pg_stat_activity where application_name = '$APP-settle' and wait_event_type = 'Lock' and wait_event = 'advisory')"
PGAPPNAME="$APP-del" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "delete from public.players where id = '$OTHER'" >/dev/null 2>&1 &
DEL_PID=$!
wait_blocked "the nominee's DELETE waits for the nomination" del settle
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
OUT_S2="$OUT_DIR/out_s2"
PGAPPNAME="$APP-settle2" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select public.settle_host_leave('$GC', '$GONE', null, null, 1, false);
  select pg_advisory_xact_lock($GATE);
  commit;" >"$OUT_S2" 2>&1 &
SETTLE2_PID=$!
wait_for "settle holds its locks (case C)" "select exists (select 1 from pg_stat_activity where application_name = '$APP-settle2' and wait_event_type = 'Lock' and wait_event = 'advisory')"
PGAPPNAME="$APP-flag" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "update public.players set spectator = true where id = '$OTHER2'" >/dev/null 2>&1 &
FLAG_PID=$!
wait_blocked "the spectator-flag UPDATE waits for the nomination" flag settle2
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
OUT_R="$OUT_DIR/out_r"
PGAPPNAME="$APP-remove" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.remove_player_if_game_open('$GD', '$SEATED')->>'status'" >"$OUT_R" 2>&1 &
REMOVE_PID=$!
wait_blocked "the removal waits for the finish" remove finish
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
OUT_E="$OUT_DIR/out_e"
PGAPPNAME="$APP-settle3" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "
  begin;
  select public.settle_host_leave('$GE', '$GONE', null, null, 1, false)->>'status';
  select pg_advisory_xact_lock($GATE);
  commit;" >"$OUT_E" 2>&1 &
SETTLE3_PID=$!
wait_for "settle holds its locks (case E)" "select exists (select 1 from pg_stat_activity where application_name = '$APP-settle3' and wait_event_type = 'Lock' and wait_event = 'advisory')"
PGAPPNAME="$APP-flag2" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "update public.players set spectator = true where id = '$NOMINEE'" >/dev/null 2>&1 &
FLAG2_PID=$!
wait_blocked "the spectator update of the nominee waits for the settlement" flag2 settle3
[ "$(psqlq -c "select spectator from public.players where id = '$NOMINEE'")" = "f" ] || fail "case E: the nominee's flag changed while the settlement was in flight"
open_gate
reap "$SETTLE3_PID" "settle (case E): $(cat "$OUT_E")"
reap "$FLAG2_PID" "nominee spectator update"
grep -q "settled" "$OUT_E" || fail "case E: expected 'settled', got '$(cat "$OUT_E")'"

# ---- Case F: a Two Truths start vs a host leaving alone ---------------------------------------------------------
# The submitter is seeded as a SPECTATOR: before the start the host is alone (end_game_if_host_alone would finish the
# game), after it the submitter plays. A blocker holds the submitter's player row, so the start is stuck mid-way. What
# this case proves is the OBSERVABLE contract: while the start is in flight the end check waits for it, and afterwards
# it sees the started roster (`continue`, the game still active) instead of an intermediate one. The wait can come from
# the start's explicit `for update` on the games row or, if the round insert's foreign-key check on `games` ran first,
# from that FK's KEY SHARE: the repository does not fix that order, so this case does not by itself isolate the explicit
# lock. That lock is pinned by the function-definition check in settle-host-leave.sql (group 16). The end check passes
# the very session timestamp the start writes (and the game is seeded with it), so a `continue` can only come from the
# roster check, not from a session mismatch.
SESSION_TS="2026-01-01T00:00:00Z"
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status, session_started_at) values ('$GF', 'lock test F', 'tok-$RUN-f', 'two_truths', 'waiting', '$SESSION_TS');
insert into public.players (id, game_id, name, joined_at, spectator) values ('$TTHOST', '$GF', 'Host', now() - interval '5 minutes', false), ('$TTSUB', '$GF', 'Submitter', now(), true);
update public.games set host_player_id = '$TTHOST' where id = '$GF';
SQL
start_gate
PGAPPNAME="$APP-blocker" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select 1 from public.players where id = '$TTSUB' for update;
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
BLOCKER_PID=$!
wait_for "the blocker holds the submitter row" "select exists (select 1 from pg_stat_activity where application_name = '$APP-blocker' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_START="$OUT_DIR/out_start"
PGAPPNAME="$APP-start" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "
  select public.start_two_truths_game('$GF', array['$TTSUB'::uuid], '$SESSION_TS',
    jsonb_build_array(jsonb_build_object('game_id', '$GF', 'round_number', 1, 'participant_ids', '[]'::jsonb,
      'submitter_player_id', '$TTSUB', 'status', 'active', 'ttl_metadata', '{\"statements\":[\"a\",\"b\",\"c\"],\"lie_index\":null}'::jsonb)),
    jsonb_build_array(jsonb_build_object('round_number', 1, 'lie_index', 1)), 1, 1)->>'status'" >"$OUT_START" 2>&1 &
START_PID=$!
wait_blocked "the start is stuck on the submitter row" start blocker
OUT_F="$OUT_DIR/out_f"
PGAPPNAME="$APP-endf" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.end_game_if_host_alone('$GF', '$TTHOST', '$SESSION_TS', 1, false)->>'status'" >"$OUT_F" 2>&1 &
ENDF_PID=$!
wait_blocked "end_game_if_host_alone waits for the start" endf start
[ "$(psqlq -c "select status from public.games where id = '$GF'")" = "waiting" ] || fail "case F: the game changed while the start was in flight"
open_gate
reap "$BLOCKER_PID" "blocker"
reap "$START_PID" "two truths start: $(cat "$OUT_START")"
reap "$ENDF_PID" "end_game_if_host_alone (case F)"
[ "$(cat "$OUT_START")" = "started" ] || fail "case F: the start did not complete: '$(cat "$OUT_START")'"
[ "$(cat "$OUT_F")" = "continue" ] || fail "case F: expected 'continue' (the submitter plays), got '$(cat "$OUT_F")'"
[ "$(psqlq -c "select status from public.games where id = '$GF'")" = "active" ] || fail "case F: the started game was finished from an intermediate roster"

# ---- Case G: word_rush_remove_player vs a finish that is committing ---------------------------------------------
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GG', 'lock test G', 'tok-$RUN-g', 'word_rush', 'active');
insert into public.players (id, game_id, name) values ('$WRSEAT', '$GG', 'Leaver'), ('$WRKEEP', '$GG', 'Stays');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, roster)
  values ('$WRSESS', '$GG', 'individual', 'automatic', 1, 3, 60, array['$WRSEAT'::uuid, '$WRKEEP'::uuid]);
SQL
start_gate
PGAPPNAME="$APP-fing" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  update public.games set status = 'finished', result_reason = 'admin_ended', finished_at = clock_timestamp() where id = '$GG';
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
FING_PID=$!
wait_for "the finish holds its uncommitted update (case G)" "select exists (select 1 from pg_stat_activity where application_name = '$APP-fing' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_G="$OUT_DIR/out_g"
PGAPPNAME="$APP-rmg" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.word_rush_remove_player('$GG', '$WRSEAT')->>'status'" >"$OUT_G" 2>&1 &
RMG_PID=$!
wait_blocked "the leave waits for the finish (the games row lock)" rmg fing
open_gate
reap "$FING_PID" "finish (case G)"
reap "$RMG_PID" "leave (case G)"
[ "$(tr -d '[:space:]' <"$OUT_G")" = "game_finished" ] || fail "case G: expected game_finished, got '$(cat "$OUT_G")'"
[ "$(psqlq -c "select cardinality(roster) || ':' || cardinality(leavers) from public.word_rush_sessions where id = '$WRSESS'")" = "2:0" ] || fail "case G: the session was touched by a leave of a finished game"
[ "$(psqlq -c "select count(*) from public.players where id = '$WRSEAT'")" = "1" ] || fail "case G: the seat of a finished game was deleted"

# ---- Case H: two leaves of one session serialise ------------------------------------------------------------------
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GH', 'lock test H', 'tok-$RUN-h', 'word_rush', 'active');
insert into public.players (id, game_id, name) values ('$WRSEAT2', '$GH', 'LeaverA'), ('$WRSEAT3', '$GH', 'LeaverB'), ('$WRKEEP2', '$GH', 'Stays');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, roster)
  values ('$WRSESS2', '$GH', 'individual', 'automatic', 1, 3, 60, array['$WRSEAT2'::uuid, '$WRSEAT3'::uuid, '$WRKEEP2'::uuid]);
SQL
start_gate
PGAPPNAME="$APP-leave1" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select public.word_rush_remove_player('$GH', '$WRSEAT2');
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
LEAVE1_PID=$!
wait_for "the first leave holds its uncommitted write (case H)" "select exists (select 1 from pg_stat_activity where application_name = '$APP-leave1' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_H="$OUT_DIR/out_h"
PGAPPNAME="$APP-leave2" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.word_rush_remove_player('$GH', '$WRSEAT3')->>'status'" >"$OUT_H" 2>&1 &
LEAVE2_PID=$!
wait_blocked "the second leave waits for the first (the games row lock)" leave2 leave1
open_gate
reap "$LEAVE1_PID" "first leave (case H)"
reap "$LEAVE2_PID" "second leave (case H)"
[ "$(tr -d '[:space:]' <"$OUT_H")" = "left" ] || fail "case H: expected left, got '$(cat "$OUT_H")'"
[ "$(psqlq -c "select roster::text from public.word_rush_sessions where id = '$WRSESS2'")" = "{$WRKEEP2}" ] || fail "case H: a leaver is still on the roster (a write was lost)"
[ "$(psqlq -c "select cardinality(leavers) from public.word_rush_sessions where id = '$WRSESS2'")" = "2" ] || fail "case H: a leaver was not recorded (a write was lost)"

# ---- Case M: a Word Rush host leave vs a join in flight -------------------------------------------------------------
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GM', 'lock test M', 'tok-$RUN-m', 'word_rush', 'active');
insert into public.players (id, game_id, name) values ('$HOSTM', '$GM', 'Host');
update public.games set host_player_id = '$HOSTM' where id = '$GM';
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, roster)
  values ('$WRSESS3', '$GM', 'individual', 'automatic', 1, 3, 60, array['$HOSTM'::uuid]);
SQL
start_gate
PGAPPNAME="$APP-joinm" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select 1 from public.games where id = '$GM' for key share;
  select pg_advisory_xact_lock($GATE);
  insert into public.players (id, game_id, name) values ('$JOINERM', '$GM', 'Joiner');
  commit;" >/dev/null 2>&1 &
JOINM_PID=$!
wait_for "the join holds its KEY SHARE (case M)" "select exists (select 1 from pg_stat_activity where application_name = '$APP-joinm' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_M="$OUT_DIR/out_m"
PGAPPNAME="$APP-hostm" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.word_rush_remove_player('$GM', '$HOSTM', p_host_leave => true, p_sessions_played => 1)->>'status'" >"$OUT_M" 2>&1 &
HOSTM_PID=$!
wait_blocked "the host leave waits for the join (the games row lock)" hostm joinm
open_gate
reap "$JOINM_PID" "join (case M)"
reap "$HOSTM_PID" "host leave (case M)"
[ "$(tr -d '[:space:]' <"$OUT_M")" = "left" ] || fail "case M: the host leave did not see the joiner (got '$(cat "$OUT_M")')"
[ "$(psqlq -c "select status from public.games where id = '$GM'")" = "active" ] || fail "case M: the game was finished over a seated joiner"

# ---- Case N: a Word Rush leave vs a Play Again reset ----------------------------------------------------------------
# (1) a reset that is committing: the leave waits, then finds a lobby (no session): the seat goes at once and nothing is recorded.
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GN', 'lock test N', 'tok-$RUN-n', 'word_rush', 'active');
insert into public.players (id, game_id, name) values ('$WRSEAT4', '$GN', 'Leaver'), ('$WRKEEP3', '$GN', 'Stays');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, roster)
  values ('$WRSESS4', '$GN', 'individual', 'automatic', 1, 3, 60, array['$WRSEAT4'::uuid, '$WRKEEP3'::uuid]);
SQL
start_gate
PGAPPNAME="$APP-reset" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  update public.games set status = 'waiting', sessions_played = sessions_played + 1 where id = '$GN';
  delete from public.word_rush_sessions where game_id = '$GN';
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
RESET_PID=$!
wait_for "the reset holds its uncommitted update (case N)" "select exists (select 1 from pg_stat_activity where application_name = '$APP-reset' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_N="$OUT_DIR/out_n"
PGAPPNAME="$APP-rmn" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.word_rush_remove_player('$GN', '$WRSEAT4')->>'status'" >"$OUT_N" 2>&1 &
RMN_PID=$!
wait_blocked "the leave waits for the reset (the games row lock)" rmn reset
open_gate
reap "$RESET_PID" "reset (case N)"
reap "$RMN_PID" "leave (case N)"
[ "$(tr -d '[:space:]' <"$OUT_N")" = "deleted" ] || fail "case N: expected deleted from the reopened lobby, got '$(cat "$OUT_N")'"
[ "$(psqlq -c "select count(*) from public.players where id = '$WRSEAT4'")" = "0" ] || fail "case N: the lobby seat was not deleted"
# (2) a leave that is in flight: the reset waits for it, and the leave is recorded in the session it saw.
psqlq <<SQL
update public.games set status = 'active' where id = '$GN';
insert into public.players (id, game_id, name) values ('$WRSEAT5', '$GN', 'Leaver2');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, roster)
  values ('$WRSESS5', '$GN', 'individual', 'automatic', 1, 3, 60, array['$WRSEAT5'::uuid, '$WRKEEP3'::uuid]);
SQL
start_gate
PGAPPNAME="$APP-leaven" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select public.word_rush_remove_player('$GN', '$WRSEAT5');
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
LEAVEN_PID=$!
wait_for "the leave holds its uncommitted write (case N, second order)" "select exists (select 1 from pg_stat_activity where application_name = '$APP-leaven' and wait_event_type = 'Lock' and wait_event = 'advisory')"
PGAPPNAME="$APP-reset2" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "update public.games set status = 'waiting', sessions_played = sessions_played + 1 where id = '$GN'" >/dev/null 2>&1 &
RESET2_PID=$!
wait_blocked "the reset waits for the leave (the games row lock)" reset2 leaven
open_gate
reap "$LEAVEN_PID" "leave (case N, second order)"
reap "$RESET2_PID" "reset (case N, second order)"
[ "$(psqlq -c "select leavers::text from public.word_rush_sessions where id = '$WRSESS5'")" = "{$WRSEAT5}" ] || fail "case N: the leave was not recorded in the session it saw"
[ "$(psqlq -c "select status from public.games where id = '$GN'")" = "waiting" ] || fail "case N: the reset did not apply after the leave"

# ---- Case I: a Two Truths round activation vs the finish ----------------------------------------------------------
# activate_ttl_round() takes the games row FOR SHARE and needs an active game. A finish (UPDATE of the games row) is observed
# WAITING on an activation that is committing, and once it commits the game is finished with the activated round open for
# the cleanup to close; a later activation of another pending round then writes nothing (not_active).
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GI', 'lock test I', 'tok-$RUN-i', 'two_truths', 'active');
insert into public.rounds (id, game_id, round_number, status, participant_ids) values
  ('$RND1', '$GI', 1, 'pending', '{}'), ('$RND2', '$GI', 2, 'pending', '{}');
SQL
start_gate
PGAPPNAME="$APP-activate" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select public.activate_ttl_round('$GI', '$RND1', 1);
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
ACTIVATE_PID=$!
wait_for "the activation holds its uncommitted write" "select exists (select 1 from pg_stat_activity where application_name = '$APP-activate' and wait_event_type = 'Lock' and wait_event = 'advisory')"
PGAPPNAME="$APP-fin" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "update public.games set status = 'finished', finished_at = now() where id = '$GI'" >/dev/null 2>&1 &
FIN_PID=$!
wait_blocked "the finish waits for the activation (the games row lock)" fin activate
open_gate
reap "$ACTIVATE_PID" "activation (case I)"
reap "$FIN_PID" "finish (case I)"
[ "$(psqlq -c "select status from public.rounds where id = '$RND1'")" = "active" ] || fail "case I: the activation that won the lock did not apply"
[ "$(psqlq -c "select status from public.games where id = '$GI'")" = "finished" ] || fail "case I: the finish did not apply after the activation"
[ "$(psqlq -c "select public.activate_ttl_round('$GI', '$RND2', 2)->>'status'")" = "not_active" ] || fail "case I: a round was activated in a finished game"
[ "$(psqlq -c "select status from public.rounds where id = '$RND2'")" = "pending" ] || fail "case I: the second round was opened after the finish"
[ "$(psqlq -c "select jsonb_array_length(public.finish_rounds_of_finished_session('$GI', (select finished_at from public.games where id = '$GI'))->'round_ids') ")" = "1" ] || fail "case I: the cleanup did not close exactly the activated round"

# ---- Case J: two concurrent activations serialise on the games row (no lock-upgrade deadlock) ----------------------
# activate_ttl_round() takes the games row FOR NO KEY UPDATE FIRST. A blocker holds the first pending round, so the first
# activation is stuck on that round while it already holds the games lock: the second activation must then WAIT for the
# first before it touches any round. (With a FOR SHARE first lock both activations would hold the games row and then
# deadlock on the pointer write.) Once the blocker releases, the first activates, and the second sees an active round.
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GJ', 'lock test J', 'tok-$RUN-j', 'two_truths', 'active');
insert into public.rounds (id, game_id, round_number, status, participant_ids) values
  ('$RND3', '$GJ', 1, 'pending', '{}'), ('$RND4', '$GJ', 2, 'pending', '{}');
SQL
start_gate
PGAPPNAME="$APP-rblock" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select 1 from public.rounds where id = '$RND3' for update;
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
RBLOCK_PID=$!
wait_for "the blocker holds the first round" "select exists (select 1 from pg_stat_activity where application_name = '$APP-rblock' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_J1="$OUT_DIR/out_j1"
PGAPPNAME="$APP-act1" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.activate_ttl_round('$GJ', '$RND3', 1)->>'status'" >"$OUT_J1" 2>&1 &
ACT1_PID=$!
wait_blocked "the first activation is stuck on the first round" act1 rblock
OUT_J="$OUT_DIR/out_j"
PGAPPNAME="$APP-act2" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.activate_ttl_round('$GJ', '$RND4', 2)->>'status'" >"$OUT_J" 2>&1 &
ACT2_PID=$!
wait_blocked "the second activation waits for the first (the games row lock)" act2 act1
open_gate
reap "$RBLOCK_PID" "round blocker (case J)"
reap "$ACT1_PID" "first activation (case J)"
reap "$ACT2_PID" "second activation (case J)"
[ "$(tr -d '[:space:]' <"$OUT_J1")" = "activated" ] || fail "case J: the first activation did not apply (got $(cat "$OUT_J1"))"
[ "$(tr -d '[:space:]' <"$OUT_J")" = "round_active" ] || fail "case J: the second activation did not see the first round active (got $(cat "$OUT_J"))"
[ "$(psqlq -c "select status from public.rounds where id = '$RND4'")" = "pending" ] || fail "case J: the second round was opened"

# ---- Case K: a join vs a host leave that may finish the game (remove_player_if_game_open, p_host_leave) --------------
# The host-leave path takes the games row FOR UPDATE, which conflicts with the KEY SHARE a join holds through its foreign
# key. Without it the successor check could miss a join that commits right after it and finish the game over a seated joiner.
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GK', 'lock test K', 'tok-$RUN-k', 'uno', 'waiting');
insert into public.players (id, game_id, name) values ('$HOSTK', '$GK', 'Host');
update public.games set host_player_id = '$HOSTK' where id = '$GK';
SQL
start_gate
# A join in flight holds exactly the KEY SHARE its foreign key takes on the games row; it is taken explicitly here because
# the lobby's AFTER INSERT trigger (players_touch_game_activity) would otherwise also take a NO KEY UPDATE lock, which
# would hide whether the host-leave lock itself conflicts. The joiner appears (and commits) only after the gate opens.
PGAPPNAME="$APP-joink" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select 1 from public.games where id = '$GK' for key share;
  select pg_advisory_xact_lock($GATE);
  insert into public.players (id, game_id, name) values ('$JOINERK', '$GK', 'Joiner');
  commit;" >/dev/null 2>&1 &
JOINK_PID=$!
wait_for "the join holds its KEY SHARE (case K)" "select exists (select 1 from pg_stat_activity where application_name = '$APP-joink' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_K="$OUT_DIR/out_k"
PGAPPNAME="$APP-hostleave" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.remove_player_if_game_open('$GK', '$HOSTK', p_host_leave => true, p_sessions_played => 1)->>'status'" >"$OUT_K" 2>&1 &
HOSTLEAVE_PID=$!
wait_blocked "the host leave waits for the join (the games row lock)" hostleave joink
open_gate
reap "$JOINK_PID" "join (case K)"
reap "$HOSTLEAVE_PID" "host leave (case K)"
[ "$(tr -d '[:space:]' <"$OUT_K")" = "deleted" ] || fail "case K: the host leave finished the game over a seated joiner (got $(cat "$OUT_K"))"
[ "$(psqlq -c "select status from public.games where id = '$GK'")" = "waiting" ] || fail "case K: the game was finished"
[ "$(psqlq -c "select count(*) from public.players where game_id = '$GK'")" = "1" ] || fail "case K: the joiner was lost"

# ---- Case L: a join vs a finish that is committing (the seat is never inserted into the finished game) --------------
# The join handler reads the status and inserts in separate calls; the insert's BEFORE trigger re-checks the status under the
# games row lock. A finish that holds the row (uncommitted) makes the join WAIT, and once it commits the join is refused.
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GL', 'lock test L', 'tok-$RUN-l', 'uno', 'waiting');
SQL
start_gate
PGAPPNAME="$APP-finl" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  update public.games set status = 'finished', result_reason = 'host_ended', finished_at = clock_timestamp() where id = '$GL';
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
FINL_PID=$!
wait_for "the finish holds its uncommitted update (case L)" "select exists (select 1 from pg_stat_activity where application_name = '$APP-finl' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_L="$OUT_DIR/out_l"
PGAPPNAME="$APP-joinl" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "insert into public.players (id, game_id, name) values ('$JOINERL', '$GL', 'Joiner')" >"$OUT_L" 2>&1 &
JOINL_PID=$!
wait_blocked "the join waits for the finish (the games row lock)" joinl finl
open_gate
reap "$FINL_PID" "finish (case L)"
# The join must FAIL (nonzero exit) with the trigger's own ERROR diagnostic: a NOTICE that merely mentions it, or a join that
# was skipped silently, would not do. `wait` is checked explicitly so `set -e` cannot skip the check.
JOINL_RC=0
wait "$JOINL_PID" || JOINL_RC=$?
[ "$JOINL_RC" -ne 0 ] || fail "case L: the join succeeded (exit 0) into a game its host ended"
grep -q "ERROR:.*game_finished:" "$OUT_L" || fail "case L: the join was not refused by the trigger (got $(cat "$OUT_L"))"
[ "$(psqlq -c "select count(*) from public.players where game_id = '$GL'")" = "0" ] || fail "case L: a seat was inserted into the finished game"

# ---- Case P: a session writer that does not take the games row (the application's round claims) vs a leave -------------
# The leave takes the SESSION row lock itself, so it waits for a writer that is committing and then works on the committed row
# (here: the turn the writer advanced decides which player replaces the leaving prompt setter).
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GP', 'lock test P', 'tok-$RUN-p', 'word_rush', 'active');
insert into public.players (id, game_id, name) values ('$WRSEAT6', '$GP', 'SetterLeaver'), ('$WRKEEP4', '$GP', 'B'), ('$WRKEEP5', '$GP', 'C');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, phase, roster, prompt_setter_player_id, turn_index)
  values ('$WRSESS6', '$GP', 'individual', 'manual', 1, 3, 60, 'awaiting_prompt', array['$WRSEAT6'::uuid, '$WRKEEP4'::uuid, '$WRKEEP5'::uuid], '$WRSEAT6', 0);
SQL
start_gate
PGAPPNAME="$APP-writer" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  update public.word_rush_sessions set turn_index = 1 where id = '$WRSESS6';
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
WRITER_PID=$!
wait_for "the writer holds its uncommitted session update (case P)" "select exists (select 1 from pg_stat_activity where application_name = '$APP-writer' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_P="$OUT_DIR/out_p"
PGAPPNAME="$APP-leavep" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.word_rush_remove_player('$GP', '$WRSEAT6')->>'status'" >"$OUT_P" 2>&1 &
LEAVEP_PID=$!
wait_blocked "the leave waits for the session writer (the session row lock)" leavep writer
open_gate
reap "$WRITER_PID" "session writer (case P)"
reap "$LEAVEP_PID" "leave (case P)"
[ "$(tr -d '[:space:]' <"$OUT_P")" = "left" ] || fail "case P: expected left, got '$(cat "$OUT_P")'"
# turn 1 over the roster without the leaver [B, C] picks C (reading the stale turn 0 would pick B)
[ "$(psqlq -c "select prompt_setter_player_id from public.word_rush_sessions where id = '$WRSESS6'")" = "$WRKEEP5" ] || fail "case P: the setter was chosen from a stale session"

echo "ok"
