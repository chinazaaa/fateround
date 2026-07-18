'use client'

import { useEffect, useState } from 'react'
import { copyToClipboard } from '@/lib/copy'
import { useToast } from '@/components/ui/Toast'
import { trackEvent, GA_EVENTS } from '@/lib/analytics'

/**
 * One-tap invite share.
 *
 * On devices with the Web Share API (most phones) this opens the native share
 * sheet — WhatsApp, Messages, etc. — with the invite pre-filled, which converts
 * far better than "copy then paste" for a mobile / WhatsApp-heavy audience and is
 * the biggest lever on the share -> join viral loop. Falls back to copying the
 * link on browsers without `navigator.share` (most desktops).
 *
 * Fires the `share_link` GA key event on a successful share or copy. The label is
 * static ("Share invite") so it renders identically on server and client — the
 * behaviour, not the text, adapts to the device (avoids a hydration mismatch).
 */
export function ShareInviteButton({
  url,
  text = 'Join my game on Fate Round:',
  label = 'Share invite',
  copyLabel,
  className = '',
}: {
  url: string
  text?: string
  label?: string
  /**
   * Label to show when the native share sheet isn't available (most desktops),
   * where this button just copies the link. Lets the caller say "Copy invite
   * link" on desktop while keeping "Share invite" on mobile. Falls back to
   * `label` when omitted.
   */
  copyLabel?: string
  className?: string
}) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  // Default true so the server + first client render both show `label` (no
  // hydration mismatch); corrected to the device's real capability after mount.
  const [canNativeShare, setCanNativeShare] = useState(true)

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const restLabel = canNativeShare ? label : (copyLabel ?? label)

  const handleShare = async () => {
    // Prefer the native share sheet (mobile → WhatsApp / Messages / etc.).
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Fate Round', text, url })
        trackEvent(GA_EVENTS.shareLink)
        return
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // User intentionally dismissed the share sheet — don't count it as a
          // share or fall back to copying; just stop here.
          return
        }
        // Real failure (e.g. permission denied) — fall through to copy.
      }
    }
    // Desktop / unsupported: copy the link so the invite still gets out.
    const ok = await copyToClipboard(url)
    if (ok) {
      trackEvent(GA_EVENTS.shareLink)
      toast.success('Invite link copied')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Could not share — try again')
    }
  }

  return (
    <button type="button" onClick={handleShare} className={`btn-primary ${className}`}>
      {copied ? 'Copied ✓' : restLabel}
    </button>
  )
}
