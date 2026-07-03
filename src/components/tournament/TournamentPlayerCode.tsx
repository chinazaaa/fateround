'use client'

import { useState } from 'react'
import { GameLinkQrModal } from '@/components/GameLinkQrModal'
import { copyToClipboard } from '@/lib/copy'
import { tournamentInviteUrl, shareOrigin } from '@/lib/site'
import { useToast } from '@/components/ui/Toast'

/**
 * A joined player's "continue on another device" card: their personal code, a resume
 * link, and a QR. Anyone with the code (or link/QR) can pick up this exact player's
 * name and seat on another device — the tournament equivalent of a normal game's
 * player resume code.
 */
export function TournamentContinueCard({ tournamentId, code }: { tournamentId: string; code: string }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // The plain tournament link — the code is entered on the page, never put in the URL.
  const url = tournamentInviteUrl(tournamentId, shareOrigin())

  const copyCode = async () => {
    const ok = await copyToClipboard(code)
    if (ok) {
      toast.success('Player code copied')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Could not copy — try again')
    }
  }

  if (!expanded) {
    return (
      <button onClick={() => setExpanded(true)} className="btn-ghost text-xs mx-auto block">
        📱 Continue on another device
      </button>
    )
  }

  return (
    <div className="surface-inset p-4 space-y-3 text-center">
      <p className="label-caps">Your player code</p>
      <p className="text-muted text-xs">
        📌 Save this code — it&apos;s the only way back into your seat if you switch devices, lose this tab, or need to
        reconnect. On the other device, open this tournament (link or QR below) and enter this code.
      </p>
      <button onClick={copyCode} className="font-mono font-bold text-2xl tracking-widest text-body" title="Copy code">
        {copied ? 'Copied ✓' : code}
      </button>
      <div className="flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={async () => {
            const ok = await copyToClipboard(url)
            toast[ok ? 'success' : 'error'](ok ? 'Tournament link copied' : 'Could not copy — try again')
          }}
          className="btn-secondary text-xs py-1.5 px-3"
        >
          Copy link
        </button>
        <button type="button" onClick={() => setQrOpen(true)} className="btn-secondary text-xs py-1.5 px-3">
          QR
        </button>
      </div>
      <GameLinkQrModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        url={url}
        title="Open on another device"
        subtitle="Scan to open this tournament, then enter your player code."
        copyLabel="Copy tournament link"
        copySuccessMessage="Tournament link copied"
      />
    </div>
  )
}

/**
 * "Already joined?" entry on the tournament join screen: type your player code to
 * restore your name + seat on this device instead of joining as someone new.
 */
export function TournamentResumeEntry({
  tournamentId,
  onResumed,
  alwaysOpen = false,
}: {
  tournamentId: string
  onResumed: (playerName: string, code: string) => void
  /** Show the code input directly instead of behind an "Enter your code" toggle —
   *  for the standalone reconnect card (where the whole card is the prompt). */
  alwaysOpen?: boolean
}) {
  const [expanded, setExpanded] = useState(alwaysOpen)
  const [codeInput, setCodeInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    const code = codeInput.trim().toUpperCase()
    if (code.length < 4 || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/player-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: code }),
      })
      const data = await res.json()
      if (res.ok && data.playerName) onResumed(data.playerName, String(data.token))
      else setError(data.error ?? 'Could not restore your player code')
    } catch {
      setError('Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (!expanded) {
    return (
      <button onClick={() => setExpanded(true)} className="btn-ghost text-xs mx-auto block">
        Already joined? Enter your player code
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
          placeholder="Your player code"
          aria-label="Your player code"
          maxLength={12}
          className="input-field flex-1 font-mono tracking-widest"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button onClick={submit} disabled={busy} className="btn-secondary btn-fit text-sm disabled:opacity-50">
          {busy ? '…' : 'Restore'}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}
