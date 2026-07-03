'use client'

import { useState } from 'react'
import { copyToClipboard } from '@/lib/copy'
import { useToast } from '@/components/ui/Toast'
import { trackEvent, GA_EVENTS } from '@/lib/analytics'

interface CopyLinkButtonProps {
  value: string
  label?: string
  copiedLabel?: string
  successMessage?: string
  className?: string
}

export function CopyLinkButton({
  value,
  label = 'Copy link →',
  copiedLabel = 'Copied ✓',
  successMessage = 'Copied to clipboard',
  className = '',
}: CopyLinkButtonProps) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const ok = await copyToClipboard(value)
    if (ok) {
      // GA key event: an invite/game link was copied to share.
      trackEvent(GA_EVENTS.shareLink)
      toast.success(successMessage)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Could not copy — try again')
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`text-sm font-semibold text-[var(--primary)] hover:opacity-80 transition-opacity ${className}`}
    >
      {copied ? copiedLabel : label}
    </button>
  )
}
