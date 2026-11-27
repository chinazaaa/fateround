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
# Case G (a Word Rush roster restore vs a committing seat removal): the restore shares the removal's games row lock, so it
# waits and then answers `no_seat`; a restored roster entry never outlives a committed seat delete.
#
# Case H (the opposite order): a seat delete behind a roster restore waits for it, then deletes the seat AND clears the roster
# entry, so no entry outlives a committed seat delete.
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
GA="SHA$RUN"; GB="SHB$RUN"; GC="SHC$RUN"; GD="SHD$RUN"; GE="SHE$RUN"; GF="SHF$RUN"; GG="SHG$RUN"; GH="SHH$RUN"; GI="SHI$RUN"
new_uuid() { psqlq -c "select gen_random_uuid()"; }
HOST="$(new_uuid)"; OTHER="$(new_uuid)"; JOINER="$(new_uuid)"; GONE="$(new_uuid)"; OTHER2="$(new_uuid)"; SEATED="$(new_uuid)"; NOMINEE="$(new_uuid)"; TTHOST="$(new_uuid)"; TTSUB="$(new_uuid)"; WRSEAT="$(new_uuid)"; WRKEEP="$(new_uuid)"; WRSESS="$(new_uuid)"; WRSESS2="$(new_uuid)"; RND1="$(new_uuid)"; RND2="$(new_uuid)"; WRSEAT2="$(new_uuid)"
WORKERS=()
# Every worker's output lives in ONE run-specific directory that cleanup removes (no temp files are left behind).
OUT_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$OUT_DIR"
  psqlq -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name like '$APP-%' and pid <> pg_backend_pid()" >/dev/null 2>&1 || true
  psqlq -c "delete from public.games where id in ('$GA', '$GB', '$GC', '$GD', '$GE', '$GF', '$GG', '$GH', '$GI')" >/dev/null 2>&1 || true
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
OUT_R="$OUT_DIR/out_r"
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
wait_for "the spectator update of the nominee waits for the settlement" "select exists (select 1 from pg_stat_activity where application_name = '$APP-flag2' and wait_event_type = 'Lock')"
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
wait_for "the start is stuck on the submitter row" "select exists (select 1 from pg_stat_activity where application_name = '$APP-start' and wait_event_type = 'Lock')"
OUT_F="$OUT_DIR/out_f"
PGAPPNAME="$APP-endf" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.end_game_if_host_alone('$GF', '$TTHOST', '$SESSION_TS', 1, false)->>'status'" >"$OUT_F" 2>&1 &
ENDF_PID=$!
wait_for "end_game_if_host_alone waits for the start" "select exists (select 1 from pg_stat_activity where application_name = '$APP-endf' and wait_event_type = 'Lock')"
[ "$(psqlq -c "select status from public.games where id = '$GF'")" = "waiting" ] || fail "case F: the game changed while the start was in flight"
open_gate
reap "$BLOCKER_PID" "blocker"
reap "$START_PID" "two truths start: $(cat "$OUT_START")"
reap "$ENDF_PID" "end_game_if_host_alone (case F)"
[ "$(cat "$OUT_START")" = "started" ] || fail "case F: the start did not complete: '$(cat "$OUT_START")'"
[ "$(cat "$OUT_F")" = "continue" ] || fail "case F: expected 'continue' (the submitter plays), got '$(cat "$OUT_F")'"
[ "$(psqlq -c "select status from public.games where id = '$GF'")" = "active" ] || fail "case F: the started game was finished from an intermediate roster"

# ---- Case G: a Word Rush roster restore vs a seat removal that is committing ------------------------------------
# remove_player_if_game_open() deletes the seat under the games row lock; word_rush_restore_roster_member() takes the
# SAME lock first, so it is observed WAITING on the removal and then finds no seat (`no_seat`): a restored roster entry
# can never outlive a committed seat delete. Without the shared lock the restore would see the (not yet committed)
# delete as still seated and put the player back on the roster.
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GG', 'lock test G', 'tok-$RUN-g', 'word_rush', 'active');
insert into public.players (id, game_id, name) values ('$WRSEAT', '$GG', 'Leaver'), ('$WRKEEP', '$GG', 'Stays');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, roster)
  values ('$WRSESS', '$GG', 'individual', 'automatic', 1, 3, 60, array['$WRKEEP'::uuid]);
SQL
start_gate
PGAPPNAME="$APP-rm" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  select public.remove_player_if_game_open('$GG', '$WRSEAT');
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
RM_PID=$!
wait_for "the removal holds its uncommitted delete" "select exists (select 1 from pg_stat_activity where application_name = '$APP-rm' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_G="$OUT_DIR/out_g"
PGAPPNAME="$APP-restore" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.word_rush_restore_roster_member('$GG', '$WRSESS', '$WRSEAT', 0, false, null, null, 0)->>'status'" >"$OUT_G" 2>&1 &
RESTORE_PID=$!
wait_for "the restore waits for the removal (the games row lock)" "select exists (select 1 from pg_stat_activity where application_name = '$APP-restore' and wait_event_type = 'Lock')"
open_gate
reap "$RM_PID" "removal (case G)"
reap "$RESTORE_PID" "restore (case G): $(cat "$OUT_G")"
[ "$(cat "$OUT_G")" = "no_seat" ] || fail "case G: expected 'no_seat', got '$(cat "$OUT_G")'"
[ "$(psqlq -c "select cardinality(roster) from public.word_rush_sessions where id = '$WRSESS'")" = "1" ] || fail "case G: the roster gained a player whose seat was deleted"

# ---- Case H: a seat delete behind a roster restore (the opposite order of case G) -------------------------------
# Two leaves of the same player overlap: the first one's compensating restore re-adds the roster entry and is still
# committing when the second one's seat delete arrives. The delete waits for the restore (the games row lock), then
# deletes the seat AND takes the player off the roster, so no roster entry outlives the committed seat delete.
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$GH', 'lock test H', 'tok-$RUN-h', 'word_rush', 'active');
insert into public.players (id, game_id, name) values ('$WRSEAT2', '$GH', 'Leaver');
insert into public.word_rush_sessions (id, game_id, mode, prompt_mode, num_teams, total_rounds, turn_seconds, roster)
  values ('$WRSESS2', '$GH', 'individual', 'automatic', 1, 3, 60, '{}');
SQL
start_gate
PGAPPNAME="$APP-restore2" psql "$DB" -v ON_ERROR_STOP=1 -X -q -c "
  begin;
  do \$\$ begin
    if (public.word_rush_restore_roster_member('$GH', '$WRSESS2', '$WRSEAT2', 0, false, null, null, 0)->>'status') is distinct from 'restored' then
      raise exception 'case H: the restore did not restore';
    end if;
    if not exists (select 1 from public.word_rush_sessions where id = '$WRSESS2' and '$WRSEAT2'::uuid = any (roster)) then
      raise exception 'case H: the restored entry is not on the roster inside the restore transaction';
    end if;
  end \$\$;
  select pg_advisory_xact_lock($GATE);
  commit;" >/dev/null 2>&1 &
RESTORE2_PID=$!
wait_for "the restore holds its uncommitted roster write" "select exists (select 1 from pg_stat_activity where application_name = '$APP-restore2' and wait_event_type = 'Lock' and wait_event = 'advisory')"
OUT_H="$OUT_DIR/out_h"
PGAPPNAME="$APP-rm2" psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A -c "select public.remove_player_if_game_open('$GH', '$WRSEAT2')->>'status'" >"$OUT_H" 2>&1 &
RM2_PID=$!
wait_for "the seat delete waits for the restore (the games row lock)" "select exists (select 1 from pg_stat_activity where application_name = '$APP-rm2' and wait_event_type = 'Lock')"
open_gate
reap "$RESTORE2_PID" "restore (case H)"
reap "$RM2_PID" "removal (case H): $(cat "$OUT_H")"
[ "$(cat "$OUT_H")" = "deleted" ] || fail "case H: expected 'deleted', got '$(cat "$OUT_H")'"
[ "$(psqlq -c "select count(*) from public.players where id = '$WRSEAT2'")" = "0" ] || fail "case H: the seat was not deleted"
[ "$(psqlq -c "select cardinality(roster) from public.word_rush_sessions where id = '$WRSESS2'")" = "0" ] || fail "case H: a roster entry outlived the committed seat delete"

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
wait_for "the finish waits for the activation (the games row lock)" "select exists (select 1 from pg_stat_activity where application_name = '$APP-fin' and wait_event_type = 'Lock')"
open_gate
reap "$ACTIVATE_PID" "activation (case I)"
reap "$FIN_PID" "finish (case I)"
[ "$(psqlq -c "select status from public.rounds where id = '$RND1'")" = "active" ] || fail "case I: the activation that won the lock did not apply"
[ "$(psqlq -c "select status from public.games where id = '$GI'")" = "finished" ] || fail "case I: the finish did not apply after the activation"
[ "$(psqlq -c "select public.activate_ttl_round('$GI', '$RND2', 2)->>'status'")" = "not_active" ] || fail "case I: a round was activated in a finished game"
[ "$(psqlq -c "select status from public.rounds where id = '$RND2'")" = "pending" ] || fail "case I: the second round was opened after the finish"
[ "$(psqlq -c "select jsonb_array_length(public.finish_rounds_of_finished_session('$GI', (select finished_at from public.games where id = '$GI'))->'round_ids') ")" = "1" ] || fail "case I: the cleanup did not close exactly the activated round"

echo "ok"
