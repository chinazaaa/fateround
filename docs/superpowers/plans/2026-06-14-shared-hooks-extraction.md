# Shared Hooks Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract duplicated Supabase Realtime subscriptions, timer logic, and auto-submit logic from the monolithic game page and host page into shared hooks.

**Architecture:** Three new hooks in `src/hooks/`: `useGameChannel` consolidates ~300 lines of duplicated Realtime subscription handlers into a single hook with callback-based extensibility; `useRoundTimer` replaces duplicated timer intervals in both pages; `useAutoSubmit` encapsulates the 11 mirrored refs and 115-line auto-submit function from the game page.

**Tech Stack:** React 19, Supabase Realtime (postgres_changes), TypeScript

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/hooks/useGameChannel.ts` | Create | Supabase Realtime channel: subscribes to games, players, participants, rounds, votes, confessions, wst_quote_pool, hot_seat_submissions. Returns reactive state + allows per-page callbacks. |
| `src/hooks/useRoundTimer.ts` | Create | Countdown timer that ticks every 500ms. Handles WST quote_submitted_at offset. Calls `onExpire` once at zero. |
| `src/hooks/useAutoSubmit.ts` | Create | Encapsulates mirrored refs for vote state + auto-submit logic. Exposes refs and a `triggerAutoSubmit` function. |
| `src/app/game/[code]/page.tsx` | Modify | Replace inline Realtime subscription (~lines 535-738), timer (~lines 894-947), and autoSubmitFromRefs (~lines 949-1077) with hook calls. |
| `src/app/host/[code]/page.tsx` | Modify | Replace inline Realtime subscription (~lines 426-585), timer (~lines 664-697), and polling (~lines 587-617) with hook calls. |

---

### Task 1: Create `useGameChannel` hook

**Files:**
- Create: `src/hooks/useGameChannel.ts`

This hook subscribes to all Supabase Realtime postgres_changes for a game and manages the shared state (game, players, participants, rounds, votes, confessions, wstPool). Both pages currently duplicate this subscription logic nearly identically. The hook provides callback props so each page can react to changes differently (e.g., game page plays sounds, host page triggers auto-advance).

- [ ] **Step 1: Create the hook file with types and subscription setup**

```typescript
// src/hooks/useGameChannel.ts
'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { mergeActiveRound, dedupeWstPool, mergeWstPoolEntry } from '@/lib/who-said-this'
import type { Game, Participant, Player, Round, Vote, Confession, WstQuotePoolEntry } from '@/types'

export interface GameChannelState {
  setGame: React.Dispatch<React.SetStateAction<Game | null>>
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>
  setWstPool: React.Dispatch<React.SetStateAction<WstQuotePoolEntry[]>>
  setConfessions: React.Dispatch<React.SetStateAction<Confession[]>>
}

export interface GameChannelCallbacks {
  onGameUpdate?: (game: Game) => void
  onRoundInsert?: (round: Round) => void
  onRoundUpdate?: (round: Round) => void
  onVoteInsert?: (vote: Vote) => void
  onVoteUpdate?: (vote: Vote) => void
  onPlayerInsert?: (player: Player) => void
  onPlayerUpdate?: (player: Player) => void
  onPlayerDelete?: (player: Player) => void
  onConfessionInsert?: (confession: Confession) => void
  onHotSeatSubInsert?: (sub: { id: string; player_id: string; round_id: string }) => void
  onHotSeatSubUpdate?: (sub: { id: string; player_id: string; round_id: string }) => void
}

/**
 * Subscribes to all Supabase Realtime changes for a game.
 * Manages shared state (game, players, participants, wstPool, confessions)
 * and delegates page-specific reactions via callbacks.
 */
export function useGameChannel(
  gameCode: string,
  channelName: string,
  state: GameChannelState,
  callbacks: GameChannelCallbacks
) {
  // Stable ref for callbacks so the channel doesn't re-subscribe on every render
  const cbRef = useRef(callbacks)
  cbRef.current = callbacks

  useEffect(() => {
    const ch = supabase
      .channel(channelName)

      // ── Games ──
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          const g = payload.new as Game
          state.setGame(g)
          cbRef.current.onGameUpdate?.(g)
        }
      )

      // ── Players ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.new as Player
          state.setPlayers((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]))
          cbRef.current.onPlayerInsert?.(p)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.new as Player
          state.setPlayers((prev) => prev.map((x) => (x.id === p.id ? p : x)))
          cbRef.current.onPlayerUpdate?.(p)
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.old as Player
          state.setPlayers((prev) => prev.filter((x) => x.id !== p.id))
          cbRef.current.onPlayerDelete?.(p)
        }
      )

      // ── Participants ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'participants', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.new as Participant
          state.setParticipants((prev) =>
            prev.some((x) => x.id === p.id)
              ? prev
              : [...prev, p].sort((a, b) => a.display_order - b.display_order)
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'participants', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.new as Participant
          state.setParticipants((prev) => prev.map((x) => (x.id === p.id ? p : x)))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'participants', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.old as Participant
          state.setParticipants((prev) => prev.filter((x) => x.id !== p.id))
        }
      )

      // ── Rounds ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` },
        (payload) => cbRef.current.onRoundInsert?.(payload.new as Round)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` },
        (payload) => cbRef.current.onRoundUpdate?.(payload.new as Round)
      )

      // ── Votes ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'votes', filter: `game_id=eq.${gameCode}` },
        (payload) => cbRef.current.onVoteInsert?.(payload.new as Vote)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'votes', filter: `game_id=eq.${gameCode}` },
        (payload) => cbRef.current.onVoteUpdate?.(payload.new as Vote)
      )

      // ── WST Quote Pool ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wst_quote_pool', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const entry = payload.new as WstQuotePoolEntry
          state.setWstPool((prev) => mergeWstPoolEntry(prev, entry))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wst_quote_pool', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const entry = payload.new as WstQuotePoolEntry
          state.setWstPool((prev) => mergeWstPoolEntry(prev, entry))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'wst_quote_pool', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const entry = payload.old as WstQuotePoolEntry
          state.setWstPool((prev) => prev.filter((x) => x.id !== entry.id && x.player_id !== entry.player_id))
        }
      )

      // ── Confessions ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'confessions', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const c = payload.new as Confession
          state.setConfessions((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]))
          cbRef.current.onConfessionInsert?.(c)
        }
      )

      // ── Hot Seat Submissions ──
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hot_seat_submissions', filter: `game_id=eq.${gameCode}` },
        (payload) => cbRef.current.onHotSeatSubInsert?.(payload.new as { id: string; player_id: string; round_id: string })
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hot_seat_submissions', filter: `game_id=eq.${gameCode}` },
        (payload) => cbRef.current.onHotSeatSubUpdate?.(payload.new as { id: string; player_id: string; round_id: string })
      )

      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- channel name is stable
  }, [gameCode, channelName])
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors from `useGameChannel.ts`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useGameChannel.ts
git commit -m "feat: add useGameChannel hook for shared Realtime subscriptions"
```

---

### Task 2: Create `useRoundTimer` hook

**Files:**
- Create: `src/hooks/useRoundTimer.ts`

Both pages have nearly identical timer logic: compute end time from `started_at` (or `quote_submitted_at` for WST), tick every 500ms, call a callback at zero. This hook replaces both.

- [ ] **Step 1: Create the hook file**

```typescript
// src/hooks/useRoundTimer.ts
'use client'

import { useEffect, useRef, useState } from 'react'
import { parseGameType, isWhoSaidThis } from '@/lib/game-types'
import type { Game, Round } from '@/types'

/**
 * Counts down from the round deadline, ticking every 500ms.
 * Calls `onExpire` exactly once when the timer reaches zero.
 *
 * Handles WST's delayed start (quote_submitted_at) automatically.
 */
export function useRoundTimer(opts: {
  game: Game | null
  currentRound: Round | null
  active: boolean
  onExpire: () => void
}): number {
  const { game, currentRound, active, onExpire } = opts
  const [timeLeft, setTimeLeft] = useState(0)
  const expiredRef = useRef(false)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    if (!active || !currentRound?.started_at || !game) {
      setTimeLeft(0)
      return
    }

    expiredRef.current = false

    const gameType = parseGameType(game.game_type)
    const isWst = isWhoSaidThis(gameType)
    const timerStartMs =
      isWst && currentRound.quote_text && currentRound.quote_submitted_at
        ? new Date(currentRound.quote_submitted_at).getTime()
        : new Date(currentRound.started_at).getTime()
    const endMs = timerStartMs + game.timer_seconds * 1000

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endMs - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0 && !expiredRef.current) {
        expiredRef.current = true
        onExpireRef.current()
      }
    }

    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [
    active,
    currentRound?.id,
    currentRound?.started_at,
    currentRound?.quote_text,
    currentRound?.quote_submitted_at,
    game?.timer_seconds,
    game?.game_type,
  ])

  return timeLeft
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors from `useRoundTimer.ts`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRoundTimer.ts
git commit -m "feat: add useRoundTimer hook for shared countdown logic"
```

---

### Task 3: Create `useAutoSubmit` hook

**Files:**
- Create: `src/hooks/useAutoSubmit.ts`

This hook encapsulates the 11 mirrored refs and the `autoSubmitFromRefs` function from the game page. It is only used by the game page (the host doesn't vote), but extracting it reduces the game page by ~130 lines and makes the refs manageable.

- [ ] **Step 1: Read the current autoSubmitFromRefs and all ref mirrors**

Read `src/app/game/[code]/page.tsx` lines 287-299 (ref mirrors) and lines 949-1077 (autoSubmitFromRefs) to get the exact current code. The hook must match the current behavior exactly.

- [ ] **Step 2: Create the hook file**

```typescript
// src/hooks/useAutoSubmit.ts
'use client'

import { useRef } from 'react'
import {
  parseGameType,
  isWouldYouRather,
  isMostLikelyTo,
  isWhoSaidThis,
  isPairGame,
  isCustomGame,
  isThreeChoiceGame,
  isAssignmentComplete,
  voteSlots,
  parsePairVoteMode,
  isPairAssignmentValid,
  completeRandomPairAssignment,
  isBinaryChoiceGame,
} from '@/lib/game-types'
import {
  getCustomSlotKeys,
  completeRandomCustomAssignment,
  isCustomAssignmentValid,
  customAssignmentMode,
} from '@/lib/custom-game'
import { isMltImportGame, mltVoteTargets } from '@/lib/mlt'
import { wstVoteTargets, isAnimeRound } from '@/lib/who-said-this'
import type { Game, Participant, Player, Round, VoteAssignment, PairAssignmentMap, WyrChoice, PlayerGender } from '@/types'

function shuffleCopy<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface AutoSubmitRefs {
  assignmentRef: React.MutableRefObject<VoteAssignment>
  pairAssignmentRef: React.MutableRefObject<PairAssignmentMap>
  customAssignmentsRef: React.MutableRefObject<Record<string, string>>
  wyrChoiceRef: React.MutableRefObject<WyrChoice | null>
  mltTargetPlayerIdRef: React.MutableRefObject<string | null>
  animeChoiceRef: React.MutableRefObject<string | null>
  playersRef: React.MutableRefObject<Player[]>
  currentRoundRef: React.MutableRefObject<Round | null>
  gameRef: React.MutableRefObject<Game | null>
  participantsRef: React.MutableRefObject<Participant[]>
  myPlayerIdRef: React.MutableRefObject<string | null>
  myPlayerGenderRef: React.MutableRefObject<PlayerGender | null>
  submittedRef: React.MutableRefObject<boolean>
}

export function useAutoSubmit(
  gameCode: string,
  opts?: { onCustomAssignmentsChange?: (ca: Record<string, string>) => void }
): {
  refs: AutoSubmitRefs
  triggerAutoSubmit: () => Promise<boolean>
} {
  const onCustomAssignmentsChangeRef = useRef(opts?.onCustomAssignmentsChange)
  onCustomAssignmentsChangeRef.current = opts?.onCustomAssignmentsChange
  const assignmentRef = useRef<VoteAssignment>({ kiss: null, marry: null, kill: null })
  const pairAssignmentRef = useRef<PairAssignmentMap>({})
  const customAssignmentsRef = useRef<Record<string, string>>({})
  const wyrChoiceRef = useRef<WyrChoice | null>(null)
  const mltTargetPlayerIdRef = useRef<string | null>(null)
  const animeChoiceRef = useRef<string | null>(null)
  const playersRef = useRef<Player[]>([])
  const currentRoundRef = useRef<Round | null>(null)
  const gameRef = useRef<Game | null>(null)
  const participantsRef = useRef<Participant[]>([])
  const myPlayerIdRef = useRef<string | null>(null)
  const myPlayerGenderRef = useRef<PlayerGender | null>(null)
  const submittedRef = useRef(false)

  const refs: AutoSubmitRefs = {
    assignmentRef,
    pairAssignmentRef,
    customAssignmentsRef,
    wyrChoiceRef,
    mltTargetPlayerIdRef,
    animeChoiceRef,
    playersRef,
    currentRoundRef,
    gameRef,
    participantsRef,
    myPlayerIdRef,
    myPlayerGenderRef,
    submittedRef,
  }

  async function triggerAutoSubmit(): Promise<boolean> {
    const a = { ...assignmentRef.current }
    const pa = { ...pairAssignmentRef.current }
    let wyr = wyrChoiceRef.current
    let mltTarget = mltTargetPlayerIdRef.current
    const plrs = playersRef.current
    const r = currentRoundRef.current
    const g = gameRef.current
    const parts = participantsRef.current
    const pid = myPlayerIdRef.current
    let animeCh = animeChoiceRef.current
    const customCa = { ...customAssignmentsRef.current }

    if (!r || !pid || !g) return false

    const gameType = parseGameType(g.game_type)
    const roundParts = parts.filter((p) => r.participant_ids.includes(p.id))
    const roundIds = roundParts.map((p) => p.id)
    const useRandom = g.auto_submit_behavior === 'random'
    const isAnimeWst = isWhoSaidThis(gameType) && !!r.anime_metadata

    // Only auto-fill random choices if the player has started voting
    const hasStartedVoting = isBinaryChoiceGame(gameType)
      ? !!wyr
      : isAnimeWst
        ? !!animeCh
        : isMostLikelyTo(gameType) || isWhoSaidThis(gameType)
          ? !!mltTarget
          : isCustomGame(gameType)
            ? Object.keys(customCa).length > 0
            : isPairGame(gameType)
              ? Object.values(pa).some(Boolean)
              : Object.values(a).some(Boolean)

    if (useRandom && hasStartedVoting) {
      if (isBinaryChoiceGame(gameType)) {
        wyr = Math.random() < 0.5 ? 'a' : 'b'
      } else if (isMostLikelyTo(gameType)) {
        const targets = mltVoteTargets(g, parts, plrs)
        if (targets.length > 0) {
          mltTarget = targets[Math.floor(Math.random() * targets.length)].id
        }
      } else if (isAnimeWst) {
        const choices = (r.anime_metadata as { choices: string[] }).choices
        if (choices.length > 0) {
          animeCh = choices[Math.floor(Math.random() * choices.length)]
        }
      } else if (isWhoSaidThis(gameType)) {
        const targets = wstVoteTargets(parts)
        if (targets.length > 0) {
          mltTarget = targets[Math.floor(Math.random() * targets.length)].id
        }
      } else if (isCustomGame(gameType)) {
        const slotKeys = getCustomSlotKeys(g)
        const customMode = customAssignmentMode(g, roundIds.length, slotKeys)
        const filled = completeRandomCustomAssignment(customCa, roundIds, slotKeys, customMode)
        Object.assign(customCa, filled)
        // Write back to ref + notify caller via onCustomAssignmentsChange
        customAssignmentsRef.current = { ...customCa }
        onCustomAssignmentsChangeRef.current?.({ ...customCa })
      } else if (isPairGame(gameType)) {
        const pairMode = parsePairVoteMode(g.pair_vote_mode)
        if (pairMode === 'one_each' && roundIds.length === 2) {
          Object.assign(pa, completeRandomPairAssignment(pa, roundIds, pairMode))
        } else {
          for (const p of roundParts) {
            if (!pa[p.id]) pa[p.id] = Math.random() < 0.5 ? 'kiss' : 'kill'
          }
        }
      } else {
        const unassigned = voteSlots(gameType).filter((slot) => !a[slot])
        const available = shuffleCopy(roundParts.filter((p) => !Object.values(a).includes(p.id)))
        unassigned.forEach((slot, i) => {
          if (available[i]) a[slot] = available[i].id
        })
      }
    }

    let voteBody: Record<string, unknown> | null = null

    if (isBinaryChoiceGame(gameType)) {
      if (!wyr) return false
      voteBody = { wyrChoice: wyr }
    } else if (isMostLikelyTo(gameType)) {
      if (!mltTarget) return false
      voteBody = isMltImportGame(g) ? { targetParticipantId: mltTarget } : { targetPlayerId: mltTarget }
    } else if (isWhoSaidThis(gameType)) {
      if (r.submitter_player_id === pid) return false
      if (!r.quote_text) return false
      if (isAnimeWst) {
        if (!animeCh) return false
        voteBody = { animeChoice: animeCh }
      } else {
        if (!mltTarget) return false
        voteBody = { targetParticipantId: mltTarget }
      }
    } else if (isCustomGame(gameType)) {
      const slotKeys = getCustomSlotKeys(g)
      const customMode = customAssignmentMode(g, roundIds.length, slotKeys)
      if (!isCustomAssignmentValid(customCa, roundIds, slotKeys, customMode)) return false
      voteBody = { customAssignments: customCa }
    } else if (isPairGame(gameType)) {
      const pairMode = parsePairVoteMode(g.pair_vote_mode)
      if (!isPairAssignmentValid(pa, roundIds, pairMode)) return false
      voteBody = {
        pairAssignments: Object.fromEntries(
          roundIds
            .map((id) => [id, pa[id]] as const)
            .filter((entry): entry is [string, 'kiss' | 'kill'] => entry[1] === 'kiss' || entry[1] === 'kill')
        ),
      }
    } else {
      if (!isAssignmentComplete(a, gameType)) return false
      voteBody = {
        kiss: a.kiss,
        marry: isThreeChoiceGame(gameType) ? a.marry : null,
        kill: a.kill,
      }
    }

    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: pid,
          roundId: r.id,
          gameId: gameCode,
          ...voteBody,
        }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  return { refs, triggerAutoSubmit }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors from `useAutoSubmit.ts`. Some imports may need adjustment if `isBinaryChoiceGame`, `customAssignmentMode`, or `isCustomAssignmentValid` are exported from different modules than shown. Check the actual exports:

Run: `grep -n 'export function isBinaryChoiceGame\|export function customAssignmentMode\|export function isCustomAssignmentValid' src/lib/game-types.ts src/lib/custom-game.ts`

Adjust imports if needed.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAutoSubmit.ts
git commit -m "feat: add useAutoSubmit hook to encapsulate vote auto-submit logic"
```

---

### Task 4: Wire `useGameChannel` into the host page

**Files:**
- Modify: `src/app/host/[code]/page.tsx` (lines ~426-585 replaced)

Replace the inline Realtime subscription in the host page with a call to `useGameChannel`. The host page's callbacks handle: resetting lobby state on `waiting`, loading results on `finished`, fetching active round on `active`, merging votes, and tracking hot seat submissions.

- [ ] **Step 1: Read the current host page Realtime block**

Read `src/app/host/[code]/page.tsx` lines 425-585 to capture the exact current subscription code that will be replaced.

- [ ] **Step 2: Add the import and replace the subscription**

Add import at top of file:
```typescript
import { useGameChannel } from '@/hooks/useGameChannel'
```

Replace the entire `useEffect` block (from `// ── Realtime ──` comment through `}, [gameCode])`) with:

```typescript
  // ── Realtime ──────────────────────────────────────────────────────────────
  useGameChannel(gameCode, `host-${gameCode}`, {
    setGame,
    setPlayers,
    setParticipants,
    setWstPool,
    setConfessions,
  }, {
    onGameUpdate: async (g) => {
      if (g.status === 'active') {
        const { data: roundData } = await supabase
          .from('rounds')
          .select('*')
          .eq('game_id', gameCode)
          .eq('status', 'active')
          .maybeSingle()
        if (roundData) {
          setCurrentRound((prev) => mergeActiveRound(prev, roundData))
          advancingRef.current = false
        }
      }
      if (g.status === 'finished') {
        await loadResults()
      }
      if (g.status === 'waiting') {
        resetHostLobbyState()
      }
    },
    onRoundUpdate: (r) => {
      if (r.status === 'active') {
        setCurrentRound((prev) => mergeActiveRound(prev, r))
        setLastFinishedRound(null)
        advancingRef.current = false
        setAdvancing(false)
      }
      if (r.status === 'finished') {
        setCurrentRound(null)
        setLastFinishedRound(r)
        advancingRef.current = false
        setEnding(false)
      }
    },
    onVoteInsert: (vote) => setVotes((prev) => mergeVote(prev, vote)),
    onVoteUpdate: (vote) => setVotes((prev) => mergeVote(prev, vote)),
    onHotSeatSubInsert: (sub) => setActiveHotSeatSubs((prev) => mergeHotSeatSub(prev, sub)),
    onHotSeatSubUpdate: (sub) => setActiveHotSeatSubs((prev) => mergeHotSeatSub(prev, sub)),
  })
```

- [ ] **Step 3: Remove the old `mergeActiveRound` import if it was only used in the subscription**

Check if `mergeActiveRound` is used elsewhere in the host page. It is — in `syncGameState` (line ~403) and the round update handler above. Keep the import.

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/app/host/[code]/page.tsx
git commit -m "refactor: replace host page inline Realtime with useGameChannel hook"
```

---

### Task 5: Wire `useGameChannel` into the game page

**Files:**
- Modify: `src/app/game/[code]/page.tsx` (lines ~535-738 replaced)

The game page's Realtime subscription is more complex because it has page-specific behaviors: playing sounds, updating player session, handling view transitions, fetching votes/confessions on round finish, and resetting the lobby.

- [ ] **Step 1: Read the current game page Realtime block**

Read `src/app/game/[code]/page.tsx` lines 535-738 to capture the exact subscription code.

- [ ] **Step 2: Add the import and replace the subscription**

Add import at top of file:
```typescript
import { useGameChannel } from '@/hooks/useGameChannel'
```

Replace the `// ── Real-time subscriptions ──` useEffect with:

```typescript
  // ── Real-time subscriptions ───────────────────────────────────────────────
  useGameChannel(gameCode, `game-player-${gameCode}`, {
    setGame,
    setPlayers,
    setParticipants,
    setWstPool,
    setConfessions: setAllConfessions,
  }, {
    onGameUpdate: async (newGame) => {
      if (newGame.status === 'active' && myPlayerIdRef.current) {
        const [{ data: activeRound }, { data: parts }] = await Promise.all([
          supabase.from('rounds').select('*').eq('game_id', gameCode).eq('status', 'active').maybeSingle(),
          supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
        ])
        if (parts) setParticipants(parts)
        if (activeRound) {
          applyActiveRound(activeRound)
        }
      }
      if (newGame.status === 'finished') {
        await loadAllResults()
        setView('results')
      }
      if (newGame.status === 'waiting') {
        resetPlayerForLobby(!!myPlayerIdRef.current)
      }
    },
    onRoundInsert: async (round) => {
      if (round.status === 'active' && myPlayerIdRef.current) {
        const { data: parts } = await supabase
          .from('participants')
          .select('*')
          .eq('game_id', gameCode)
          .order('display_order')
        if (parts) setParticipants(parts)
        applyActiveRound(round)
      }
    },
    onRoundUpdate: async (round) => {
      if (round.status === 'active') {
        const priorId = roundFormIdRef.current
        applyActiveRound(round, { switchView: priorId !== round.id })
      }
      if (round.status === 'finished') {
        const [{ data: rv }, { data: rc }] = await Promise.all([
          supabase.from('votes').select('*').eq('round_id', round.id),
          supabase.from('confessions').select('*').eq('round_id', round.id).order('created_at'),
        ])
        setLastFinishedRound(round)
        setLastRoundVotes(rv || [])
        setAllConfessions((prev) => {
          const ids = new Set(prev.map((c) => c.id))
          return [...prev, ...(rc || []).filter((c) => !ids.has(c.id))]
        })
        setAllVotes((prev) => {
          const ids = new Set(prev.map((v) => v.id))
          return [...prev, ...(rv || []).filter((v) => !ids.has(v.id))]
        })
        setAllRounds((prev) => {
          const ids = new Set(prev.map((r) => r.id))
          return ids.has(round.id) ? prev.map((r) => (r.id === round.id ? round : r)) : [...prev, round]
        })
        setView('round_results')
      }
    },
    onPlayerUpdate: (p) => {
      if (p.id === myPlayerIdRef.current) {
        setMyPlayerName(p.name)
        const voteGender = playerVoteGenderForRound(p, participantsRef.current)
        if (voteGender) {
          setMyPlayerGender(voteGender)
          setPlayerSession(gameCode, p.id, p.name, voteGender)
        }
      }
    },
    onPlayerDelete: (p) => {
      if (p.id === myPlayerIdRef.current) {
        clearPlayerSession(gameCode)
        setMyPlayerId(null)
        setMyPlayerName(null)
        setMyPlayerGender(null)
        setEditingJoin(false)
        setView('join')
      }
    },
    onConfessionInsert: () => {
      // Trigger re-render for live confessions in round results
      setLastRoundVotes((prev) => prev)
    },
  })
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Manually test core flow**

Run: `npm run dev`

Open the app in a browser. Create a game, join with another tab, start a round, vote, and verify:
- Players list updates in real time
- Round transitions work (active → finished → results)
- Votes appear
- Game status changes propagate

- [ ] **Step 5: Commit**

```bash
git add src/app/game/[code]/page.tsx
git commit -m "refactor: replace game page inline Realtime with useGameChannel hook"
```

---

### Task 6: Wire `useRoundTimer` into the host page

**Files:**
- Modify: `src/app/host/[code]/page.tsx` (lines ~664-697 replaced)

Replace the host page's inline timer `useEffect` with `useRoundTimer`. The host timer calls `handleEndRound` on expiry.

- [ ] **Step 1: Add the import and replace the timer**

Add import:
```typescript
import { useRoundTimer } from '@/hooks/useRoundTimer'
```

Replace the `// ── Timer (host) ──` useEffect and the `timerRef` state with:

```typescript
  const timeLeft = useRoundTimer({
    game,
    currentRound,
    active: game?.status === 'active' && !!currentRound,
    onExpire: handleEndRound,
  })
```

Remove the `timerRef` declaration (`const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)`) and the `const [timeLeft, setTimeLeft] = useState(0)` state.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/host/[code]/page.tsx
git commit -m "refactor: replace host page inline timer with useRoundTimer hook"
```

---

### Task 7: Wire `useRoundTimer` into the game page

**Files:**
- Modify: `src/app/game/[code]/page.tsx` (lines ~894-947 replaced)

The game page timer is more complex: it also checks vote eligibility and triggers auto-submit. With `useRoundTimer`, the `onExpire` callback handles the auto-submit logic.

- [ ] **Step 1: Add the import and replace the timer**

Add import:
```typescript
import { useRoundTimer } from '@/hooks/useRoundTimer'
```

Replace the `// ── Timer ──` useEffect with:

```typescript
  const timeLeft = useRoundTimer({
    game,
    currentRound,
    active: view === 'round' && !!currentRound?.started_at && !!game,
    onExpire: () => {
      if (submittedRef.current) return

      const roundGender = getRoundParticipantGender(
        currentRoundRef.current?.participant_ids ?? [],
        participantsRef.current
      )
      const gameType = parseGameType(gameRef.current?.game_type)
      const playerGender = myPlayerGenderRef.current ?? getPlayerSession(gameCode)?.playerGender ?? null
      const r = currentRoundRef.current
      const isWstRound = isWhoSaidThis(gameType)
      const isSubmitter = isWstRound && r?.submitter_player_id === myPlayerIdRef.current
      const genderFreeVoting = !!gameRef.current && isGenderFreeVoting(gameRef.current)
      const canVote = isWstRound
        ? !!myPlayerIdRef.current && !isSubmitter && !!r?.quote_text
        : isNameOnlyPlayerJoin(gameType) || genderFreeVoting
          ? !!myPlayerIdRef.current
          : !!roundGender && !!playerGender && canPlayerVoteInRound(playerGender, roundGender)

      if (canVote) {
        void triggerAutoSubmit().then((didSubmit) => {
          if (didSubmit) {
            submittedRef.current = true
            setSubmitted(true)
            playVoteSubmittedSound()
          }
        })
      }
    },
  })
```

Ensure the following imports are present at the top of the game page:
```typescript
import { isGenderFreeVoting } from '@/lib/gender-based' // or wherever it is exported
import { playVoteSubmittedSound } from '@/lib/sounds'
```

Remove the old `timerRef` declaration and the `const [timeLeft, setTimeLeft] = useState(0)` state.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/game/[code]/page.tsx
git commit -m "refactor: replace game page inline timer with useRoundTimer hook"
```

---

### Task 8: Wire `useAutoSubmit` into the game page

**Files:**
- Modify: `src/app/game/[code]/page.tsx` (lines ~287-299 ref mirrors + lines ~949-1077 autoSubmitFromRefs replaced)

Replace the 11 mirrored refs and the `autoSubmitFromRefs` function with `useAutoSubmit`. The hook returns the refs object, which the game page syncs on every render (same pattern as before, but centralized).

- [ ] **Step 1: Add the import and hook call**

Add import:
```typescript
import { useAutoSubmit } from '@/hooks/useAutoSubmit'
```

Add the hook call near the top of the component (after state declarations):
```typescript
  const { refs: autoSubmitRefs, triggerAutoSubmit } = useAutoSubmit(gameCode, {
    onCustomAssignmentsChange: setCustomAssignments,
  })
  const {
    assignmentRef,
    pairAssignmentRef,
    customAssignmentsRef,
    wyrChoiceRef,
    mltTargetPlayerIdRef: autoMltRef,
    animeChoiceRef,
    playersRef,
    currentRoundRef,
    gameRef,
    participantsRef,
    myPlayerIdRef,
    myPlayerGenderRef,
    submittedRef,
  } = autoSubmitRefs
```

- [ ] **Step 2: Remove the old ref mirror block and autoSubmitFromRefs**

Delete lines ~287-317 (the ref mirrors):
```
  const submittedRef = useRef(false)
  const assignmentRef = useRef(assignment)
  assignmentRef.current = assignment
  // ... all 11 ref mirrors ...
```

Delete lines ~949-1077 (the `autoSubmitFromRefs` function and the `shuffleCopy` helper above it if present).

Keep the ref sync pattern — add it after the hook call:
```typescript
  // Sync state → refs so auto-submit reads current values
  assignmentRef.current = assignment
  pairAssignmentRef.current = pairAssignment
  customAssignmentsRef.current = customAssignments
  wyrChoiceRef.current = wyrChoice
  autoMltRef.current = mltTargetPlayerId
  animeChoiceRef.current = animeChoice
  playersRef.current = players
  currentRoundRef.current = currentRound
  gameRef.current = game
  participantsRef.current = participants
  myPlayerIdRef.current = myPlayerId
  myPlayerGenderRef.current = myPlayerGender
```

- [ ] **Step 3: Update all references to the old refs**

Search for any remaining references to `mltTargetPlayerIdRef` in the game page and rename to `autoMltRef` (or keep the name — the destructuring alias handles it).

Also remove the old `timerRef` if not already removed in Task 7, and any other refs that were part of the old block (`announcedRoundIdRef`, `suppressRoundSoundRef`, `joinGenderTouchedRef`, `roundFormIdRef`, `poolFormSyncedRef`) — these are NOT part of auto-submit and should remain as local refs.

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`

Test the auto-submit flow:
1. Create a game with a short timer (10s)
2. Join and start a round
3. Make a partial selection
4. Let the timer expire
5. Verify the vote auto-submits with random fill

- [ ] **Step 6: Commit**

```bash
git add src/app/game/[code]/page.tsx
git commit -m "refactor: replace game page ref mirrors and autoSubmitFromRefs with useAutoSubmit hook"
```

---

### Task 9: Final cleanup and build verification

**Files:**
- Modify: `src/app/game/[code]/page.tsx` — remove unused imports
- Modify: `src/app/host/[code]/page.tsx` — remove unused imports

- [ ] **Step 1: Remove unused imports from both pages**

After the refactor, several imports will be unused. Check and remove:

For the host page, the direct `supabase` import may still be needed for initial load, polling, and API calls. Keep it if so.

For the game page, same — `supabase` is still used for initial load, polling, and WST pool fetches.

Run: `npx tsc --noEmit --pretty 2>&1 | head -50`

Fix any unused import errors.

- [ ] **Step 2: Run a production build**

Run: `npm run build 2>&1 | tail -30`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit cleanup**

```bash
git add src/app/game/[code]/page.tsx src/app/host/[code]/page.tsx
git commit -m "chore: remove unused imports after hooks extraction"
```

---

## Line Count Impact

| File | Before | After (estimated) |
|------|--------|-------------------|
| `src/app/game/[code]/page.tsx` | ~3,165 | ~2,700 (-465) |
| `src/app/host/[code]/page.tsx` | ~2,396 | ~2,150 (-246) |
| `src/hooks/useGameChannel.ts` | 0 | ~180 |
| `src/hooks/useRoundTimer.ts` | 0 | ~55 |
| `src/hooks/useAutoSubmit.ts` | 0 | ~200 |

Net reduction: ~275 lines. More importantly, the duplicated Realtime subscription is now a single source of truth, and the game page's ref management is encapsulated.
