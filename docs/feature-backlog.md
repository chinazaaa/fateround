# Feature Backlog

Ideas for future development. Items that have since shipped are listed under
**Shipped** at the bottom.

## Bigger Features

### Video Reveal
Record short video reactions when results are shown using the MediaRecorder API. Upload clips to Supabase Storage. Play back a compilation at the final leaderboard. Significant storage and bandwidth implications.

### Daily / cross-session streaks
Per-game achievement badges already ship (see Shipped below). A daily or
cross-session streak system — tracking a player's activity across games and days
— is still unbuilt; it would require player identity / accounts.

## Monetization

### Accounts + Pro + Cosmetics (Phase 0–1)
Anonymous-first auth (Supabase), email OTP upgrade, `profiles.is_pro` + `owned_cosmetics`.
**Pro Host** — one-time ₦1,000 / $2 host utility (add-time, caps, concurrent
rooms/tournaments). **Cosmetics** — primary revenue: premium themes, skins, frames,
seasonal drops (₦200–1,200); sold to any account, **not** bundled in Pro. **Trophies +
streaks** drive account signup (earned, never sold). Payments: Paystack (Africa) + Stripe.
Full spec: [revenue-model.md](./revenue-model.md) · [account-tiers.md](./account-tiers.md) ·
[trophies-and-streaks.md](./trophies-and-streaks.md).

## Shipped

Previously backlogged, now delivered:

- **Custom Themes** — a `theme` field applied via CSS custom properties (`src/lib/themes.ts`, `useApplyGameTheme`), with a picker in the create wizard.
- **Achievements** — end-of-game badges computed from vote data (`src/lib/achievements.ts`, `AchievementBadges`). _(Only per-game badges — cross-session/daily streaks are still open; see above.)_
- **Rematch History** — previous results captured as `game_snapshots` on finish, with history UI (`RematchHistory`, `/history/[code]`).
- **Timer Music** — intensity-scaled countdown audio tied to `timeLeft` (`playTimerMusic`/`stopTimerMusic` in `src/lib/sounds.ts`), with a mute toggle.
- **Tournament Mode** — brackets & head-to-head across games (`src/lib/tournament-*`, `src/components/tournament/`, `src/app/tournament/`, `supabase/migrations/0097_tournaments.sql` + follow-ups).
- **Custom Game Modes** — host-defined slots (label/emoji/color) via `CustomSlotBuilder` (`src/lib/custom-game.ts`).
- **AI-Generated Questions** — LLM-generated questions across several game types (`src/lib/ai-questions.ts`, `@anthropic-ai/sdk`). _(Theme/prompt-driven; not yet literally personalized to player names.)_
