'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { gameTypeConfig } from '@/lib/game-types'
import { supabase } from '@/lib/supabase'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import type { Game } from '@/types'
import { useToast } from '@/components/ui/Toast'

const MAX_CHARS = 500

export function SecretMessageSenderView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [screen, setScreen] = useState<'loading' | 'ready' | 'closed' | 'not_found'>('loading')
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const [joining, setJoining] = useState(false)

  const ensureSender = useCallback(async () => {
    const session = getPlayerSession(gameCode)
    if (session?.playerId) {
      setMyPlayerId(session.playerId)
      return session.playerId
    }

    setJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not connect')

      setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender ?? 'both')
      setMyPlayerId(data.playerId)
      return data.playerId as string
    } finally {
      setJoining(false)
    }
  }, [gameCode])

  const load = useCallback(async () => {
    const { data: gameData } = await supabase.from('games').select('*').eq('id', gameCode).maybeSingle()
    if (!gameData) {
      setScreen('not_found')
      return
    }

    setGame(gameData)

    if (gameData.status !== 'active') {
      setScreen('closed')
      return
    }

    setScreen('ready')

    const session = getPlayerSession(gameCode)
    if (session?.playerId) {
      setMyPlayerId(session.playerId)
    }
  }, [gameCode])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (screen !== 'ready' || myPlayerId) return
    ensureSender().catch((err) => {
      toastError(err instanceof Error ? err.message : 'Could not connect')
    })
  }, [screen, myPlayerId, ensureSender, toastError])

  useEffect(() => {
    const channel = supabase
      .channel(`secret-sender-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          const next = payload.new as Game
          setGame(next)
          if (next.status !== 'active') {
            setScreen('closed')
            clearPlayerSession(gameCode)
            setMyPlayerId(null)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode])

  const sendMessage = async () => {
    const text = messageInput.trim()
    if (!text || sending) return

    setSending(true)
    try {
      let playerId = myPlayerId
      if (!playerId) {
        playerId = await ensureSender()
      }
      if (!playerId) throw new Error('Could not connect')

      const res = await fetch('/api/anonymous-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          playerId,
          text,
          messageType: 'text',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send')

      setMessageInput('')
      success('Message sent!')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const cfg = gameTypeConfig('secret_message')

  if (screen === 'loading') {
    return (
      <div className="page-wrap flex items-center justify-center">
        <div className="w-11 h-11 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (screen === 'not_found') {
    return (
      <div className="page-wrap flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-5xl">🔍</p>
          <h1 className="text-2xl font-black text-body">Link not found</h1>
          <p className="text-muted text-sm">Double-check the link you were sent.</p>
          <button type="button" onClick={() => router.push('/')} className="btn-secondary px-6 py-3">
            Go Home
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'closed') {
    return (
      <div className="page-wrap flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-5xl">💌</p>
          <h1 className="text-2xl font-black text-body">{game?.title ?? 'Secret Message'}</h1>
          <GameTypeBadge gameType="secret_message" />
          <p className="text-muted text-sm">This board is closed and not accepting new messages.</p>
          <button type="button" onClick={() => router.push('/')} className="btn-secondary px-6 py-3">
            Go Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrap px-4 py-8 max-w-md mx-auto w-full space-y-6">
      <div className="text-center space-y-2">
        <div className="text-4xl">{cfg.headerEmoji}</div>
        <h1 className="text-2xl font-black tracking-tight gradient-title">{game?.title}</h1>
        <GameTypeBadge gameType="secret_message" />
        <p className="text-muted text-sm leading-relaxed">
          Send a message anonymously. Only the link owner will see it — senders never see each other&apos;s messages.
        </p>
      </div>

      <div className="glass-card-strong p-5 space-y-4">
        <label className="block space-y-2">
          <span className="label-caps">Your message</span>
          <textarea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="Say something honest…"
            rows={4}
            disabled={joining || sending}
            className="input-field w-full resize-none"
            autoFocus
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <span className="text-faint text-xs tabular-nums">
            {messageInput.length}/{MAX_CHARS}
          </span>
          <button
            type="button"
            onClick={sendMessage}
            disabled={!messageInput.trim() || sending || joining}
            className="btn-primary px-5 py-2.5 text-sm"
          >
            {sending ? 'Sending…' : joining ? 'Connecting…' : 'Send'}
          </button>
        </div>
      </div>

      <p className="text-faint text-xs text-center leading-relaxed">
        Your identity is never shown to the link owner. You can send multiple messages.
      </p>
    </div>
  )
}
