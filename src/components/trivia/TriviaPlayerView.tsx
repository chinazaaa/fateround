'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { TriviaActiveRound } from '@/components/trivia/TriviaActiveRound'
import { gameTypeConfig } from '@/lib/game-types'
import { triviaCategoryFromGame } from '@/lib/trivia'
import { triviaCategoryLabel } from '@/lib/trivia-questions'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT, ROUND_SELECT, TRIVIA_ANSWER_SELECT } from '@/lib/supabase-selects'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import type { Game, Player, Round, TriviaAnswer } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { ShareGameLinkCard } from '@/components/ShareGameLinkCard'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { playerIsViewer, preJoinScreen, allowLatePlayers } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'

type Screen = 'loading' | 'join' | 'game_started_waiting' | 'late_join_choice' | 'playing' | 'not_found'

export function TriviaPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [answers, setAnswers] = useState<TriviaAnswer[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myPlayerName, setMyPlayerName] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, rdsRes, ansRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      supabase.from('trivia_answers').select(TRIVIA_ANSWER_SELECT).eq('game_id', gameCode),
    ])
    if (!supabasePollOk(gameRes, plrsRes, rdsRes, ansRes)) return false

    const gameData = gameRes.data
    const plrs = plrsRes.data

    if (!gameData) {
      setScreen('not_found')
      return true
    }

    setGame(gameData)
    setPlayers(plrs ?? [])
    setRounds(rdsRes.data ?? [])
    setAnswers(ansRes.data ?? [])

    const session = getPlayerSession(gameCode)
    let playerId = session?.playerId ?? null
    if (session && plrs && !plrs.some((p) => p.id === session.playerId)) {
      clearPlayerSession(gameCode)
      playerId = null
      setMyPlayerId(null)
      setMyPlayerName('')
    } else if (session) {
      setMyPlayerId(session.playerId)
      setMyPlayerName(session.playerName)
    }

    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      setScreen(pre === 'game_started_waiting' ? 'game_started_waiting' : pre === 'late_join_choice' ? 'late_join_choice' : 'join')
      return true
    }

    setScreen('playing')
    return true
  }, [gameCode])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`trivia-player-${gameCode}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` }, () =>
        load()
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` }, () =>
        load()
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trivia_answers', filter: `game_id=eq.${gameCode}` }, () =>
        load()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const openLobbyJoin = useCallback(() => {
    setScreen('join')
    void load()
  }, [load])

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'game_started_waiting' || screen === 'late_join_choice') void load()
  })

  const me = players.find((p) => p.id === myPlayerId)
  const isViewer = !!(game && me && playerIsViewer(me, game))
  const { context: lateJoinContext, loading: lateJoinContextLoading } = useLateJoinContext(
    gameCode,
    game,
    screen === 'late_join_choice'
  )
  const { context: viewerPromoteContext } = useLateJoinContext(
    gameCode,
    game,
    isViewer && screen === 'playing'
  )

  const joinGame = async (joinAsViewer?: boolean) => {
    const name = joinName.trim()
    if (!name) return
    setJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameCode,
          playerName: name,
          ...(game?.status === 'active' ? { joinAsViewer } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender)
      setMyPlayerId(data.playerId)
      setMyPlayerName(data.playerName)
      setScreen('playing')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setJoining(false)
    }
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyPlayerName('')
    setJoinName('')
    setScreen('join')
  }

  const cfg = gameTypeConfig('trivia')

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-lg">Loading…</p>
      </div>
    )
  }

  if (screen === 'not_found') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-muted text-lg">Game not found</p>
        <button type="button" onClick={() => router.push('/')} className="btn-secondary py-3 px-6 text-base">
          Home
        </button>
      </div>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={openLobbyJoin} />
  }

  if (screen === 'late_join_choice' && game) {
    return (
      <LateJoinChoice
        gameCode={gameCode}
        game={game}
        context={lateJoinContext}
        contextLoading={lateJoinContextLoading}
        playersAllowed={game ? allowLatePlayers(game) : false}
        showNameField
        nameInput={joinName}
        onNameChange={setJoinName}
        joining={joining}
        onJoinAsViewer={() => void joinGame(true)}
        onJoinAsPlayer={() => void joinGame(false)}
      />
    )
  }

  if (screen === 'join') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 py-8">
        <div className="glass-card-strong w-full max-w-lg p-8 sm:p-10 space-y-6">
          <div className="text-center space-y-2">
            <div className="text-5xl sm:text-6xl">{cfg.headerEmoji}</div>
            <h1 className="text-2xl sm:text-3xl font-black gradient-title">{game?.title}</h1>
            <GameTypeBadge gameType="trivia" />
            {game && (
              <p className="text-muted text-base">
                {triviaCategoryLabel(triviaCategoryFromGame(game))} · {game.rounds_count} rounds · {game.timer_seconds}s
                each
              </p>
            )}
          </div>
          <input
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && joinGame()}
            placeholder="Your name"
            autoFocus
            className="input-field w-full text-base py-3.5"
          />
          <button
            type="button"
            onClick={() => void joinGame()}
            disabled={joining || !joinName.trim()}
            className="btn-primary w-full py-4 text-base sm:text-lg"
          >
            {joining ? 'Joining…' : 'Join game'}
          </button>
          <ShareGameLinkCard gameCode={gameCode} />
        </div>
      </div>
    )
  }

  if (!game || !myPlayerId) return null

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="text-center space-y-1">
          <div className="text-4xl sm:text-5xl">{cfg.headerEmoji}</div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title">{game.title}</h1>
          <p className="text-muted text-sm sm:text-base">{cfg.label}</p>
        </div>

        {isViewer && (
          <ViewerModeBanner
            gameCode={gameCode}
            playerId={myPlayerId}
            game={game}
            player={me}
            playerDetail={viewerPromoteContext?.playerDetail}
            onPromoted={load}
          />
        )}
        <PlayerSessionControls
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={myPlayerName}
          onRenamed={(name) => {
            setMyPlayerName(name)
            setPlayerSession(gameCode, myPlayerId, name, 'both')
          }}
          onLeft={handlePlayerLeft}
          inLobby={game.status === 'waiting'}
        />
        <TriviaActiveRound
          gameCode={gameCode}
          game={game}
          players={players}
          rounds={rounds}
          answers={answers}
          myPlayerId={myPlayerId}
          playerName={myPlayerName}
          onReload={load}
          readOnly={isViewer}
        />
      </div>
    </div>
  )
}
