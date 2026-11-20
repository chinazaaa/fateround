#!/usr/bin/env bash
# Two-session regression test for the locking in public.matching_pairs_record_flip_checked()
# (supabase/migrations/20261202900000_matching_pairs_record_flip_checked.sql).
#
#   DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/matching-pairs-record-flip-checked-lock.sh
#
# Session A plays the duplicate cleanup (20261202500000): it takes SHARE ROW EXCLUSIVE on
# memory_match_submissions and keeps its transaction open until the test releases it, then deletes one of the
# player's rows and commits. Session B is a
# flip that read the history BEFORE the cleanup (so its fingerprint is the old one). The test asserts that B
#   - is observed WAITING on A's lock in pg_locks (so it cannot have read the pre-cleanup history), and
#   - then answers `stale` and inserts nothing.
# The sessions are coordinated through pg_locks / pg_stat_activity and an advisory-lock gate, not timing: A is
# held open by the gate, B is started only once A is seen holding its lock, and the gate is opened only once B
# is seen waiting, so no delay on a slow runner can change the outcome. Without the table lock in the function B
# would not wait and would store a score from the superseded history. Fixtures are committed (two sessions
# cannot share a transaction) and removed on exit.
set -euo pipefail

DB="${DB:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
G=MPLCK
P=00000000-0000-0000-0000-00000000d001
R=00000000-0000-0000-0000-00000000d0a1
psqlq() { psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }

cleanup() { psqlq -c "delete from public.games where id = '$G'" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status) values ('$G', 'mp lock test', 'host-mplck', 'matching_pairs', 'active');
insert into public.players (id, game_id, name) values ('$P', '$G', 'P1');
insert into public.rounds (id, game_id, round_number, status, memory_match_metadata)
  values ('$R', '$G', 1, 'active', '{"gridSizePairs":4,"pairs":[],"playerBoards":[]}');
insert into public.memory_match_progress (game_id, round_id, player_id) values ('$G', '$R', '$P');
insert into public.memory_match_submissions (game_id, round_id, player_id, pair_index, is_match, streak_at_time, streak_bonus, points_after)
  values ('$G', '$R', '$P', 0, true, 1, 0, 1000), ('$G', '$R', '$P', 1, false, 0, 0, 900);
SQL

# The fingerprint session B scored from: two rows, the latest of which is `last_id`.
LAST_ID=$(psqlq -c "select id from public.memory_match_submissions where round_id='$R' and player_id='$P' order by submitted_at desc, id desc limit 1")

GATE_KEY=7770001   # advisory lock the test holds to keep session A's transaction open
fail() { release_gate; echo "matching-pairs-record-flip-checked-lock: FAILED - $*" >&2; exit 1; }

# The gate: a long-lived session (fed through a FIFO) that holds the advisory lock until told to let go.
GATE_DIR=$(mktemp -d)
mkfifo "$GATE_DIR/in"
PGAPPNAME=mp_lock_gate psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A <"$GATE_DIR/in" >/dev/null &
GATE_PID=$!
exec 3>"$GATE_DIR/in"
GATE_OPEN=0
release_gate() {
  if [ "$GATE_OPEN" = "0" ]; then
    GATE_OPEN=1
    echo "select pg_advisory_unlock($GATE_KEY);" >&3 2>/dev/null || true
    exec 3>&-
  fi
}
trap 'release_gate; kill "$GATE_PID" 2>/dev/null || true; rm -rf "$GATE_DIR"; cleanup' EXIT

# Poll until a query returns a row (1 = found); gives up after ~10 s.
wait_for() {
  local sql="$1" i
  for i in $(seq 1 100); do
    [ -n "$(psqlq -c "$sql")" ] && return 0
    sleep 0.1
  done
  return 1
}

echo "select pg_advisory_lock($GATE_KEY);" >&3
wait_for "select 1 from pg_locks l join pg_stat_activity a on a.pid = l.pid
          where a.application_name = 'mp_lock_gate' and l.locktype = 'advisory' and l.granted limit 1" \
  || fail "the gate session never took its advisory lock"

# Session A: the cleanup. It takes its table lock and then waits on the gate, so it stays open until released.
PGAPPNAME=mp_lock_A psqlq >/dev/null <<SQL &
begin;
lock table public.memory_match_submissions in share row exclusive mode;
select pg_advisory_xact_lock($GATE_KEY);
delete from public.memory_match_submissions where round_id = '$R' and player_id = '$P' and pair_index = 0;
commit;
SQL
A_PID=$!

wait_for "select 1 from pg_locks l join pg_stat_activity a on a.pid = l.pid
          where a.application_name = 'mp_lock_A' and l.granted and l.mode = 'ShareRowExclusiveLock'
            and l.relation = 'public.memory_match_submissions'::regclass limit 1" \
  || fail "session A never took its lock"

# Session B: the flip that read the old history.
B_OUT=$(mktemp)
PGAPPNAME=mp_lock_B psqlq -c "select (public.matching_pairs_record_flip_checked('$G', '$R', '$P', 2, true, 1, 0, 1000, 2, '$LAST_ID'))->>'status'" >"$B_OUT" &
B_PID=$!

# B must be seen waiting for a lock A holds; if it finished first it did not wait.
SAW_WAITING=0
for i in $(seq 1 100); do
  if [ -n "$(psqlq -c "select 1 from pg_locks l join pg_stat_activity a on a.pid = l.pid
                         where a.application_name = 'mp_lock_B' and not l.granted limit 1")" ]; then
    SAW_WAITING=1
    break
  fi
  kill -0 "$B_PID" 2>/dev/null || break
  sleep 0.1
done
[ "$SAW_WAITING" = "1" ] || { release_gate; wait "$B_PID" 2>/dev/null || true; wait "$A_PID" 2>/dev/null || true; fail "the flip did not wait for the cleanup (it returned '$(cat "$B_OUT")' without blocking on A's lock)"; }

release_gate   # B is waiting on A's lock: let A delete and commit
wait "$B_PID"
wait "$A_PID"
STATUS=$(tr -d '[:space:]' <"$B_OUT")
rm -f "$B_OUT"

ROWS=$(psqlq -c "select count(*) from public.memory_match_submissions where round_id='$R' and player_id='$P'")

[ "$STATUS" = "stale" ] || fail "expected 'stale', got '$STATUS'"
[ "$ROWS" = "1" ] || fail "expected the cleaned history (1 row) and no insert, found $ROWS rows"

echo "matching-pairs-record-flip-checked-lock: OK (flip waited on the cleanup, then stale, nothing inserted)"
