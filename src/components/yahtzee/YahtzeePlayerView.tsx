'use client'

// Yahtzee: player-facing roll/hold/score loop.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  YahtzeeCard,
  YahtzeeDiceTray,
  YahtzeeLoadingScreen,
  YahtzeePrimaryButton,
  YahtzeeSecondaryButton,
  YahtzeeShell,
} from '@/components/yahtzee/YahtzeeChrome'
import { YahtzeeLeaderboard, YahtzeeScorecard } from '@/components/yahtzee/YahtzeeScorecard'
import { YahtzeeFinalResultsShareBlock } from '@/components/yahtzee/YahtzeeFinalResultsShareBlock'
import { gameTypeConfig } from '@/lib/game-types'
import { currentPlayerId } from '@/lib/yahtzee'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT, YAHTZEE_PLAYER_SCORES_SELECT, YAHTZEE_SESSION_SELECT } from '@/lib/supabase-selects'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { resolvePlayerSession } from '@/lib/player-resume'
import type { Game, Player, YahtzeeCategory, YahtzeePlayerScore, YahtzeeSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { ShareGameLinkCard } from '@/components/ShareGameLinkCard'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameLobbyPlayerList } from '@/components/ui/GameLobbyPlayerList'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useYahtzeeNotifications, playYahtzeeScoreSound } from '@/hooks/useYahtzeeNotifications'
import { useYahtzeeTurnTimer } from '@/hooks/useYahtzeeTurnTimer'

type Screen = 'loading' | 'join' | 'game_started_waiting' | 'waiting' | 'active' | 'finished' | 'not_found'

export function YahtzeePlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<YahtzeeSession | null>(null)
  const [scores, setScores] = useState<YahtzeePlayerScore[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const [acting, setActing] = useState(false)
  const [localHeld, setLocalHeld] = useState<boolean[]>([false, false, false, false, false])
  const turnIndexRef = useRef<number | null>(null)

  useApplyGameTheme(game?.theme)

  const syncScreen = useCallback((gameData: Game, playerId: string | null) => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') {
        setScreen('game_started_waiting')
        return
      }
      setScreen('join')
      return
    }
    if (gameData.status === 'waiting') {
      setScreen('waiting')
      return
    }
    if (gameData.status === 'active') {
      setScreen('active')
      return
    }
    setScreen('finished')
  }, [])

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, sessionRes, scoresRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('yahtzee_sessions').select(YAHTZEE_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('yahtzee_player_scores').select(YAHTZEE_PLAYER_SCORES_SELECT).eq('game_id', gameCode).order('player_order'),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessionRes, scoresRes)) return false

    const gameData = gameRes.data
    const plrs = plrsRes.data
    const sessionData = sessionRes.data as YahtzeeSession | null

    if (!gameData) {
      setScreen('not_found')
      return true
    }

    setGame(gameData)
    setPlayers(plrs ?? [])
    setSession(sessionData)
    setScores((scoresRes.data as YahtzeePlayerScore[]) ?? [])

    const session = await resolvePlayerSession(gameCode, plrs)
    const playerId = session?.playerId ?? null
    if (session) {
      setMyPlayerId(session.playerId)
    } else {
      setMyPlayerId(null)
    }

    if (sessionData) {
      const turnChanged = turnIndexRef.current !== sessionData.current_turn_index
      const isMyActiveTurn =
        playerId != null && currentPlayerId(sessionData) === playerId
      const midTurn = (sessionData.rolls_this_turn ?? 0) > 0

      if (turnChanged || !isMyActiveTurn || !midTurn) {
        turnIndexRef.current = sessionData.current_turn_index
        setLocalHeld(sessionData.held ?? [false, false, false, false, false])
      }
    }
    syncScreen(gameData, playerId)
    return true
  }, [gameCode, syncScreen])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`yahtzee-player-${gameCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yahtzee_sessions', filter: `game_id=eq.${gameCode}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yahtzee_player_scores', filter: `game_id=eq.${gameCode}` }, () => void load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting') void load()
  })

  const join = async () => {
    if (!joinName.trim()) return
    setJoining(true)
    try {
      const joiningAsViewer = game?.status === 'active'
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameCode,
          playerName: joinName.trim(),
          ...(joiningAsViewer ? { joinAsViewer: true } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, 'both', data.resumeToken)
      setMyPlayerId(data.playerId)
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setJoining(false)
    }
  }

  const postAction = async (url: string, body: Record<string, unknown> = {}) => {
    if (!myPlayerId) return
    setActing(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActing(false)
    }
  }

  const toggleHold = (index: number) => {
    if (!session || !myPlayerId || currentPlayerId(session) !== myPlayerId) return
    if ((session.rolls_this_turn ?? 0) < 1) return

    const next = [...localHeld]
    next[index] = !next[index]
    setLocalHeld(next)

    void fetch('/api/yahtzee/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId, held: next }),
    }).then(async (res) => {
      const data = await res.json()
      if (!res.ok) {
        setLocalHeld(session.held ?? [false, false, false, false, false])
        toastError(data.error ?? 'Could not keep dice')
      }
    })
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setJoinName('')
    setScreen('join')
  }

  const cfg = gameTypeConfig('yahtzee')
  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = turnPlayerId === myPlayerId
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const canScore = isMyTurn && (session?.rolls_this_turn ?? 0) > 0

  // Audio notifications
  useYahtzeeNotifications({ game, session, myPlayerId, enabled: screen === 'active' })

  // Turn timer countdown (also fires expire-turn when deadline passes)
  const { secondsLeft, hasTimer, urgent } = useYahtzeeTurnTimer(
    gameCode,
    session,
    screen === 'active'
  )

  if (screen === 'loading') return <YahtzeeLoadingScreen />

  if (screen === 'not_found') {
    return (
      <YahtzeeShell title="Game not found">
        <YahtzeePrimaryButton onClick={() => router.push('/')}>Back home</YahtzeePrimaryButton>
      </YahtzeeShell>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => setScreen('join')} />
  }

  if (screen === 'join') {
    const joiningAsViewer = game?.status === 'active'
    return (
      <YahtzeeShell title={game?.title ?? cfg.label} subtitle="Enter your name to join">
        <YahtzeeCard className="p-6 space-y-5 max-w-md mx-auto">
          <div className="text-center">
            <div className="text-5xl mb-3">🎲</div>
            <p className="text-sm text-muted">
              {joiningAsViewer
                ? 'Game in progress — join as a viewer and watch live (read-only).'
                : '1–6 players · roll, hold, score'}
            </p>
          </div>
          <input
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="Your name"
            className="input-field w-full"
            maxLength={40}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
          <YahtzeePrimaryButton onClick={() => void join()} disabled={!joinName.trim()} loading={joining}>
            {joiningAsViewer ? 'Join as viewer' : 'Join game'}
          </YahtzeePrimaryButton>
        </YahtzeeCard>
        <ShareGameLinkCard gameCode={gameCode} className="max-w-md mx-auto" />
      </YahtzeeShell>
    )
  }

  if (screen === 'waiting') {
    const myName = players.find((p) => p.id === myPlayerId)?.name ?? ''
    return (
      <YahtzeeShell title={game?.title} subtitle="Waiting for the host to start">
        <p className="text-center">
          <GameRulesLink gameType="yahtzee" variant="subtle" />
        </p>
        <GameLobbyPlayerList players={players} myPlayerId={myPlayerId} label="In lobby" />
        {myPlayerId && myName && (
          <PlayerSessionControls
            gameCode={gameCode}
            playerId={myPlayerId}
            currentName={myName}
            onRenamed={() => void load()}
            onLeft={handlePlayerLeft}
            inLobby
          />
        )}
        <ShareGameLinkCard gameCode={gameCode} />
      </YahtzeeShell>
    )
  }

  if (screen === 'finished') {
    const myName = players.find((p) => p.id === myPlayerId)?.name
    const iWon = myPlayerId != null && session?.winner_player_id === myPlayerId
    const shareWinnerName = iWon ? myName : winner?.name

    return (
      <YahtzeeShell title="Game over!" subtitle={winner ? `${winner.name} wins` : undefined}>
        {game && scores.length > 0 ? (
          <YahtzeeFinalResultsShareBlock
            game={game}
            players={players}
            scores={scores}
            winnerName={shareWinnerName}
            highlightPlayerId={myPlayerId}
          />
        ) : (
          <>
            <YahtzeeCard className="py-10 text-center">
              <div className="text-6xl mb-3">🏆</div>
              {winner && <p className="text-2xl font-black text-[var(--marry)]">{winner.name}</p>}
            </YahtzeeCard>
            <YahtzeeLeaderboard rows={scores} players={players} highlightPlayerId={myPlayerId} />
            <YahtzeeSecondaryButton onClick={() => router.push('/games')}>Create a new game</YahtzeeSecondaryButton>
          </>
        )}
      </YahtzeeShell>
    )
  }

  if (!session) {
    return <YahtzeeLoadingScreen />
  }

  const myPlayer = players.find((p) => p.id === myPlayerId)
  const isViewer = !!(game && myPlayer && playerIsViewer(myPlayer, game))
  const myName = myPlayer?.name ?? ''

  if (isViewer) {
    return (
      <YahtzeeShell title={game?.title} wide compact>
        <ViewerModeBanner gameCode={gameCode} playerId={myPlayerId} game={game} player={myPlayer} />
        {myPlayerId && myName && (
          <PlayerSessionControls
            gameCode={gameCode}
            playerId={myPlayerId}
            currentName={myName}
            onRenamed={() => void load()}
            onLeft={handlePlayerLeft}
          />
        )}
        <div className="space-y-2">
          <YahtzeeScorecard
            players={players}
            scores={scores}
            activePlayerId={turnPlayerId}
            dice={session.dice}
            scoringEnabled={false}
          />
          <YahtzeeDiceTray
            dice={session.dice}
            held={session.held}
            rollsThisTurn={session.rolls_this_turn}
            rollsRemaining={session.rolls_remaining}
            turnName={turnPlayer?.name}
            secondsLeft={secondsLeft}
            hasTimer={hasTimer}
            urgent={urgent}
            spectator
          />
        </div>
      </YahtzeeShell>
    )
  }

  return (
    <YahtzeeShell title={game?.title} wide compact>
      {myPlayerId && myName && (
        <PlayerSessionControls
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={myName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
        />
      )}
      <div className="space-y-2">
        <YahtzeeScorecard
          players={players}
          scores={scores}
          myPlayerId={myPlayerId}
          activePlayerId={turnPlayerId}
          dice={session.dice}
          scoringEnabled={canScore}
          onScore={(category: YahtzeeCategory) => {
            playYahtzeeScoreSound()
            void postAction('/api/yahtzee/score', { category })
          }}
        />

        <YahtzeeDiceTray
          dice={session.dice}
          held={localHeld}
          rollsThisTurn={session.rolls_this_turn}
          rollsRemaining={session.rolls_remaining}
          interactive={isMyTurn && (session.rolls_this_turn ?? 0) > 0}
          onToggleHold={toggleHold}
          onRoll={() => postAction('/api/yahtzee/roll')}
          rolling={acting}
          isMyTurn={isMyTurn}
          turnName={turnPlayer?.name}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer}
          urgent={urgent}
        />
      </div>
    </YahtzeeShell>
  )
}
