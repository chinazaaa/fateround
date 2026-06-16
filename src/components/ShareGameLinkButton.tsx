'use client'

import { useState } from 'react'
import { copyToClipboard } from '@/lib/copy'
import { playerGameUrl } from '@/lib/site'
import { useToast } from '@/components/ui/Toast'

type Props = {
  gameCode: string
  className?: string
}

export function ShareGameLinkButton({ gameCode, className = '' }: Props) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const url = playerGameUrl(gameCode)

  const handleCopy = async () => {
    const ok = await copyToClipboard(url)
    if (ok) {
      toast.success('Invite link copied')
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
      className={`btn-secondary text-xs sm:text-sm py-1.5 px-2.5 sm:px-4 whitespace-nowrap ${className}`}
    >
      {copied ? 'Copied ✓' : (
        <>
          <span className="sm:hidden">Copy link</span>
          <span className="hidden sm:inline">Copy invite link</span>
        </>
      )}
    </button>
  )
}
