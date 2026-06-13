# Participant Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let hosts choose whether all imported participants or only joined ones appear in rounds for people-based games.

**Architecture:** Add a `participant_filter` column (`'all' | 'joined'`, default `'all'`) to the `games` table. Expose it in the create wizard and host lobby as a segmented control. The start route and host page use this value to determine the round pool.

**Tech Stack:** Next.js 16, React 19, Supabase (Postgres), Tailwind CSS 4, TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-13-participant-filter-design.md`

---

### Task 1: Add database column and TypeScript type

**Files:**
- Modify: `supabase/schema.sql` (games table, around line 15)
- Create: `supabase/migrations/003_participant_filter.sql`
- Modify: `src/types/index.ts` (Game interface, around line 23)

- [ ] **Step 1: Add column to schema.sql**

After the `participant_mode` line in the `games` table definition, add:

```sql
  participant_filter text not null default 'all' check (participant_filter in ('all', 'joined')),
```

- [ ] **Step 2: Create migration file**

```sql
alter table games
  add column if not exists participant_filter text not null default 'all'
  check (participant_filter in ('all', 'joined'));
```

- [ ] **Step 3: Add to Game type**

In `src/types/index.ts`, add to the `Game` interface after `participant_mode`:

```typescript
  participant_filter: 'all' | 'joined'
```

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql supabase/migrations/003_participant_filter.sql src/types/index.ts
git commit -m "feat: add participant_filter column to games table"
```

---

### Task 2: Accept participant_filter in the games API

**Files:**
- Modify: `src/app/api/games/route.ts` (POST handler, around lines 86-190)

- [ ] **Step 1: Add to request body extraction**

In the POST handler's destructuring of `parsed.data` (around line 86), add:

```typescript
    participant_filter: rawParticipantFilter,
```

- [ ] **Step 2: Add to the Zod schema**

Find the Zod schema that validates the POST body. Add:

```typescript
  participant_filter: z.enum(['all', 'joined']).optional(),
```

- [ ] **Step 3: Add to the INSERT query**

In the `supabase.from('games').insert({...})` call (around line 172), add after `participant_mode`:

```typescript
    participant_filter: rawParticipantFilter === 'joined' ? 'joined' : 'all',
```

- [ ] **Step 4: If a PATCH handler exists, add participant_filter support there too**

Check if there's a PATCH handler in this file or in `src/app/api/games/[code]/route.ts`. If so, add `participant_filter` to the allowed update fields.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/games/route.ts
git commit -m "feat: accept participant_filter in games API"
```

---

### Task 3: Add toggle to game creation wizard

**Files:**
- Modify: `src/app/create/page.tsx` (settings state and form UI)

- [ ] **Step 1: Add to settings state**

Find the initial settings state object. Add:

```typescript
  participant_filter: 'all' as 'all' | 'joined',
```

- [ ] **Step 2: Add toggle UI**

Find the "Who's in the poll" `SettingsGroup` with the `participant_mode` segmented control (around line 724). After that block, add a new setting that only shows for import-mode people-based games:

```tsx
{settings.participant_mode === 'import' && !isWyr && !isMlt && !isWst && (
  <SettingsGroup title="Who appears in rounds">
    <SegmentedControl
      value={settings.participant_filter}
      onChange={(v) => setSettings({ ...settings, participant_filter: v })}
      options={[
        { value: 'all', label: 'Everyone on the list' },
        { value: 'joined', label: 'Only people who join' },
      ]}
    />
  </SettingsGroup>
)}
```

- [ ] **Step 3: Include in POST body**

The POST request (around line 399) already spreads `...settings`, so `participant_filter` will be included automatically. Verify this by reading the existing code.

- [ ] **Step 4: Commit**

```bash
git add src/app/create/page.tsx
git commit -m "feat: add participant filter toggle to create wizard"
```

---

### Task 4: Add toggle to host lobby and update round pool logic

**Files:**
- Modify: `src/app/host/[code]/page.tsx` (roundParticipants computation ~line 1012, info text ~line 1319)

- [ ] **Step 1: Update roundParticipants computation**

Find the `roundParticipants` computation (around line 1012-1017):

```typescript
    const roundParticipants = isJoinersMode
      ? participants
      : isMltImport
        ? participants
        : participantsWhoJoined(participants, players)
```

Replace with:

```typescript
    const roundParticipants = isJoinersMode
      ? participants
      : isMltImport
        ? participants
        : game.participant_filter === 'all'
          ? participants
          : participantsWhoJoined(participants, players)
```

- [ ] **Step 2: Add lobby toggle UI**

Find the info text section (around line 1319) that shows "X of Y on the list have joined". Before that text, add a toggle for non-joiners, non-MLT-import people-based games:

```tsx
{!isJoinersMode && !isMltImport && !isWyr && !isMlt && !isWst && (
  <div className="flex items-center gap-2 text-xs">
    <span className="text-muted">Rounds include:</span>
    <SegmentedControl
      value={game.participant_filter ?? 'all'}
      onChange={async (v) => {
        await supabase.from('games').update({ participant_filter: v }).eq('id', game.id)
      }}
      options={[
        { value: 'all', label: 'Everyone' },
        { value: 'joined', label: 'Joined only' },
      ]}
    />
  </div>
)}
```

Note: Check if `SegmentedControl` is already imported in this file. If not, import it from `@/components/ui/CreateWizard`.

- [ ] **Step 3: Update info text to reflect the setting**

Update the info text (around line 1319) to reflect the current filter:

```tsx
{!isJoinersMode && (
  <p className="text-faint text-xs">
    {isMltImport
      ? `${players.length} of ${participants.length} voters joined — all names appear in rounds`
      : game.participant_filter === 'all'
        ? `All ${participants.length} names will appear in rounds`
        : `${roundParticipants.length} of ${participants.length} on the list have joined — only joined names appear in rounds`}
  </p>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/host/\\[code\\]/page.tsx
git commit -m "feat: add participant filter toggle to host lobby"
```

---

### Task 5: Use participant_filter in the start route

**Files:**
- Modify: `src/app/api/games/[code]/start/route.ts` (round pool selection, around line 335)

- [ ] **Step 1: Update round pool selection**

Find the round pool selection (around line 335):

```typescript
  const isImportMode = (game.participant_mode ?? 'import') === 'import'
  const roundPool = isImportMode ? participantsWhoJoined(participantsData, playersData) : participantsData
```

Replace with:

```typescript
  const isImportMode = (game.participant_mode ?? 'import') === 'import'
  const useAllParticipants = !isImportMode || game.participant_filter === 'all'
  const roundPool = useAllParticipants ? participantsData : participantsWhoJoined(participantsData, playersData)
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/games/\\[code\\]/start/route.ts
git commit -m "feat: use participant_filter when building round pool"
```

---

### Task 6: Build check and manual testing

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Manual test plan**

1. Create an SMK game in import mode — verify "Who appears in rounds" toggle shows, defaults to "Everyone on the list"
2. In host lobby — verify toggle appears, shows "All N names will appear in rounds"
3. Toggle to "Joined only" — verify text updates to "X of Y on the list have joined"
4. Start game with "Everyone" — verify all imported names appear in rounds
5. Create another game, toggle to "Joined only", have only some join — verify only joined names appear
6. Create a WYR game — verify the toggle does NOT appear (question-based mode)
7. Create a joiners-mode game — verify the toggle does NOT appear

- [ ] **Step 4: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during participant filter testing"
```
