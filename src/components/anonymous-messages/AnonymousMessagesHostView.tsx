'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnonymousMessageFeed } from '@/components/anonymous-messages/AnonymousMessageFeed'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { useAnonymousMessages } from '@/hooks/useAnonymousMessages'
import { gameTypeConfig } from '@/lib/game-types'
import { supabase } from '@/lib/supabase'
import { appOrigin } from '@/lib/site'
import type { Game, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'

export function AnonymousMessagesHostView({
  gameCode,
  hostToken,
}: {
  gameCode: string
  hostToken: string
}) {
  const router = useRouter()
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [starting, setStarting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const messagesEnabled = game?.status === 'active' || game?.status === 'finished'
  const { messages, removeMessage } = useAnonymousMessages(gameCode, !!messagesEnabled)

  const load = useCallback(async () => {
    const [{ data: gameData }, { data: plrs }] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameCode).maybeSingle(),
      supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
    ])
    if (gameData) setGame(gameData)
    setPlayers(plrs ?? [])
  }, [gameCode])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`anon-host-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => setGame(payload.new as Game)
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const player = payload.new as Player
          setPlayers((prev) => (prev.some((p) => p.id === player.id) ? prev : [...prev, player]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const player = payload.old as Player
          setPlayers((prev) => prev.filter((p) => p.id !== player.id))
        }
      )
      .subscribe()

    const poll = setInterval(load, 3000)
    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  const startSession = async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const endSession = async () => {
    setEnding(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/finish-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to end session')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to end session')
    } finally {
      setEnding(false)
    }
  }

  const playAgain = async () => {
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const removeMessageByHost = async (messageId: string) => {
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
      success('Message removed')
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

  const playerLink = `${appOrigin()}/game/${gameCode}`
  const canStart = players.length >= 2

  return (
    <div className="page-wrap px-4 py-8 max-w-2xl mx-auto w-full space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted text-xs uppercase tracking-wider">Host panel</p>
          <h1 className="text-2xl font-black text-body mt-1">{game.title}</h1>
          <p className="text-muted text-sm">{gameTypeConfig(game.game_type).label}</p>
          <p className="text-[var(--primary)] text-xs mt-1 font-medium">
            Anonymous room — players get auto names, messages are fully anonymous
          </p>
        </div>
        <div className="text-right">
          <p className="text-muted text-xs uppercase tracking-wider">Code</p>
          <p className="text-body font-mono font-black text-2xl tracking-[0.2em]">{gameCode}</p>
        </div>
      </div>

      <div className="glass-card p-4 space-y-3">
        <p className="text-muted text-xs uppercase tracking-wider">Player link</p>
        <CopyLinkButton value={playerLink} label="Copy player link" />
      </div>

      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-muted text-xs uppercase tracking-wider">In the lobby</p>
          <span className="text-faint text-xs">{players.length} joined</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {players.length === 0 ? (
            <p className="text-muted text-sm">Waiting for players…</p>
          ) : (
            players.map((player) => (
              <span key={player.id} className="chip text-xs">
                {player.name}
              </span>
            ))
          )}
        </div>
      </div>

      {game.status === 'waiting' && (
        <button
          type="button"
          onClick={startSession}
          disabled={!canStart || starting}
          className="btn-primary w-full"
        >
          {starting ? 'Starting…' : canStart ? 'Start anonymous session' : 'Need at least 2 players'}
        </button>
      )}

      {game.status === 'active' && (
        <>
          <AnonymousMessageFeed
            messages={messages}
            title="Live anonymous messages"
            canRemove
            removingId={removingId}
            onRemove={removeMessageByHost}
          />
          <button type="button" onClick={endSession} disabled={ending} className="btn-secondary w-full">
            {ending ? 'Ending…' : 'End session'}
          </button>
        </>
      )}

      {game.status === 'finished' && (
        <>
          <AnonymousMessageFeed messages={messages} title="Session transcript" readOnly />
          <div className="flex gap-3">
            <button type="button" onClick={playAgain} disabled={playingAgain} className="btn-primary flex-1">
              {playingAgain ? 'Resetting…' : 'Play again'}
            </button>
            <button type="button" onClick={() => router.push('/')} className="btn-secondary px-5">
              Home
            </button>
          </div>
        </>
      )}
    </div>
  )
}
