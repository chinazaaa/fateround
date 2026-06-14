# Anonymous Messages Enhancements — Design Spec

## Overview

Enhance the anonymous messages feature with emoji in messages (emoji-mart picker), GIF/sticker support (Klipy API), ephemeral emoji reactions on messages (Supabase Realtime broadcast), a scroll-to-bottom button with unread count badge, and increased max players from 15 to 50.

## 1. Emoji in Messages

### Package
Install `@emoji-mart/react` and `@emoji-mart/data` — the standard React emoji picker.

### Composer UI
- Add a 😀 button next to the send button in `AnonymousMessageComposer`
- Tapping opens the emoji-mart picker as a popover above the composer
- On mobile: picker opens as a bottom sheet; virtual keyboard is dismissed first
- Selecting an emoji inserts it at the cursor position in the textarea
- Picker closes on selection or outside click
- Messages render emoji inline (unicode characters — no special rendering needed)

## 2. GIF/Sticker Support (Klipy API)

### API
- **Klipy API** — free tier with 100 req/hour (testing), unlimited on production approval
- **Base URL:** `https://api.klipy.com`
- **Auth:** API key in URL path — `/api/v1/{APP_KEY}/gifs/search?q=hello`
- **GIF search:** `GET /api/v1/{APP_KEY}/gifs/search?q={query}&per_page=20`
- **GIF trending:** `GET /api/v1/{APP_KEY}/gifs/trending?per_page=20`
- **Sticker search:** `GET /api/v1/{APP_KEY}/stickers/search?q={query}&per_page=20` (separate endpoint, NOT a type param)
- **Sticker trending:** `GET /api/v1/{APP_KEY}/stickers/trending?per_page=20`
- Register at `https://partner.klipy.com/api-keys`
- **API key handling:** Proxy through a Next.js API route (`/api/klipy`) to keep the key server-side. Do NOT use `NEXT_PUBLIC_` prefix.

### Response Structure
```json
{
  "result": true,
  "data": {
    "data": [
      {
        "id": 8041071659142944,
        "slug": "hello-hi-662",
        "title": "Hello",
        "type": "gif",
        "blur_preview": "data:image/jpeg;base64,...",
        "file": {
          "hd": { "gif": { "url": "...", "width": 498, "height": 498 }, "webp": {...}, "mp4": {...} },
          "sm": { "gif": { "url": "...", "width": 220, "height": 220 }, "webp": {...} },
          "xs": { "gif": { "url": "...", "width": 90, "height": 90 }, "webp": {...} }
        }
      }
    ],
    "current_page": 1,
    "per_page": 24,
    "has_next": true
  }
}
```

Use `file.sm.webp.url` for grid previews, `file.hd.gif.url` for the sent message. Use `blur_preview` as placeholder during lazy load.

### Database Changes

Add columns to `anonymous_messages`:
```sql
ALTER TABLE anonymous_messages ADD COLUMN message_type text NOT NULL DEFAULT 'text'
  CHECK (message_type IN ('text', 'gif'));
ALTER TABLE anonymous_messages ADD COLUMN media_url text;
```

### TypeScript Type Changes

Extend `AnonymousMessage`:
```typescript
export interface AnonymousMessage {
  // ...existing fields
  message_type: 'text' | 'gif'
  media_url?: string | null
}
```

Treat missing `message_type` as `'text'` in rendering code (for pre-migration messages).

### Composer UI
- Add a 🎬 button next to the emoji button
- Tapping opens a GIF/sticker search panel (slides up from composer area)
- Panel has two tabs: "GIFs" and "Stickers"
- Search input at top with debounced search (300ms)
- Grid of results below (2 columns, lazy-loaded images with `blur_preview` placeholder)
- Trending results shown by default (no search query)
- Tapping a GIF/sticker sends it immediately via a new `onSendGif(mediaUrl: string)` callback — bypasses the text send flow
- Panel closes after sending, or on outside click, or via an X button at top-right
- **Error handling:** If Klipy API is unreachable or returns errors, show "Couldn't load GIFs — try again" with a retry button inside the picker. The GIF button in the composer always shows (not hidden on API failure).

### Composer Interface Changes

The `AnonymousMessageComposer` `onSend` callback signature stays for text messages. A new `onSendGif: (mediaUrl: string) => void` prop is added for GIF sends.

### Feed Rendering
- Text messages: render as before
- GIF messages: render the image from `media_url` with `max-width: 200px`, rounded corners, lazy loaded
- GIF-only messages (empty text): show image only, no text bubble
- Treat missing `message_type` as `'text'` for backward compat with pre-migration messages

### Reply Previews for GIF Messages
- When replying to a GIF-only message (empty text), `reply_to_text` stores `"[GIF]"` instead of empty string
- The feed displays "[GIF]" as the quoted reply preview text

### API Route Changes
- `POST /api/anonymous-messages` accepts optional `messageType` ('text' | 'gif') and `mediaUrl` fields
- Validation: if `messageType === 'gif'`, `mediaUrl` is required and must be a valid URL
- If `messageType === 'text'`, text must be non-empty (enforced in API route, not schema)
- For GIF messages, text defaults to empty string

### Validation Schema Changes
```typescript
export const createAnonymousMessageSchema = z.object({
  gameId: gameCodeString(),
  playerId: uuidString('playerId'),
  text: z.string().transform((s) => stripHtml(s.trim())).pipe(z.string().max(500)).default(''),
  replyToId: uuidString('replyToId').optional(),
  messageType: z.enum(['text', 'gif']).default('text'),
  mediaUrl: z.string().url().max(2000).optional().nullable(),
})
```

Note: text keeps `stripHtml` sanitization. The `min(1)` constraint is removed from the schema to allow empty text on GIF messages. The API route enforces non-empty text for `messageType === 'text'`.

### Klipy Proxy Route
New API route: `GET /api/klipy?type={gifs|stickers}&q={query}&page={page}`
- Proxies requests to Klipy API server-side, keeping the API key private
- Returns the Klipy response JSON as-is
- Env var: `KLIPY_API_KEY` (NOT `NEXT_PUBLIC_`)

## 3. Emoji Reactions (Ephemeral)

### Mechanism
- Supabase Realtime broadcast channel (no database table)
- Channel name: `reactions:{gameId}`
- Broadcast event: `{ type: 'reaction', messageId: string, emoji: string, playerName: string, action: 'add' | 'remove' }`

### Local State
- In-memory `Map<messageId, Map<emoji, Set<playerName>>>` stored in React state
- Updated on every broadcast received
- Resets on page refresh (by design — ephemeral)

### UI
- Small 😊 button on each message (visible on all messages, not just hover — mobile needs tap targets)
- Tapping opens the full emoji-mart picker positioned near the message (use Floating UI or manual positioning to handle viewport overflow — flip/shift as needed)
- Selecting an emoji broadcasts the reaction and closes the picker
- Reactions display as small pills below the message: `😂 3  🔥 1  ❤️ 2`
- Tapping an existing reaction pill toggles your reaction (add/remove + broadcast)
- Your own reactions are highlighted (filled background)
- One reaction per emoji per player (enforced locally)
- **Rate limiting:** Client-side throttle — max 1 reaction broadcast per 500ms per player to prevent spam

### Component
- New `MessageReactions` component renders the reaction pills
- New `useAnonymousReactions(gameId)` hook manages the Supabase channel subscription and local state

## 4. Scroll-to-Bottom Button with Unread Count

### Behavior
- Floating button appears when scrolled more than 200px from bottom (`SCROLL_THRESHOLD = 200`)
- Shows "↓" icon with unread count badge (e.g. "3 new")
- Badge only shows when count > 0
- Tapping scrolls smoothly to bottom and resets count
- Button disappears when within 80px of bottom (existing `NEAR_BOTTOM_PX`)
- Count increments for each new message that arrives while scrolled up
- Count resets when user scrolls to bottom (manually or via button)

### Implementation
- Replaces the current auto-scroll toggle in `AnonymousMessageFeed`
- Track `unreadCount` state, increment on new message when not near bottom
- The `useAnonymousFeedAutoScroll` hook is removed (no longer needed — orphaned localStorage key `'kmk-anon-feed-auto-scroll'` is harmless)
- Scroll detection uses existing `NEAR_BOTTOM_PX = 80` threshold for disappear, new `SCROLL_THRESHOLD = 200` for appear

### UI
- Position: `absolute bottom-2 right-2` within the feed scroll container (NOT `fixed` — scoped to the feed div)
- Style: glass-card with violet accent, rounded-full, `w-10 h-10`
- Badge: small red circle positioned top-right with white text count
- Animation: fade-in/out with scale transition

## 5. Max Players Increase

- Change `ANONYMOUS_ROOM_MAX_PLAYERS` from 15 to 50 in `src/lib/anonymous-messages.ts`
- Update `max_players` validation in `src/lib/validation.ts` — change `.max(15)` to `.max(50)` in `createGameSchema`
- `ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS` stays at 15 (sensible default, hosts can increase)

## Database Migration Summary

```sql
-- 019: Anonymous messages enhancements
ALTER TABLE anonymous_messages ADD COLUMN message_type text NOT NULL DEFAULT 'text'
  CHECK (message_type IN ('text', 'gif'));
ALTER TABLE anonymous_messages ADD COLUMN media_url text;
```

## New Dependencies

- `@emoji-mart/react` — React wrapper for emoji-mart
- `@emoji-mart/data` — emoji data set

No npm package for Klipy — proxied via Next.js API route using `fetch`.

## Environment Variables

- `KLIPY_API_KEY` — Klipy API key (server-side only, NOT `NEXT_PUBLIC_`)

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/anonymous-messages.ts` | Modify | Update MAX_PLAYERS to 50 |
| `src/lib/validation.ts` | Modify | Update createAnonymousMessageSchema, max_players cap to 50 |
| `src/types/index.ts` | Modify | Add message_type, media_url to AnonymousMessage |
| `src/app/api/anonymous-messages/route.ts` | Modify | Accept messageType, mediaUrl; GIF reply preview |
| `src/app/api/klipy/route.ts` | Create | Proxy route for Klipy API (keeps key server-side) |
| `src/lib/klipy.ts` | Create | Klipy API client (server-side fetch helpers) |
| `src/hooks/useAnonymousMessages.ts` | Modify | Fetch message_type, media_url fields |
| `src/hooks/useAnonymousReactions.ts` | Create | Supabase broadcast channel for reactions |
| `src/components/anonymous-messages/AnonymousMessageComposer.tsx` | Modify | Add emoji + GIF buttons, onSendGif prop |
| `src/components/anonymous-messages/EmojiPickerPopover.tsx` | Create | emoji-mart wrapper with positioning |
| `src/components/anonymous-messages/GifStickerPicker.tsx` | Create | Klipy search UI with tabs |
| `src/components/anonymous-messages/MessageReactions.tsx` | Create | Reaction pills display |
| `src/components/anonymous-messages/AnonymousMessageFeed.tsx` | Modify | GIF rendering, reactions, scroll button |
| `src/components/anonymous-messages/ScrollToBottomButton.tsx` | Create | Floating button with unread badge |
| `src/components/anonymous-messages/AnonymousMessagesPlayerView.tsx` | Modify | Wire onSendGif, pass reaction hooks |
| `src/components/anonymous-messages/AnonymousMessagesHostView.tsx` | Modify | Wire reaction display (read-only for host) |
| `supabase/migrations/019_anonymous_message_media.sql` | Create | Add message_type, media_url columns |

## Scope Boundaries

**In scope:**
- Emoji picker in composer (emoji-mart)
- GIF/sticker search and send (Klipy API via proxy)
- Ephemeral emoji reactions via Supabase broadcast
- Scroll-to-bottom button with unread count
- Max players increase to 50
- Klipy API proxy route (server-side key)

**Out of scope:**
- Persisted reactions (database table)
- Custom sticker upload
- Message formatting (bold, italic, markdown)
- Animated emoji / custom emoji
- GIF auto-play settings
- Reaction analytics or "who reacted" list
