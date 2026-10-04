# Redaction playtests

End-to-end gameplay checks for the hidden-state games. Unlike the unit tests, these drive the
**real API routes** against a running app, so they cover the authorization branches that a test
re-implementing the masking by hand cannot.

## Running

> **`supabase db reset` DESTROYS the local database** — it drops and recreates it. Anything not
> reproducible from migrations or a seed script is lost. Hosted projects are untouched.

The scripts read their keys from the environment and **exit 2 if either is missing**, rather than
falling back to a default that would make every assertion below pass for the wrong reason.

```sh
supabase start && supabase db reset

# Required — the scripts will not run without these:
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(supabase status -o env | grep NEXT_PUBLIC_SUPABASE_ANON_KEY | cut -d= -f2-)"
export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o env | grep SUPABASE_SERVICE_ROLE_KEY | cut -d= -f2-)"


# REQUIRED. Without this every route 403s and all four harnesses fail at the first request.
# A from-scratch reset leaves service_role with no SELECT on tables created before
# 20260803160000_default_privileges_lockdown.sql — `games` and `players` among them — because
# that migration's ALTER DEFAULT PRIVILEGES applies to FUTURE objects only. Hosted projects do
# not need this; their default privileges predate every migration. See supabase/tests/README.md.
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c 'grant all on all tables in schema public to service_role;'

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key> \
SUPABASE_SERVICE_ROLE_KEY=<local service key> \
npm run dev
```

`npm run dev` runs in the FOREGROUND. Leave it running and use a **second terminal** for the
playtests — chaining them after it would only run once the server exits:

```sh
node scripts/playtest/redaction-playtest.mjs      # all 7 games: create → join → start → assert
node scripts/playtest/word-holder-playtest.mjs    # describe_it / quick_draw: word only to its holder
node scripts/playtest/two-truths-playtest.mjs     # submit → start → guess → reveal
node scripts/playtest/codewords-playtest.mjs      # roles → start → key only to spymasters
node scripts/playtest/late-join-playtest.mjs      # share-link joiner: own hand back, others counts-only
node scripts/playtest/gameplay-playtest.mjs       # whot/uno/crazy_eights: PLAYED past an empty draw pile
```

`gameplay-playtest.mjs` is the only one that takes turns. It needs `PLAYTEST_APP_URL` and
`PLAYTEST_SUPABASE_URL` as well as the two keys, and takes a few minutes — UNO alone deals an
86-card draw pile that has to be played down one turn at a time.

Each script exits non-zero if any assertion fails, so they can be chained with `&&` or used in CI.

Get the local keys from `supabase status`.

## What each asserts

Both directions, always:

- the secret is **not** readable by `anon` (leak), and
- the game still **works** — non-secret columns readable, `start` returns 200, the session row is
  created, and the rightful holder still receives the secret (break).

A revoke that breaks the game fails these just as loudly as one that leaks.

`gameplay-playtest.mjs` additionally, per game:

- plays and draws through the real action routes until the **draw pile runs out**, then asserts
  the reshuffle happened (`draw_count` recovered) and that the game kept accepting moves after it;
- compares `anon`'s `draw_count`/`discard_count` against the service role's
  `jsonb_array_length(draw_pile)`/`(discard_pile)` on **every turn** — the counts are all
  `isDrawPileDepleted` has left to reason with, so a drift between them is the bug;
- finishes a second game by greedy play, and requires a real `winner_player_id`.

## Gotchas found writing these

- `anon` denials surface as **401** locally and **403** hosted. Assert one of those two
  specifically — NOT merely "not 200". A 404, 429 or 500 is _inconclusive_, not proof of
  redaction, and treating it as a pass lets an outage or a rate limit masquerade as a working
  security boundary. `assertDenied` in `_shared.mjs` encodes this.
- Codewords masks the key **element-wise**: non-spymasters get `key: [null × 25]`, preserving the
  array shape. Checking for the presence of a `key` field reports a false leak — check for a
  non-null _element_.
- `ttl_round_lies.lie_index` is the index into the **shuffled** statement order, so it will not
  match the `lieIndex` that was submitted. That is by design (`two-truths.test.ts:25`).
- Two Truths cannot start until every player has submitted statements; the "Need at least 3
  players to submit their statements" error is legitimate then, and is _also_ the signature of the
  #838 revoke regression. Submit statements first, or the test cannot tell the two apart.
- Codewords needs `participant_mode: 'joiners'`, else creation 400s asking for a participant list.
- **A logged status is not an assertion.** The two-truths harness originally logged the guess
  result without failing on it. On a clean database that guess returns 400 ("Round is not
  active" — the first `advance` ACTIVATES the round), so `ttl_guesses` stayed empty and the
  redaction checks that followed passed against zero rows: vacuously true, proving nothing about
  any grant. Every harness now asserts the setup calls succeeded AND that the table has real rows
  before asserting `anon` cannot read them. When adding a check, ask what makes it fail.
- **Whot's draw pile is not always observable at 0.** "General market" deals a card to every
  player inside one request, so a pile of 2 can empty and be refilled between two reads. Asserting
  `draw_count === 0` was seen at some point is flaky; the reshuffle (the count going *up*, which
  nothing but a refill can do) is the sound proof that it ran out.
- **UNO never ends unless the harness calls "UNO".** Without `callUno: true` on the play that
  leaves a player on one card, the next move catches the missed call and penalises them back up.
  A greedy-play run went 300 turns with nobody going out. The flag is ignored on every other play.
- **Draw-only play cannot reach the reshuffle.** Cards only enter the discard by being *played*,
  and the reshuffle refills the draw pile *from* the discard — so a run that only draws exhausts
  the deck outright and exercises the opposite branch. `gameplay-playtest.mjs` alternates.
