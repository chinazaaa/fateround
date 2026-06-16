'use client'

import { useEffect } from 'react'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { ShareGameLinkCard } from '@/components/ShareGameLinkCard'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT } from '@/lib/supabase-selects'
import { usePolling } from '@/hooks/usePolling'
import type { Game, GameType } from '@/types'

type Props = {
  gameCode: string
  game: Pick<Game, 'title' | 'game_type' | 'status'> | null
  onLobbyOpen: () => void
}

export function GameStartedWaiting({ gameCode, game, onLobbyOpen }: Props) {
  const gameType = parseGameType(game?.game_type ?? 'smash_marry_kill')
  const cfg = gameTypeConfig(gameType)

  useLobbyOpenNotification(game?.status, onLobbyOpen)

  usePolling(
    async () => {
      const res = await supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle()
      if (res.data?.status === 'waiting') {
        onLobbyOpen()
      }
      return true
    },
    [gameCode, onLobbyOpen],
    { intervalMs: 8_000, enabled: game?.status !== 'waiting' }
  )

  useEffect(() => {
    if (game?.status === 'waiting') onLobbyOpen()
  }, [game?.status, onLobbyOpen])

  return (
    <div className="page-wrap flex items-center justify-center px-4">
      <div className="glass-card p-6 w-full max-w-md space-y-5 text-center">
        <div className="space-y-2">
          <div className="text-4xl">{cfg.headerEmoji}</div>
          <h1 className="text-2xl font-black text-body">{game?.title ?? 'Game in progress'}</h1>
          <GameTypeBadge gameType={gameType as GameType} />
        </div>
        <div className="space-y-2">
          <p className="text-lg font-bold text-body">Game in progress</p>
          <p className="text-muted text-sm leading-relaxed">
            The host has started without you. Stay on this page — when the lobby opens again you&apos;ll hear a chime
            and can join the next round.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-faint text-sm">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--primary)] animate-pulse" />
          Waiting for lobby…
        </div>
        <ShareGameLinkCard gameCode={gameCode} />
      </div>
    </div>
  )
}
