# Mafia → Wolvesville-style Redesign (Plan)

Status: Phase 1 (core mechanics rewrite) implemented; Phases 2-3 not started.

## Why / scope
User wants a full rewrite of the Mafia game (mechanics + UI, web + mobile) to feel like Wolvesville: richer roles, real night/day/vote flow, layered chat, and optionally the social meta-layer (avatars, clans, leveling, currency, battle pass). This is a multi-week effort, not a single PR — this doc breaks it into independently shippable phases.

## Current state (audited 2026-07-25)
- Engine: `src/lib/mafia.ts` — 4 roles only (villager/mafia/doctor/detective), plurality-vote night/day resolution, single win check (mafia parity).
- Types: `src/types/index.ts:1839-1902`.
- API: `src/app/api/mafia/[code]/{state,host-state,advance,night-action,vote,chat}/route.ts`.
- Web UI: `src/components/mafia/{MafiaHostView,MafiaPlayerView,MafiaPhaseCard,MafiaIdentityPanel,MafiaPlayersGrid,MafiaChat}.tsx`.
- Mobile: `MafiaHostScreen.tsx` (211 lines), `MafiaPlayerView.tsx` (601 lines) — behind web on chat-scope edge cases and viewer/spectator flow per `docs/mobile-web-parity-plan.md:666`.
- Migrations: `20260706110000_mafia.sql` (sessions/player_states, 4 roles baked into enum-less text columns), `20260706115000_mafia_chat.sql`.
- No existing doc mentions Wolvesville or a social/meta layer for any game — this would be net-new.
- Legacy note: `parseGameType` treats `'werewolf'` as an alias for `'mafia'` — worth resolving/cleaning during rewrite, not carrying forward silently.

## Wolvesville reference (researched 2026-07-25)
- Loop: Night (private role actions) → Day (open discussion) → Voting (majority-based, ties = no lynch) → repeat.
- Rooms are role-set driven, fixed sizes (9/16/25), not arbitrary player counts.
- ~150 roles across Village / Werewolf / Solo-neutral / special-condition (Lover pair, Fool-wins-if-lynched, Lurker-inherits-team). We do NOT need 150 — see phasing below.
- Chat is layered: day/alive chat, private wolf-night chat, separate dead/ghost chat — our current 3-channel model (day/mafia/ghost) already matches this shape; the gap is which roles can read which channel simultaneously (mobile parity gap flagged in the audit).
- Social/meta layer (avatars, clans, XP, gold/gems currency, battle pass, voice) is a big separate product surface, not specific to Mafia — overlaps with existing parked plans ([Platform features master plan](../memory placeholder), clubs, high-scores/leaderboards). Treat as **out of scope for the Mafia rewrite itself**; only reuse pieces once they exist platform-wide.

## Recommended phasing

**Phase 1 — Core mechanics rewrite (engine + API)**
- Expand role model beyond the current 4: add at least a solo/neutral role (e.g. Jester/Fool-style "wins if lynched"), a Cupid/Lovers mechanic, and 1-2 more werewolf-team variants (e.g. Alpha Wolf with a private wolf-day message). Target ~10-12 roles, not 150 — enough to feel like Wolvesville without an unbounded content backlog.
- Rework win-condition checker to handle multiple simultaneous win types (team win, solo win, lovers win).
- Add majority-based (not plain plurality) day vote with explicit "no lynch on tie" rule, matching Wolvesville's voting behavior — this is a real behavior change from current `resolveMafiaDayVote`.
- New migration(s): extend `mafia_player_states`/`mafia_sessions` for new role fields (e.g. `lover_pair_id`, role enum expansion) and any new phase needed for Lovers reveal.

**Phase 2 — UI/UX rewrite (web first, then mobile per project convention)**
- Redesign role-reveal, night-action, day-discussion, and voting screens to match the Wolvesville flow described above (bigger role-identity moment, clearer night target picker, live majority tracker on voting).
- Fix the known mobile chat-scope gap (alive mafia should see both wolf-chat and day-chat) while doing this, since it's directly in scope.
- Add missing mobile-parity items already tracked: vote pips, vote-count-on-roster, join-as-viewer/spectator flow, ALIVE/ELIMINATED badges (`docs/mobile-web-parity-plan.md:666-677`).

**Phase 3 (optional, separate proposal) — Social/meta layer**
- Avatars, clans, leveling, currency/shop, battle pass. Not Mafia-specific — would be a platform-wide feature spanning [Platform features master plan] and [Pricing packages draft]. Recommend scoping this as its own proposal only if the user wants Mafia to be the pilot for platform-wide progression systems.

## Open questions for user before Phase 1 starts
1. Target role count/list — approve a concrete ~10-12 role list (with names/effects) before engine work starts.
2. Room-size model — keep arbitrary player counts (current `MAFIA_MIN_PLAYERS=5` / `MAFIA_MAX_PLAYERS=16`) or move to Wolvesville's fixed role-set-driven sizes?
3. Is Phase 3 (social/meta) wanted at all right now, or explicitly deferred?
