# Clubs — Build Spec

Status: **Draft spec — ready to review, then build.** · Created 2026-07-17 ·
Companion to [`account-tiers.md`](./account-tiers.md) (§Clubs — the philosophy this expands),
[`platform-features-master-plan.md`](./platform-features-master-plan.md) (Batch 5),
[`trophies-and-streaks.md`](./trophies-and-streaks.md) (identity foundation),
[`high-scores-leaderboards-plan.md`](./high-scores-leaderboards-plan.md) (scores a club aggregates).

> **What a Club is, in one line:** a named, persistent group with a crest and a roster that turns a
> recurring WhatsApp game-night crew into a first-class thing inside FateRound — with pre-set teams,
> a club leaderboard, seasons, and club game history. It moves the community *off* WhatsApp and gives
> repeat players a reason to keep an account.
>
> **Why it's last (Batch 5):** it depends on the identity foundation (Batch 1) and is far more
> valuable once there are trophies (Batch 3) and daily scores (Batch 4) to aggregate into a club
> leaderboard. Build the thing people join *for* first, then the container.

> **2026-08-02 — pricing model realigned, club-count decision reconfirmed.**
> [`revenue-model.md`](./revenue-model.md) moved from a one-time Pro+Cosmetics model to a
> **FateRound+ / Club Pro subscription** model. Club *creation* is now a paid-tier lever
> (Free 1 → FateRound+ 3 → Club Pro branding/50-member roster, admin-paid), but **joining stays
> unlimited on every tier — reconfirmed, not reopened.** Free club creation is sharpened from 2
> to **1** (see [`account-tiers.md`](./account-tiers.md) §Clubs for the full reasoning: capping
> joins would tax an invited member for someone else's decision, shrink the inviter's own club,
> and break FateRound's invite-driven growth loop at exactly the moment a new user is most
> engaged). §1 and §11 below are updated to match.

---

## 1. Principles (inherited from `account-tiers.md`)

1. **Joining is free and unlimited on every tier.** Free account required (not a guest), but no
   cap on how many clubs you can join — see the 2026-08-02 note above for why.
2. **Account-gated, not FateRound+-gated.** You need an account (not a guest) to join or
   create — a club is persistent membership, and a ghost can't hold a spot. This is a
   moment-of-value signup hook.
3. **Club *creation* is the paid-tier lever, not membership.** Free account: 1 club created.
   FateRound+: up to 3. Club Pro (admin-paid): unlimited, plus the roster jumps from the
   free 20-member cap to 50. See §11 decision #2.
4. **Additive only.** Clubs never make non-club play worse. Every game still works with zero clubs.

---

## 2. Scope — what ships vs. what's later

| Capability | This spec (v1) | Later |
|---|:---:|:---:|
| Create a club (≤20), crest/name, roster | ✅ | |
| Invite by link/code, join, leave, roles (owner/admin/member) | ✅ | |
| Pre-set teams loaded into supported game lobbies | ✅ | |
| Club leaderboard (aggregate of members' results) | ✅ | |
| Club game history (games played *as* this club) | ✅ | |
| Seasons (recurring, resetting standings) | ✅ (basic) | richer season rewards |
| Club tournaments / leagues | — | ✅ |
| Rosters > 20, vanity club code | — | ✅ (Pro / Club+) |
| Purchasable crest packs / season cosmetics | — | ✅ (revenue) |

---

## 3. Data model (`supabase/migrations/`, `YYYYMMDDHHMMSS_` prefix)

Keys off `profiles.id` (the Batch-1 identity). **Remember the column-grants gotcha:** every new
column that clients read needs an explicit column-level `GRANT SELECT` to `anon`/`authenticated`, or
reads throw `42501`.

```sql
-- A club.
create table clubs (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique,                    -- optional readable id; vanity code is later/Pro
  crest_emoji   text,                            -- v1 crest = emoji + colour (cheap, no upload)
  crest_color   text,
  owner_id      uuid not null references profiles(id) on delete restrict,
  member_limit  int  not null default 20,        -- 20 free; raised later for Pro/Club+
  created_at    timestamptz not null default now()
);

-- Membership + role. One row per (club, member).
create table club_members (
  club_id     uuid not null references clubs(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  role        text not null default 'member'
                check (role in ('owner','admin','member')),
  joined_at   timestamptz not null default now(),
  primary key (club_id, profile_id)
);
create index idx_club_members_profile on club_members(profile_id);

-- Invite links/codes (short-lived, revocable). Joining consumes/validates against this.
create table club_invites (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references clubs(id) on delete cascade,
  code        text unique not null,              -- what goes in the share link
  created_by  uuid not null references profiles(id),
  expires_at  timestamptz,                       -- null = no expiry
  max_uses    int,                                -- null = unlimited
  uses        int not null default 0,
  created_at  timestamptz not null default now()
);

-- Which rooms were played "as" this club (for club history + leaderboard attribution).
-- Written when a host starts a room with a club context selected.
create table club_games (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references clubs(id) on delete cascade,
  game_id     uuid not null,                     -- the games row
  game_type   text not null,
  season_id   uuid references club_seasons(id),  -- null outside a season
  played_at   timestamptz not null default now()
);
create index idx_club_games_club on club_games(club_id, played_at desc);

-- Optional pre-set teams the club reuses (Codewords red/blue, Describe It teams, etc.).
create table club_teams (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references clubs(id) on delete cascade,
  name        text not null,                     -- "Team Red"
  color       text,
  sort_order  int not null default 0
);
create table club_team_members (
  team_id     uuid not null references club_teams(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  primary key (team_id, profile_id)
);

-- Seasons: a named, dated window standings reset around.
create table club_seasons (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references clubs(id) on delete cascade,
  name        text not null,                     -- "Season 1", "Detty December"
  starts_on   date not null,
  ends_on     date,                              -- null = ongoing
  created_at  timestamptz not null default now()
);
```

**The club leaderboard is a query, not a table** — aggregate members' existing results (wins,
trophy points, daily scores) filtered to `club_games` / the active season. Cache later if needed;
don't add a table for it in v1.

---

## 4. Roles & permissions

| Action | Member | Admin | Owner |
|---|:---:|:---:|:---:|
| View club, roster, leaderboard, history | ✅ | ✅ | ✅ |
| Play as the club / load pre-set teams | ✅ | ✅ | ✅ |
| Create invite link, remove a member | — | ✅ | ✅ |
| Edit crest/name, create seasons, edit teams | — | ✅ | ✅ |
| Promote/demote admins, delete club, transfer ownership | — | — | ✅ |

- **One owner** per club (transferable). Deleting a club is owner-only and cascades (§3).
- Leaving: any member can leave; if the owner leaves, they must transfer ownership first (block
  otherwise). Mirrors the "never strand a group" instinct.

---

## 5. Invite & join flow

1. Owner/admin creates an invite → `club_invites` row → shareable link `/(club)/join/:code`.
2. Recipient opens it: **guest → prompted to save an account first** (§Principle 2 — moment of
   value: "Join the club to keep your spot & team history"), then joins; **logged-in → one-tap
   join**, respecting `member_limit`.
3. Joining inserts a `club_members` row (`role='member'`), increments `uses`, honours
   `expires_at` / `max_uses`.
4. Reuses the profile-backed identity — a joining account **never re-types their name** (ties into
   the Batch-1 "stop re-asking logged-in players" work).

---

## 6. Playing "as" a club + pre-set teams

- On the **host lobby / create-room** flow, a host who's in a club can pick **"Play as \<Club\>"**.
  That stamps the resulting room with a `club_id` and (if inside a season) `season_id`, writing a
  `club_games` row at start. This is what feeds club history and the club leaderboard.
- For team games (Codewords, Describe It, team Trivia, Bingo nights), the host can **load a saved
  `club_teams` preset** instead of re-assigning teams by hand every session. Assignment writes into
  the game's existing team structure — Clubs supplies the *roster→team* mapping; it does not change
  any game engine.
- **Supported games first:** the existing team-based modes only. Non-team games can still be "played
  as a club" (for history/leaderboard) without the team preset.

---

## 7. Club leaderboard, history & seasons

- **Club leaderboard:** rank members within the club by a chosen metric (wins, or trophy points, or
  aggregated daily score) over the active season (or all-time if no season). Pure query over
  existing data joined to `club_games` — no new scoring system, reuses Batch 3/4 outputs.
- **Club history:** reverse-chronological `club_games` — "what we played, when, who won."
- **Seasons:** a `club_seasons` window the standings reset around; ending a season snapshots the
  final board (store the snapshot as a row/jsonb when a season closes so past champions persist).
  v1 seasons are manual (owner creates/closes); auto-recurring seasons are later.

---

## 8. Security / RLS (follow [`rls-hardening.md`](./rls-hardening.md))

- **Club-private data is member-only.** RLS on `clubs`/`club_members`/`club_games`/`club_teams`/
  `club_seasons`: a row is readable if `auth.uid()` is a member of that `club_id`
  (`exists (select 1 from club_members where club_id = <row>.club_id and profile_id = auth.uid())`).
- **Writes go through the server** (award/aggregate style) using the admin client for anything that
  crosses members (creating `club_games` at room start, closing a season). Direct client writes only
  for self-service member actions guarded by role checks (create invite = admin/owner only).
- **Invites** validated server-side (expiry, max_uses, member_limit) — never trust the client.
- **Public surface is narrow:** a club's public card (if we ever show one) exposes name + crest +
  member count only, never member emails/PII — same pattern as the trophy/leaderboard public views.

---

## 9. The three-codebase reality (web + shared + native mobile)

Per [`platform-features-master-plan.md`](./platform-features-master-plan.md) § Cross-cutting, every
item below is three units of work:

**Shared / backend:** the migration above + RLS + server endpoints
(`/api/clubs` CRUD, `/api/clubs/:id/invite`, `/api/clubs/join/:code`, `/api/clubs/:id/leaderboard`,
`/api/clubs/:id/teams`, season open/close). Keep club types in `packages/shared/src` **and** mirror
them into `apps/mobile` (types/SELECTs are duplicated, not re-exported).

**Web UI:** club home (crest, roster, leaderboard, history tabs), create/edit club modal, invite
sheet, join page, "Play as \<Club\>" + team-preset picker wired into the host lobby, season
management for owners/admins.

**Native mobile UI (Expo):** the same set built natively — runtime-themed (`useThemedStyles`),
following the mobile header/text conventions. Deep-link handling for `/(club)/join/:code` so an
invite link opens the app.

**Design surfaces:** club home, crest picker (emoji+colour in v1), roster with role badges, invite
sheet, join screen, club leaderboard, season board + "season champion" moment, team-assignment step
in supported lobbies. Budget design on **both** platforms.

---

## 10. Build order (inside Batch 5)

1. **Core:** `clubs` + `club_members` + roles + create/edit + invite/join (web + mobile). A crew can
   form a club and hold a roster.
2. **Play as a club:** `club_games` written at room start + club history list.
3. **Club leaderboard:** the aggregate query over members' results.
4. **Pre-set teams:** `club_teams` + load-into-lobby for the team games.
5. **Seasons:** `club_seasons` + resetting standings + end-of-season snapshot.
6. *(Later, not Batch 5):* club tournaments/leagues, >20 rosters, vanity codes, purchasable crests.

---

## 11. Open decisions for Clubs (recommended defaults — override anytime)

| # | Decision | Recommended default |
|---|---|---|
| 1 | Crest in v1 — emoji+colour vs. image upload | **Emoji + colour.** No upload infra, no moderation surface, ships fast. Image/branded crests become a later cosmetic. |
| 2 | Can one person be in many clubs? | **Yes, unlimited membership on every tier — reconfirmed 2026-08-02.** Cap sits on clubs *created* instead: Free 1, FateRound+ 3, Club Pro admin unlimited (sharpened from Free=2 on 2026-08-02, see [`account-tiers.md`](./account-tiers.md) §Clubs). Joining is the sticky, invite-driven action; creation is the abuse vector and the actual cost centre (storage, moderation, branding, admin tooling). |
| 3 | Club leaderboard metric | **Default to wins within the season; offer a toggle to trophy-points or daily-score.** Wins are the most intuitive "who's best in our crew." |
| 4 | Guests inside a club room | Guests can *play* in a club's room, but only **accounts count toward the club leaderboard/history** (they're the ones with a persistent identity). Nudge guests to claim. |
| 5 | Season length | **Owner-defined, suggest monthly.** Auto-recurring monthly seasons are a later nicety. |
| 6 | Name uniqueness | **Non-unique club names** (like display handles, decision #3 in the master plan); `slug`/id disambiguates. |

---

## 12. What's explicitly NOT in this spec

- **Monetization** (Club Pro branding bundle, >20 rosters, club count gating) —
  [`revenue-model.md`](./revenue-model.md). Build the free, sticky layer first; no separate
  crest/cosmetic purchases — branding ships bundled into the Club Pro subscription.
- **Club tournaments / leagues** — deferred to after v1; they sit on the shipped tournaments system.
- **Cross-club discovery / public directory** — clubs are invite-only in v1; a browse/directory is a
  later growth feature with its own moderation questions.
