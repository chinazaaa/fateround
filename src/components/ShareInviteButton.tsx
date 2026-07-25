'use client'

import { useEffect, useState } from 'react'
import { copyToClipboard } from '@/lib/copy'
import { useToast } from '@/components/ui/Toast'
import { trackEvent, GA_EVENTS } from '@/lib/analytics'

/**
 * One-tap invite share / copy.
 *
 * On TOUCH devices with the Web Share API (phones/tablets) this opens the native
 * share sheet — WhatsApp, Messages, etc. — with the invite pre-filled, the biggest
 * lever on the share -> join loop. Everywhere else (desktop — even desktop Chrome,
 * which technically has `navigator.share` but only surfaces a clunky OS sheet) it
 * just copies the link to the clipboard. Gated on a coarse pointer so desktop
 * always copies.
 *
 * Fires the `share_link` GA key event on a successful share or copy. Default state
 * = "copy" so the server + first client render match (no hydration mismatch);
 * corrected to native-share on touch devices after mount.
 */
export function ShareInviteButton({
  url,
  text = 'Join my game on FateRound:',
  label = 'Share invite',
  copyLabel,
  className = '',
}: {
  url: string
  text?: string
  label?: string
  /**
   * Label shown when the button copies (desktop). Lets the caller say "Copy invite
   * link" on desktop while keeping "Share invite" on touch devices. Falls back to
   * `label` when omitted.
   */
  copyLabel?: string
  className?: string
}) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  // Default false → server + first client render show the copy label (safe for
  // desktop, the SSR majority). Flipped to true on touch devices after mount.
  const [canNativeShare, setCanNativeShare] = useState(false)

  useEffect(() => {
    const hasShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    const coarsePointer = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)')?.matches
    setCanNativeShare(hasShare && coarsePointer)
  }, [])

  const restLabel = canNativeShare ? label : (copyLabel ?? label)

  const copyLink = async () => {
    const ok = await copyToClipboard(url)
    if (ok) {
      trackEvent(GA_EVENTS.shareLink)
      toast.success('Link copied')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Could not copy — try again')
    }
  }

  const handleShare = async () => {
    // Touch device: native share sheet (WhatsApp / Messages / …).
    if (canNativeShare) {
      try {
        await navigator.share({ title: 'FateRound', text, url })
        trackEvent(GA_EVENTS.shareLink)
        return
      } catch (err) {
        // User dismissed the sheet — stop, don't fall back to copy.
        if (err instanceof Error && err.name === 'AbortError') return
        // Real failure — fall through to copy.
      }
    }
    // Desktop (or share failed): copy the link.
    await copyLink()
  }

  return (
    <button type="button" onClick={handleShare} className={`btn-primary ${className}`}>
      {copied ? 'Copied ✓' : restLabel}
    </button>
  )
}
