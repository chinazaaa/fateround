# Player Photo Upload Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players upload a profile photo from the waiting lobby's player list, for people-based game modes only.

**Architecture:** All changes are in `src/app/game/[code]/page.tsx`. A hidden `<input type="file">` is triggered by tapping a camera icon (no photo) or the avatar thumbnail (has photo). Upload/delete handlers call the existing `/api/photos` endpoints. A `photoUploading` state drives the spinner. The local `participants` array is optimistically updated after upload/delete, and a cache-busting `?t=` param prevents stale images on re-upload.

**Tech Stack:** React 19, Next.js App Router, existing Supabase Storage API routes, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-06-13-player-photo-upload-design.md`

---

### Task 1: Add photo upload state and hidden file input

**Files:**
- Modify: `src/app/game/[code]/page.tsx:155-173` (state declarations area)
- Modify: `src/app/game/[code]/page.tsx:1347-1356` (waiting view render, before the return JSX)

- [ ] **Step 1: Add state and ref declarations**

After line 173 (`const [pqOpen, setPqOpen] = useState(false)`), add:

```tsx
// Photo upload (people-based modes)
const [photoUploading, setPhotoUploading] = useState(false)
const photoInputRef = useRef<HTMLInputElement>(null)
```

`useRef` is already imported on line 1.

- [ ] **Step 2: Add a helper to check if game is people-based**

Inside the waiting view block (after line 1352, `const canSubmitPoolQuote = !!me?.participant_id`), add:

```tsx
const isPeopleMode = !isWouldYouRather(game?.game_type) && !isMostLikelyTo(game?.game_type) && !isWst
const myParticipant = me?.participant_id ? participants.find((p) => p.id === me.participant_id) : null
const canUploadPhoto = isPeopleMode && !!me?.participant_id
```

- [ ] **Step 3: Commit**

```bash
git add src/app/game/\[code\]/page.tsx
git commit -m "feat: add photo upload state and people-mode check in waiting view"
```

---

### Task 2: Add upload and delete handlers

**Files:**
- Modify: `src/app/game/[code]/page.tsx` (inside the waiting view block, after the variables from Task 1 Step 2)

- [ ] **Step 1: Add the upload handler**

After the `canUploadPhoto` line added in Task 1, add:

```tsx
const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file || !me?.participant_id || photoUploading) return
  // Reset input so re-selecting the same file triggers onChange
  e.target.value = ''

  if (file.size > 2 * 1024 * 1024) {
    toast.error('Photo must be under 2MB')
    return
  }

  setPhotoUploading(true)
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('gameId', gameCode)
    fd.append('participantId', me.participant_id)
    fd.append('playerId', me.id)

    const res = await fetch('/api/photos', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error || 'Failed to upload photo')
      return
    }
    // Optimistic update with cache-busting param
    const url = data.photoUrl + '?t=' + Date.now()
    setParticipants((prev) =>
      prev.map((p) => (p.id === me.participant_id ? { ...p, photo_url: url } : p))
    )
  } catch {
    toast.error('Upload failed — try again')
  } finally {
    setPhotoUploading(false)
  }
}
```

- [ ] **Step 2: Add the delete handler**

Immediately after the upload handler, add:

```tsx
const handlePhotoDelete = async () => {
  if (!me?.participant_id || photoUploading) return
  setPhotoUploading(true)
  try {
    const res = await fetch('/api/photos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: gameCode,
        participantId: me.participant_id,
        playerId: me.id,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error || 'Failed to remove photo')
      return
    }
    // Optimistic update — clear photo
    setParticipants((prev) =>
      prev.map((p) => (p.id === me.participant_id ? { ...p, photo_url: null } : p))
    )
  } catch {
    toast.error('Could not remove photo — try again')
  } finally {
    setPhotoUploading(false)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/game/\[code\]/page.tsx
git commit -m "feat: add photo upload and delete handlers in waiting view"
```

---

### Task 3: Render the photo upload UI in the player list

**Files:**
- Modify: `src/app/game/[code]/page.tsx:1431-1453` (Players Joined list)

- [ ] **Step 1: Add hidden file input**

Inside the `<CenteredCard>`, just before the Players Joined `<div>` (before line 1431), add:

```tsx
{canUploadPhoto && (
  <input
    ref={photoInputRef}
    type="file"
    accept="image/jpeg,image/png,image/webp,image/gif"
    className="hidden"
    onChange={handlePhotoUpload}
  />
)}
```

- [ ] **Step 2: Replace the current player's dot with photo UI**

Replace the player list rendering block (lines 1434-1451):

```tsx
{players.map((p) => {
  const isMe = p.name === myPlayerName
  const myPart = isMe ? myParticipant : null
  const hasPhoto = isMe && !!myPart?.photo_url

  return (
    <div key={p.id} className="flex items-center gap-2">
      {isMe && canUploadPhoto ? (
        photoUploading ? (
          <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : hasPhoto ? (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="block"
            >
              <Avatar name={p.name} photoUrl={myPart!.photo_url} size="sm" />
            </button>
            <button
              type="button"
              onClick={handlePhotoDelete}
              className="absolute -top-1 -right-1 w-4 h-4 min-w-[24px] min-h-[24px] flex items-center justify-center rounded-full bg-red-500/90 text-white text-[10px] leading-none hover:bg-red-400 transition-colors"
              style={{ padding: 0 }}
            >
              ×
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-[var(--surface-inset)] border border-dashed border-[var(--border-strong)] text-faint hover:text-[var(--primary)] hover:border-[var(--primary)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm13.5 3a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
            </svg>
          </button>
        )
      ) : (
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${isMe ? 'bg-[var(--primary)]' : 'bg-[var(--border-strong)]'}`}
        />
      )}
      <span
        className={`text-sm flex-1 min-w-0 truncate ${isMe ? 'text-[var(--primary)] font-semibold' : 'text-body-muted'}`}
      >
        {p.name}
        {isMe ? ' (you)' : ''}
      </span>
      {!joinNeedsGender ? null : (
        <span className="text-[10px] uppercase tracking-wider text-faint shrink-0">
          {playerIdentityLabel(p, participants, game?.game_type)}
        </span>
      )}
    </div>
  )
})}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/game/\[code\]/page.tsx
git commit -m "feat: render photo upload UI in player list for people-based modes"
```

---

### Task 4: Manual testing

**Files:** None (testing only)

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test the full flow**

1. Create a SMK game (people-based mode)
2. Join as a player — verify camera icon appears next to your name in the waiting view
3. Tap camera icon — verify file picker opens
4. Select an image under 2MB — verify spinner shows, then thumbnail replaces camera icon
5. Verify the X button appears on the thumbnail
6. Tap thumbnail — verify file picker opens for re-upload
7. Select a new image — verify thumbnail updates with new photo
8. Tap X button — verify photo is removed, camera icon returns
9. Try uploading a file over 2MB — verify error toast appears
10. Create a WYR game — verify no camera icon appears (question-based mode excluded)

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add src/app/game/\[code\]/page.tsx
git commit -m "fix: address issues found during photo upload testing"
```
