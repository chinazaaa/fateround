'use client'

import { useState } from 'react'
import { useHostToken } from '@/hooks/useHostToken'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

/**
 * Play-again / Return-to-lobby controls that a PLAYER view can render on its
 * finish screen. Renders nothing when the viewer isn't the host.
 *
 * Why this exists: host-only actions normally live inside HostView (the
 * `/host/[code]` tree, where `useHostToken` is verified). But a host who lands
 * on the PLAYER url `/game/[code]` at end of game — via a shared/bookmarked
 * link, a push-notification deep-link, or host+play routing that dropped them
 * into the player shell — used to see no host controls at all, so the round
 * felt "stuck" from their side. This component lets any player-view finish
 * branch surface the same actions when the viewer's device still holds a
 * valid host token (localStorage or profile-reclaim via useHostToken).
 *
 * Do NOT gate on any client-side "am I host?" heuristic other than
 * `useHostToken` — that's the same authority the host page uses, and the
 * play-again endpoint re-verifies the token server-side, so surfacing the
 * buttons is always safe (a non-host will simply see nothing).
 */
export function HostFinishControlsInline({
  gameCode,
  hostPlayerId,
}: {
  gameCode: string
  /** Host+play mode's own seat id, forwarded so the endpoint knows to auto-ready the
   *  host into the next round the same way UnoHostView does. Optional. */
  hostPlayerId?: string | null
  onReset?: () => void | Promise<void>
}) {
  const { hostToken, resolved } = useHostToken(gameCode)
  const { confirm } = useConfirm()
  const { success, error: toastError } = useToast()
  const [busy, setBusy] = useState(false)

  // Only render for a viewer whose device actually holds a valid host token.
  if (!resolved || !hostToken) return null

  const reset = async (sameSettings: boolean) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined, same_settings: sameSettings }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      success(sameSettings ? 'Ready up for the next game!' : 'Back to the lobby')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setBusy(false)
    }
  }

  const onPlayAgain = async () => {
    const ok = await confirm({
      title: 'Play again — same settings?',
      message:
        'Reopens the game with the same settings. Previous watchers and new people can join; everyone taps "ready" and you start the next game once enough players are in.',
      confirmLabel: 'Play again',
    })
    if (ok) void reset(true)
  }

  const onReturnToLobby = async () => {
    const ok = await confirm({
      title: 'Return to lobby?',
      message:
        'Sends everyone back to the game lobby where you can tweak settings or let new people join before starting again.',
      confirmLabel: 'Return to lobby',
    })
    if (ok) void reset(false)
  }

  return (
    <div className="mt-4 space-y-2">
      <button
        type="button"
        onClick={() => void onPlayAgain()}
        disabled={busy}
        className="btn-secondary w-full py-3 text-base disabled:opacity-60"
      >
        {busy ? 'Starting…' : '↻ Play again · same settings'}
      </button>
      <button
        type="button"
        onClick={() => void onReturnToLobby()}
        disabled={busy}
        className="w-full py-2.5 text-sm font-semibold text-muted transition-colors hover:text-body disabled:opacity-60"
      >
        Return to lobby
      </button>
      <p className="text-xs text-muted text-center px-4">
        Same settings reopens the game for ready-up — watchers and new people can join · lobby lets you tweak settings
        first.
      </p>
    </div>
  )
}
