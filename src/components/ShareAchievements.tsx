'use client'

import { useCallback, useRef, useState, type RefObject } from 'react'
import type { Achievement } from '@/lib/achievements'
import { appDomain } from '@/lib/site'
import { captureElementAsImage } from '@/lib/capture-element-image'
import { shareImageBlob, downloadBlobAsFile, shareFilenameStem } from '@/lib/share-image'
import { ShareActionButtons } from '@/components/ShareActionButtons'
import { useToast } from '@/components/ui/Toast'

function buildAchievementsShareText(achievements: Achievement[], gameTitle: string): string {
  const lines: string[] = [`🏆 ${gameTitle} — Achievements`, '']

  for (const achievement of achievements) {
    const who = achievement.participantName ? ` — ${achievement.participantName}` : ''
    lines.push(`${achievement.emoji} ${achievement.title}${who}`)
    lines.push(`   ${achievement.description}`)
  }

  lines.push('', `Play at ${appDomain()}`)
  return lines.join('\n')
}

export function ShareAchievements({
  captureRef,
  achievements,
  gameTitle,
}: {
  captureRef: RefObject<HTMLElement | null>
  achievements: Achievement[]
  gameTitle: string
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
      const result = await shareImageBlob(blob, 'achievements.png')

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
        const text = buildAchievementsShareText(achievements, gameTitle)
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({ text })
          return
        }
        await navigator.clipboard.writeText(text)
        success('Achievements copied to clipboard!')
      } catch {
        error(err instanceof Error ? err.message : 'Could not share achievements')
      }
    } finally {
      busyLock.current = false
      setSharing(false)
    }
  }, [captureRef, achievements, gameTitle, success, error])

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
      downloadBlobAsFile(blob, `${shareFilenameStem(gameTitle)}-achievements.png`)
      success('Image downloaded')
    } catch (err) {
      error(err instanceof Error ? err.message : 'Could not download achievements')
    } finally {
      busyLock.current = false
      setDownloading(false)
    }
  }, [captureRef, gameTitle, success, error])

  return (
    <ShareActionButtons
      shareLabel="Share Achievements"
      onShare={handleShare}
      onDownload={handleDownload}
      sharing={sharing}
      downloading={downloading}
    />
  )
}
