# Feature Backlog

Ideas for future development. Items that have since shipped are listed under
**Shipped** at the bottom.

## Bigger Features

### Video Reveal
Record short video reactions when results are shown using the MediaRecorder API. Upload clips to Supabase Storage. Play back a compilation at the final leaderboard. Significant storage and bandwidth implications.

### Daily / cross-session streaks
**Partially shipped.** The identity layer and the streak engine both landed with trophies:
`profiles.current_streak` / `longest_streak` advance once per WAT day from the award pass
(`src/lib/trophies/streak.ts`), and streak trophies are earnable. What is still open is the
player-facing surface — there is no streak UI on web or mobile yet, no freeze/grace mechanic,
and no reminder. See [trophies-and-streaks.md](./trophies-and-streaks.md).

## Monetization

### Accounts + FateRound+ + Club Pro (Phase 0–1)
Anonymous-first auth (Supabase), email OTP upgrade, `profiles` + `subscriptions` +
entitlements. **FateRound+** — recurring subscription (₦1,000/mo · ₦7,500/yr): raised room
caps, unlimited custom decks/CSV, daily-challenge archive, premium packs/themes, trophy case,
extended clocks. **Club Pro** — ₦3,000/mo per club, paid by the admin, who gets FateRound+
bundled; members stay free (anti-loophole: never auto-grants the whole club +). **Trophies +
streaks** drive account signup and are earned, never sold, on every tier. Payments: Paystack
(Africa) + Stripe (intl). Full spec: [revenue-model.md](./revenue-model.md) ·
[account-tiers.md](./account-tiers.md) · [trophies-and-streaks.md](./trophies-and-streaks.md) ·
[pricing-implementation-plan.md](./pricing-implementation-plan.md).

## Shipped

Previously backlogged, now delivered:

- **Custom Themes** — a `theme` field applied via CSS custom properties (`src/lib/themes.ts`, `useApplyGameTheme`), with a picker in the create wizard.
- **Achievements** — end-of-game badges computed from vote data (`src/lib/achievements.ts`, `AchievementBadges`). _(Only per-game badges — cross-session/daily streaks are still open; see above.)_
- **Rematch History** — previous results captured as `game_snapshots` on finish, with history UI (`RematchHistory`, `/history/[code]`).
- **Timer Music** — intensity-scaled countdown audio tied to `timeLeft` (`playTimerMusic`/`stopTimerMusic` in `src/lib/sounds.ts`), with a mute toggle.
- **Tournament Mode** — brackets & head-to-head across games (`src/lib/tournament-*`, `src/components/tournament/`, `src/app/tournament/`, `supabase/migrations/0097_tournaments.sql` + follow-ups).
- **Custom Game Modes** — host-defined slots (label/emoji/color) via `CustomSlotBuilder` (`src/lib/custom-game.ts`).
- **AI-Generated Questions** — LLM-generated questions across several game types (`src/lib/ai-questions.ts`, `@anthropic-ai/sdk`). _(Theme/prompt-driven; not yet literally personalized to player names.)_
