'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useHostToken } from '@/hooks/useHostToken'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { getPlayerSession } from '@/lib/utils'

/**
 * Universal host safety net on the PLAYER page (`/game/[code]`).
 *
 * A host who lands on the player URL at end of round — via a shared/bookmarked
 * link, a push-notification deep-link, host+play routing that dropped them
 * into the player shell, or simply because they closed the host tab and
 * clicked their own join link — used to see no host controls at all when the
 * game finished, so the round felt "stuck" from their side. This overlay
 * fills that gap by rendering a floating Play again / Return to lobby /
 * Open host view card once (a) the game reaches `status = 'finished'` AND
 * (b) the viewer's device still holds a valid host token (via useHostToken,
 * which also falls back to profile-reclaim when localStorage is empty).
 *
 * Renders nothing for non-hosts, non-finished games, or when the viewer is
 * already on `/host/[code]`. The play-again endpoint re-verifies the host
 * token server-side, so showing the buttons to a stale-token holder is safe:
 * a non-host will see the reset fail with a toast, not silently succeed.
 */
export function HostFinishFloating({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { hostToken, resolved } = useHostToken(gameCode)
  const { confirm } = useConfirm()
  const { success, error: toastError } = useToast()
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Poll game status just enough to catch the finish transition. 4s matches
  // the tournament-return banner cadence on this same page.
  useEffect(() => {
    if (!gameCode) return
    let cancelled = false
    const check = () => {
      supabase
        .from('games')
        .select('status')
        .eq('id', gameCode)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled || !data) return
          setStatus((data.status as string | null) ?? null)
        })
    }
    check()
    const timer = setInterval(check, 4000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [gameCode])

  if (!resolved || !hostToken || status !== 'finished' || dismissed) return null

  const reset = async (sameSettings: boolean) => {
    const hostPlayerId = getPlayerSession(gameCode)?.playerId ?? undefined
    setBusy(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId, same_settings: sameSettings }),
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
      message: 'Reopens the game with the same settings. Watchers and new people can join and ready up.',
      confirmLabel: 'Play again',
    })
    if (ok) void reset(true)
  }

  const onReturnToLobby = async () => {
    const ok = await confirm({
      title: 'Return to lobby?',
      message: 'Sends everyone back to the game lobby where you can tweak settings before starting again.',
      confirmLabel: 'Return to lobby',
    })
    if (ok) void reset(false)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 pointer-events-none">
      <div
        className="glass-card-strong pointer-events-auto flex flex-col gap-2 rounded-2xl px-4 py-3 w-full max-w-sm border border-[var(--border)] shadow-xl"
        role="status"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-body">You&apos;re still the host</p>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="text-muted hover:text-body text-lg leading-none px-1"
          >
            ×
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void onPlayAgain()}
            disabled={busy}
            className="btn-secondary flex-1 py-2.5 text-sm disabled:opacity-60"
          >
            {busy ? '…' : '↻ Play again'}
          </button>
          <button
            type="button"
            onClick={() => void onReturnToLobby()}
            disabled={busy}
            className="btn-secondary flex-1 py-2.5 text-sm disabled:opacity-60"
          >
            Return to lobby
          </button>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/host/${gameCode}`)}
          className="text-xs font-semibold text-muted hover:text-body pt-0.5"
        >
          Open host view →
        </button>
      </div>
    </div>
  )
}
