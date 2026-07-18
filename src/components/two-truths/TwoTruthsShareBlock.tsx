'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { useToast } from '@/components/ui/Toast'
import { captureElementAsImage } from '@/lib/capture-element-image'
import { shareImageBlob } from '@/lib/share-image'
import type { Game } from '@/types'

export function TwoTruthsShareBlock({
  children,
  game,
  returnToLobbyButton,
}: {
  children: ReactNode
  game: Pick<Game, 'id' | 'title' | 'game_type'>
  /** Optional ghost/secondary action (e.g. "Return to lobby") grouped into the footer. */
  returnToLobbyButton?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)
  const { success, error } = useToast()
  const [sharing, setSharing] = useState(false)

  const handleShare = async () => {
    const target = captureRef.current
    if (!target || target.offsetHeight === 0) {
      error('Nothing to share yet')
      return
    }
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
    <div className="space-y-4">
      <div ref={captureRef} className="space-y-4">
        <ShareResultsCaptureHeader game={game} />
        {children}
      </div>
      <HostGameFinishedActions
        variant="winner"
        gameCode={game.id}
        returnToLobbyButton={returnToLobbyButton}
        shareButton={
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="btn-primary w-full py-3 text-base flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.5 2.5 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.367A2.5 2.5 0 0 1 13 4.5Z" />
            </svg>
            {sharing ? 'Sharing…' : 'Share Results'}
          </button>
        }
      />
    </div>
  )
}
