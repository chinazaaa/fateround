'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnonymousMessageFeed } from '@/components/anonymous-messages/AnonymousMessageFeed'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { useAnonymousMessageTrim } from '@/hooks/useAnonymousMessageTrim'
import { useAnonymousMessages } from '@/hooks/useAnonymousMessages'
import { gameTypeConfig } from '@/lib/game-types'
import { supabase } from '@/lib/supabase'
import { appDomain, appOrigin } from '@/lib/site'
import { shareImageBlob } from '@/lib/share-image'
import type { AnonymousMessage, Game } from '@/types'
import { useToast } from '@/components/ui/Toast'

export function SecretMessageHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const router = useRouter()
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [ending, setEnding] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [sharingId, setSharingId] = useState<string | null>(null)
  const sharingLock = useRef(false)

  const inboxEnabled = game?.status === 'active'
  const { messages, removeMessage } = useAnonymousMessages(gameCode, !!inboxEnabled)
  useAnonymousMessageTrim(gameCode, game?.status === 'active')

  const load = useCallback(async () => {
    const { data: gameData } = await supabase.from('games').select('*').eq('id', gameCode).maybeSingle()
    if (gameData) setGame(gameData)
  }, [gameCode])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`secret-host-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => setGame(payload.new as Game)
      )
      .subscribe()

    const poll = setInterval(load, 5000)
    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  const shareUrl = `${appOrigin()}/game/${gameCode}`
  const cfg = gameTypeConfig('secret_message')

  const closeBoard = async () => {
    setEnding(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/finish-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to close board')
      success('Board closed — inbox cleared')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to close board')
    } finally {
      setEnding(false)
    }
  }

  const reopenBoard = async () => {
    setReopening(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reopen board')
      success('Board reopened')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reopen board')
    } finally {
      setReopening(false)
    }
  }

  const shareMessageAsImage = useCallback(
    async (message: AnonymousMessage) => {
      const text = message.text?.trim()
      if (!text || sharingLock.current) return

      sharingLock.current = true
      setSharingId(message.id)
      try {
        const { renderSecretMessageShareImage } = await import('@/lib/share-message-image')
        const blob = await renderSecretMessageShareImage({
          messageText: text,
          gameTitle: game?.title ?? 'Secret Message',
          headerEmoji: cfg.headerEmoji,
          brand: appDomain(),
        })
        const result = await shareImageBlob(blob)
        if (result === 'copied') {
          success('Image copied — paste into Stories or chat')
        } else if (result === 'shared') {
          success('Shared!')
        } else {
          success('Image downloaded')
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        toastError(err instanceof Error ? err.message : 'Could not share image')
      } finally {
        sharingLock.current = false
        setSharingId(null)
      }
    },
    [game?.title, success, toastError]
  )

  const deleteMessage = async (messageId: string) => {
    setRemovingId(messageId)
    try {
      const res = await fetch('/api/anonymous-messages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, messageId, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to remove message')
      removeMessage(messageId)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to remove message')
    } finally {
      setRemovingId(null)
    }
  }

  if (!game) {
    return (
      <div className="page-wrap flex items-center justify-center">
        <div className="w-11 h-11 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="page-wrap px-4 py-6 max-w-lg mx-auto w-full space-y-5">
      <div className="text-center space-y-2">
        <div className="text-4xl">{cfg.headerEmoji}</div>
        <h1 className="text-2xl font-black tracking-tight gradient-title">{game.title}</h1>
        <p className="text-muted text-sm">{cfg.label} · only you can read these</p>
      </div>

      <div className="glass-card-strong p-4 space-y-3">
        <p className="label-caps">Share link</p>
        <p className="text-body-muted text-sm leading-relaxed">
          Post this anywhere — Instagram, WhatsApp, your bio. Anyone who opens it can send you a message.
        </p>
        <CopyLinkButton value={shareUrl} label="Copy link" copiedLabel="Copied ✓" successMessage="Link copied" />
        <p className="text-faint text-xs font-mono break-all">{shareUrl}</p>
      </div>

      {game.status === 'active' ? (
        <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-body font-semibold">Board is open</p>
            <p className="text-faint text-xs mt-0.5">Senders can post right now · inbox trims at 1,000 messages</p>
          </div>
          <button type="button" onClick={closeBoard} disabled={ending} className="btn-secondary text-sm py-2 px-4">
            {ending ? 'Closing…' : 'Close board'}
          </button>
        </div>
      ) : (
        <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3 border border-amber-500/30">
          <div>
            <p className="text-body font-semibold">Board is closed</p>
            <p className="text-faint text-xs mt-0.5">Reopen to accept new messages</p>
          </div>
          <button type="button" onClick={reopenBoard} disabled={reopening} className="btn-primary text-sm py-2 px-4">
            {reopening ? 'Reopening…' : 'Reopen board'}
          </button>
        </div>
      )}

      {inboxEnabled ? (
        <AnonymousMessageFeed
          messages={messages}
          title="Your inbox"
          emptyLabel="No messages yet — share your link to start receiving"
          hideSenderNames
          canShareAsImage
          sharingId={sharingId}
          onShareAsImage={shareMessageAsImage}
          canRemove
          removingId={removingId}
          onRemove={deleteMessage}
        />
      ) : null}

      <div className="flex flex-wrap gap-2 justify-center pt-2">
        <button type="button" onClick={() => router.push('/')} className="btn-secondary text-sm py-2 px-4">
          Home
        </button>
      </div>
    </div>
  )
}
