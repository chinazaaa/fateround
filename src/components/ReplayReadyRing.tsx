'use client'

import { TrashIcon } from '@/components/host/host-icons'
import { LeaveGameButton, leaveButtonQuietClassName } from '@/components/ui/LeaveGameButton'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import type { Player } from '@/types'

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
  onLeft,
}: {
  /** Everyone in the room — seated players show as ready, spectators as "not ready yet". */
  players: Player[]
  meId: string | null
  /** Host sees "Start game" instead of a ready toggle. */
  isHost: boolean
  minPlayers: number
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

  const R = 60
  const C = 2 * Math.PI * R
  const dashoffset = C * (1 - (total ? readyCount / total : 0))

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-8 text-center">
      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">Play again · same settings</span>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-body sm:text-3xl">
        {canStart ? 'Ready when you are' : 'Waiting for players…'}
      </h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-muted">
        {isHost
          ? `Same players, same settings. Start the next game once everyone’s in (${minPlayers}+ needed).`
          : 'Same players, same settings. Tap to get ready — the host starts the next game.'}
      </p>

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
                  <span className="text-xs font-bold text-[var(--primary)]">✅ Ready</span>
                ) : (
                  <span className="text-xs font-semibold text-faint">not ready</span>
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

      <div className="mt-5 w-full">
        {isHost ? (
          <>
            <button
              type="button"
              onClick={onStart}
              disabled={!canStart || starting}
              className="btn-primary w-full py-3.5 text-base disabled:cursor-not-allowed disabled:opacity-50"
            >
              {starting ? 'Starting…' : '▶ Start game'}
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
            ✅ You’re ready — tap to cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onToggleReady(true)}
            disabled={pending}
            className="btn-primary w-full py-3.5 text-base disabled:opacity-60"
          >
            ✋ Tap to get ready
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
