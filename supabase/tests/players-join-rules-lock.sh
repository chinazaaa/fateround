#!/usr/bin/env bash
# Multi-session regression test for the locking in public.players_enforce_join_rules()
# (supabase/migrations/20261203700000_players_join_rules_trigger.sql).
#
#   DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/players-join-rules-lock.sh
#
# Before the trigger, POST /api/players counted seats / looked the name up and then inserted, so simultaneous
# joins all passed the check: 9 joins into a 4-seat lobby seated 6-9, 4 joins with one name created 4 rows.
#
# Case 1 (seat cap) and case 2 (name) are deterministic. Session A inserts a player and keeps its transaction
# open; session B is a second join into the same game. The test asserts that B is observed WAITING on a lock
# held by A (so it cannot have counted / looked up before A's row exists), and that once A commits B is refused
# with PJ001 (full) / PJ002 (name taken) instead of being admitted. Without the trigger B does not wait, so the
# test fails there.
# Case 3 is a stampede: N sessions are parked on an advisory-lock gate, all seen waiting, then released at the
# same instant. Exactly max_players are seated and exactly one 'Same' exists; in a team game every 'Same' is kept.
# Sessions are coordinated through pg_locks / pg_stat_activity, not timing. Fixtures are committed (sessions
# cannot share a transaction) and removed on exit.
set -euo pipefail

DB="${DB:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
psqlq() { psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A "$@"; }
# A join as a bare session: prints the SQLSTATE + message of a refusal (verbose errors), nothing on success.
join_sql() { # game name
  echo "insert into public.players (game_id, name) values ('$1', '$2');"
}

cleanup() { psqlq -c "delete from public.games where id in ('PJLKA','PJLKB','PJLKC','PJLKD','PJLKE')" >/dev/null 2>&1 || true; }
GATE_DIR=""
GATE_PID=""
GATE_FD_OPEN=0
GATE_KEY=7770101
trap 'gate_release; [ -n "$GATE_PID" ] && kill "$GATE_PID" 2>/dev/null || true; [ -n "$GATE_DIR" ] && rm -rf "$GATE_DIR"; cleanup' EXIT
fail() { gate_release; echo "players-join-rules-lock: FAILED - $*" >&2; exit 1; }

# Poll until a query returns a row; gives up after ~10 s.
wait_for() {
  local sql="$1" i
  for i in $(seq 1 100); do
    [ -n "$(psqlq -c "$sql")" ] && return 0
    sleep 0.1
  done
  return 1
}

# The gate: a long-lived session (fed through a FIFO) that holds an exclusive advisory lock until told to let go.
gate_start() {
  GATE_DIR=$(mktemp -d)
  mkfifo "$GATE_DIR/in"
  PGAPPNAME=pj_gate psql "$DB" -v ON_ERROR_STOP=1 -X -q -t -A <"$GATE_DIR/in" >/dev/null &
  GATE_PID=$!
  exec 3>"$GATE_DIR/in"
  GATE_FD_OPEN=1
  echo "select pg_advisory_lock($GATE_KEY);" >&3
  wait_for "select 1 from pg_locks l join pg_stat_activity a on a.pid = l.pid
            where a.application_name = 'pj_gate' and l.locktype = 'advisory' and l.granted limit 1" \
    || fail "the gate session never took its advisory lock"
}
gate_release() {
  if [ "$GATE_FD_OPEN" = "1" ]; then
    GATE_FD_OPEN=0
    echo "select pg_advisory_unlock($GATE_KEY);" >&3 2>/dev/null || true
    exec 3>&-
  fi
}

cleanup
psqlq <<SQL
insert into public.games (id, title, host_token, game_type, status, max_players) values
  ('PJLKA', 'pj lock cap',        'h', 'uno', 'waiting', 2),
  ('PJLKB', 'pj lock name',       'h', 'uno', 'waiting', 6),
  ('PJLKC', 'pj stampede cap',    'h', 'uno', 'waiting', 4),
  ('PJLKD', 'pj stampede name',   'h', 'uno', 'waiting', 8),
  ('PJLKE', 'pj stampede team',   'h', 'uno', 'waiting', 4);
update public.games set uno_team_mode = true where id = 'PJLKE';
SQL

# ---------------------------------------------------------------------------------------------------------
# Cases 1 and 2: session A holds an uncommitted join; session B must wait for it, then be refused.
# ---------------------------------------------------------------------------------------------------------
two_session_case() { # label game a_name b_name seed_name expected_code
  local label="$1" game="$2" a_name="$3" b_name="$4" seed="$5" expect="$6"
  [ -z "$seed" ] || psqlq -c "$(join_sql "$game" "$seed")" >/dev/null
  gate_start

  # A: join, then park on the gate with the transaction (and the game lock the trigger took) still open.
  PGAPPNAME=pj_A psqlq >/dev/null <<SQL &
begin;
$(join_sql "$game" "$a_name")
select pg_advisory_xact_lock($GATE_KEY);
commit;
SQL
  local a_pid=$!
  wait_for "select 1 from pg_locks l join pg_stat_activity a on a.pid = l.pid
            where a.application_name = 'pj_A' and l.locktype = 'advisory' and not l.granted limit 1" \
    || { gate_release; fail "$label: session A never reached the gate with its join inserted"; }

  # B: the competing join. Refusals are read from the verbose error (SQLSTATE).
  local b_out; b_out=$(mktemp)
  PGAPPNAME=pj_B psql "$DB" -X -q -t -A -v VERBOSITY=verbose -c "$(join_sql "$game" "$b_name")" >"$b_out" 2>&1 &
  local b_pid=$!

  local saw_waiting=0 i
  for i in $(seq 1 100); do
    if [ -n "$(psqlq -c "select 1 from pg_locks l join pg_stat_activity a on a.pid = l.pid
                           where a.application_name = 'pj_B' and not l.granted limit 1")" ]; then
      saw_waiting=1
      break
    fi
    kill -0 "$b_pid" 2>/dev/null || break
    sleep 0.1
  done
  if [ "$saw_waiting" != "1" ]; then
    gate_release; wait "$b_pid" 2>/dev/null || true; wait "$a_pid" 2>/dev/null || true
    fail "$label: the second join did not wait for the first (it returned '$(tr -d '\n' <"$b_out")' without blocking)"
  fi

  gate_release   # B is waiting on A's lock: let A commit
  wait "$a_pid"
  wait "$b_pid" || true
  grep -q "$expect" "$b_out" || fail "$label: expected the second join to be refused with $expect, got: $(tr -d '\n' <"$b_out")"
  rm -f "$b_out"
  kill "$GATE_PID" 2>/dev/null || true; wait "$GATE_PID" 2>/dev/null || true
  rm -rf "$GATE_DIR"; GATE_DIR=""; GATE_PID=""
}

# Case 1: cap 2, one seat already taken; A takes the last seat, B must see it and be refused.
two_session_case "seat cap" PJLKA "A" "B" "Seed" "PJ001"
SEATED=$(psqlq -c "select count(*) from public.players where game_id='PJLKA' and spectator=false")
[ "$SEATED" = "2" ] || fail "seat cap: expected 2 seated, found $SEATED"

# Case 2: A takes the name 'Same'; B asks for 'same' and must see it.
two_session_case "name" PJLKB "Same" "same" "" "PJ002"
NAMED=$(psqlq -c "select count(*) from public.players where game_id='PJLKB' and lower(name)='same'")
[ "$NAMED" = "1" ] || fail "name: expected 1 'Same', found $NAMED"

# ---------------------------------------------------------------------------------------------------------
# Case 3: stampede. N joins released at the same instant.
# ---------------------------------------------------------------------------------------------------------
stampede() { # game count name_prefix ("" = every racer a different name; otherwise all share the name)
  local game="$1" n="$2" shared="$3" pids=() i name
  gate_start
  for i in $(seq 1 "$n"); do
    name="${shared:-Racer$i}"
    PGAPPNAME="pj_race" psql "$DB" -X -q -t -A -v VERBOSITY=verbose >"$GATE_DIR/r$i" 2>&1 <<SQL &
select pg_advisory_lock_shared($GATE_KEY); select pg_advisory_unlock_shared($GATE_KEY);
$(join_sql "$game" "$name")
SQL
    pids+=($!)
  done
  wait_for "select 1 from pg_stat_activity a where a.application_name = 'pj_race'
              and (select count(*) from pg_locks l where l.pid = a.pid and l.locktype = 'advisory' and not l.granted) > 0
            group by 1 having count(*) = $n" \
    || { gate_release; fail "stampede $game: the $n sessions never all reached the gate"; }
  gate_release
  for p in "${pids[@]}"; do wait "$p" || true; done
}

ROUNDS=5
for round in $(seq 1 $ROUNDS); do
  psqlq -c "delete from public.players where game_id in ('PJLKC','PJLKD','PJLKE')" >/dev/null

  stampede PJLKC 9 ""
  SEATED=$(psqlq -c "select count(*) from public.players where game_id='PJLKC' and spectator=false")
  [ "$SEATED" = "4" ] || fail "stampede cap (round $round): 9 simultaneous joins into 4 seats seated $SEATED, expected exactly 4"
  REFUSED=$(grep -l "PJ001" "$GATE_DIR"/r* | wc -l | tr -d ' ')
  [ "$REFUSED" = "5" ] || fail "stampede cap (round $round): expected 5 PJ001 refusals, saw $REFUSED"
  kill "$GATE_PID" 2>/dev/null || true; wait "$GATE_PID" 2>/dev/null || true; rm -rf "$GATE_DIR"; GATE_DIR=""; GATE_PID=""

  stampede PJLKD 4 "Same"
  NAMED=$(psqlq -c "select count(*) from public.players where game_id='PJLKD' and lower(name)='same'")
  [ "$NAMED" = "1" ] || fail "stampede name (round $round): 4 simultaneous joins named 'Same' created $NAMED rows, expected exactly 1"
  kill "$GATE_PID" 2>/dev/null || true; wait "$GATE_PID" 2>/dev/null || true; rm -rf "$GATE_DIR"; GATE_DIR=""; GATE_PID=""

  stampede PJLKE 4 "Same"
  NAMED=$(psqlq -c "select count(*) from public.players where game_id='PJLKE' and lower(name)='same'")
  [ "$NAMED" = "4" ] || fail "stampede team (round $round): team game should keep all 4 'Same' joins, found $NAMED"
  kill "$GATE_PID" 2>/dev/null || true; wait "$GATE_PID" 2>/dev/null || true; rm -rf "$GATE_DIR"; GATE_DIR=""; GATE_PID=""
done

echo "players-join-rules-lock: OK (2nd join waits then is refused; $ROUNDS stampedes: 9->4 seats, 4x 'Same'->1, team 4x 'Same'->4)"
