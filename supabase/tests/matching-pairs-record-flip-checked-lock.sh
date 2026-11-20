#!/usr/bin/env bash
# Two-session regression test for the locking in public.matching_pairs_record_flip_checked()
# (supabase/migrations/20261202900000_matching_pairs_record_flip_checked.sql).
#
#   DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/matching-pairs-record-flip-checked-lock.sh
#
# Session A plays the duplicate cleanup (20261202500000): it takes SHARE ROW EXCLUSIVE on
# memory_match_submissions, deletes one of the player's rows and commits a few seconds later. Session B is a
# flip that read the history BEFORE the cleanup (so its fingerprint is the old one). The test asserts that B
#   - blocks until A commits (it does not read the pre-cleanup history), and
#   - then answers `stale` and inserts nothing.
# Without the table lock in the function B would return immediately and store a score from the superseded
# history. Fixtures are committed (two sessions cannot share a transaction) and removed on exit.
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

# Session A: the cleanup, holding its lock for 3 s before it deletes the earlier row and commits.
psqlq <<SQL &
begin;
lock table public.memory_match_submissions in share row exclusive mode;
select pg_sleep(3);
delete from public.memory_match_submissions where round_id = '$R' and player_id = '$P' and pair_index = 0;
commit;
SQL
A_PID=$!
sleep 1   # let A take its lock

# Session B: the flip that read the old history.
START=$(date +%s.%N)
STATUS=$(psqlq -c "select (public.matching_pairs_record_flip_checked('$G', '$R', '$P', 2, true, 1, 0, 1000, 2, '$LAST_ID'))->>'status'")
ELAPSED=$(echo "$(date +%s.%N) - $START" | bc)
wait "$A_PID"

ROWS=$(psqlq -c "select count(*) from public.memory_match_submissions where round_id='$R' and player_id='$P'")

fail() { echo "matching-pairs-record-flip-checked-lock: FAILED - $*" >&2; exit 1; }
[ "$STATUS" = "stale" ] || fail "expected 'stale', got '$STATUS'"
[ "$ROWS" = "1" ] || fail "expected the cleaned history (1 row) and no insert, found $ROWS rows"
[ "$(echo "$ELAPSED >= 1.5" | bc)" = "1" ] || fail "the flip did not wait for the cleanup (returned after ${ELAPSED}s)"

echo "matching-pairs-record-flip-checked-lock: OK (waited ${ELAPSED}s, stale, nothing inserted)"
