# Redaction guard

`redaction-guard.sql` asserts the column-level SELECT boundary that the `sec_*` migrations
establish: for every table holding hidden game state, the secret columns must be unreadable by
`anon`/`authenticated`, and **every other column must still be readable** (a re-grant that misses
a column breaks the game just as surely as a leak exposes it).

Run it against a fully migrated database:

```sh
supabase db reset                 # applies every migration from scratch
docker cp supabase/tests/redaction-guard.sql \
  supabase_db_<project-ref>:/tmp/redaction-guard.sql
docker exec supabase_db_<project-ref> \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/redaction-guard.sql
```

Exit code 0 = pass. Any failure raises and exits non-zero, so it drops straight into CI.

## Why `has_column_privilege` and not `information_schema`

`information_schema.column_privileges` only lists grants the *current* role can see, which makes
it quietly wrong here. `has_column_privilege` answers the question the app actually asks.

## The `service_role` check is conditional on purpose

Locally, `service_role` holds no privileges on many migration-created tables, so asserting it
unconditionally produces false failures (10 of them, at the time of writing). The guard therefore
only flags *starvation*: `service_role` reads other columns of the table but not the secret one,
which would mean a migration revoked from it by mistake.

The cause is `20260803160000_default_privileges_lockdown.sql`. It sets, via
`ALTER DEFAULT PRIVILEGES`, `select on tables to anon, authenticated` and `all on tables to
service_role` — and, as its own comment says, "This affects FUTURE objects only; it does not
retroactively change existing grants." So on a local database built by replaying migrations in
order, the grants split strictly by migration timestamp:

| created                      | `anon` SELECT | examples                                                    |
| ---------------------------- | ------------- | ----------------------------------------------------------- |
| **before** `20260803160000`  | no            | `codewords_boards`, `codewords_player_roles`, `ttl_statements` |
| **after** `20260803160000`   | yes           | `notification_subscriptions`, `game_rsvps`, `wordle_room_solutions` |

Hosted projects differ because their default privileges were in force from project creation,
before any migration ran, so the early tables received grants there too. This is why a table can
be unreadable locally and perfectly readable on dev — and why a local-only failure is not
automatically a production bug. Confirm against the hosted project before acting on one.

## Expect failures for games whose revoke has not merged

The `spec` lists every game the redaction work covers, including ones whose migration is still on
an unmerged branch. Run the guard against a database that lacks one of those migrations and it
will report a leak for that table — correctly: the column really is readable there. As of this
commit `uno_sessions` and `whot_sessions` are in that state on `dev`. Their entries stay in the
spec on purpose, so the guard starts passing the moment those land rather than having to be
remembered and re-added.

## Adding a game

Append `{"t":"<table>","s":["<secret col>", ...]}` to the `spec` array. The guard fails if a named
secret column does not exist, so a rename cannot silently un-guard a table.
