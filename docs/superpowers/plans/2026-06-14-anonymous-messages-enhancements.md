# Anonymous Messages Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add emoji picker, GIF/sticker support (Klipy API), ephemeral emoji reactions, scroll-to-bottom button with unread count, and increase max players to 50 for anonymous message rooms.

**Architecture:** Emoji insertion via `@emoji-mart/react` in the composer. GIFs/stickers fetched from Klipy API through a server-side proxy route. Reactions broadcast ephemerally via Supabase Realtime channels (no DB). Scroll-to-bottom button replaces the auto-scroll toggle. New `message_type` and `media_url` columns on `anonymous_messages` for GIF storage.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres + Realtime broadcast), TypeScript, Tailwind CSS 4, emoji-mart, Klipy REST API

**Spec:** `docs/superpowers/specs/2026-06-14-anonymous-messages-enhancements-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/019_anonymous_message_media.sql` | Create | Add message_type, media_url columns |
| `src/types/index.ts` | Modify | Add message_type, media_url to AnonymousMessage |
| `src/lib/anonymous-messages.ts` | Modify | Update MAX_PLAYERS to 50 |
| `src/lib/validation.ts` | Modify | Update message schema + max_players cap |
| `src/app/api/anonymous-messages/route.ts` | Modify | Accept messageType, mediaUrl; GIF reply preview |
| `src/app/api/klipy/route.ts` | Create | Server-side proxy for Klipy API |
| `src/lib/klipy.ts` | Create | Klipy API fetch helpers |
| `src/hooks/useAnonymousMessages.ts` | Modify | Fetch message_type, media_url fields |
| `src/hooks/useAnonymousReactions.ts` | Create | Supabase broadcast channel for reactions |
| `src/components/anonymous-messages/EmojiPickerPopover.tsx` | Create | emoji-mart wrapper |
| `src/components/anonymous-messages/GifStickerPicker.tsx` | Create | Klipy search UI with tabs |
| `src/components/anonymous-messages/MessageReactions.tsx` | Create | Reaction pills display |
| `src/components/anonymous-messages/ScrollToBottomButton.tsx` | Create | Floating button with unread badge |
| `src/components/anonymous-messages/AnonymousMessageComposer.tsx` | Modify | Add emoji + GIF buttons, onSendGif prop |
| `src/components/anonymous-messages/AnonymousMessageFeed.tsx` | Modify | GIF rendering, reactions, scroll button |
| `src/components/anonymous-messages/AnonymousMessagesPlayerView.tsx` | Modify | Wire onSendGif, pass reaction hooks |
| `src/components/anonymous-messages/AnonymousMessagesHostView.tsx` | Modify | Wire reaction display |

---

### Task 1: Dependencies + Schema + Types

**Files:**
- Create: `supabase/migrations/019_anonymous_message_media.sql`
- Modify: `src/types/index.ts`
- Modify: `src/lib/anonymous-messages.ts`
- Modify: `src/lib/validation.ts`

- [ ] **Step 1: Install emoji-mart**

```bash
pnpm add @emoji-mart/react @emoji-mart/data
```

- [ ] **Step 2: Create migration file**

Create `supabase/migrations/019_anonymous_message_media.sql`:

```sql
-- Anonymous messages enhancements: GIF/sticker support
ALTER TABLE anonymous_messages ADD COLUMN message_type text NOT NULL DEFAULT 'text'
  CHECK (message_type IN ('text', 'gif'));
ALTER TABLE anonymous_messages ADD COLUMN media_url text;
```

- [ ] **Step 3: Update AnonymousMessage type**

In `src/types/index.ts`, find the `AnonymousMessage` interface (around line 156) and add after `reply_to_text`:

```typescript
  message_type?: 'text' | 'gif'
  media_url?: string | null
```

Note: `message_type` is optional in the TS type (with `?`) so pre-migration messages without the field still type-check. Rendering code treats missing `message_type` as `'text'`.

- [ ] **Step 4: Update max players constant**

In `src/lib/anonymous-messages.ts`, change line 18:

```typescript
export const ANONYMOUS_ROOM_MAX_PLAYERS = 50
```

Keep `ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS = 15` unchanged.

- [ ] **Step 5: Update validation schema**

In `src/lib/validation.ts`, find `createAnonymousMessageSchema` (around line 285). Replace it with:

```typescript
export const createAnonymousMessageSchema = z.object({
  gameId: gameCodeString(),
  playerId: uuidString('playerId'),
  text: z
    .string()
    .transform((s) => stripHtml(s.trim()))
    .pipe(z.string().max(500))
    .default(''),
  replyToId: uuidString('replyToId').optional(),
  messageType: z.enum(['text', 'gif']).default('text'),
  mediaUrl: z.string().url().max(2000).optional().nullable(),
})
```

Also find the `max_players` validation in `createGameSchema` — search for `.max(15)` related to `max_players` and change to `.max(50)`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add GIF schema, emoji-mart deps, update max players to 50"
```

---

### Task 2: Klipy API Proxy

**Files:**
- Create: `src/lib/klipy.ts`
- Create: `src/app/api/klipy/route.ts`

- [ ] **Step 1: Create Klipy API client**

Create `src/lib/klipy.ts`:

```typescript
export interface KlipyMediaItem {
  id: number
  slug: string
  title: string
  type: string
  blur_preview: string
  file: {
    hd?: { gif?: { url: string; width: number; height: number }; webp?: { url: string; width: number; height: number } }
    sm?: { gif?: { url: string; width: number; height: number }; webp?: { url: string; width: number; height: number } }
    xs?: { gif?: { url: string; width: number; height: number }; webp?: { url: string; width: number; height: number } }
  }
}

export interface KlipySearchResult {
  result: boolean
  data: {
    data: KlipyMediaItem[]
    current_page: number
    per_page: number
    has_next: boolean
  }
}

const KLIPY_BASE = 'https://api.klipy.com'

function getApiKey(): string {
  const key = process.env.KLIPY_API_KEY
  if (!key) throw new Error('KLIPY_API_KEY environment variable is not set')
  return key
}

export async function searchKlipyGifs(query: string, page = 1, perPage = 20): Promise<KlipySearchResult> {
  const key = getApiKey()
  const url = query.trim()
    ? `${KLIPY_BASE}/api/v1/${key}/gifs/search?q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`
    : `${KLIPY_BASE}/api/v1/${key}/gifs/trending?page=${page}&per_page=${perPage}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Klipy API error: ${res.status}`)
  return res.json()
}

export async function searchKlipyStickers(query: string, page = 1, perPage = 20): Promise<KlipySearchResult> {
  const key = getApiKey()
  const url = query.trim()
    ? `${KLIPY_BASE}/api/v1/${key}/stickers/search?q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`
    : `${KLIPY_BASE}/api/v1/${key}/stickers/trending?page=${page}&per_page=${perPage}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Klipy API error: ${res.status}`)
  return res.json()
}

export function getPreviewUrl(item: KlipyMediaItem): string {
  return item.file.sm?.webp?.url ?? item.file.sm?.gif?.url ?? item.file.xs?.gif?.url ?? ''
}

export function getFullUrl(item: KlipyMediaItem): string {
  return item.file.hd?.gif?.url ?? item.file.sm?.gif?.url ?? ''
}
```

- [ ] **Step 2: Create proxy route**

Create `src/app/api/klipy/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { searchKlipyGifs, searchKlipyStickers } from '@/lib/klipy'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'gifs'
  const query = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? '1')

  try {
    const result =
      type === 'stickers'
        ? await searchKlipyStickers(query, page)
        : await searchKlipyGifs(query, page)

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch from Klipy'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/klipy.ts src/app/api/klipy/route.ts
git commit -m "feat: add Klipy API client and proxy route"
```

---

### Task 3: Update Anonymous Messages API Route

**Files:**
- Modify: `src/app/api/anonymous-messages/route.ts`

- [ ] **Step 1: Update POST handler for GIF support**

Read the file first. Then update the POST handler:

1. The parsed data now includes `messageType` and `mediaUrl` (from the updated schema).

2. After `const { gameId, playerId, text, replyToId } = parsed.data`, add:
```typescript
  const messageType = parsed.data.messageType ?? 'text'
  const mediaUrl = parsed.data.mediaUrl ?? null
```

3. Add validation after the ban check: if `messageType === 'text'` and text is empty, reject:
```typescript
  if (messageType === 'text' && !text.trim()) {
    return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 })
  }
  if (messageType === 'gif' && !mediaUrl) {
    return NextResponse.json({ error: 'GIF URL is required' }, { status: 400 })
  }
```

4. Update the reply preview for GIF messages. Find the line `replyToText = truncateReplyPreview(parent.text)` and replace:
```typescript
    replyToText = parent.text?.trim() ? truncateReplyPreview(parent.text) : '[GIF]'
```

5. Update the insert to include new fields:
```typescript
  const { error } = await supabase.from('anonymous_messages').insert({
    game_id: gameCode,
    player_id: playerId,
    text: text || '',
    reply_to_id: replyToIdValue,
    reply_to_text: replyToText,
    message_type: messageType,
    media_url: mediaUrl,
  })
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/anonymous-messages/route.ts
git commit -m "feat: accept messageType and mediaUrl in anonymous messages API"
```

---

### Task 4: Update useAnonymousMessages Hook

**Files:**
- Modify: `src/hooks/useAnonymousMessages.ts`

- [ ] **Step 1: Update the select query to include new fields**

Find the `.select()` call (around line 49). Update to:

```typescript
      .select('id, game_id, player_id, text, created_at, reply_to_id, reply_to_text, message_type, media_url, players(name)')
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAnonymousMessages.ts
git commit -m "feat: fetch message_type and media_url in anonymous messages hook"
```

---

### Task 5: Emoji Picker Component

**Files:**
- Create: `src/components/anonymous-messages/EmojiPickerPopover.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useEffect, useRef } from 'react'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'

interface EmojiPickerPopoverProps {
  open: boolean
  onClose: () => void
  onSelect: (emoji: string) => void
}

export function EmojiPickerPopover({ open, onClose, onSelect }: EmojiPickerPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onClose])

  if (!open) return null

  return (
    <div ref={containerRef} className="absolute bottom-full mb-2 left-0 z-50">
      <Picker
        data={data}
        onEmojiSelect={(emoji: { native: string }) => {
          onSelect(emoji.native)
          onClose()
        }}
        theme="dark"
        previewPosition="none"
        skinTonePosition="search"
        maxFrequentRows={2}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/anonymous-messages/EmojiPickerPopover.tsx
git commit -m "feat: add EmojiPickerPopover component"
```

---

### Task 6: GIF/Sticker Picker Component

**Files:**
- Create: `src/components/anonymous-messages/GifStickerPicker.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KlipyMediaItem } from '@/lib/klipy'

interface GifStickerPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (mediaUrl: string) => void
}

type Tab = 'gifs' | 'stickers'

export function GifStickerPicker({ open, onClose, onSelect }: GifStickerPickerProps) {
  const [tab, setTab] = useState<Tab>('gifs')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<KlipyMediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchItems = useCallback(
    async (q: string, type: Tab) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/klipy?type=${type}&q=${encodeURIComponent(q)}`)
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        setItems(data.data?.data ?? [])
      } catch {
        setError("Couldn't load — try again")
        setItems([])
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    fetchItems('', tab)
  }, [open, tab, fetchItems])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchItems(query, tab), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, tab, fetchItems])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onClose])

  if (!open) return null

  function getPreviewUrl(item: KlipyMediaItem): string {
    return item.file.sm?.webp?.url ?? item.file.sm?.gif?.url ?? item.file.xs?.gif?.url ?? ''
  }

  function getFullUrl(item: KlipyMediaItem): string {
    return item.file.hd?.gif?.url ?? item.file.sm?.gif?.url ?? ''
  }

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full mb-2 left-0 right-0 z-50 glass-card border border-white/10 rounded-2xl overflow-hidden"
      style={{ maxHeight: '320px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => { setTab('gifs'); setQuery('') }}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'gifs' ? 'bg-violet-500/20 text-violet-300' : 'text-muted hover:text-body'
            }`}
          >
            GIFs
          </button>
          <button
            type="button"
            onClick={() => { setTab('stickers'); setQuery('') }}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'stickers' ? 'bg-violet-500/20 text-violet-300' : 'text-muted hover:text-body'
            }`}
          >
            Stickers
          </button>
        </div>
        <button type="button" onClick={onClose} className="text-faint hover:text-body text-lg px-1" aria-label="Close">
          ×
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${tab}…`}
          className="input-field w-full text-sm"
        />
      </div>

      {/* Grid */}
      <div className="px-3 pb-3 overflow-y-auto" style={{ maxHeight: '220px' }}>
        {loading && items.length === 0 && (
          <div className="text-center py-8">
            <div className="animate-spin h-5 w-5 border-2 border-violet-400 border-t-transparent rounded-full mx-auto" />
          </div>
        )}
        {error && (
          <div className="text-center py-6 space-y-2">
            <p className="text-red-400 text-sm">{error}</p>
            <button type="button" onClick={() => fetchItems(query, tab)} className="text-xs text-violet-300 underline">
              Try again
            </button>
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="text-muted text-sm text-center py-6">No results found</p>
        )}
        {items.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {items.map((item) => {
              const preview = getPreviewUrl(item)
              const full = getFullUrl(item)
              if (!preview || !full) return null
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(full)
                    onClose()
                  }}
                  className="rounded-xl overflow-hidden border border-white/5 hover:border-violet-400/40 transition-colors aspect-square"
                >
                  <img
                    src={preview}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    style={{ background: `url(${item.blur_preview}) center/cover` }}
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-white/10 text-center">
        <p className="text-faint text-[9px]">Powered by Klipy</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/anonymous-messages/GifStickerPicker.tsx
git commit -m "feat: add GifStickerPicker component with Klipy search"
```

---

### Task 7: Scroll-to-Bottom Button

**Files:**
- Create: `src/components/anonymous-messages/ScrollToBottomButton.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

interface ScrollToBottomButtonProps {
  visible: boolean
  unreadCount: number
  onClick: () => void
}

export function ScrollToBottomButton({ visible, unreadCount, onClick }: ScrollToBottomButtonProps) {
  if (!visible) return null

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-2 right-2 z-10 w-10 h-10 rounded-full glass-card border border-violet-400/40 flex items-center justify-center text-violet-300 hover:bg-violet-500/15 transition-all animate-in fade-in zoom-in-90 duration-200"
      aria-label={unreadCount > 0 ? `${unreadCount} new messages — scroll to bottom` : 'Scroll to bottom'}
    >
      <span className="text-lg">↓</span>
      {unreadCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/anonymous-messages/ScrollToBottomButton.tsx
git commit -m "feat: add ScrollToBottomButton component"
```

---

### Task 8: Ephemeral Reactions Hook

**Files:**
- Create: `src/hooks/useAnonymousReactions.ts`

- [ ] **Step 1: Create the hook**

```typescript
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface ReactionEvent {
  messageId: string
  emoji: string
  playerName: string
  action: 'add' | 'remove'
}

type ReactionMap = Map<string, Map<string, Set<string>>>

export function useAnonymousReactions(gameCode: string, enabled: boolean) {
  const [reactions, setReactions] = useState<ReactionMap>(new Map())
  const lastBroadcastRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel(`reactions:${gameCode}`)
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        const { messageId, emoji, playerName, action } = payload as ReactionEvent
        setReactions((prev) => {
          const next = new Map(prev)
          const msgReactions = new Map(next.get(messageId) ?? new Map<string, Set<string>>())
          const players = new Set(msgReactions.get(emoji) ?? new Set<string>())

          if (action === 'add') {
            players.add(playerName)
          } else {
            players.delete(playerName)
          }

          if (players.size > 0) {
            msgReactions.set(emoji, players)
          } else {
            msgReactions.delete(emoji)
          }

          if (msgReactions.size > 0) {
            next.set(messageId, msgReactions)
          } else {
            next.delete(messageId)
          }

          return next
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, gameCode])

  const broadcastReaction = useCallback(
    (messageId: string, emoji: string, playerName: string, action: 'add' | 'remove') => {
      const now = Date.now()
      if (now - lastBroadcastRef.current < 500) return
      lastBroadcastRef.current = now

      supabase.channel(`reactions:${gameCode}`).send({
        type: 'broadcast',
        event: 'reaction',
        payload: { messageId, emoji, playerName, action } satisfies ReactionEvent,
      })
    },
    [gameCode],
  )

  const getReactionsForMessage = useCallback(
    (messageId: string): Map<string, Set<string>> => {
      return reactions.get(messageId) ?? new Map()
    },
    [reactions],
  )

  return { reactions, broadcastReaction, getReactionsForMessage }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAnonymousReactions.ts
git commit -m "feat: add useAnonymousReactions hook with Supabase broadcast"
```

---

### Task 9: Message Reactions Component

**Files:**
- Create: `src/components/anonymous-messages/MessageReactions.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useState } from 'react'
import { EmojiPickerPopover } from './EmojiPickerPopover'

interface MessageReactionsProps {
  messageId: string
  reactions: Map<string, Set<string>>
  myPlayerName: string
  onReact: (messageId: string, emoji: string, action: 'add' | 'remove') => void
  disabled?: boolean
}

export function MessageReactions({
  messageId,
  reactions,
  myPlayerName,
  onReact,
  disabled = false,
}: MessageReactionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleEmojiSelect = (emoji: string) => {
    const existing = reactions.get(emoji)
    const hasMyReaction = existing?.has(myPlayerName) ?? false
    onReact(messageId, emoji, hasMyReaction ? 'remove' : 'add')
  }

  const handlePillClick = (emoji: string) => {
    const existing = reactions.get(emoji)
    const hasMyReaction = existing?.has(myPlayerName) ?? false
    onReact(messageId, emoji, hasMyReaction ? 'remove' : 'add')
  }

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1 relative">
      {/* Existing reaction pills */}
      {Array.from(reactions.entries()).map(([emoji, players]) => {
        const isMine = players.has(myPlayerName)
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => handlePillClick(emoji)}
            disabled={disabled}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-colors ${
              isMine
                ? 'bg-violet-500/25 border border-violet-400/40 text-violet-200'
                : 'bg-white/5 border border-white/10 text-faint hover:border-white/20'
            }`}
          >
            <span>{emoji}</span>
            <span className="text-[10px] tabular-nums">{players.size}</span>
          </button>
        )
      })}

      {/* Add reaction button */}
      {!disabled && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-white/5 border border-white/10 text-faint hover:border-white/20 hover:text-body transition-colors"
            aria-label="Add reaction"
          >
            😊
          </button>
          <EmojiPickerPopover
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSelect={handleEmojiSelect}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/anonymous-messages/MessageReactions.tsx
git commit -m "feat: add MessageReactions component"
```

---

### Task 10: Update Composer — Emoji + GIF Buttons

**Files:**
- Modify: `src/components/anonymous-messages/AnonymousMessageComposer.tsx`

- [ ] **Step 1: Update the composer**

Read the file first. Then make these changes:

1. Add imports:
```typescript
import { useState } from 'react'
import { EmojiPickerPopover } from './EmojiPickerPopover'
import { GifStickerPicker } from './GifStickerPicker'
```

2. Add `onSendGif` prop to the interface:
```typescript
interface AnonymousMessageComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onSendGif: (mediaUrl: string) => void
  sending: boolean
  replyTo: AnonymousMessage | null
  onClearReply: () => void
}
```

3. Add state inside the component:
```typescript
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [gifPickerOpen, setGifPickerOpen] = useState(false)
```

4. Add emoji insert handler:
```typescript
  const handleEmojiInsert = (emoji: string) => {
    const textarea = textareaRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = value.slice(0, start) + emoji + value.slice(end)
      onChange(newValue)
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length
        textarea.focus()
      }, 0)
    } else {
      onChange(value + emoji)
    }
  }
```

5. Add toolbar buttons between the textarea and send button. Replace the existing `<button>` send button with:

```tsx
      <div className="flex items-center gap-2">
        <div className="flex gap-1 relative">
          <button
            type="button"
            onClick={() => { setEmojiPickerOpen((v) => !v); setGifPickerOpen(false) }}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg surface-inset border-theme text-muted hover:text-body transition-colors"
            aria-label="Add emoji"
          >
            😀
          </button>
          <button
            type="button"
            onClick={() => { setGifPickerOpen((v) => !v); setEmojiPickerOpen(false) }}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold surface-inset border-theme text-muted hover:text-body transition-colors"
            aria-label="Send GIF or sticker"
          >
            GIF
          </button>
          <EmojiPickerPopover
            open={emojiPickerOpen}
            onClose={() => setEmojiPickerOpen(false)}
            onSelect={handleEmojiInsert}
          />
          <GifStickerPicker
            open={gifPickerOpen}
            onClose={() => setGifPickerOpen(false)}
            onSelect={(url) => { onSendGif(url); setGifPickerOpen(false) }}
          />
        </div>
        <button type="button" onClick={onSend} disabled={sending || !value.trim()} className="btn-primary flex-1">
          {sending ? 'Sending…' : replyTo ? 'Send reply' : 'Send anonymously'}
        </button>
      </div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/anonymous-messages/AnonymousMessageComposer.tsx
git commit -m "feat: add emoji and GIF buttons to composer"
```

---

### Task 11: Update Message Feed — GIFs, Reactions, Scroll Button

**Files:**
- Modify: `src/components/anonymous-messages/AnonymousMessageFeed.tsx`

- [ ] **Step 1: Update the feed**

Read the file first. Major changes:

1. Add imports:
```typescript
import { ScrollToBottomButton } from './ScrollToBottomButton'
import { MessageReactions } from './MessageReactions'
```

2. Remove the `useAnonymousFeedAutoScroll` import and all auto-scroll toggle logic.

3. Add new props:
```typescript
interface AnonymousMessageFeedProps {
  messages: AnonymousMessage[]
  title?: string
  emptyLabel?: string
  readOnly?: boolean
  canRemove?: boolean
  canReply?: boolean
  removingId?: string | null
  onRemove?: (messageId: string) => void
  onReply?: (message: AnonymousMessage) => void
  highlightMessageId?: string | null
  // New props:
  reactionsMap?: Map<string, Map<string, Set<string>>>
  myPlayerName?: string
  onReact?: (messageId: string, emoji: string, action: 'add' | 'remove') => void
}
```

Remove `showAutoScrollToggle` prop.

4. Replace auto-scroll logic with scroll-to-bottom button state:

```typescript
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const prevMessageCount = useRef(messages.length)

  const SCROLL_THRESHOLD = 200

  // Track new messages when scrolled up
  useEffect(() => {
    const newMessages = messages.length - prevMessageCount.current
    prevMessageCount.current = messages.length
    if (newMessages > 0 && showScrollButton) {
      setUnreadCount((c) => c + newMessages)
    }
  }, [messages.length, showScrollButton])

  // Scroll event handler
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      setShowScrollButton(distFromBottom > SCROLL_THRESHOLD)
      if (distFromBottom <= NEAR_BOTTOM_PX) {
        setUnreadCount(0)
      }
    }
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  const handleScrollToBottom = () => {
    scrollToBottom('smooth')
    setUnreadCount(0)
  }
```

5. Replace the auto-scroll toggle button in the header with just the message count:
```tsx
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted text-xs uppercase tracking-wider">{title}</p>
        <span className="text-faint text-xs tabular-nums">{messages.length}</span>
      </div>
```

6. In the message rendering, add GIF support. Find where `message.text` is displayed. Replace the text paragraph with:
```tsx
                    {message.media_url && (message.message_type === 'gif' || message.message_type === undefined) && message.media_url ? (
                      <div className="mt-1">
                        <img
                          src={message.media_url}
                          alt="GIF"
                          loading="lazy"
                          className="rounded-xl max-w-[200px]"
                        />
                      </div>
                    ) : null}
                    {message.text && (
                      <p className="text-body-muted text-sm leading-relaxed flex-1 min-w-0">{message.text}</p>
                    )}
```

Actually, let me be more precise. Find the existing text display and action buttons area:
```tsx
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-body-muted text-sm leading-relaxed flex-1 min-w-0">{message.text}</p>
```

Replace with:
```tsx
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      {message.text ? (
                        <p className="text-body-muted text-sm leading-relaxed flex-1 min-w-0">{message.text}</p>
                      ) : <div className="flex-1" />}
                      <div className="flex shrink-0 items-center gap-2">
                        {canReply && onReply && (
                          <button type="button" onClick={() => onReply(message)} className="text-faint hover:text-violet-300 text-xs" aria-label="Reply to message">Reply</button>
                        )}
                        {canRemove && onRemove && (
                          <button type="button" onClick={() => onRemove(message.id)} disabled={removingId === message.id} className="text-faint hover:text-red-400 text-xs disabled:opacity-50" aria-label="Remove message">
                            {removingId === message.id ? '…' : 'Remove'}
                          </button>
                        )}
                      </div>
                    </div>
                    {message.media_url && (
                      <img src={message.media_url} alt="GIF" loading="lazy" className="rounded-xl max-w-[200px]" />
                    )}
                    {reactionsMap && myPlayerName && onReact && (
                      <MessageReactions
                        messageId={message.id}
                        reactions={reactionsMap.get(message.id) ?? new Map()}
                        myPlayerName={myPlayerName}
                        onReact={onReact}
                        disabled={readOnly}
                      />
                    )}
                  </div>
```

Remove the duplicate action buttons that were after the old text paragraph.

7. Add the scroll-to-bottom button inside the scroll container. Find `<div ref={scrollRef}` and make it `relative`, then add the button at the end of that div:

```tsx
      <div ref={scrollRef} className="relative max-h-[min(52vh,28rem)] overflow-y-auto scrollbar-thin">
        {/* existing message list */}
        <ScrollToBottomButton
          visible={showScrollButton}
          unreadCount={unreadCount}
          onClick={handleScrollToBottom}
        />
      </div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/anonymous-messages/AnonymousMessageFeed.tsx
git commit -m "feat: add GIF rendering, reactions, scroll-to-bottom button to feed"
```

---

### Task 12: Wire Everything into Player + Host Views

**Files:**
- Modify: `src/components/anonymous-messages/AnonymousMessagesPlayerView.tsx`
- Modify: `src/components/anonymous-messages/AnonymousMessagesHostView.tsx`

- [ ] **Step 1: Update Player View**

Read the file first. Key changes:

1. Add import:
```typescript
import { useAnonymousReactions } from '@/hooks/useAnonymousReactions'
```

2. Add reactions hook (near other hooks):
```typescript
  const { getReactionsForMessage, broadcastReaction, reactions: reactionsMap } = useAnonymousReactions(gameCode, screen === 'active')
```

3. Add `sendGif` function alongside the existing `sendMessage`:
```typescript
  const sendGif = async (mediaUrl: string) => {
    if (!myPlayerId) return
    setSending(true)
    try {
      const res = await fetch('/api/anonymous-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          playerId: myPlayerId,
          text: '',
          messageType: 'gif',
          mediaUrl,
          ...(replyTo ? { replyToId: replyTo.id } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send')
      setReplyTo(null)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to send GIF')
    } finally {
      setSending(false)
    }
  }
```

4. Pass `onSendGif` to `AnonymousMessageComposer`:
```tsx
<AnonymousMessageComposer
  value={messageInput}
  onChange={setMessageInput}
  onSend={sendMessage}
  onSendGif={sendGif}
  sending={sending}
  replyTo={replyTo}
  onClearReply={() => setReplyTo(null)}
/>
```

5. Pass reaction props to `AnonymousMessageFeed`:
```tsx
<AnonymousMessageFeed
  messages={messages}
  // ...existing props
  reactionsMap={reactionsMap}
  myPlayerName={myLobbyName ?? 'Unknown'}
  onReact={(messageId, emoji, action) => broadcastReaction(messageId, emoji, myLobbyName ?? 'Unknown', action)}
/>
```

Where `myLobbyName` is the player's anonymous lobby name. Find how the player's name is stored — it should be available from the player record or session. Search for where the player name is used in the component and use the same variable.

- [ ] **Step 2: Update Host View**

Read the file first. Key changes:

1. Add import:
```typescript
import { useAnonymousReactions } from '@/hooks/useAnonymousReactions'
```

2. Add reactions hook:
```typescript
  const { reactions: reactionsMap } = useAnonymousReactions(gameCode, game?.status === 'active')
```

3. Pass reaction props to `AnonymousMessageFeed` (host view is read-only for reactions):
```tsx
<AnonymousMessageFeed
  messages={messages}
  // ...existing props
  reactionsMap={reactionsMap}
  myPlayerName=""
  onReact={() => {}}
/>
```

Host sees reactions but cannot add them (disabled via readOnly).

- [ ] **Step 3: Commit**

```bash
git add src/components/anonymous-messages/AnonymousMessagesPlayerView.tsx src/components/anonymous-messages/AnonymousMessagesHostView.tsx
git commit -m "feat: wire emoji, GIFs, and reactions into player and host views"
```

---

### Task 13: Build and Verify

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 2: Run format**

```bash
pnpm format
```

- [ ] **Step 3: Run build**

```bash
pnpm build
```

- [ ] **Step 4: Fix any issues and commit**

```bash
git add -A
git commit -m "fix: address build issues for anonymous messages enhancements"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Dependencies + Schema + Types | migration, types, validation, constants |
| 2 | Klipy API proxy | `klipy.ts`, `api/klipy/route.ts` |
| 3 | Update messages API | `api/anonymous-messages/route.ts` |
| 4 | Update messages hook | `useAnonymousMessages.ts` |
| 5 | Emoji picker component | `EmojiPickerPopover.tsx` |
| 6 | GIF/sticker picker component | `GifStickerPicker.tsx` |
| 7 | Scroll-to-bottom button | `ScrollToBottomButton.tsx` |
| 8 | Reactions hook | `useAnonymousReactions.ts` |
| 9 | Reactions component | `MessageReactions.tsx` |
| 10 | Update composer | `AnonymousMessageComposer.tsx` |
| 11 | Update feed | `AnonymousMessageFeed.tsx` |
| 12 | Wire into player + host views | `AnonymousMessagesPlayerView.tsx`, `AnonymousMessagesHostView.tsx` |
| 13 | Build verification | (none — testing) |
