# Held migrations

Migrations here are NOT applied by `supabase db push` (it only reads `supabase/migrations`).

- `20261130130000_sec_gofish_hide_hands_and_ocean.sql` — Go Fish: revokes `ocean` and `cards` from the
  public key. Held out of the release that shipped the Go Fish web changes because it revokes columns an
  installed mobile build may still request, and `MOBILE_ROLLOUT_ACK` was not set for Production.
  Already applied to Preview (`dev`), so it must stay in `supabase/migrations` on `dev`.

To release it: once a compatible mobile build is out, `git mv` it back to `supabase/migrations` on a branch
off `main`, set `MOBILE_ROLLOUT_ACK=20261130130000` on the Production environment, and merge. The deploy
uses `--include-all`, so an older timestamp than already-applied migrations is fine.
