'use client'

import { useState } from 'react'
import { GameLinkQrModal } from '@/components/GameLinkQrModal'
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
  const [qrOpen, setQrOpen] = useState(false)
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
    <>
      <div className={`flex items-center gap-1.5 ${className}`}>
        <button
          type="button"
          onClick={handleCopy}
          className="btn-secondary text-xs sm:text-sm py-1.5 px-2.5 sm:px-4 whitespace-nowrap"
        >
          {copied ? 'Copied ✓' : (
            <>
              <span className="sm:hidden">Copy link</span>
              <span className="hidden sm:inline">Copy invite link</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          className="btn-secondary text-xs sm:text-sm py-1.5 px-2.5 sm:px-3 whitespace-nowrap"
          aria-label="Show join QR code"
        >
          QR
        </button>
      </div>
      <GameLinkQrModal open={qrOpen} onClose={() => setQrOpen(false)} url={url} />
    </>
  )
}
