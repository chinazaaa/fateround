'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { YahtzeeDiceTray } from '@/components/yahtzee/YahtzeeChrome'
import { YahtzeeScorecard } from '@/components/yahtzee/YahtzeeScorecard'
import { YahtzeeFinalResultsShareBlock } from '@/components/yahtzee/YahtzeeFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostBoardGameLobbyPanel } from '@/components/host-lobby/HostBoardGameLobbyPanel'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { gameTypeConfig } from '@/lib/game-types'
import {
  currentPlayerId,
  getYahtzeeHostMode,
  setYahtzeeHostMode,
  YAHTZEE_MIN_PLAYERS,
  type YahtzeeHostMode,
} from '@/lib/yahtzee'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  PLAYER_SELECT,
  YAHTZEE_PLAYER_SCORES_SELECT,
  YAHTZEE_SESSION_SELECT,
} from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, Player, YahtzeeCategory, YahtzeePlayerScore, YahtzeeSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { useYahtzeeTurnTimer } from '@/hooks/useYahtzeeTurnTimer'
import { useYahtzeeNotifications, playYahtzeeScoreSound } from '@/hooks/useYahtzeeNotifications'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { ExitIcon } from '@/components/host/host-icons'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'

type HostTab = 'play' | 'manage'

export function YahtzeeHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<YahtzeeSession | null>(null)
  const [scores, setScores] = useState<YahtzeePlayerScore[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)

  // Host+play mode
  const [hostMode, setHostMode] = useState<YahtzeeHostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [hostActing, setHostActing] = useState(false)
  const [localHostHeld, setLocalHostHeld] = useState<boolean[]>([false, false, false, false, false])
  const [tab, setTab] = useState<HostTab>('manage')
  const turnIndexRef = useRef<number | null>(null)

  useApplyGameTheme(game?.theme)
  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, sessionRes, scoresRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('yahtzee_sessions').select(YAHTZEE_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase
        .from('yahtzee_player_scores')
        .select(YAHTZEE_PLAYER_SCORES_SELECT)
        .eq('game_id', gameCode)
        .order('player_order'),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessionRes, scoresRes)) return false
    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setSession(sessionRes.data as YahtzeeSession | null)
    setScores((scoresRes.data as YahtzeePlayerScore[]) ?? [])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
    setHostMode(getYahtzeeHostMode(gameCode))
    const session = getPlayerSession(gameCode)
    if (session) {
      setHostPlayerId(session.playerId)
      setHostResumeToken(session.resumeToken ?? null)
      setHostPlayerName(session.playerName)
    }
  }, [gameCode, load])

  // Reset held when turn changes away from host
  useEffect(() => {
    if (!session || !hostPlayerId) return
    const turnId = currentPlayerId(session)
    const turnIndex = session.current_turn_index ?? null
    if (turnIndex !== turnIndexRef.current) {
      turnIndexRef.current = turnIndex
      if (turnId !== hostPlayerId) {
        setLocalHostHeld([false, false, false, false, false])
      }
    }
  }, [session, hostPlayerId])

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage when it ends.
  useEffect(() => {
    if (game?.status === 'active') setTab('play')
    else if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  // Realtime push: reload on any change to this game's row + its tables.
  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'yahtzee_sessions', 'yahtzee_player_scores'],
    load
  )

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      if (playerId === hostPlayerId) {
        setHostPlayerId(null)
        setHostResumeToken(null)
        setHostPlayerName('')
        setLocalHostHeld([false, false, false, false, false])
        clearPlayerSession(gameCode)
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [gameCode, hostPlayerId]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  const changeHostMode = (mode: YahtzeeHostMode) => {
    if (game?.status !== 'waiting') return
    setHostMode(mode)
    setYahtzeeHostMode(gameCode, mode)
  }

  const hostJoinGame = async () => {
    const name = hostJoinName.trim()
    if (!name) return
    setHostJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerName: name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender, data.resumeToken)
      setHostPlayerId(data.playerId)
      setHostResumeToken(data.resumeToken ?? null)
      setHostPlayerName(data.playerName)
      setHostMode('player')
      setYahtzeeHostMode(gameCode, 'player')
      await load()
      success(`Joined as ${data.playerName}`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }

  const postHostAction = async (url: string, body: Record<string, unknown> = {}) => {
    if (!hostPlayerId || hostActing) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setHostActing(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setHostActing(false)
    }
  }

  const toggleHostHold = (index: number) => {
    if (!session || !hostPlayerId || currentPlayerId(session) !== hostPlayerId) return
    if ((session.rolls_this_turn ?? 0) < 1) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    const next = [...localHostHeld]
    next[index] = !next[index]
    setLocalHostHeld(next)
    void fetch('/api/yahtzee/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, held: next }),
    }).then(async (res) => {
      const data = await res.json()
      if (!res.ok) {
        setLocalHostHeld(session.held ?? [false, false, false, false, false])
        toastError(data.error ?? 'Could not keep dice')
      }
    })
  }

  const startGame = async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start')
      success('Game started!')
      await load()
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const playAgain = async () => {
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      success('Ready for a new game!')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const cfg = gameTypeConfig('yahtzee')
  const joinUrl = `${appOrigin()}/game/${gameCode}`
  const canStart = players.filter((p) => p.spectator !== true).length >= YAHTZEE_MIN_PLAYERS
  const turnPlayerId = session ? currentPlayerId(session) : null
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const hostPlays = hostMode === 'player' && !!hostPlayerId

  const isHostTurn = turnPlayerId === hostPlayerId
  const canHostScore = isHostTurn && (session?.rolls_this_turn ?? 0) > 0

  const { secondsLeft, hasTimer, urgent } = useYahtzeeTurnTimer(gameCode, session, game?.status === 'active')
  useYahtzeeNotifications({ game, session, myPlayerId: hostPlayerId, enabled: hostPlays && game?.status === 'active' })

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  // Primary tab: interactive board when the host is playing, read-only board otherwise.
  const interactivePlay =
    session && hostPlayerId ? (
      <div className="space-y-2">
        <YahtzeeScorecard
          players={players}
          scores={scores}
          myPlayerId={hostPlayerId}
          activePlayerId={turnPlayerId}
          dice={session.dice}
          scoringEnabled={canHostScore}
          onScore={(category: YahtzeeCategory) => {
            playYahtzeeScoreSound()
            void postHostAction('/api/yahtzee/score', { category })
          }}
        />
        <YahtzeeDiceTray
          dice={session.dice}
          held={localHostHeld}
          rollsThisTurn={session.rolls_this_turn}
          rollsRemaining={session.rolls_remaining}
          interactive={isHostTurn && (session.rolls_this_turn ?? 0) > 0}
          onToggleHold={toggleHostHold}
          onRoll={() => postHostAction('/api/yahtzee/roll')}
          rolling={hostActing}
          isMyTurn={isHostTurn}
          turnName={turnPlayer?.name}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer}
          urgent={urgent}
        />
      </div>
    ) : (
      <div className="glass-card p-8 text-center text-sm text-muted">Loading game…</div>
    )

  const watchBoard = session ? (
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
  ) : (
    <p className="text-muted text-sm text-center">Waiting for the round to begin…</p>
  )

  const manage = (
    <HostManageSection
      game={game}
      players={players}
      highlightPlayerId={hostPlayerId}
      removingPlayerId={removingPlayerId}
      onRemovePlayer={removePlayer}
      gameType="yahtzee"
      top={
        game.status === 'waiting' ? (
          <HostModeSelector
            mode={hostMode}
            onChange={changeHostMode}
            joinedPlayerId={hostPlayerId}
            joinedPlayerName={hostPlayerName}
            joinName={hostJoinName}
            onJoinNameChange={setHostJoinName}
            onJoin={() => void hostJoinGame()}
            joining={hostJoining}
            spectatorHint="Spectate from the Watch tab"
          />
        ) : undefined
      }
      settings={
        <>
          {game.status === 'waiting' && (
            <HostBoardGameLobbyPanel
              gameCode={gameCode}
              hostToken={hostToken}
              game={game}
              boardGameType="yahtzee"
              playerCount={players.length}
              onGameUpdate={setGame}
            />
          )}
          {game.status === 'active' && (
            <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
          )}
        </>
      }
      footer={
        game.status === 'waiting' ? (
          <HostLobbyWaitingFooter
            gameCode={gameCode}
            hostToken={hostToken}
            onStart={() => void startGame()}
            onEnded={load}
            canStart={canStart}
            starting={starting}
            startDisabledHint={canStart ? null : 'Join as a player above to start solo, or wait for others to join.'}
            className="space-y-3"
          />
        ) : game.status === 'active' ? (
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={load}
            label="End game early"
            icon={<ExitIcon size={16} />}
            confirmTitle="End this game early?"
            confirmMessage="The current game will end and players will see the results screen."
            className="btn-danger-soft"
          />
        ) : null
      }
    />
  )

  return (
    <HostGameLayout
      gameCode={gameCode}
      status={game.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind={primaryKind}
      showTabs={showTabs}
      gameStarted={gameStarted}
      header={<HostGameHeader game={game} />}
      primary={hostPlays ? interactivePlay : watchBoard}
      manage={manage}
      finished={
        <>
          <YahtzeeFinalResultsShareBlock
            game={game}
            players={players}
            scores={scores}
            winnerName={winner?.name}
            playAgainButton={
              <button
                type="button"
                onClick={() => void playAgain()}
                disabled={playingAgain}
                className="btn-primary w-full py-3"
              >
                {playingAgain ? 'Resetting…' : 'Play again'}
              </button>
            }
          />
          {hostPlayerId && session?.winner_player_id === hostPlayerId && (
            <PostWinToCommunity
              gameType="yahtzee"
              gameCode={gameCode}
              winnerName={hostPlayerName}
              roundKey={session?.id}
            />
          )}
        </>
      }
    />
  )
}
