# Player Photo Upload Integration

## Summary

Add a photo upload UI in the waiting view's "Players Joined" list for people-based game modes (SMK, Red Flag/Green Flag, Smash or Pass). Players tap a camera icon next to their name to upload a photo, which then displays as a circular thumbnail. They can re-upload by tapping the thumbnail or remove it via a small X button.

## Scope

- **Game modes**: People-based only — SMK, Red Flag/Green Flag, Smash or Pass. Question-based modes (WYR, MLT, WST) are excluded.
- **View**: Waiting view only (game status = "waiting").
- **Eligibility**: Player must have a linked `participant_id`.

## UX States

1. **No photo**: A camera icon replaces the colored dot in the player's row. Tapping opens the device file picker (`<input type="file" accept="image/*">`).
2. **Uploading**: A spinner replaces the camera icon.
3. **Has photo**: A circular thumbnail (Avatar component, sm size) with a tiny X button on the top-right corner.
   - Tap thumbnail: opens file picker to re-upload (API upserts).
   - Tap X: calls DELETE /api/photos, reverts to camera icon state.
4. **Error**: Toast notification via existing `useToast` hook. Reverts to previous visual state.

## Other Players

No change — other players keep the colored dot. Their photos already appear in the ParticipantGallery below the list.

## API

No backend changes. Uses existing endpoints:

- `POST /api/photos` — FormData with `file`, `gameId`, `participantId`, `playerId`. Returns `{ photoUrl }`.
- `DELETE /api/photos` — JSON body with `gameId`, `participantId`, `playerId`. Returns `{ ok: true }`.

## Files Changed

- `src/app/game/[code]/page.tsx` — hidden file input ref, `photoUploading` state, upload handler, delete handler, conditional rendering in the player list row for the current player.

## Implementation Details

- **Cache busting**: After re-upload, append `?t={timestamp}` to the returned `photoUrl` before setting state, so the browser doesn't serve a stale cached image from the same storage path.
- **State refresh**: Optimistically update the local `participants` array with the new `photo_url` after upload/delete. Realtime subscription will also propagate the change, but optimistic update gives instant feedback.
- **Concurrency**: Disable the file picker (don't open it) while `photoUploading` is true.
- **X button touch target**: Minimum 24px tap area on the delete button, even though it's visually small.
- **Delete error handling**: Pessimistic — photo stays visible until delete succeeds. On failure, toast the error and keep the photo.

## Constraints

- Max file size: 2MB (enforced by API).
- Allowed types: JPEG, PNG, WebP, GIF (enforced by API with magic byte validation).
- Upload only available while game status is "waiting" (enforced by API).
