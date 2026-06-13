# Participant Filter — Design Spec

## Summary

Add a `participant_filter` setting that lets the host choose whether all imported participants appear in rounds, or only those who have joined. Available in both the create wizard and the host lobby. Defaults to "all".

## Scope

- **Game modes**: People-based import-mode games only — SMK, Smash or Pass, Red Flag/Green Flag.
- **Joiners mode**: Unaffected — every player creates their own participant, so filtering doesn't apply.
- **Question-based modes**: Unaffected (WYR, MLT, WST don't use participant photo card rounds).

## Data Model

New column on `games` table:

```sql
participant_filter text not null default 'all' check (participant_filter in ('all', 'joined'))
```

- `'all'` — all imported participants appear in rounds regardless of joining (new default).
- `'joined'` — only participants claimed by a player appear in rounds (previous behavior).

## Create Wizard

A segmented control or toggle in the game creation flow, shown only for import-mode people-based games (after participant list is imported). Label: "Who appears in rounds?" with options:

- **Everyone on the list** (`'all'`) — selected by default
- **Only people who join** (`'joined'`)

## Host Lobby

Same toggle, shown in the waiting view for import-mode people-based games. Editable before starting. Updates the game record via the existing PATCH `/api/games` endpoint.

The info text below the "Players Joined" section should reflect the setting:
- When `'all'`: "All {participants.length} names will appear in rounds"
- When `'joined'`: "{roundParticipants.length} of {participants.length} on the list have joined — only joined names appear in rounds"

## Start Route

In `src/app/api/games/[code]/start/route.ts`, the round pool selection changes:

- Current logic: `isImportMode ? participantsWhoJoined(participants, players) : participants`
- New logic: `isImportMode && game.participant_filter === 'joined' ? participantsWhoJoined(participants, players) : participants`

The minimum pool check still applies. If `participant_filter === 'joined'` and not enough people joined, the existing "need at least N" warning shows.

## API Changes

- `POST /api/games` — accept optional `participantFilter` field (`'all' | 'joined'`), default `'all'`.
- `PATCH /api/games` — accept `participantFilter` field for lobby updates.
- No new endpoints needed.

## Files Changed

- `supabase/schema.sql` — add `participant_filter` column to `games` table
- New migration file — add the column
- `src/types/index.ts` — add `participant_filter` to `Game` type
- `src/app/api/games/route.ts` — accept and store `participantFilter` on POST and PATCH
- `src/app/create/page.tsx` — add toggle UI for import-mode people-based games
- `src/app/host/[code]/page.tsx` — add lobby toggle, update `roundParticipants` computation and info text
- `src/app/api/games/[code]/start/route.ts` — use `participant_filter` when building the round pool
