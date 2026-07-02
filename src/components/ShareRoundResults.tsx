'use client'

import { useCallback, useRef, useState, type RefObject } from 'react'
import type { Game, Participant, Player, Round, Vote } from '@/types'
import { appDomain } from '@/lib/site'
import { buildRoundShareCardContent } from '@/lib/share-round-content'
import { captureElementAsImage } from '@/lib/capture-element-image'
import { shareImageBlob, downloadBlobAsFile, shareFilenameStem } from '@/lib/share-image'
import { ShareActionButtons } from '@/components/ShareActionButtons'
import { useToast } from '@/components/ui/Toast'

function buildRoundShareText({
  game,
  round,
  votes,
  participants,
  players,
}: {
  game: Game
  round: Round
  votes: Vote[]
  participants: Participant[]
  players: Player[]
}): string {
  const card = buildRoundShareCardContent({ game, round, votes, participants, players })
  const lines: string[] = [`${card.headerEmoji} ${card.gameLabel} - ${card.roundLabel}`]

  if (card.subtitle) lines.push(card.subtitle)
  for (const row of card.rows) {
    lines.push(`${row.emoji} ${row.label}: ${row.value}`)
  }
  lines.push('', `Play at ${appDomain()}`)

  return lines.join('\n')
}

export function ShareRoundResults({
  captureRef,
  game,
  round,
  votes,
  participants,
  players,
}: {
  captureRef: RefObject<HTMLElement | null>
  game: Game
  round: Round
  votes: Vote[]
  participants: Participant[]
  players: Player[]
}) {
  const { success, error } = useToast()
  const [sharing, setSharing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const busyLock = useRef(false)

  const handleShare = useCallback(async () => {
    if (busyLock.current) return

    const target = captureRef.current
    if (!target) {
      error('Nothing to share yet')
      return
    }

    busyLock.current = true
    setSharing(true)
    try {
      const blob = await captureElementAsImage(target)
      const result = await shareImageBlob(blob, 'round-results.png')

      if (result === 'copied') {
        success('Image copied — paste into Stories or chat')
      } else if (result === 'shared') {
        success('Shared!')
      } else {
        success('Image downloaded')
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return

      try {
        const text = buildRoundShareText({ game, round, votes, participants, players })
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({ text })
          return
        }
        await navigator.clipboard.writeText(text)
        success('Results copied to clipboard!')
      } catch {
        error(err instanceof Error ? err.message : 'Could not share results')
      }
    } finally {
      busyLock.current = false
      setSharing(false)
    }
  }, [captureRef, game, round, votes, participants, players, success, error])

  const handleDownload = useCallback(async () => {
    if (busyLock.current) return

    const target = captureRef.current
    if (!target) {
      error('Nothing to download yet')
      return
    }

    busyLock.current = true
    setDownloading(true)
    try {
      const blob = await captureElementAsImage(target)
      downloadBlobAsFile(blob, `${shareFilenameStem(game.title)}-round.png`)
      success('Image downloaded')
    } catch (err) {
      error(err instanceof Error ? err.message : 'Could not download results')
    } finally {
      busyLock.current = false
      setDownloading(false)
    }
  }, [captureRef, game.title, success, error])

  return (
    <ShareActionButtons
      shareLabel="Share Round"
      onShare={handleShare}
      onDownload={handleDownload}
      sharing={sharing}
      downloading={downloading}
    />
  )
}
