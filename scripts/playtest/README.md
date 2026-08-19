# Redaction playtests

End-to-end gameplay checks for the hidden-state games. Unlike the unit tests, these drive the
**real API routes** against a running app, so they cover the authorization branches that a test
re-implementing the masking by hand cannot.

## Running

```sh
supabase start && supabase db reset
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key> \
SUPABASE_SERVICE_ROLE_KEY=<local service key> \
npm run dev
node scripts/playtest/redaction-playtest.mjs      # all 7 games: create → join → start → assert
node scripts/playtest/word-holder-playtest.mjs    # describe_it / quick_draw: word only to its holder
node scripts/playtest/two-truths-playtest.mjs     # submit → start → guess → reveal
node scripts/playtest/codewords-playtest.mjs      # roles → start → key only to spymasters
```

Get the local keys from `supabase status`.

## What each asserts

Both directions, always:

- the secret is **not** readable by `anon` (leak), and
- the game still **works** — non-secret columns readable, `start` returns 200, the session row is
  created, and the rightful holder still receives the secret (break).

A revoke that breaks the game fails these just as loudly as one that leaks.

## Gotchas found writing these

- `anon` denials surface as **401**, not 403. Assert "not 200", not a specific code.
- Codewords masks the key **element-wise**: non-spymasters get `key: [null × 25]`, preserving the
  array shape. Checking for the presence of a `key` field reports a false leak — check for a
  non-null *element*.
- `ttl_round_lies.lie_index` is the index into the **shuffled** statement order, so it will not
  match the `lieIndex` that was submitted. That is by design (`two-truths.test.ts:25`).
- Two Truths cannot start until every player has submitted statements; the "Need at least 3
  players to submit their statements" error is legitimate then, and is *also* the signature of the
  #838 revoke regression. Submit statements first, or the test cannot tell the two apart.
- Codewords needs `participant_mode: 'joiners'`, else creation 400s asking for a participant list.
