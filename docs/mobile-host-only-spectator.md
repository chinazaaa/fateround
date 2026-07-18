# Mobile task: seat a "host-only" host as a visible spectator ("Host · Watching")

Status: **spec only — not implemented.** Do this in a session where the Expo app can run on a device/simulator (RN can't be verified from the web toolchain).

## Goal (parity with web)

On web (shipped), a host who chooses **"Host only"** (watches, doesn't play) is seated as a **spectator player row** and shows in the roster as **"Host · Watching"** with a **HOST** badge, visible to everyone. Do the same on mobile.

## Current mobile behavior (the gap)

- The mobile host holds a seat **only if they have a local player session** (`hostPlayerId = session?.playerId`). A host+play deep link (`hostPlayerUrl`, carries a `player` resume token) seats them via `autoJoinGame` in `apps/mobile/app/host/[code].tsx:49-65`. A plain host link does **not** seat them → **host-only = no player row**.
- Consequences: a host-only mobile host is **absent from the roster drawer** and can't be badged (the HOST badge from the roster work needs a row; `games.host_player_id` is only published when `hostPlayerId` exists — `apps/mobile/components/host/HostChrome.tsx:65-68`).
- Mobile has **no `useHostSeat` / seat-toggle** (that whole machine is web-only). Host is simply "seated or not".

## What already exists to build on

- `joinGame({ gameCode, playerName, joinAsViewer: true })` in `apps/mobile/lib/api.ts` already creates a **spectator** row (server `spectatorOnJoin` returns true for an explicit viewer, even in the lobby).
- `setPlayerSession` / `getPlayerSession` (`apps/mobile/lib/session`) persist the local session; `HostChrome` already re-reads it and **publishes `host_player_id`** once `hostPlayerId` is set.
- Roster drawer already renders `HOST` (via `row.host` / `manage.hostPlayerId`) and `Watching` (via `viewer`) + `· you` (via `isMe`) — `apps/mobile/components/session/RosterDrawer.tsx`. So once the host has a spectator row, the drawer shows **"Host · Watching · you"** automatically.

## The change

### 1. Seat the host-only host as a spectator (core)
Add a one-time seat in the host shell (best place: `HostChrome`, which has `gameCode`, `hostToken`, and the live `session`). Mirror web's `useHostSeat` active-seat effect:

```ts
// in HostChrome (or a small useHostSpectatorSeat hook it calls)
const seatFiredRef = useRef(false)
useEffect(() => {
  if (seatFiredRef.current) return
  // Only when the host holds NO seat and the game is live (watching matters during play).
  if (hostPlayerId || game.status !== 'active') return
  seatFiredRef.current = true
  void (async () => {
    try {
      const data = await joinGame({ gameCode, playerName: 'Host', joinAsViewer: true })
      await setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender ?? 'both', data.resumeToken ?? null)
      // HostChrome's session subscription picks it up → hostPlayerId set → publishHostPlayerId fires → badge.
    } catch {
      /* best-effort; host can still run the game unseated */
    }
  })()
}, [gameCode, hostPlayerId, game.status])
```

Notes:
- Default name **"Host"** (web does the same; the HOST badge makes it read clearly). If the create screen collected a host name on mobile, prefer that.
- Gate to `game.status === 'active'` (not the lobby) to match web's decision — a host-only host in the *lobby* stays out of the "players to start" list; visibility only matters during play. (If product wants them visible in the lobby too, seat on mount instead, and do step 2.)
- One-shot ref so it can't double-seat; the session subscription + `!hostPlayerId` guard also prevent re-seating on refresh (a refreshed host adopts the existing session).

### 2. (Only if seating in the lobby) Show the host row as "Host · Watching", not "not ready"
`HostLobbyScreen` marks `notReady = p.spectator === true` (`:308`). If the host is a spectator row in the lobby, it would read as a **not-ready player**. Mirror the web fix (`HostPlayerManageList`): for the row whose id === `hostPlayerId`, render **"Host · Watching"** and no Remove, instead of "not ready". Skip this step if step 1 stays gated to `active` only.

## Edge cases / risks
- **Don't double-seat**: guard on `!hostPlayerId` + the one-shot ref; a host who *is* playing (host+play) already has a row and must be skipped.
- **canStart / counts**: a host spectator has `spectator === true`, so it won't count toward min-players (same as web) — verify Bingo/Trivia/etc. start logic still counts only real players.
- **Play-again / replay**: after a reset that re-seats everyone, re-check the host lands back as a spectator (web's reconcile handles this; mobile should re-run the seat effect since `hostPlayerId` clears).
- **Host transfer**: `host_player_id` repoint already handled server-side (`claim-host`); no mobile change needed.
- **Tournament / locked rosters**: the ready endpoint refuses in tournaments; the *join* path used here should still work, but verify a host-only host in a tournament game seats cleanly (or intentionally skip seating there).

## Verification (device)
1. Create a game on mobile, choose **Host only** (don't take a seat), start it (needs enough other players).
2. Confirm the host appears in the roster drawer as **"Host · Watching · you"** with the **HOST** pill.
3. On a *second* client (another phone or web), open the same game and confirm the host shows with the **HOST** badge (cross-client, via `host_player_id`).
4. Toggle/relaunch: refresh the host app → still seated (adopts session), still one row (no duplicate).

## Files
- `apps/mobile/components/host/HostChrome.tsx` — the seat effect (+ already publishes `host_player_id`).
- `apps/mobile/lib/api.ts` — `joinGame` (exists), `publishHostPlayerId` (exists).
- `apps/mobile/lib/session` — `setPlayerSession` / `getPlayerSession` (exist).
- `apps/mobile/components/HostLobbyScreen.tsx` — only if seating in the lobby (step 2).
- Web reference to mirror: `src/hooks/useHostSeat.ts` (`seatHostAsSpectator`, the active-seat effect, the mode reconcile) and `src/components/host/HostPlayerManageList.tsx` (the "Host · Watching" row).
