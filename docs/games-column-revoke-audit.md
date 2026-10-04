# `games` column revoke audit

Which `public.games` columns can be revoked from `anon`, and — just as importantly — which cannot.

## Why

A `games` realtime frame is **12,275 bytes per subscriber per UPDATE** (measured, n=5, zero
variance). Only ~44% is data. The rest is the `columns` metadata array: a `{name,type}` entry for
every delivered column, shipped on every event no matter how little changed. **The saving scales
with column count, not value size.**

Publication column lists do **not** help. Supabase Realtime decodes via wal2json, which reads the
publication only for `pubinsert/pubupdate/pubdelete` and `add-tables`; `attnames` is never read
(column lists are a `pgoutput` feature). Measured: a 15-column list on `games` moved the frame
12,305 → 12,304 bytes. The payload is pruned solely by `realtime.apply_rls()` via
`has_column_privilege`, so **a column-level REVOKE is the only lever**. Measured: revoking 29
`mafia_*` columns moved it 12,305 → 9,930 bytes (−19.3%).

## Method

A column is eligible only if **no anon select names it**. PostgREST fails an _entire_ select with
`42501` if any requested column is revoked, so one missed reference breaks every read of that
table — this is what happened in #838.

| set                                                                   | count  |
| --------------------------------------------------------------------- | ------ |
| `games` columns total                                                 | 157    |
| named by web `GAME_SELECT` (`src/lib/supabase-selects.ts`)            | 118    |
| named by mobile `GAME_SELECT` (`apps/mobile/lib/supabase-selects.ts`) | 111    |
| already revoked (`host_token`, `pending_host_nominated_at`)           | 2      |
| **in neither select list**                                            | **34** |
| **rejected on client-reader evidence**                                | **6**  |
| **safe to revoke**                                                    | **28** |

`select('*')` is not a blocker: it already errors for anon and the codebase routes every client
read through the curated lists. `src/lib/supabase-selects.ts` documents this in its header.

## Rejected — and why (this list is the safety argument)

| column                     | reader                                                          | note                      |
| -------------------------- | --------------------------------------------------------------- | ------------------------- |
| `mafia_advanced_mode`      | `src/components/host-lobby/HostMafiaLobbyPanel.tsx:96`          | reads off the `game` prop |
| `mafia_day_seconds`        | `HostMafiaLobbyPanel.tsx:93`                                    | ditto                     |
| `mafia_voting_seconds`     | `HostMafiaLobbyPanel.tsx:94`                                    | ditto                     |
| `mafia_anonymous_votes`    | `HostMafiaLobbyPanel.tsx:95`                                    | ditto; also named by mobile `GAME_SELECT` |
| `host_user_id`             | `LiveGamesStrip.tsx`, `HostThemePicker.tsx`, `useHostToken.ts`  | client-side               |
| `elimination_config`       | `src/app/tournament/[code]/page.tsx`, `src/app/create/page.tsx` | client-side               |
| `wordle_room_custom_words` | `HostWordleRoomLobbyPanel.tsx`                                  | client-side               |

**The `HostMafiaLobbyPanel` case is the one worth understanding**, because it is invisible from
the select lists. Three of its four settings (`mafia_advanced_mode`, `mafia_day_seconds`,
`mafia_voting_seconds`) are in _neither_ list, so REST never returns them — the panel's only
source is the **realtime payload**, which today carries all 155 granted columns regardless of
what any select asks for. The fourth, `mafia_anonymous_votes`, is named by mobile `GAME_SELECT`
(so it never entered the 34-column candidate pool and is not one of the 6 rejected candidates
counted above), but on web it too arrives only via realtime. Revoke them and the panel silently falls back to its defaults
(`?? 90`, `?? 45`) instead of showing saved settings. No error, no test failure, just wrong
numbers in the host's lobby.

To revoke these four later, first add them to web `GAME_SELECT` so they are read explicitly over
REST; the realtime dependency then disappears. That is a separate, safe PR.

## Accepted — 28 columns

**AI question generation (3)** — `ai_generated_questions`, `ai_questions_config`,
`ai_questions_enabled`. Referenced only in `src/types/index.ts`, `src/lib/validation/game.ts`
(write-side), `apps/mobile/lib/game-api.ts` (POST body), and `realtime-merge.ts`'s `TOAST_PRONE`
list (a name in an array, not a read).

**Push bookkeeping (1)** — `last_host_join_push_at`. Sole reference is `src/lib/push.ts`, server.

**Mafia role toggles (23)** — `mafia_alpha_wolf_enabled`, `mafia_arsonist_enabled`,
`mafia_aura_seer_enabled`, `mafia_bodyguard_enabled`, `mafia_count`, `mafia_cupid_enabled`,
`mafia_cursed_villager_enabled`, `mafia_framer_enabled`, `mafia_jester_enabled`,
`mafia_last_roles`, `mafia_little_girl_enabled`, `mafia_mafia_seer_enabled`, `mafia_mayor_enabled`,
`mafia_medium_enabled`, `mafia_priest_enabled`, `mafia_red_lady_enabled`, `mafia_seer_enabled`,
`mafia_serial_killer_enabled`, `mafia_tracker_enabled`, `mafia_trapper_enabled`,
`mafia_vigilante_enabled`, `mafia_witch_enabled`, `mafia_wolf_cub_enabled`.

`MafiaHostView.tsx` looks like a reader but is not: it **builds** its settings object from
`/api/mafia/<code>/host-state` (service role) — see lines 178-185 and 421-428, where
`mafia_aura_seer_enabled` is assigned from `mafiaState.auraSeerEnabled`. Components import
`src/lib/mafia.ts` only for the `MAFIA_MIN_PLAYERS` constant.

**Analytics (1)** — `sessions_played`, incremented server-side.

## Why realtime stays correct

`mergeRealtimeGame` (`src/lib/realtime-merge.ts`) treats an absent column as `undefined` and
**skips it rather than overwriting** known state. A revoked column therefore cannot blank client
state — the behaviour was designed for exactly this shape.

## Expected saving

Removing 28 of 155 delivered columns cuts the column count by ≈18% — a share of the column
list, not of the frame itself. Extrapolating per-column from the measured 29-column revoke
(12,305 → 9,930 bytes, −2,375 bytes), a 28-column set should save roughly **2.3 KB off
12.3 KB (≈19%)** per subscriber per update. This is an unmeasured extrapolation from a
different column set, not a measurement of the final list — see below.

## Not verified

- **The final 28-column set has not been measured.** The −19.3%/29-column figure is from a
  different set. Measure before claiming a number publicly.
- No live playtest against a revoked schema. The shared local stack is in use by other sessions,
  and a previous attempt to apply a revoke there crashed mid-run and broke it for everyone.
- Mobile coverage is established from `apps/mobile/lib/supabase-selects.ts` on `dev`. What an
  already-installed build reads cannot be verified from the repo — this is why the release gate
  below is not optional.

## Release gate

A revoke breaks any installed mobile build that reads the column, and Expo config is baked at
build time, so **there is no OTA rescue** — those users stay broken until a **store release**.
CI's revoke guard (`.github/workflows/ci.yml`, `migrate` job) fails any pending migration
containing a non-comment `revoke` unless its version is listed in `MOBILE_ROLLOUT_ACK`. Ship
order: mobile store release first, then ack this version, then merge.
