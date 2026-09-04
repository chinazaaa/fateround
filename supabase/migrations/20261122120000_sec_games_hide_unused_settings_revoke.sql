-- Revoke anon SELECT on `games` columns that no anon client reads.
--
-- WHY THIS SAVES MONEY
-- A `games` realtime frame is 12,275 bytes per subscriber per UPDATE (measured). Only ~44% of
-- that is data; the rest is the `columns` metadata array — a {name,type} entry for every
-- delivered column, shipped on every event regardless of how little changed. So the saving
-- scales with column COUNT, not value size.
--
-- WHY A REVOKE IS THE ONLY LEVER
-- Publication column lists do NOT narrow a postgres_changes payload. Supabase Realtime decodes
-- via wal2json, which reads the publication only for pubinsert/pubupdate/pubdelete and
-- add-tables; `attnames` is never read (column lists are a pgoutput feature). Measured: applying
-- a 15-column list to `games` moved the frame 12,305 -> 12,304 bytes. The payload is pruned
-- solely by `realtime.apply_rls()`, which filters columns through `has_column_privilege`.
-- A column-level REVOKE is therefore the only thing that shrinks a frame. Measured: revoking 29
-- mafia_* columns moved it 12,305 -> 9,930 bytes (-19.3%).
--
-- WHY THIS SET IS SAFE
-- PostgREST fails an ENTIRE select with 42501 if any requested column is revoked, so a column is
-- only eligible if NO anon select names it. Every column below is absent from both curated select
-- lists — src/lib/supabase-selects.ts (web, 118 columns) and apps/mobile/lib/supabase-selects.ts
-- (mobile, 111 columns) — and has no client-side reader. Remaining references are types,
-- write-side validation, or server routes using the service role, which keeps its grants.
--
-- Realtime is safe by construction: a revoked column is simply absent from the payload, and
-- `mergeRealtimeGame` (src/lib/realtime-merge.ts) skips `undefined` rather than overwriting
-- known state.
--
-- See docs/games-column-revoke-audit.md for the per-column evidence and the rejected list.
--
-- ⚠️  MOBILE: this cannot ship to production without a STORE RELEASE. Expo config is baked into
-- the native binary at build time, so there is no OTA path for an installed build. CI's revoke
-- guard blocks this until its version is named in MOBILE_ROLLOUT_ACK.

revoke select (
  -- AI question generation: server-generated, read only by service-role routes.
  ai_generated_questions,
  ai_questions_config,
  ai_questions_enabled,

  -- Push bookkeeping: written and read only by src/lib/push.ts, server-side.
  last_host_join_push_at,

  -- Mafia role toggles. MafiaHostView does NOT read these off the game row — it builds its
  -- settings object from /api/mafia/<code>/host-state (service role). The four the host LOBBY
  -- panel reads live (advanced_mode, day_seconds, voting_seconds, anonymous_votes) are
  -- deliberately NOT in this list; see the audit doc.
  mafia_alpha_wolf_enabled,
  mafia_arsonist_enabled,
  mafia_aura_seer_enabled,
  mafia_bodyguard_enabled,
  mafia_count,
  mafia_cupid_enabled,
  mafia_cursed_villager_enabled,
  mafia_framer_enabled,
  mafia_jester_enabled,
  mafia_last_roles,
  mafia_little_girl_enabled,
  mafia_mafia_seer_enabled,
  mafia_mayor_enabled,
  mafia_medium_enabled,
  mafia_priest_enabled,
  mafia_red_lady_enabled,
  mafia_seer_enabled,
  mafia_serial_killer_enabled,
  mafia_tracker_enabled,
  mafia_trapper_enabled,
  mafia_vigilante_enabled,
  mafia_witch_enabled,
  mafia_wolf_cub_enabled,

  -- Host analytics counter, incremented server-side.
  sessions_played
) on public.games from anon;
