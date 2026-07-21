# Plan: Move hardcoded "platform" game content into admin management

**Goal:** every game whose `platform` content source is a hardcoded array in code should instead
read from an admin-editable store, so content can be added / edited / removed without a code
deploy — the way **landmine** (categories) and **crossword / word search / word scramble** (themes)
already work.

---

## 1. Three content models (not everything is a "theme")

The existing two admin surfaces are shaped by *how the host/game interacts with the content*:

| Model | Host interaction | Games | Admin surface today |
|---|---|---|---|
| **Themes** | Host picks one named pool (optionally locked difficulty) | crossword, word_search, word_scramble | `puzzle_themes` table + `/admin/themes` ✅ |
| **Categories** | Rotating caller picks one named bucket per round | landmine | `landmine_categories` table + `/admin/landmine-categories` ✅ |
| **Flat bank** | **No pick** — "platform" just means "draw from the whole curated bank" | trivia + 10 others (below) | **none yet — this plan** |

### Refinement (decided): category-bearing games join **themes**, not the flat bank

Games that already have a **category** concept become **themes** — each category is a theme a host
can pick (or "all"):

- **trivia** → its `category` (Tech / General / …) becomes a theme. Extend the existing
  `puzzle_themes` system to accept `trivia` (entries hold trivia questions instead of words; the
  "locked difficulty" field is simply unused/null for trivia). Host sees a theme dropdown =
  "pick a trivia topic", defaulting to "all active themes" (= today's platform behaviour).
- **who_said_this** → candidate: its decks (`WST_PLATFORM_DECK` vs `WST_ANIME_DECK`) are de-facto
  themes ("Anime"). Could also join themes — but it already overlaps with library packs (the
  seeded "Anime Icons" pack), so flag for a decision rather than assume.

Everything else has **no** categories, so it stays a **flat bank**: the host doesn't choose a named
set; `platform` = the entire admin-curated bank (admin may split it into `label`ed batches for their
own organization — §4 — but those are never shown to the host; they're unioned at draw time).

**Build order (decided): flat bank first, then bring trivia into themes.**

---

## 2. Inventory — games with a hardcoded platform bank (need migrating)

**Flat bank** (this phase — no categories):

| Game type | Hardcoded source | Entry shape | ~Count | Consumed at |
|---|---|---|---|---|
| `would_you_rather` | `lib/would-you-rather-questions.ts` `WYR_QUESTIONS` | `{optionA, optionB}` | 155 | start route |
| `this_or_that` | `lib/this-or-that-questions.ts` `THIS_OR_THAT_QUESTIONS` | `{optionA, optionB}` | 60 | start route |
| `most_likely_to` | `lib/most-likely-to-questions.ts` `MLT_QUESTIONS` | `string` | 270 | start route |
| `never_have_i_ever` | `lib/never-have-i-ever-questions.ts` `NHIE_QUESTIONS` | `string` | 110 | start route |
| `pick_a_number` | `lib/pick-a-number-questions.ts` `PAN_QUESTIONS` | `string` | 50 | start route |
| `codewords` | `lib/codewords-words.ts` `CODEWORDS_WORD_POOL` | `string` (word) | ~401 | start route |
| `describe_it` (Text Charades) | `lib/describe-it-words.ts` `DESCRIBE_IT_WORD_POOL` | `string` | ~230 | start route |
| `quiplash` | `lib/quiplash-prompts.ts` `QUIPLASH_PROMPTS` | `{prompt}` | ~42 | start route |
| `quick_draw` | `lib/quick-draw-prompts.ts` `QUICK_DRAW_PROMPTS` **and** `lib/quick-draw-guess-words.ts` `QUICK_DRAW_GUESS_WORD_POOL` | `{prompt}` / `string` | 42 / 238 | start route |

**Themes** (later phase — category-bearing, join `puzzle_themes`):

| Game type | Hardcoded source | Entry shape | ~Count | Consumed at |
|---|---|---|---|---|
| `trivia` | `lib/trivia-questions.ts` `TRIVIA_TECH_QUESTIONS` + `TRIVIA_GENERAL_QUESTIONS` | `{question, choices[4], correctIndex, category}` | 50 | start route |
| `who_said_this` *(candidate)* | `lib/who-said-this-questions.ts` `WST_PLATFORM_DECK` + `WST_ANIME_DECK` | `{quote, options[4], correctIndex}` | 16 (+10) | **create** route (folds into `custom_questions`) |

The `platform` vs `library` vs `custom` decision runs through
`parseQuestionSource()` in `lib/custom-questions.ts`; the `platform` branch is what falls through to
these arrays. For the text-poll games (WYR/MLT/NHIE/PAN/this_or_that) the bank is unioned with
player-submitted lobby questions via `combineLobbyQuestions()` — that stays; we only swap the
hardcoded half for the admin bank.

### Explicitly NOT in scope (no hardcoded bank — content is people/players)
`smash_marry_kill`, `red_flag_green_flag`, `smash_or_pass`, `parent_approval`, `i_call_on`
(people polls over participants), `hot_seat`, `two_truths` (player-submitted in lobby). Nothing to
migrate.

---

## 3. Recommended architecture — one generic `platform_content` table

Rather than 11 landmine-style tables + 11 admin pages, generalize the way `puzzle_themes` already
does across 3 games: **one table keyed by `game_type`, one admin page with game-type tabs.**

```sql
create table platform_content (
  id          uuid primary key default gen_random_uuid(),
  game_type   text not null,          -- 'trivia', 'would_you_rather', ...
  variant     text,                   -- for games with >1 pool (quick_draw: 'draw' | 'guess'); else null
  label       text not null,          -- admin-only batch name, e.g. "Trivia — General" (never shown to host)
  entries     jsonb not null default '[]',   -- array of rows in that game's native shape
  entry_count integer not null default 0,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  builtin_key text,                   -- idempotent seeding from code (like puzzle_themes.builtin_key)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index platform_content_lookup on platform_content (game_type, variant, is_active, sort_order);
-- RLS decision per game (see below): secret pools = RLS on + no policy (service-role only);
-- non-secret = FOR SELECT USING (is_active).
```

**Why generic, not per-game:**
- One migration, one admin page, one CRUD API — vs 11 of each.
- Mirrors the proven `puzzle_themes` game_type generalization.
- Reuses everything I just built: the CSV/line-editing pattern (theme edit) and the per-game
  validators/parsers already in `library/submit/page.tsx` + `custom-questions.ts`.

**Draw semantics:** when `question_source === 'platform'`, the game reads
`entries` unioned across all `is_active` rows for that `game_type` (+ `variant`), instead of the
hardcoded array. One row or many — the host never sees the split.

**Defaults:** follow the landmine/puzzle-themes rule — **seed the current hardcoded arrays into the
table** (via an `import-builtins` route keyed on `builtin_key`, exactly like
`/api/admin/puzzle-themes/import-builtins`). Keep the hardcoded arrays in code as a **fallback only
while the table is empty** for a game_type, so nothing breaks mid-rollout; once seeded, the table wins.

**RLS / secrecy:** trivia/WST answers and codewords/describe_it/quick_draw-guess words are
answer-bearing — those game_types should be **service-role-only** (RLS on, no policy), read
server-side at start/create like landmine. Prompt-only banks (WYR, MLT, NHIE, PAN, quiplash,
quick_draw prompts) are not secret and can have a public read policy if ever needed. Simplest: keep
**all** reads server-side (start/create routes already run server-side), no client policy needed.

---

## 4. The pieces to build (replicating the landmine 5-layer pattern)

1. **Migration** `…_platform_content.sql` — table above + seed rows from the code arrays
   (`ON CONFLICT (game_type, builtin_key) DO NOTHING`). Also **fix the pre-existing bug**: the WST
   library migration dropped `quick_draw/crossword/word_search/word_scramble` from the
   `question_packs` game_type CHECK — re-add them (independent, but same neighborhood).
2. **Shared lib** `lib/platform-content.ts` — per-game-type shape validation + CSV↔entries
   serializers. Reuse the existing validators (`parseTriviaQuestionImport`, `parseWyr…`,
   `parseWstDeckImport`, `parseCodewordsWordRows`, etc.) so an admin bank and a host upload are
   byte-identical shapes.
3. **Admin CRUD API** `api/admin/platform-content/route.ts` (GET list w/o entries + POST) and
   `[id]/route.ts` (GET w/ entries + PATCH + DELETE), gated by `assertAdminRequest`. Plus
   `import-builtins/route.ts`.
4. **Admin UI** `app/admin/platform-content/page.tsx` — game-type tabs (like `/admin/themes`),
   per-game batch list with **CSV/line editing** (reuse the exact edit pattern from `/admin/themes`
   that I just built), create/edit/delete/activate. Add nav link in `admin/layout.tsx`.
5. **Consumption swap** — in each `pick…()` selector (start route) and the WST create path, replace
   "read hardcoded array" with "read active `platform_content` for this game_type, fallback to
   hardcoded if empty." This is the only gameplay-touching change; keep it behind the fallback so
   it's safe.

---

## 5. Per-game edge cases

- **trivia** — keep the `category` field; store it inside each row's `entries` item (shape already
  has it). No host-facing theme, but admin batches can be organized by category via `label`.
- **who_said_this** — consumed at **create** (deck copied into `custom_questions`), not start. The
  read swap lives in `create/page.tsx` + `PlayAgainSetup.tsx` instead of the start route. `WST_ANIME_DECK`
  becomes a second active batch (or its own `variant`).
- **quick_draw** — two pools: draw prompts and guess words. Use the `variant` column
  (`'draw'` / `'guess'`) so both live in one table under `game_type='quick_draw'`.
- **quiplash** — not a `library` game type, but `platform_content` is independent of the library, so
  no issue.
- **poll games (WYR/MLT/NHIE/PAN/this_or_that)** — the admin bank replaces only the platform half of
  `combineLobbyQuestions`; lobby-submitted questions still merge on top.

---

## 6. Reuse from work already done this session
- The **theme CSV edit** flow (fetch entries → `puzzleThemeEntriesToCsv` → prefill → edit lines) is
  the exact UX for the platform-content admin editor — generalize it.
- The **library question validators** in `library/submit/page.tsx` already turn CSV → each game's
  row shape; lift the shared ones into `lib/platform-content.ts`.
- The **admin pack question editor** (JSON/line editing) I added is the same idea for answer-bearing
  banks if CSV is awkward.

---

## 7. Suggested rollout (phased, pilot first)
1. **Pilot: trivia** — build the table + admin page + `import-builtins` + start-route swap end to
   end. Proves the generic model with the richest shape (category + answers + secrecy).
2. **Text-poll family** (WYR, this_or_that, MLT, NHIE, PAN) — all share simple shapes; fast follow.
3. **Word pools** (codewords, describe_it, quick_draw ×2, quiplash) — single-column, easy.
4. **who_said_this** — last, since it's the create-time path.

Each phase: seed builtins → verify the admin page edits → verify a game still starts drawing from
the table (and still works if the table is emptied → hardcoded fallback).

---

## 8. Open decisions for you
- **One generic table (recommended)** vs 11 landmine-style per-game tables. Generic = far less code;
  per-game = closer literal copy of landmine. *Recommend generic.*
- **Batches per game** (multiple `label`ed rows unioned) vs **one row per game_type**. Batches give
  organization (e.g. Tech vs General trivia) at no host-facing cost. *Recommend allow batches.*
- **Keep hardcoded arrays as fallback** (safe, recommended) vs delete them after seeding (landmine
  style, cleaner but no safety net).
