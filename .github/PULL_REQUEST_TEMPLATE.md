## Summary

<!-- What does this PR do and why? 1–3 sentences. -->

## Changes

<!-- The key changes, as bullets. -->

-

## Database

<!-- New Supabase migrations? List the file(s) and what they change. Otherwise "None". -->

None

## Testing

<!-- How was this verified? Check what applies. -->

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` passes
- [ ] Manually verified the change in the running app

## Self-review

<!-- Do a dedicated fault-finding pass BEFORE requesting review (run /code-review or read
     the diff adversarially). These are the classes of bug that most often slip through. -->

- [ ] **Failure paths** — every new `await`/fetch/DB read handles the error/empty case (no swallowed errors, no silent empty state that strands the user).
- [ ] **Cross-state** — checked behavior when switching modes/game-types and on re-entry, not just the fresh happy path.
- [ ] **Collection scope** — every `.find`/`.filter` is scoped to the right round/game/player (not the whole unfiltered list).
- [ ] **Web ↔ mobile parity** — matching change made in `apps/mobile` + `packages/shared` if it applies there.
- [ ] **New DB columns/tables** — column-level `GRANT SELECT` added, and added to the relevant `*_SELECT` strings (web **and** mobile).
- [ ] **A11y** — new interactive controls have labels / `aria-pressed` / keyboard handling.

## Screenshots / Notes

<!-- Optional: screenshots for UI changes, follow-ups, or anything reviewers should know. -->
