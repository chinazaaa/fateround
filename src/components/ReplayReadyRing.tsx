'use client'

import { CheckmarkCircle02Icon, HandIcon, PlayIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { TrashIcon } from '@/components/host/host-icons'
import { LeaveGameButton, leaveButtonQuietClassName } from '@/components/ui/LeaveGameButton'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import type { Game, Player } from '@/types'

/**
 * "Play again · same settings" ready-up ring — game-agnostic, reusable across games.
 *
 * Shown while a game is reopened for a replay (`status = waiting` + `replay_pending`).
 * The game is a real open lobby, so previous spectators and new joiners appear here too.
 * Readiness reuses the seat mechanic: a player is "ready" when they hold a seat
 * (`spectator === false`). Players tap to get ready / cancel; the host taps "Start game"
 * once enough players are ready. Copy is intentionally generic ("next game", not
 * game-specific terms) so any game can reuse it. Uses the app's current design tokens.
 */
export function ReplayReadyRing({
  players,
  meId,
  isHost,
  minPlayers,
  onToggleReady,
  onStart,
  pending = false,
  starting = false,
  gameCode,
  hostToken,
  capacityGame,
  onLeft,
}: {
  /** Everyone in the room — seated players show as ready, spectators as "not ready yet". */
  players: Player[]
  meId: string | null
  /** Host sees "Start game" instead of a ready toggle. */
  isHost: boolean
  minPlayers: number
  /** Game row for the seat cap (game_type + max_players). When the seats are full, a
   *  spectator sees a "watching" state instead of a dead "tap to get ready" button; the
   *  button returns automatically once a seat frees up. Omitted → no cap (button always shown). */
  capacityGame?: Pick<Game, 'game_type' | 'max_players'> | null
  /** Player toggles their own seat (ready = true → take a seat, false → sit out). */
  onToggleReady: (ready: boolean) => void
  /** Host starts the next game. */
  onStart: () => void
  pending?: boolean
  starting?: boolean
  /** Enables host kick controls beside each player row. */
  gameCode?: string
  hostToken?: string
  /** Player leaves the room (uses `meId` as the player id). */
  onLeft?: () => void
}) {
  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode ?? '', hostToken ?? '')
  const canRemovePlayers = isHost && !!gameCode && !!hostToken
  const total = players.length
  const readyCount = players.filter((p) => p.spectator !== true).length
  const canStart = readyCount >= minPlayers
  const me = meId ? players.find((p) => p.id === meId) : undefined
  const meReady = !!me && me.spectator !== true
  // Seats are full when the ready (seated) count has hit the cap. A spectator then can't
  // ready up — show a "watching" state; seatsFull is derived from the live player list, so
  // the ready button returns the moment a seat frees. No cap known → never "full".
  const maxPlayers = capacityGame ? lobbyMaxPlayersFromGameClient(capacityGame.game_type, capacityGame) : null
  const seatsFull = maxPlayers != null && readyCount >= maxPlayers

  const R = 60
  const C = 2 * Math.PI * R
  const dashoffset = C * (1 - (total ? readyCount / total : 0))

  return (
    // pb-32 leaves room for the sticky action footer below so the last
    // player row / hint text never hides behind it. sm:pb-8 collapses the
    // reserve on wide screens where the footer sits inline anyway.
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 pt-8 pb-32 text-center sm:pb-8">
      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">Play again · same settings</span>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-body sm:text-3xl">
        {canStart ? 'Ready when you are' : 'Waiting for players…'}
      </h2>

      <div className="relative my-6" style={{ width: 132, height: 132 }}>
        <svg width="132" height="132" viewBox="0 0 132 132" style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx="66"
            cy="66"
            r={R}
            fill="none"
            strokeWidth="10"
            style={{ stroke: 'color-mix(in srgb, var(--foreground) 10%, transparent)' }}
          />
          <circle
            cx="66"
            cy="66"
            r={R}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={dashoffset}
            style={{ stroke: 'var(--primary)', transition: 'stroke-dashoffset .5s cubic-bezier(.4,0,.2,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black leading-none tabular-nums text-body">
            {readyCount}/{total}
          </span>
          <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.13em] text-faint">Ready</span>
        </div>
      </div>

      <div className="w-full space-y-2">
        {players.map((p) => {
          const on = p.spectator !== true
          const isMe = p.id === meId
          return (
            <div
              key={p.id}
              className={[
                'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                on
                  ? 'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--surface))]'
                  : 'border-[var(--border)] bg-[var(--surface)]',
                isMe ? 'ring-1 ring-[color-mix(in_srgb,var(--primary)_35%,transparent)]' : '',
              ].join(' ')}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--background)] text-xs font-black text-body">
                {p.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold text-body">
                  {isMe ? `${p.name} (you)` : p.name}
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-2">
                {on ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)]">
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} className="shrink-0" /> Ready
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-faint">{seatsFull ? 'watching' : 'not ready'}</span>
                )}
                {canRemovePlayers && p.id !== meId ? (
                  <button
                    type="button"
                    onClick={() => void removePlayer(p.id, p.name)}
                    disabled={removingPlayerId === p.id}
                    aria-label={`Remove ${p.name}`}
                    className="rounded-lg p-1 text-faint transition-colors hover:bg-[color-mix(in_srgb,#ef4444_8%,transparent)] hover:text-red-500 disabled:opacity-50"
                  >
                    {removingPlayerId === p.id ? <span className="px-0.5 text-xs">…</span> : <TrashIcon size={15} />}
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {/* Action footer — the button (or 'game full' notice) pins to the
       * bottom of the viewport on narrow screens so hosts don't have to
       * scroll past the player list to hit 'Start game / Play again' and
       * players don't have to hunt for 'Tap to get ready'. Multiple user
       * reports on the finished screen: 'why is the ready button so far
       * down'. The sticky wrapper only kicks in below sm; on tablet+
       * (`sm:`) it collapses to the ordinary in-flow position because
       * there's enough vertical room already.
       *
       * `-mx-4` breaks out of the parent's px-4 so the backdrop reaches
       * the screen edges; padding is added back inside. env(safe-area-
       * inset-bottom) keeps it clear of the iOS home indicator. The
       * translucent background + blur mirrors the site's other sticky
       * bars (LobbyStartButton) so the pattern reads as one system. */}
      <div
        className={[
          'mt-5 w-full',
          'sticky bottom-0 z-30 -mx-4 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_92%,transparent)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md',
          'sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none',
        ].join(' ')}
      >
        {isHost ? (
          <>
            <button
              type="button"
              onClick={onStart}
              disabled={!canStart || starting}
              className="btn-primary w-full py-3.5 text-base disabled:cursor-not-allowed disabled:opacity-50"
            >
              {starting ? (
                'Starting…'
              ) : (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <HugeiconsIcon icon={PlayIcon} size={16} className="shrink-0" /> Start game
                </span>
              )}
            </button>
            {!canStart ? (
              <p className="mt-2 text-xs text-faint">
                Need at least {minPlayers} players ready to start ({readyCount} so far)
              </p>
            ) : null}
          </>
        ) : meReady ? (
          <button
            type="button"
            onClick={() => onToggleReady(false)}
            disabled={pending}
            className="btn-secondary w-full py-3.5 text-base disabled:opacity-60"
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} className="shrink-0" /> You&apos;re ready — tap to
              cancel
            </span>
          </button>
        ) : seatsFull ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-center">
            <p className="text-sm font-semibold text-body">Game full — you’re watching this round</p>
            <p className="mt-0.5 text-xs text-muted">A seat opens up if someone sits out — you can grab it then.</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onToggleReady(true)}
            disabled={pending}
            className="btn-primary w-full py-3.5 text-base disabled:opacity-60"
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <HugeiconsIcon icon={HandIcon} size={16} className="shrink-0" /> Tap to get ready
            </span>
          </button>
        )}
        {!isHost && gameCode && meId && onLeft ? (
          <LeaveGameButton
            gameCode={gameCode}
            playerId={meId}
            onLeft={onLeft}
            confirmTitle="Leave this game?"
            confirmMessage="You can rejoin with the same name if there is room."
            className={`${leaveButtonQuietClassName} mt-3`}
          />
        ) : null}
      </div>
    </div>
  )
}
