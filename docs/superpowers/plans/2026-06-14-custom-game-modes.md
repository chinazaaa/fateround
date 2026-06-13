# Custom Game Modes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `custom` game type that lets hosts define 2-5 voting slots with custom labels, emoji, and colors — enabling user-created game modes like "Hire / Fire / Promote".

**Architecture:** New `'custom'` entry in the `GameType` union with slot config stored as `custom_slots` JSONB on the game record. A dedicated code path handles voting (via `pair_assignments` JSONB with dynamic slot keys), tallying, results, and share text. Built-in game types are untouched. A generalized N-person round generation function supports pool sizes 2-5.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres), TypeScript, Zod, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-06-14-custom-game-modes-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/schema.sql` | Modify | Add `custom_slots` column |
| `src/types/index.ts` | Modify | Add CustomSlot, CustomSlotsConfig types; extend GameType, Game |
| `src/lib/game-types.ts` | Modify | Add `'custom'` to config, add `isCustomGame()` and custom helpers |
| `src/lib/custom-game.ts` | Create | Custom game vote tallying, assignment validation, round generation |
| `src/lib/validation.ts` | Modify | Add `'custom'` to gameTypeEnum, add custom_slots and customAssignments schemas |
| `src/lib/utils.ts` | Modify | Add generalized `generateNRounds()` function |
| `src/app/api/games/route.ts` | Modify | Store `custom_slots` on game creation |
| `src/app/api/games/[code]/start/route.ts` | Modify | Handle custom game round generation |
| `src/app/api/votes/route.ts` | Modify | Handle custom game vote validation and storage |
| `src/app/create/page.tsx` | Modify | Add custom slot builder UI with templates |
| `src/components/CustomSlotBuilder.tsx` | Create | Template picker + slot editor component |
| `src/components/CustomVoteCard.tsx` | Create | N-slot voting card for custom games |
| `src/components/CustomRoundResults.tsx` | Create | Results display for custom game rounds |
| `src/app/game/[code]/page.tsx` | Modify | Wire custom voting UI and results |
| `src/app/host/[code]/page.tsx` | Modify | Wire custom results in host view |
| `src/components/ShareRoundResults.tsx` | Modify | Add custom game share text |
| `src/components/ShareResults.tsx` | Modify | Add custom game final share text |

---

### Task 1: Schema + Types

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add custom_slots column to schema.sql**

Append after the existing anime WST additions at the end of the file:

```sql
-- ============================================================================
-- Custom Game Modes — schema additions
-- ============================================================================

ALTER TABLE games ADD COLUMN IF NOT EXISTS custom_slots jsonb;
```

- [ ] **Step 2: Add types to src/types/index.ts**

Add after the `WstQuoteSource` type at the end of the file:

```typescript
export interface CustomSlot {
  key: string
  label: string
  emoji: string
  color: string
}

export interface CustomSlotsConfig {
  slots: CustomSlot[]
  title: string
}
```

Extend the `GameType` union to include `'custom'`:

```typescript
export type GameType =
  | 'smash_marry_kill'
  | 'red_flag_green_flag'
  | 'smash_or_pass'
  | 'would_you_rather'
  | 'most_likely_to'
  | 'who_said_this'
  | 'hot_seat'
  | 'custom'
```

Add `custom_slots` to the `Game` interface (after `wst_quote_source`):

```typescript
  custom_slots?: CustomSlotsConfig | null
```

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql src/types/index.ts
git commit -m "feat(schema+types): add custom game mode types and column"
```

---

### Task 2: Game Type Config + Helpers

**Files:**
- Modify: `src/lib/game-types.ts`

- [ ] **Step 1: Add 'custom' to GAME_TYPE_CONFIG**

Add after the `hot_seat` entry (before the closing of the config object):

```typescript
  custom: {
    id: 'custom',
    label: 'Custom Game',
    tagline: 'Create your own voting categories',
    headerEmoji: '✏️',
    card: {
      accent: '#a855f7',
      accentSoft: 'rgba(168,85,247,0.15)',
      emoji: '✏️',
      players: '2+ players',
      vibe: 'Your rules',
    },
    slots: {
      kiss: { emoji: '✏️', label: 'Slot 1', color: '#a855f7', leaderboardLabel: 'Most Slot 1', activeClass: 'border-purple-400 bg-purple-500/20 text-purple-100', borderClass: 'border-purple-500/40', textColor: '#a855f7' },
      marry: { emoji: '✏️', label: 'Slot 2', color: '#64748b', leaderboardLabel: 'Most Slot 2', activeClass: 'border-slate-400 bg-slate-500/20 text-slate-100', borderClass: 'border-slate-500/40', textColor: '#64748b' },
      kill: { emoji: '✏️', label: 'Slot 3', color: '#ef4444', leaderboardLabel: 'Most Slot 3', activeClass: 'border-red-400 bg-red-500/20 text-red-100', borderClass: 'border-red-500/40', textColor: '#ef4444' },
    },
  },
```

Note: These slot defaults are fallbacks only — actual labels/colors come from `game.custom_slots` at runtime.

- [ ] **Step 2: Add 'custom' to GAME_TYPE_OPTIONS**

```typescript
export const GAME_TYPE_OPTIONS: GameType[] = [
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'would_you_rather',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
]
```

- [ ] **Step 3: Add 'custom' to parseGameType()**

Add before the default return:

```typescript
  if (raw === 'custom') return 'custom'
```

- [ ] **Step 4: Add isCustomGame() helper**

Add after the existing `isThreeChoiceGame()` function:

```typescript
export function isCustomGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'custom'
}
```

- [ ] **Step 5: Add custom game to gameHowItWorks()**

Add a case for custom:

```typescript
  if (isCustomGame(gameType)) {
    return 'Add everyone\'s names on the next step. Each round shows a group of names — everyone assigns one person to each custom category.'
  }
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/game-types.ts
git commit -m "feat: add 'custom' game type to config and helpers"
```

---

### Task 3: Custom Game Logic Library

**Files:**
- Create: `src/lib/custom-game.ts`

- [ ] **Step 1: Create the custom game logic module**

```typescript
import type { Game, Vote, Participant, CustomSlot, CustomSlotsConfig } from '@/types'

// ---------------------------------------------------------------------------
// Config access
// ---------------------------------------------------------------------------

export function getCustomSlots(game: Game): CustomSlot[] {
  return game.custom_slots?.slots ?? []
}

export function getCustomSlotKeys(game: Game): string[] {
  return getCustomSlots(game).map((s) => s.key)
}

export function getCustomSlotCount(game: Game): number {
  return getCustomSlots(game).length
}

export function getCustomTitle(game: Game): string {
  return game.custom_slots?.title ?? 'Custom Game'
}

// ---------------------------------------------------------------------------
// Vote assignment validation
// ---------------------------------------------------------------------------

export function parseCustomAssignments(
  raw: unknown,
): Record<string, string> | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Record<string, string> = {}
  for (const [id, slot] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof slot === 'string') out[id] = slot
  }
  return Object.keys(out).length > 0 ? out : null
}

export function isCustomAssignmentValid(
  assignments: Record<string, string>,
  participantIds: string[],
  slotKeys: string[],
): boolean {
  // Every participant must have an assignment
  if (!participantIds.every((id) => id in assignments)) return false
  // Every assignment must be a valid slot key
  const slotSet = new Set(slotKeys)
  if (!Object.values(assignments).every((v) => slotSet.has(v))) return false
  // Each slot key must be used exactly once
  const usedSlots = new Set(Object.values(assignments))
  if (usedSlots.size !== slotKeys.length) return false
  // Assignment count must match participant count and slot count
  if (Object.keys(assignments).length !== participantIds.length) return false
  return true
}

export function fillRandomCustomAssignment(
  participantIds: string[],
  slotKeys: string[],
): Record<string, string> {
  const shuffledSlots = [...slotKeys]
  for (let i = shuffledSlots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffledSlots[i], shuffledSlots[j]] = [shuffledSlots[j], shuffledSlots[i]]
  }
  const out: Record<string, string> = {}
  participantIds.forEach((id, i) => {
    out[id] = shuffledSlots[i]
  })
  return out
}

export function completeRandomCustomAssignment(
  current: Record<string, string>,
  participantIds: string[],
  slotKeys: string[],
): Record<string, string> {
  const out = { ...current }
  const usedSlots = new Set(Object.values(out))
  const remainingSlots = slotKeys.filter((k) => !usedSlots.has(k))
  const unassigned = participantIds.filter((id) => !(id in out))

  // Shuffle remaining slots
  for (let i = remainingSlots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[remainingSlots[i], remainingSlots[j]] = [remainingSlots[j], remainingSlots[i]]
  }
  unassigned.forEach((id, i) => {
    out[id] = remainingSlots[i]
  })
  return out
}

// ---------------------------------------------------------------------------
// Vote tallying
// ---------------------------------------------------------------------------

export interface CustomTallyRow {
  participantId: string
  name: string
  counts: Record<string, number>
}

export interface CustomTally {
  rows: CustomTallyRow[]
  voterCount: number
  slotWinners: Record<string, { name: string; count: number }>
}

export function tallyCustomVotes(
  votes: Vote[],
  participantIds: string[],
  nameById: Map<string, string>,
  slotKeys: string[],
): CustomTally {
  // Initialize counts
  const countsMap = new Map<string, Record<string, number>>()
  for (const pid of participantIds) {
    const counts: Record<string, number> = {}
    for (const key of slotKeys) counts[key] = 0
    countsMap.set(pid, counts)
  }

  let voterCount = 0
  for (const vote of votes) {
    const assignments = vote.pair_assignments as Record<string, string> | null
    if (!assignments) continue
    voterCount++
    for (const [pid, slotKey] of Object.entries(assignments)) {
      const counts = countsMap.get(pid)
      if (counts && slotKey in counts) {
        counts[slotKey]++
      }
    }
  }

  const rows: CustomTallyRow[] = participantIds.map((pid) => ({
    participantId: pid,
    name: nameById.get(pid) ?? '',
    counts: countsMap.get(pid) ?? {},
  }))

  // Find winner per slot
  const slotWinners: Record<string, { name: string; count: number }> = {}
  for (const key of slotKeys) {
    let maxCount = 0
    let winnerName = ''
    for (const row of rows) {
      const count = row.counts[key] ?? 0
      if (count > maxCount) {
        maxCount = count
        winnerName = row.name
      }
    }
    if (maxCount > 0) {
      slotWinners[key] = { name: winnerName, count: maxCount }
    }
  }

  return { rows, voterCount, slotWinners }
}

// ---------------------------------------------------------------------------
// Leaderboard (final results)
// ---------------------------------------------------------------------------

export interface CustomLeaderboardEntry {
  slot: CustomSlot
  entries: Array<{ name: string; count: number }>
}

export function buildCustomLeaderboard(
  allVotes: Vote[],
  participants: Participant[],
  slots: CustomSlot[],
): CustomLeaderboardEntry[] {
  const nameById = new Map(participants.map((p) => [p.id, p.name]))
  const participantIds = participants.map((p) => p.id)
  const slotKeys = slots.map((s) => s.key)

  // Count across all rounds
  const totalCounts = new Map<string, Record<string, number>>()
  for (const pid of participantIds) {
    const counts: Record<string, number> = {}
    for (const key of slotKeys) counts[key] = 0
    totalCounts.set(pid, counts)
  }

  for (const vote of allVotes) {
    const assignments = vote.pair_assignments as Record<string, string> | null
    if (!assignments) continue
    for (const [pid, slotKey] of Object.entries(assignments)) {
      const counts = totalCounts.get(pid)
      if (counts && slotKey in counts) {
        counts[slotKey]++
      }
    }
  }

  return slots.map((slot) => ({
    slot,
    entries: participantIds
      .map((pid) => ({
        name: nameById.get(pid) ?? '',
        count: totalCounts.get(pid)?.[slot.key] ?? 0,
      }))
      .sort((a, b) => b.count - a.count)
      .filter((e) => e.count > 0),
  }))
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/custom-game.ts
git commit -m "feat: add custom game logic library"
```

---

### Task 4: Validation Schema Updates

**Files:**
- Modify: `src/lib/validation.ts`

- [ ] **Step 1: Add 'custom' to gameTypeEnum**

Update the `gameTypeEnum` to include `'custom'`:

```typescript
const gameTypeEnum = z.enum([
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'would_you_rather',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
])
```

- [ ] **Step 2: Add custom_slots to createGameSchema**

Add after the `participant_filter` field:

```typescript
  custom_slots: z
    .object({
      slots: z
        .array(
          z.object({
            key: z.string(),
            label: sanitizedString(1, 20),
            emoji: z.string().min(1).max(4),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          }),
        )
        .min(2)
        .max(5),
      title: sanitizedString(1, 100),
    })
    .optional()
    .nullable(),
```

- [ ] **Step 3: Add customAssignments to createVoteSchema**

Add after `animeChoice`:

```typescript
  customAssignments: z.record(z.string(), z.string()).optional().nullable(),
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/validation.ts
git commit -m "feat(validation): add custom game schemas"
```

---

### Task 5: Generalized Round Generation

**Files:**
- Modify: `src/lib/utils.ts`

- [ ] **Step 1: Add generateNRounds() function**

Add after the existing `generatePairRounds()` function:

```typescript
/** Generate rounds with N participants each (for custom games with 2-5 slots). */
export function generateNRounds(
  participantIds: string[],
  roundCount: number,
  poolSize: number,
): string[][] {
  if (participantIds.length < poolSize || poolSize < 2) return []

  const rounds: string[][] = []
  const appearances = new Map<string, number>()
  for (const id of participantIds) appearances.set(id, 0)
  const seen = new Set<string>()

  for (let r = 0; r < roundCount; r++) {
    // Sort by fewest appearances, then shuffle ties
    const sorted = [...participantIds].sort((a, b) => {
      const diff = (appearances.get(a) ?? 0) - (appearances.get(b) ?? 0)
      if (diff !== 0) return diff
      return Math.random() - 0.5
    })

    // Take top poolSize candidates
    const group = sorted.slice(0, poolSize)
    const key = [...group].sort().join(',')

    // Try to avoid duplicate groups (best effort)
    if (seen.has(key) && r < roundCount - 1) {
      // Shuffle and retry once
      const shuffled = [...participantIds].sort(() => Math.random() - 0.5)
      const alt = shuffled.slice(0, poolSize)
      const altKey = [...alt].sort().join(',')
      if (!seen.has(altKey)) {
        group.length = 0
        group.push(...alt)
      }
    }

    const finalKey = [...group].sort().join(',')
    seen.add(finalKey)
    rounds.push(group)

    for (const id of group) {
      appearances.set(id, (appearances.get(id) ?? 0) + 1)
    }
  }

  return rounds
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/utils.ts
git commit -m "feat: add generalized N-person round generation"
```

---

### Task 6: Game Creation + Start APIs

**Files:**
- Modify: `src/app/api/games/route.ts`
- Modify: `src/app/api/games/[code]/start/route.ts`

- [ ] **Step 1: Store custom_slots on game creation**

In `src/app/api/games/route.ts`, find where the game row is inserted into the `games` table. Add:

```typescript
custom_slots: parsed.data.custom_slots ?? null,
```

- [ ] **Step 2: Handle custom game in start route**

In `src/app/api/games/[code]/start/route.ts`, add imports at the top:

```typescript
import { isCustomGame } from '@/lib/game-types'
import { getCustomSlotCount } from '@/lib/custom-game'
import { generateNRounds } from '@/lib/utils'
```

Add a new block BEFORE the existing trio/pair game block (the final `else` block). Find where the conditional chain ends before the generic trio/pair handling:

```typescript
  if (isCustomGame(gameType)) {
    const slotCount = getCustomSlotCount(game)
    if (slotCount < 2) {
      return NextResponse.json({ error: 'Custom game needs at least 2 slots configured' }, { status: 400 })
    }

    const { data: participantsData } = await supabase
      .from('participants')
      .select('id, gender, name')
      .eq('game_id', code.toUpperCase())
      .order('display_order')

    if (!participantsData || participantsData.length < slotCount) {
      return NextResponse.json(
        { error: `Need at least ${slotCount} names on the list (one per slot)` },
        { status: 400 },
      )
    }

    const isImportMode = (game.participant_mode ?? 'import') === 'import'
    const useAllParticipants = !isImportMode || game.participant_filter === 'all'
    const roundPool = useAllParticipants
      ? participantsData
      : participantsWhoJoined(participantsData, playersData)

    if (roundPool.length < slotCount) {
      return NextResponse.json(
        { error: `Need at least ${slotCount} people to join before starting` },
        { status: 400 },
      )
    }

    const participantIds = roundPool.map((p) => p.id)
    const groups = generateNRounds(participantIds, game.rounds_count, slotCount)

    if (groups.length === 0) {
      return NextResponse.json(
        { error: `Need at least ${slotCount} people to start` },
        { status: 400 },
      )
    }

    const roundRows = groups.map((group, index) => ({
      game_id: code.toUpperCase(),
      round_number: index + 1,
      participant_ids: group,
      status: index === 0 ? 'active' : 'pending',
      started_at: index === 0 ? now : null,
      ended_at: null,
    }))

    const { error: roundError } = await supabase.from('rounds').insert(roundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await supabase
      .from('games')
      .update({ status: 'active', current_round_number: 1, rounds_count: groups.length })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

    return NextResponse.json({ success: true })
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/games/route.ts src/app/api/games/[code]/start/route.ts
git commit -m "feat: handle custom game creation and start"
```

---

### Task 7: Vote API — Custom Game Branch

**Files:**
- Modify: `src/app/api/votes/route.ts`

- [ ] **Step 1: Add imports**

```typescript
import { isCustomGame } from '@/lib/game-types'
import { parseCustomAssignments, isCustomAssignmentValid, getCustomSlotKeys } from '@/lib/custom-game'
```

- [ ] **Step 2: Add custom game vote branch**

Add a new `else if` block BEFORE the existing pair game block (before `} else if (isPairGame(gameType))`):

```typescript
  } else if (isCustomGame(gameType)) {
    const customAssignments = parseCustomAssignments(parsed.data.customAssignments)
    if (!customAssignments) {
      return NextResponse.json({ error: 'Assign everyone to a category' }, { status: 400 })
    }

    // Fetch custom_slots from game record
    const { data: fullGame } = await supabase
      .from('games')
      .select('custom_slots')
      .eq('id', gameId.toUpperCase())
      .maybeSingle()

    const slotKeys = fullGame?.custom_slots?.slots?.map((s: { key: string }) => s.key) ?? []
    if (slotKeys.length === 0) {
      return NextResponse.json({ error: 'Game has no custom slots configured' }, { status: 400 })
    }

    if (!isCustomAssignmentValid(customAssignments, roundIds, slotKeys)) {
      return NextResponse.json({ error: 'Invalid assignment — assign one person per category' }, { status: 400 })
    }

    row = {
      kiss_participant_id: null,
      marry_participant_id: null,
      kill_participant_id: null,
      pair_assignments: customAssignments as Record<string, string>,
      wyr_choice: null,
      target_player_id: null,
      target_participant_id: null,
    }
  }
```

Note: `pair_assignments` accepts any JSONB — the column has no CHECK constraint, so storing string slot keys (instead of 'kiss'/'kill') works at the DB level. The TypeScript type mismatch (`Record<string, string>` vs `Record<string, PairFlag>`) is handled by the `as` cast since we're going through the Supabase client which accepts any JSON.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/votes/route.ts
git commit -m "feat: handle custom game votes"
```

---

### Task 8: Custom Slot Builder Component

**Files:**
- Create: `src/components/CustomSlotBuilder.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'
import { useState } from 'react'
import type { CustomSlot, CustomSlotsConfig } from '@/types'

const PRESET_EMOJI = [
  '🔥', '💀', '💍', '💚', '🚩', '⭐', '💼', '🏆',
  '💩', '👔', '📋', '🚪', '💕', '👋', '🎯', '👑',
  '🥇', '🥈', '🥉', '✨',
]

const PRESET_COLORS = [
  '#ef4444', '#22c55e', '#3b82f6', '#eab308',
  '#a855f7', '#ec4899', '#64748b', '#b45309',
]

interface Template {
  title: string
  slots: CustomSlot[]
}

const TEMPLATES: Template[] = [
  {
    title: 'Hire / Fire / Promote',
    slots: [
      { key: 'slot_0', label: 'Hire', emoji: '💼', color: '#22c55e' },
      { key: 'slot_1', label: 'Fire', emoji: '🔥', color: '#ef4444' },
      { key: 'slot_2', label: 'Promote', emoji: '⭐', color: '#eab308' },
    ],
  },
  {
    title: 'Date / Friendzone',
    slots: [
      { key: 'slot_0', label: 'Date', emoji: '💕', color: '#ec4899' },
      { key: 'slot_1', label: 'Friendzone', emoji: '👋', color: '#64748b' },
    ],
  },
  {
    title: 'Best / Worst',
    slots: [
      { key: 'slot_0', label: 'Best', emoji: '🏆', color: '#22c55e' },
      { key: 'slot_1', label: 'Worst', emoji: '💩', color: '#ef4444' },
    ],
  },
  {
    title: 'Gold / Silver / Bronze',
    slots: [
      { key: 'slot_0', label: 'Gold', emoji: '🥇', color: '#eab308' },
      { key: 'slot_1', label: 'Silver', emoji: '🥈', color: '#64748b' },
      { key: 'slot_2', label: 'Bronze', emoji: '🥉', color: '#b45309' },
    ],
  },
  {
    title: 'CEO / Intern / Fired',
    slots: [
      { key: 'slot_0', label: 'CEO', emoji: '👔', color: '#3b82f6' },
      { key: 'slot_1', label: 'Intern', emoji: '📋', color: '#a855f7' },
      { key: 'slot_2', label: 'Fired', emoji: '🚪', color: '#ef4444' },
    ],
  },
]

function makeSlots(count: number): CustomSlot[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `slot_${i}`,
    label: '',
    emoji: PRESET_EMOJI[i % PRESET_EMOJI.length],
    color: PRESET_COLORS[i % PRESET_COLORS.length],
  }))
}

interface CustomSlotBuilderProps {
  value: CustomSlotsConfig | null
  onChange: (config: CustomSlotsConfig) => void
}

export function CustomSlotBuilder({ value, onChange }: CustomSlotBuilderProps) {
  const [showTemplates, setShowTemplates] = useState(!value)
  const [editingEmoji, setEditingEmoji] = useState<number | null>(null)
  const [editingColor, setEditingColor] = useState<number | null>(null)

  const slots = value?.slots ?? makeSlots(3)
  const title = value?.title ?? ''

  function updateSlot(index: number, updates: Partial<CustomSlot>) {
    const newSlots = slots.map((s, i) => (i === index ? { ...s, ...updates } : s))
    const newTitle = newSlots.every((s) => s.label)
      ? newSlots.map((s) => s.label).join(' / ')
      : title
    onChange({ slots: newSlots, title: newTitle })
  }

  function setSlotCount(count: number) {
    let newSlots: CustomSlot[]
    if (count > slots.length) {
      newSlots = [...slots, ...makeSlots(count - slots.length).map((s, i) => ({ ...s, key: `slot_${slots.length + i}` }))]
    } else {
      newSlots = slots.slice(0, count)
    }
    const newTitle = newSlots.every((s) => s.label)
      ? newSlots.map((s) => s.label).join(' / ')
      : title
    onChange({ slots: newSlots, title: newTitle })
  }

  function selectTemplate(template: Template) {
    onChange({ slots: template.slots, title: template.title })
    setShowTemplates(false)
  }

  if (showTemplates) {
    return (
      <div className="space-y-3">
        <p className="text-muted text-xs uppercase tracking-wider">Pick a template or start from scratch</p>
        <div className="grid gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.title}
              type="button"
              onClick={() => selectTemplate(t)}
              className="w-full text-left glass-card px-4 py-3 hover:border-theme-strong transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{t.slots.map((s) => s.emoji).join('')}</span>
                <span className="text-body font-semibold text-sm">{t.title}</span>
                <span className="text-faint text-xs ml-auto">{t.slots.length} slots</span>
              </div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onChange({ slots: makeSlots(2), title: '' })
              setShowTemplates(false)
            }}
            className="w-full text-left glass-card px-4 py-3 hover:border-theme-strong transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">✏️</span>
              <span className="text-body font-semibold text-sm">Start from scratch</span>
              <span className="text-faint text-xs ml-auto">2 slots</span>
            </div>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted text-xs uppercase tracking-wider">Custom slots</p>
        <button
          type="button"
          onClick={() => setShowTemplates(true)}
          className="text-xs text-[var(--primary)] hover:opacity-80"
        >
          Change template
        </button>
      </div>

      {/* Slot count */}
      <div className="flex gap-2">
        {[2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setSlotCount(n)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
              slots.length === n
                ? 'bg-[var(--primary)] text-white'
                : 'surface-inset text-muted hover:text-body'
            }`}
          >
            {n} slots
          </button>
        ))}
      </div>

      {/* Slot editor */}
      <div className="space-y-2">
        {slots.map((slot, i) => (
          <div key={slot.key} className="glass-card px-3 py-2.5 space-y-2">
            <div className="flex items-center gap-2">
              {/* Emoji picker trigger */}
              <button
                type="button"
                onClick={() => setEditingEmoji(editingEmoji === i ? null : i)}
                className="text-xl w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5"
              >
                {slot.emoji}
              </button>
              {/* Label input */}
              <input
                type="text"
                value={slot.label}
                onChange={(e) => updateSlot(i, { label: e.target.value.slice(0, 20) })}
                placeholder={`Slot ${i + 1} label`}
                className="flex-1 bg-transparent border-b border-theme text-body text-sm py-1 outline-none focus:border-[var(--primary)]"
              />
              {/* Color picker trigger */}
              <button
                type="button"
                onClick={() => setEditingColor(editingColor === i ? null : i)}
                className="w-6 h-6 rounded-full border-2 border-white/20 shrink-0"
                style={{ backgroundColor: slot.color }}
              />
            </div>

            {/* Emoji grid */}
            {editingEmoji === i && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PRESET_EMOJI.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { updateSlot(i, { emoji: e }); setEditingEmoji(null) }}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-base hover:bg-white/10 ${
                      slot.emoji === e ? 'bg-white/15 ring-1 ring-white/30' : ''
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}

            {/* Color grid */}
            {editingColor === i && (
              <div className="flex gap-2 pt-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { updateSlot(i, { color: c }); setEditingColor(null) }}
                    className={`w-7 h-7 rounded-full border-2 ${
                      slot.color === c ? 'border-white' : 'border-white/20'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Live preview */}
      {slots.some((s) => s.label) && (
        <div>
          <p className="text-muted text-xs uppercase tracking-wider mb-2">Preview</p>
          <div className="flex gap-2">
            {slots.map((slot) => (
              <button
                key={slot.key}
                type="button"
                disabled
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-white/10 text-center"
                style={{ backgroundColor: `${slot.color}20`, borderColor: `${slot.color}60`, color: slot.color }}
              >
                {slot.emoji} {slot.label || '...'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CustomSlotBuilder.tsx
git commit -m "feat: add CustomSlotBuilder component with templates"
```

---

### Task 9: Game Creation Wizard — Custom Mode

**Files:**
- Modify: `src/app/create/page.tsx`

- [ ] **Step 1: Add imports and state**

Add to imports:
```typescript
import { isCustomGame } from '@/lib/game-types'
import { CustomSlotBuilder } from '@/components/CustomSlotBuilder'
import type { CustomSlotsConfig } from '@/types'
```

Add state variable after existing state declarations:
```typescript
const [customSlots, setCustomSlots] = useState<CustomSlotsConfig | null>(null)
```

- [ ] **Step 2: Reset customSlots in selectGameType**

Add at the top of the `selectGameType` function:
```typescript
  setCustomSlots(null)
```

Also add custom game handling for participant mode:
```typescript
  ...(isCustomGame(type) ? { participant_mode: 'import' as const } : {}),
```

- [ ] **Step 3: Add custom slot builder in settings area**

Find the WST quote source section and the round settings area. After the WST section, add a custom game section:

```typescript
{isCustom && (
  <CustomSlotBuilder value={customSlots} onChange={setCustomSlots} />
)}
```

Where `isCustom` is computed:
```typescript
const isCustom = isCustomGame(settings.game_type)
```

- [ ] **Step 4: Update round settings for custom games**

In the round settings area, custom games should show the standard round count chips (like SMK), not the WST automatic message. Make sure the `{isWst ? ... : ...}` conditional doesn't hide the round selector for custom games.

- [ ] **Step 5: Pass custom_slots in game creation payload**

In the `createGame` function's `JSON.stringify` call, add:

```typescript
custom_slots: isCustom ? customSlots : null,
```

- [ ] **Step 6: Update validation — disable create button if custom slots incomplete**

In the button disabled logic, add a check that custom game has all labels filled:

```typescript
const customSlotsValid = !isCustom || (customSlots && customSlots.slots.length >= 2 && customSlots.slots.every((s) => s.label.trim()))
```

Use this in the "Next" button disabled state.

- [ ] **Step 7: Commit**

```bash
git add src/app/create/page.tsx
git commit -m "feat: add custom game mode to creation wizard"
```

---

### Task 10: Custom Vote Card Component

**Files:**
- Create: `src/components/CustomVoteCard.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'
import type { Participant, CustomSlot } from '@/types'
import { Avatar } from '@/components/Avatar'

interface CustomVoteCardProps {
  participants: Participant[]
  slots: CustomSlot[]
  assignments: Record<string, string>
  onAssign: (participantId: string, slotKey: string) => void
  disabled?: boolean
}

export function CustomVoteCard({
  participants,
  slots,
  assignments,
  onAssign,
  disabled,
}: CustomVoteCardProps) {
  const usedSlots = new Set(Object.values(assignments))

  return (
    <div className="space-y-3">
      {participants.map((p) => {
        const currentSlot = assignments[p.id]
        return (
          <div key={p.id} className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <Avatar name={p.name} photoUrl={p.photo_url} />
              <div className="min-w-0 flex-1">
                <p className="text-body font-bold text-lg leading-tight truncate">{p.name}</p>
                {currentSlot && (() => {
                  const slot = slots.find((s) => s.key === currentSlot)
                  return slot ? (
                    <p className="text-xs mt-0.5" style={{ color: slot.color }}>
                      {slot.emoji} {slot.label}
                    </p>
                  ) : null
                })()}
              </div>
            </div>
            <div className="flex gap-1.5">
              {slots.map((slot) => {
                const isActive = currentSlot === slot.key
                const isUsedByOther = !isActive && usedSlots.has(slot.key)
                return (
                  <button
                    key={slot.key}
                    type="button"
                    onClick={() => onAssign(p.id, slot.key)}
                    disabled={disabled || isUsedByOther}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                      isActive
                        ? 'text-white'
                        : isUsedByOther
                          ? 'opacity-40 cursor-not-allowed surface-inset border-theme text-muted'
                          : 'surface-inset border-theme text-muted hover:border-theme-strong'
                    }`}
                    style={
                      isActive
                        ? { backgroundColor: `${slot.color}30`, borderColor: `${slot.color}80`, color: slot.color }
                        : undefined
                    }
                  >
                    {slot.emoji} {slot.label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CustomVoteCard.tsx
git commit -m "feat: add CustomVoteCard component"
```

---

### Task 11: Custom Round Results Component

**Files:**
- Create: `src/components/CustomRoundResults.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'
import type { CustomSlot } from '@/types'
import type { CustomTally } from '@/lib/custom-game'
import { Avatar } from '@/components/Avatar'

interface CustomRoundResultsProps {
  tally: CustomTally
  slots: CustomSlot[]
  myAssignment?: Record<string, string> | null
}

export function CustomRoundResults({ tally, slots, myAssignment }: CustomRoundResultsProps) {
  const gridCols: Record<number, string> = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
  }

  return (
    <div className="space-y-4">
      {/* Winners summary */}
      <div className="glass-card border border-theme-strong p-4 space-y-3">
        <p className="text-muted text-xs uppercase tracking-wider text-center">
          Round results · {tally.voterCount} {tally.voterCount === 1 ? 'vote' : 'votes'}
        </p>
        <div className={`grid gap-2 ${gridCols[slots.length] ?? 'grid-cols-3'}`}>
          {slots.map((slot) => {
            const winner = tally.slotWinners[slot.key]
            return (
              <div key={slot.key} className="surface-inset rounded-xl px-2 py-3 text-center">
                <p className="text-lg">{slot.emoji}</p>
                <p className="text-faint text-[10px] uppercase tracking-wider mt-0.5">Most {slot.label}</p>
                <p className="text-body font-semibold text-sm mt-1 leading-tight truncate">
                  {winner?.name ?? '—'}
                </p>
                {winner && <p className="text-faint text-[10px] mt-0.5">{winner.count} votes</p>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Per-participant breakdown */}
      <div className="space-y-3">
        {tally.rows.map((row) => {
          const maxCount = Math.max(1, ...Object.values(row.counts))
          const mySlot = myAssignment?.[row.participantId]
          const mySlotMeta = mySlot ? slots.find((s) => s.key === mySlot) : null

          return (
            <div key={row.participantId} className="glass-card rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <Avatar name={row.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-bold truncate">{row.name}</p>
                  {mySlotMeta && (
                    <p className="text-xs mt-0.5" style={{ color: mySlotMeta.color }}>
                      You: {mySlotMeta.emoji} {mySlotMeta.label}
                    </p>
                  )}
                </div>
              </div>
              <div className={`grid gap-2 ${gridCols[slots.length] ?? 'grid-cols-3'}`}>
                {slots.map((slot) => {
                  const count = row.counts[slot.key] ?? 0
                  const pct = Math.min((count / maxCount) * 100, 100)
                  const isWinner = tally.slotWinners[slot.key]?.name === row.name
                  return (
                    <div key={slot.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span style={{ color: slot.color }}>{slot.emoji}</span>
                        <span className="text-body font-bold">{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: isWinner ? slot.color : `${slot.color}80`,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CustomRoundResults.tsx
git commit -m "feat: add CustomRoundResults component"
```

---

### Task 12: Wire Custom Voting into Player Page

**Files:**
- Modify: `src/app/game/[code]/page.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { isCustomGame } from '@/lib/game-types'
import { getCustomSlots, getCustomSlotKeys, tallyCustomVotes, fillRandomCustomAssignment, completeRandomCustomAssignment } from '@/lib/custom-game'
import { CustomVoteCard } from '@/components/CustomVoteCard'
import { CustomRoundResults } from '@/components/CustomRoundResults'
```

- [ ] **Step 2: Add custom assignment state**

Near the other vote state variables:
```typescript
const [customAssignments, setCustomAssignments] = useState<Record<string, string>>({})
```

Reset on round change (find where other vote state is reset):
```typescript
setCustomAssignments({})
```

- [ ] **Step 3: Add custom game voting UI**

Find the section where trio/pair voting renders (the `ParticipantPhotoCard` mapping). Add a branch before it:

```typescript
{isCustomGame(gameType) && game && currentRound ? (() => {
  const slots = getCustomSlots(game)
  const roundParts = participants.filter((p) => currentRound.participant_ids.includes(p.id))
  return (
    <CustomVoteCard
      participants={roundParts}
      slots={slots}
      assignments={customAssignments}
      onAssign={(pid, slotKey) => {
        setCustomAssignments((prev) => {
          // Remove any existing assignment of this slot to another participant
          const cleaned: Record<string, string> = {}
          for (const [id, key] of Object.entries(prev)) {
            if (key !== slotKey && id !== pid) cleaned[id] = key
          }
          cleaned[pid] = slotKey
          return cleaned
        })
      }}
      disabled={submitted}
    />
  )
})() : null}
```

- [ ] **Step 4: Update vote submission for custom games**

Find the `voteBody` construction. Add a branch for custom games:

```typescript
  : isCustomGame(submitGameType)
  ? { customAssignments }
```

- [ ] **Step 5: Update submit button for custom games**

The submit button needs to check that all slots are assigned for custom games. Find the disabled logic and add:

```typescript
const customComplete = !isCustomGame(gameType) || (
  game && Object.keys(customAssignments).length === getCustomSlots(game).length
)
```

- [ ] **Step 6: Update auto-submit for custom games**

Find the auto-submit handler. Add custom game random fill:

```typescript
if (isCustomGame(submitGameType) && game && currentRound) {
  const slotKeys = getCustomSlotKeys(game)
  const roundParts = currentRound.participant_ids
  const filled = completeRandomCustomAssignment(customAssignments, roundParts, slotKeys)
  setCustomAssignments(filled)
}
```

- [ ] **Step 7: Add custom results display**

Find the results view section. Add a branch for custom games:

```typescript
{isCustomGame(gameType) && game ? (() => {
  const slots = getCustomSlots(game)
  const slotKeys = slots.map((s) => s.key)
  const roundParts = lastFinishedRound.participant_ids
  const nameMap = new Map(participants.map((p) => [p.id, p.name]))
  const tally = tallyCustomVotes(lastRoundVotes, roundParts, nameMap, slotKeys)
  const myVote = lastRoundVotes.find((v) => v.player_id === myPlayerId)
  const myAssignment = myVote?.pair_assignments as Record<string, string> | null
  return <CustomRoundResults tally={tally} slots={slots} myAssignment={myAssignment} />
})() : null}
```

- [ ] **Step 8: Commit**

```bash
git add src/app/game/[code]/page.tsx
git commit -m "feat: wire custom game voting and results into player page"
```

---

### Task 13: Wire Custom Results into Host Page

**Files:**
- Modify: `src/app/host/[code]/page.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { isCustomGame } from '@/lib/game-types'
import { getCustomSlots, tallyCustomVotes, buildCustomLeaderboard } from '@/lib/custom-game'
import { CustomRoundResults } from '@/components/CustomRoundResults'
```

- [ ] **Step 2: Add custom results in between-rounds view**

Find the trio/pair between-rounds results section. Add a branch:

```typescript
{isCustomGame(gameType) && game ? (() => {
  const slots = getCustomSlots(game)
  const slotKeys = slots.map((s) => s.key)
  const nameMap = new Map(participants.map((p) => [p.id, p.name]))
  const tally = tallyCustomVotes(roundVotes, lastFinishedRound.participant_ids, nameMap, slotKeys)
  return <CustomRoundResults tally={tally} slots={slots} />
})() : null}
```

- [ ] **Step 3: Add custom results in finals view**

Find the finals/all-rounds results section. Add a branch for custom games that shows per-round results and leaderboard:

```typescript
{isCustomGame(gameType) && game ? (
  <div className="space-y-8">
    {/* Leaderboard */}
    {(() => {
      const slots = getCustomSlots(game)
      const leaderboard = buildCustomLeaderboard(votes, participants, slots)
      return (
        <div className="glass-card border border-theme-strong p-4 space-y-4">
          <p className="text-muted text-xs uppercase tracking-wider text-center">Final Leaderboard</p>
          {leaderboard.map((entry) => (
            <div key={entry.slot.key} className="space-y-1">
              <p className="text-sm font-semibold" style={{ color: entry.slot.color }}>
                {entry.slot.emoji} Most {entry.slot.label}
              </p>
              {entry.entries.slice(0, 3).map((e, i) => (
                <p key={e.name} className="text-body text-sm pl-6">
                  {i === 0 ? '🏆' : `${i + 1}.`} {e.name} ({e.count} votes)
                </p>
              ))}
            </div>
          ))}
        </div>
      )
    })()}

    {/* Per-round results */}
    {allRounds.map((round) => {
      const roundVotesForRound = votes.filter((v) => v.round_id === round.id)
      const slots = getCustomSlots(game)
      const slotKeys = slots.map((s) => s.key)
      const nameMap = new Map(participants.map((p) => [p.id, p.name]))
      const tally = tallyCustomVotes(roundVotesForRound, round.participant_ids, nameMap, slotKeys)
      return (
        <div key={round.id}>
          <h2 className="text-muted text-xs uppercase tracking-wider mb-3">Round {round.round_number}</h2>
          <CustomRoundResults tally={tally} slots={slots} />
        </div>
      )
    })}
  </div>
) : null}
```

- [ ] **Step 4: Add custom game to live tally in host active round view**

Find the live tally section (where it shows real-time vote counts per category). Add a custom game branch that reads from `pair_assignments`:

```typescript
{isCustomGame(gameType) && game && roundVotes.length > 0 && !game.anonymous && (
  <div>
    <p className="text-muted text-xs uppercase tracking-wider mb-2">Live Tally</p>
    <div className="space-y-2">
      {roundParts.map((p) => {
        const slots = getCustomSlots(game)
        const counts = slots.map((slot) => ({
          slot,
          count: roundVotes.filter((v) => {
            const assignments = v.pair_assignments as Record<string, string> | null
            return assignments?.[p.id] === slot.key
          }).length,
        }))
        return (
          <div key={p.id} className="glass-card px-4 py-3 flex items-center gap-4">
            <p className="font-semibold text-body w-24 truncate">{p.name}</p>
            <div className="flex gap-3 text-sm">
              {counts.map(({ slot, count }) => (
                <span key={slot.key} style={{ color: slot.color }}>
                  {slot.emoji} {count}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/host/[code]/page.tsx
git commit -m "feat: wire custom game results into host page"
```

---

### Task 14: Share Text

**Files:**
- Modify: `src/components/ShareRoundResults.tsx`
- Modify: `src/components/ShareResults.tsx`

- [ ] **Step 1: Add custom game share text in ShareRoundResults.tsx**

Add import:
```typescript
import { isCustomGame } from '@/lib/game-types'
import { getCustomSlots, tallyCustomVotes } from '@/lib/custom-game'
```

In `buildRoundShareText`, add a branch before the trio/pair `else` block:

```typescript
  } else if (isCustomGame(gameType)) {
    const slots = getCustomSlots(game)
    const slotKeys = slots.map((s) => s.key)
    const roundParts = participants.filter((p) => round.participant_ids.includes(p.id))
    const nameMap = new Map(roundParts.map((p) => [p.id, p.name]))
    const tally = tallyCustomVotes(votes, round.participant_ids, nameMap, slotKeys)

    lines.push(`✏️ ${game.custom_slots?.title ?? 'Custom Game'} - Round ${round.round_number} of ${game.rounds_count}`)
    for (const slot of slots) {
      const winner = tally.slotWinners[slot.key]
      if (winner) {
        lines.push(`${slot.emoji} Most ${slot.label}: ${winner.name} (${winner.count} votes)`)
      }
    }
  }
```

- [ ] **Step 2: Add custom game share text in ShareResults.tsx**

Add import:
```typescript
import { isCustomGame } from '@/lib/game-types'
import { buildCustomLeaderboard } from '@/lib/custom-game'
```

In `buildShareText`, add a branch before the trio/pair `else` block:

```typescript
  } else if (isCustomGame(gameType)) {
    const slots = game.custom_slots?.slots ?? []
    const leaderboard = buildCustomLeaderboard(votes, participants, slots)
    for (const entry of leaderboard) {
      const top = entry.entries[0]
      if (top) {
        lines.push(`${entry.slot.emoji} Most ${entry.slot.label}: ${top.name}`)
      }
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ShareRoundResults.tsx src/components/ShareResults.tsx
git commit -m "feat: add custom game share text"
```

---

### Task 15: Migration File

**Files:**
- Create: `supabase/migrations/005_custom_game_modes.sql`

- [ ] **Step 1: Create migration**

```sql
-- Custom Game Modes
ALTER TABLE games ADD COLUMN IF NOT EXISTS custom_slots jsonb;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/005_custom_game_modes.sql
git commit -m "feat(migration): add custom_slots column"
```

---

### Task 16: Build and Verify

- [ ] **Step 1: Run typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Run format**

```bash
npx prettier --write 'src/**/*.{ts,tsx}'
```

- [ ] **Step 3: Run build**

```bash
npm run build
```

- [ ] **Step 4: Fix any issues and commit**

```bash
git add -A
git commit -m "fix: address build issues for custom game modes"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Schema + Types | `schema.sql`, `types/index.ts` |
| 2 | Game type config + helpers | `game-types.ts` |
| 3 | Custom game logic library | `custom-game.ts` (create) |
| 4 | Validation schemas | `validation.ts` |
| 5 | N-person round generation | `utils.ts` |
| 6 | Game creation + start APIs | `games/route.ts`, `start/route.ts` |
| 7 | Vote API | `votes/route.ts` |
| 8 | Custom slot builder | `CustomSlotBuilder.tsx` (create) |
| 9 | Creation wizard integration | `create/page.tsx` |
| 10 | Custom vote card | `CustomVoteCard.tsx` (create) |
| 11 | Custom round results | `CustomRoundResults.tsx` (create) |
| 12 | Player page wiring | `game/[code]/page.tsx` |
| 13 | Host page wiring | `host/[code]/page.tsx` |
| 14 | Share text | `ShareRoundResults.tsx`, `ShareResults.tsx` |
| 15 | Migration file | `migrations/005_custom_game_modes.sql` |
| 16 | Build verification | (none — testing) |
