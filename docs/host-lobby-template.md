# Host Lobby (mobile-parity) — template & rollout guide

The web host **lobby** (the `waiting` state, before the game starts) has been rebuilt to
match the mobile app's `HostLobbyScreen`: one clean, full-screen, single column instead of
the old tabbed Play/Watch/Manage shell. **Trivia is the reference implementation.** This doc
is the pattern for rolling it out to the remaining host views.

> Scope: this replaces **only** the pre-start lobby. Active/finished games (and the
> play-again ready-up lobby) still use the existing `HostGameLayout` — leave those alone.

## What the host sees

Top→bottom: home logo + theme toggle + **Host settings** (⚙) → `Hosting · <Game>` eyebrow →
room title → **How to play** row → **game-code card** (the hero; tap = share sheet) →
play-as-yourself card → players list (`N / max`) → pinned **Start / End lobby** footer.

`Host settings` opens a sheet with **Sound** + the game's own settings (theme, edit
settings, late-join, transfer). Light/dark lives in the top bar. No "how to play" in the
sheet — it sits under the title (mobile parity).

## Components

| Component | Role |
|---|---|
| `components/host/HostLobby.tsx` | Game-agnostic full-screen lobby shell (portal). Slots for the play card, extra panels, gear settings, and how-to-play. |
| `components/host/HostLobbySettingsSheet.tsx` | The ⚙ sheet: Sound switch + `children` (per-game settings). |
| `components/host/ShareGameModal.tsx` | Mobile-parity share sheet (code + Copy code, link tabs, QR, Share/Copy). Opened by tapping the code card. |
| `components/host/HostLobbySkeleton.tsx` | Branded loading shimmer for the `!game` state. |

### Chrome suppression (important)

While `HostLobby`/`HostLobbySkeleton` are mounted they set `data-host-lobby="active"` on
`<html>`. `globals.css` then:

- `display:none`s `.game-host-chrome` (the app's marketing host header) and
  `.app-fixed-theme-toggle` (the global fixed theme toggle that renders on `/host`) — the
  lobby renders its own single `ThemeToggle` in the top bar.
- docks `.voice-fab` (the floating `AudioChat` control) to
  `bottom: calc(var(--lobby-footer-h) + 1rem)` — `HostLobby` measures its pinned footer into
  `--lobby-footer-h` (ResizeObserver) so the voice pill always clears the Start button.

You don't touch any of this per game — it's automatic. Just render `HostLobby`.

## Step 0 — know your host view's shape (read this first)

This pattern drops in cleanly for host views built on **`HostGameLayout`** (the Play/Watch +
Manage shell — ~28 of the games). Before you start, confirm the view you're editing uses it.
A few games use different shells and need care (do them last, one at a time):

| View | Shell | Note |
|---|---|---|
| `WhotHostView` | `HostRoomShell` | card-table/voice room layout — port carefully |
| `MahjongHostView`, `SecretMessageHostView` | `HostPageShell` | not tabbed; adapt the waiting branch by hand |
| Poll-family (no dedicated view) | `PollHostView` fallback | separate lobby (`HostModePanel`/`PollHostPlayShell`) — out of scope for this pass |

For the standard `HostGameLayout` games, follow the Trivia pattern below.

## Wiring a game (the Trivia pattern)

See `components/trivia/TriviaHostView.tsx`. In the host view:

1. **Gate the lobby** — render `HostLobby` only for the fresh waiting state; keep the tabbed
   layout for everything else:

   ```tsx
   const waitingLobby = game.status === 'waiting' && !game.replay_pending
   ```

2. **Loading** — return the skeleton instead of a spinner while the game loads:

   ```tsx
   if (!game) return <HostLobbySkeleton />
   ```

3. **Render** — when `waitingLobby`, return `<HostLobby …/>` instead of `<HostGameLayout …/>`:

   ```tsx
   return (
     <>
       {waitingLobby ? (
         <HostLobby
           gameCode={gameCode}
           hostToken={hostToken}
           game={game}
           gameTypeLabel={cfg.label}                 // gameTypeConfig(type).label
           players={players}
           maxPlayers={lobbyMaxPlayersFromGameClient(type, game) ?? game.max_players}
           resumeToken={hostResumeToken}
           playCard={<HostModeSelector … />}          // the play-as-yourself card
           howToPlay={<HostRulesRow gameType={type} />}
           settingsChildren={lobbySettings}           // theme picker, edit settings, late-join, transfer
           onStart={() => void startGame()}
           starting={starting}
           startDisabled={!canStart}                  // reuse THIS game's gate — do NOT copy Trivia's `>= 1`
           startDisabledHint={startGateHint}
           startLabel="Start <game>"
           onRemovePlayer={removePlayer}
           removingPlayerId={removingPlayerId}
           highlightPlayerId={hostPlayerId}
           onEnded={load}
         />
       ) : (
         <HostGameLayout … />                         // unchanged
       )}
       {/* keep existing modals (settings, play-again, etc.) */}
     </>
   )
   ```

### Slot conventions

- **`playCard`** — the existing `HostModeSelector` (Host only / Host + play). Reuse the
  view's current mode state and join/rename handlers.
  - **Board/seat games with a token or seat picker** (Monopoly, etc.): pass the picker
    through `HostModeSelector`'s `renderJoinForm` prop instead of the default name input.
  - **Host-can't-play games** (tournament games, or host-run-only games): render an
    explanatory note as `playCard` instead of the selector — see Trivia's `game.tournament_id`
    branch.
- **`settingsChildren`** — the game's lobby settings, in this order: theme picker →
  "Edit settings" button (opens the existing settings modal) → `HostLateJoinSettingsCard`
  (where supported) → `TransferHostControl`. Give the transfer trigger a real button style:
  `triggerClassName="btn-secondary w-full flex items-center justify-center gap-2"`.
- **`howToPlay`** — `<HostRulesRow gameType={type} />`.
- **`children`** — team/word-pool panels that must appear on the main screen (Codewords,
  Describe It, Word Rush, etc.), rendered between the play card and the players list.

### Start gate & capacity — get these right per game

- **`startDisabled` / `startDisabledHint`:** every game has its **own** minimum (Trivia = 1
  active player; team games need teams filled; some board games need N seats). **Reuse the
  view's existing can-start / disabled-reason logic** — do not copy Trivia's `>= 1`. For the
  lobby minimum, `isLobbyLimitGameType(type)` + the game's limits (`src/lib/game-limits.ts`)
  tell you whether a floor applies. If the view already renders a start button with a
  disabled reason, lift that same condition/string into `startDisabled`/`startDisabledHint`.
- **`maxPlayers`:** prefer `lobbyMaxPlayersFromGameClient(type, game)` (handles games with a
  computed/fixed seat count); fall back to `game.max_players`. Shown as `N / max`.

## Per-game rollout checklist

- [ ] Confirm the view uses `HostGameLayout` (Step 0). If not, handle it separately.
- [ ] `if (!game) return <HostLobbySkeleton />`
- [ ] Compute `waitingLobby = status === 'waiting' && !replay_pending`
- [ ] Render `HostLobby` (waiting) vs `HostGameLayout` (everything else)
- [ ] Move host-mode selector into `playCard` (use `renderJoinForm` for token/seat pickers;
      a note instead of the selector for host-can't-play games)
- [ ] Move theme/edit-settings/late-join/transfer into `settingsChildren`
- [ ] `howToPlay={<HostRulesRow …/>}`
- [ ] `maxPlayers` via `lobbyMaxPlayersFromGameClient` (not hardcoded)
- [ ] **Start gate: reuse the game's real minimum** for `startDisabled`/hint — not `>= 1`
- [ ] Team/pool panels (if any) via `children`
- [ ] Keep the view's existing modals (settings, play-again) rendered in both branches
- [ ] `tsc` clean; verify light + dark at a real `/host/<code>` URL — check the players
      count, the start gate actually blocks below minimum, and the settings sheet knobs save

## Notes / open items

- The voice control floats above the footer (mobile's `VoiceRail` does the same). Turning it
  into a docked full-width bar is a shared `AudioChat` change — out of scope here.
- The play-again ready-up lobby (`replay_pending`) is intentionally excluded; it keeps the
  tabbed layout for now (mobile uses `ReplayReadyRing`).
