'use client'

import { useRef, useState, type ReactNode } from 'react'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { useToast } from '@/components/ui/Toast'
import { captureElementAsImage } from '@/lib/capture-element-image'
import { shareImageBlob } from '@/lib/share-image'

export function TwoTruthsShareBlock({
  children,
  gameTitle,
}: {
  children: ReactNode
  gameTitle: string
}) {
  const captureRef = useRef<HTMLDivElement>(null)
  const { success, error } = useToast()
  const [sharing, setSharing] = useState(false)

  const handleShare = async () => {
    const target = captureRef.current
    if (!target || target.offsetHeight === 0) { error('Nothing to share yet'); return }
    setSharing(true)
    try {
      const blob = await captureElementAsImage(target)
      const result = await shareImageBlob(blob, 'two-truths-results.png')
      if (result === 'copied') success('Image copied — paste into Stories or chat')
      else if (result === 'shared') success('Shared!')
      else success('Image downloaded')
    } catch (err) {
      error(err instanceof Error ? err.message : 'Could not share results')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="space-y-3">
      <div ref={captureRef} className="space-y-4">
        <div className="text-center space-y-1">
          <p className="text-2xl leading-none">🤥</p>
          <p className="font-bold text-body">{gameTitle}</p>
          <p className="text-muted text-xs uppercase tracking-wider">Final results</p>
        </div>
        {children}
      </div>
      <button
        type="button"
        onClick={handleShare}
        disabled={sharing}
        className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.5 2.5 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.367A2.5 2.5 0 0 1 13 4.5Z" />
        </svg>
        {sharing ? 'Sharing…' : 'Share Results'}
      </button>
      <CreateNewGameButton />
    </div>
  )
}
